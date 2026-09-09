using System;
using System.Collections.Generic;
using System.Linq;

namespace RoguelikeCardFramework.Core
{
    public sealed partial class NativeGameSession
    {
        private NativeCombatState combat;
        private readonly List<NativeStatus> runStatuses = new();
        private readonly List<string> encounteredEnemyIds = new();
        private int revision, battlesStarted, battlesWon, damageTaken;
        public NativeCombatState Combat => Copy(combat);
        public int DrawPileCount => drawPile.Count;
        public int DiscardPileCount => discard.Count;
        private void Atomic(Action action)
        {
            var before = Export(); var oldMessage = Message; var oldPhase = Phase; var oldResume = resumePhase;
            try { action(); revision++; SyncCombatDisplay(); }
            catch { Restore(before); Phase = oldPhase; resumePhase = oldResume; Message = oldMessage; throw; }
        }
        private void StartEncounter(string id)
        {
            var encounter = content.encounters[id]; var enemyIds = new List<string>(encounter.enemyIds);
            if (encounter.category == "normal" || encounter.category == "elite")
            {
                var opening = new[] { "enemy.dirty-dog", "enemy.sick-dog", "enemy.wanderer", "enemy.dried-person" };
                if (Floor == 1 && Node <= 4)
                {
                    var restricted = enemyIds.Where(opening.Contains).ToList(); if (restricted.Count > 0) enemyIds = restricted;
                }
                var unseen = enemyIds.Where(e => !encounteredEnemyIds.Contains(e)).ToList();
                var pool = unseen.Count > 0 ? unseen : enemyIds; enemyIds = new List<string>();
                for (var i = 0; i < Math.Max(1, encounter.enemyCount); i++) enemyIds.Add(random.Pick($"encounter:{id}:{battlesStarted}:{i}:enemy", pool));
            }
            combat = new NativeCombatState { encounterId = id, statuses = runStatuses.Where(s => s.scope == "run").Select(Copy).ToList() };
            for (var i = 0; i < enemyIds.Count; i++)
            {
                var definition = content.enemies.Find(e => e.id == enemyIds[i]);
                combat.enemies.Add(new NativeCombatEnemy { definitionId = definition.id, instanceId = $"enemy-{i}-{definition.id}", health = definition.health });
                if (!encounteredEnemyIds.Contains(definition.id)) encounteredEnemyIds.Add(definition.id);
            }
            Block = 0; hand.Clear(); discard.Clear(); drawPile.Clear(); drawPile.AddRange(random.Shuffle($"combat:{id}:deck", deck));
            battlesStarted++; Phase = NativePhase.Combat; ResetCombatResources();
            RunCombatTriggers("combatStart"); DrawCombatCards(content.handSize); RunCombatTriggers("turnStart");
            Message = "选择目标后出牌。"; AddLog("遭遇 " + string.Join("、", combat.enemies.Select(e => content.enemies.Find(d => d.id == e.definitionId).name)));
        }
        public int EffectiveCardCost(string id)
        {
            var card = CardFor(id); if (combat == null) return card.cost;
            if (card.type == "attack" && Stacks(combat.statuses, "status.conceal") > combat.concealAttacksUsed) return 0;
            return Math.Max(0, card.cost - (card.type == "skill" ? Stacks(combat.statuses, "status.clear") : 0));
        }
        public string EnemyIntentLabel(NativeCombatEnemy enemy)
        {
            var definition = content.enemies.Find(e => e.id == enemy.definitionId);
            return definition.intents[enemy.intentIndex % definition.intents.Count].name;
        }
        private void PlayCombatCard(int index, string targetId)
        {
            RequirePhase(NativePhase.Combat);
            if (index < 0 || index >= hand.Count) throw new ArgumentOutOfRangeException(nameof(index));
            var id = hand[index]; var card = CardFor(id); var cost = EffectiveCardCost(id);
            var resource = combat.resources.Find(r => r.id == card.resource);
            if (resource == null || resource.amount < cost) throw new InvalidOperationException("资源不足。");
            string target = null;
            if (card.target == "enemy")
            {
                // Existing callers may omit the target only when there is one living enemy.
                if (targetId == null && combat.enemies.Count(e => e.health > 0) == 1) targetId = combat.enemies.Find(e => e.health > 0).instanceId;
                if (!combat.enemies.Any(e => e.instanceId == targetId && e.health > 0)) throw new InvalidOperationException("请选择存活的敌人。");
                target = targetId;
            }
            else if (card.target == "self") target = "player";
            var concealed = card.type == "attack" && Stacks(combat.statuses, "status.conceal") > combat.concealAttacksUsed;
            resource.amount -= cost;
            ExecuteCombatEffects(card.effects, "player", target, card.type);
            if (card.type == "attack") { combat.angerAttacksUsed++; if (concealed) combat.concealAttacksUsed++; }
            // Draw effects execute before the played card leaves the hand, matching the web kernel.
            hand.RemoveAt(index); (card.playDestination == "exhaust" ? combat.exhaust : discard).Add(id);
            RunCombatTriggers("afterCardPlayed", card.tags); AddLog("使用 " + card.name); CheckNativeCombatEnd();
        }
        private void EndCombatTurn()
        {
            RequirePhase(NativePhase.Combat); RunCombatTriggers("turnEnd"); TickStatuses(combat.statuses);
            if (content.discardHandAtEnd) { discard.AddRange(hand); hand.Clear(); }
            foreach (var enemy in combat.enemies)
            {
                if (enemy.health <= 0) continue;
                if (content.clearBlockAtStart) enemy.block = 0;
                var definition = content.enemies.Find(e => e.id == enemy.definitionId);
                var intent = definition.intents[enemy.intentIndex % definition.intents.Count];
                EnemyName = definition.name;
                ExecuteCombatEffects(intent.effects, enemy.instanceId, intent.target == "enemy" ? "player" : intent.target == "self" ? enemy.instanceId : null, "attack");
                TickStatuses(enemy.statuses); enemy.intentIndex = (enemy.intentIndex + 1) % definition.intents.Count;
                AddLog(definition.name + "：" + intent.name); if (Health <= 0) break;
            }
            if (CheckNativeCombatEnd()) return;
            combat.turn++; combat.angerAttacksUsed = combat.concealAttacksUsed = 0;
            if (content.clearBlockAtStart) Block = 0;
            ResetCombatResources(); DrawCombatCards(content.handSize - hand.Count); RunCombatTriggers("turnStart");
        }
        private void ResetCombatResources()
        {
            combat.resources.Clear();
            foreach (var pair in content.resourcePerTurn)
            {
                var amount = pair.Key == content.characters[CharacterId].resource ? perTurnResource : pair.Value;
                if (content.resourceMaximums.TryGetValue(pair.Key, out var max)) amount = Math.Min(max, amount);
                combat.resources.Add(new NativeResource { id = pair.Key, amount = amount });
            }
        }
        private void DrawCombatCards(int count)
        {
            for (var i = 0; i < count && hand.Count < content.handLimit; i++)
            {
                if (drawPile.Count == 0 && discard.Count > 0)
                { drawPile.AddRange(random.Shuffle($"combat:{combat.encounterId}:reshuffle:{combat.turn}", discard)); discard.Clear(); }
                if (drawPile.Count == 0) break;
                var index = drawPile.Count - 1; hand.Add(drawPile[index]); drawPile.RemoveAt(index); combat.cardsDrawn++;
                RunCombatTriggers("afterCardDrawn", occurrence: combat.cardsDrawn);
            }
        }
        private static int Stacks(List<NativeStatus> statuses, string id) => statuses.Find(s => s.definitionId == id)?.stacks ?? 0;
        private static void TickStatuses(List<NativeStatus> statuses)
        {
            foreach (var status in statuses.Where(s => s.hasDuration)) { status.duration--; if (status.definitionId == "status.weak") status.stacks = Math.Max(0, status.stacks - 1); }
            statuses.RemoveAll(s => (s.hasDuration && s.duration <= 0) || s.stacks <= 0);
        }
        private void AddCombatStatus(List<NativeStatus> statuses, string id, int stacks, bool duration, string scope = "combat")
        {
            var definition = content.statuses[id]; var current = statuses.Find(s => s.definitionId == id);
            if (current == null) { statuses.Add(new NativeStatus { definitionId = id, stacks = stacks, duration = duration ? stacks : 0, hasDuration = duration, scope = scope }); return; }
            current.stacks = definition.stacking == "stack" ? current.stacks + stacks : stacks;
            if (duration) { current.hasDuration = true; current.duration += stacks; }
            if (scope == "run") current.scope = scope;
        }
        private void ExecuteCombatEffects(List<NativeEffect> effects, string source, string target = null, string cardType = null, int stacks = 1)
        {
            var sourceStatuses = source == "player" ? combat?.statuses ?? runStatuses : combat.enemies.Find(e => e.instanceId == source).statuses;
            var anger = source == "player" && cardType == "attack" && Stacks(sourceStatuses, "status.anger") > 0 && (combat?.angerAttacksUsed ?? 0) == 0;
            foreach (var effect in effects)
            {
                var p = effect.parameters;
                int Number(string key) => MiniJson.Int(p, key);
                double Fraction(string key) => Convert.ToDouble(p[key]);
                bool Flag(string key) => p.TryGetValue(key, out var value) && value is bool flag && flag;
                var amount = Number("amount");
                if (effect.id == "core.damage" && cardType == "attack")
                {
                    if (source == "player") amount += Stacks(sourceStatuses, "status.strong");
                    if (anger) amount *= 2;
                    if (Stacks(sourceStatuses, "status.weak") > 0) amount = (int)Math.Floor(amount * .75);
                }
                if (effect.id == "core.block" && cardType == "defense" && source == "player") amount += Stacks(sourceStatuses, "status.sharp");
                var targetId = effect.id == "core.blockSource" ? source : target ?? (effect.id == "core.damage" ? "player" : source);
                var enemy = targetId == "player" ? null : combat?.enemies.Find(e => e.instanceId == targetId);
                switch (effect.id)
                {
                    case "core.damage":
                        if (targetId != "player" && enemy == null) throw new InvalidOperationException("Damage target missing.");
                        var absorbed = Math.Min(targetId == "player" ? Block : enemy.block, Math.Max(0, amount));
                        var dealt = Math.Max(0, amount - absorbed);
                        if (targetId == "player") { Block -= absorbed; Health = Math.Max(0, Health - dealt); damageTaken += dealt; if (absorbed > 0 && dealt == 0) RunCombatTriggers("afterDamageBlocked"); }
                        else { enemy.block -= absorbed; enemy.health = Math.Max(0, enemy.health - dealt); }
                        break;
                    case "core.block": case "core.blockSource":
                        if (targetId == "player") Block += Math.Max(0, amount); else enemy.block += Math.Max(0, amount); break;
                    case "core.draw": DrawCombatCards(Math.Max(0, amount)); break;
                    case "core.gainResource":
                        var resourceId = MiniJson.Str(p, "resourceId"); var resource = combat.resources.Find(r => r.id == resourceId);
                        resource.amount += amount * (Flag("perStack") ? stacks : 1);
                        if (content.resourceMaximums.TryGetValue(resourceId, out var max)) resource.amount = Math.Min(max, resource.amount); break;
                    case "core.heal": case "core.healPercent":
                        var maximum = targetId == "player" ? MaxHealth : content.enemies.Find(e => e.id == enemy.definitionId).health;
                        var heal = effect.id == "core.healPercent" ? (int)Math.Ceiling(maximum * Fraction("percent")) : Math.Max(0, amount);
                        if (targetId == "player") Health = Math.Min(maximum, Health + heal); else enemy.health = Math.Min(maximum, enemy.health + heal); break;
                    case "core.gainGold": Gold += amount; break;
                    case "core.addStatus": AddCombatStatus(targetId == "player" ? combat?.statuses ?? runStatuses : enemy.statuses, MiniJson.Str(p, "statusId"), Number("stacks"), Flag("durationFromStacks")); break;
                    case "core.multiplyGoldRandom":
                        Gold = (int)Math.Ceiling(Gold * (random.Next($"collectible:gold:{revision}") < Fraction("upChance") ? Fraction("upMultiplier") : Fraction("downMultiplier"))); break;
                    case "core.upgradeRandomCards":
                        var tag = MiniJson.Str(p, "cardTag");
                        var eligible = instances.Where(c => deck.Contains(c.instanceId) && (tag == "any" || content.cards[c.definitionId].tags.Contains(tag)) && c.upgradeLevel < content.cards[c.definitionId].upgrades.Count);
                        foreach (var card in random.Shuffle($"upgrade:{tag}:{revision}", eligible).Take(Math.Max(0, Number("count")))) card.upgradeLevel++;
                        break;
                    default: throw new InvalidOperationException("Effect not migrated: " + effect.id);
                }
            }
        }
        private void RunCombatTriggers(string hook, List<string> tags = null, int occurrence = 0)
        {
            foreach (var status in (combat?.statuses ?? runStatuses).ToArray())
                if (content.statuses[status.definitionId].triggers.TryGetValue(hook, out var effects)) ExecuteCombatEffects(effects, "player", "player", stacks: status.stacks);
            foreach (var id in collectibles)
                foreach (var trigger in content.collectibleDefinitions[id].triggers)
                    if (trigger.hook == hook && (string.IsNullOrEmpty(trigger.cardTag) || tags?.Contains(trigger.cardTag) == true) && (trigger.every == 0 || occurrence > 0 && occurrence % trigger.every == 0))
                        ExecuteCombatEffects(trigger.effects, "player", "player");
            if (combat != null) foreach (var enemy in combat.enemies)
                foreach (var status in enemy.statuses.ToArray())
                    if (content.statuses[status.definitionId].triggers.TryGetValue(hook, out var effects)) ExecuteCombatEffects(effects, enemy.instanceId, enemy.instanceId, stacks: status.stacks);
        }
        private bool CheckNativeCombatEnd()
        {
            if (Health > 0 && combat.enemies.Any(e => e.health > 0)) return false;
            if (Health > 0) RunCombatTriggers("combatEnd");
            var encounter = content.encounters[combat.encounterId];
            SyncCombatDisplay(); runStatuses.Clear(); runStatuses.AddRange(combat.statuses.Where(s => Health <= 0 || s.scope == "run").Select(Copy));
            combat = null; hand.Clear(); drawPile.Clear(); discard.Clear();
            if (Health <= 0) { Finish(false); return true; }
            Block = 0; battlesWon++; Score += 40;
            switch (encounter.category)
            {
                case "normal": Gold += random.Integer($"combat:{encounter.id}:{battlesWon}:gold", content.normalGoldMin, content.normalGoldMax); Phase = NativePhase.Map; break;
                case "elite": Gold += 100; Phase = NativePhase.Map; break;
                case "special": Phase = NativePhase.Map; break;
                case "boss":
                    Score += 200;
                    if (Floor >= content.mapRules.floorCount) { Score += 150; Finish(true); }
                    else
                    {
                        var pool = encounter.rewardPool?.Count > 0 ? encounter.rewardPool : content.rewards.Keys.ToList();
                        rewardIds.Clear(); rewardIds.AddRange(random.Shuffle($"reward:{Floor}:{encounter.id}", pool).Take(content.rewardChoiceCount));
                        rewardContinuation = "next-floor"; Phase = NativePhase.Reward; Message = "首领已倒下，选择奖励。";
                    }
                    break;
                default: throw new InvalidOperationException("Unknown encounter category.");
            }
            AddLog("战斗胜利"); return true;
        }
        private void SyncCombatDisplay()
        {
            if (combat == null) return;
            Resource = combat.resources.Find(r => r.id == content.characters[CharacterId].resource)?.amount ?? 0;
            var enemy = combat.enemies.Find(e => e.health > 0) ?? combat.enemies[0]; var definition = content.enemies.Find(e => e.id == enemy.definitionId);
            EnemyName = definition.name; EnemyHealth = enemy.health; EnemyMaxHealth = definition.health;
            EnemyDamage = definition.intents[enemy.intentIndex].effects.Where(e => e.id == "core.damage").Sum(e => MiniJson.Int(e.parameters, "amount"));
        }
    }
}
