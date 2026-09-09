using System;
using System.Collections.Generic;
using UnityEngine;

namespace RoguelikeCardFramework.Core
{
    public enum NativePhase { Menu, CharacterSelect, Map, Combat, Reward, Shop, Event, Rest, Result, Encyclopedia, Settings, BoonSelect, BoonRemove, ThemeSelect }

    [Serializable] public sealed class NativeRunSave
    {
        public int schemaVersion = 4;
        public string phase;
        public string characterId;
        public int health, maxHealth, gold, floor, node, score, resource, block, enemyHealth, enemyMaxHealth, enemyDamage;
        public string enemyName;
        public List<string> deck = new();
        public List<string> hand = new();
        public List<string> drawPile = new();
        public List<string> discard = new();
        public RandomState random;
        public List<string> log = new();
        public NativeSetupState setup;
        public NativeMapState map;
        public List<NativeCardInstance> cardInstances = new();
        public List<string> collectibles = new();
        public int perTurnResource;
        public bool setupShop;
        public NativeCombatState combat;
        public List<NativeStatus> runStatuses = new();
        public List<string> encounteredEnemyIds = new();
        public int revision, battlesStarted, battlesWon, damageTaken;
        public List<string> rewardIds = new();
        public string rewardContinuation;
    }

    public sealed partial class NativeGameSession
    {
        public NativePhase Phase { get; private set; } = NativePhase.Menu;
        public int Health { get; private set; }
        public int MaxHealth { get; private set; }
        public int Gold { get; private set; }
        public int Floor { get; private set; }
        public int Node { get; private set; }
        public int Score { get; private set; }
        public int Resource { get; private set; }
        public int Block { get; private set; }
        public int EnemyHealth { get; private set; }
        public int EnemyMaxHealth { get; private set; }
        public int EnemyDamage { get; private set; }
        public string EnemyName { get; private set; } = "";
        public string CharacterId { get; private set; } = "";
        public string Message { get; private set; } = "";
        public IReadOnlyList<string> Hand => hand;
        public IReadOnlyList<string> Log => log;
        public bool HasRun => !string.IsNullOrEmpty(CharacterId) && Phase != NativePhase.Result && resumePhase != NativePhase.Result;

        private readonly ContentDatabase content;
        private NamespacedRandom random = new("20260908");
        private readonly List<string> deck = new();
        private readonly List<string> drawPile = new();
        private readonly List<string> discard = new();
        private readonly List<string> hand = new();
        private readonly List<string> log = new();
        private NativePhase resumePhase = NativePhase.Map;

        public NativeGameSession(ContentDatabase content) { this.content = content; }
        public void Open(NativePhase phase) { Phase = phase; }
        public void ContinueRun() { if (HasRun) Phase = resumePhase; }
        public void GoToMenu()
        {
            if (Phase != NativePhase.Menu && Phase != NativePhase.CharacterSelect && Phase != NativePhase.Encyclopedia && Phase != NativePhase.Settings) resumePhase = Phase;
            Phase = NativePhase.Menu;
        }
        public void NewRun(string seed = null)
        {
            random = new NamespacedRandom(string.IsNullOrWhiteSpace(seed) ? Guid.NewGuid().ToString("N") : seed.Trim());
            Phase = NativePhase.CharacterSelect; CharacterId = ""; Message = "选择进入风沙的角色";
            setup = null; map = null; setupShop = false; instances.Clear(); collectibles.Clear();
            deck.Clear(); hand.Clear(); drawPile.Clear(); discard.Clear(); log.Clear();
            Resource = Block = EnemyHealth = EnemyMaxHealth = EnemyDamage = 0; EnemyName = ""; resumePhase = NativePhase.Map;
            combat = null; runStatuses.Clear(); encounteredEnemyIds.Clear(); battlesStarted = battlesWon = damageTaken = 0; revision++;
            rewardIds.Clear(); rewardContinuation = null;
        }
        public void ChooseCharacter(string id)
        {
            RequirePhase(NativePhase.CharacterSelect);
            var character = content.characters[id]; CharacterId = id; Health = MaxHealth = character.health; Gold = content.startingGold; Floor = 1; Node = 0; Score = 0;
            deck.Clear(); instances.Clear(); var definitions = character.deck.Count > 0 ? character.deck : content.startingDeck;
            for (var i = 0; i < definitions.Count; i++) AddCard(definitions[i], $"starter-{i}-{definitions[i]}");
            collectibles.AddRange(character.collectibles ?? content.startingCollectibles);
            perTurnResource = content.resourcePerTurn[character.resource];
            setup = new NativeSetupState { boonOffers = random.Shuffle("setup:boons", content.startingBoons).GetRange(0, 3) };
            Phase = NativePhase.BoonSelect; Message = "选择一项开局祝福。"; log.Clear(); AddLog("探索开始");
            revision++;
        }
        public string[] MapChoices()
        {
            if (map != null) return map.nodes.FindAll(n => n.available && !n.visited).ConvertAll(n => n.id).ToArray();
            if (Node >= 5) return new[] { "首领战" };
            var choices = new[] { "战斗", "事件", "商店", "休整" };
            return new[] { choices[(Node + Floor) % choices.Length], choices[(Node + Floor + 1) % choices.Length] };
        }
        public void ChooseNode(string kind)
        {
            RequirePhase(NativePhase.Map);
            if (map != null) { Atomic(() => EnterRouteNode(kind)); return; }
            if (Array.IndexOf(MapChoices(), kind) < 0) throw new InvalidOperationException("Map node is not available.");
            Node++; Score += 10;
            if (kind == "战斗" || kind == "首领战") StartCombat(kind == "首领战");
            else if (kind == "商店") { Phase = NativePhase.Shop; Message = "废墟商人正在整理货架。"; }
            else if (kind == "事件") { Phase = NativePhase.Event; Message = "风沙中出现了异常动静。"; }
            else { Phase = NativePhase.Rest; Message = "这里暂时安全。"; }
        }
        private void StartCombat(bool boss, bool elite = false)
        {
            NativeEnemy selected;
            if (boss) selected = content.enemies.Find(e => e.id.StartsWith("boss.") && e.id.EndsWith(Floor == 1 ? "hunger-mass" : Floor == 2 ? "truth-seer" : Floor == 3 ? "terror-violence" : "angel-question"));
            else { var candidates = content.enemies.FindAll(e => !e.id.StartsWith("boss.") && (elite ? e.id.Contains("elite") : !e.id.Contains("elite") && e.health <= 30 + Floor * 15)); selected = random.Pick("native:encounter", candidates); }
            EnemyName = selected.name; EnemyHealth = EnemyMaxHealth = selected.health; EnemyDamage = selected.damage; Block = 0; Phase = NativePhase.Combat;
            drawPile.Clear(); drawPile.AddRange(deck); Shuffle(drawPile); discard.Clear(); hand.Clear(); BeginTurn(); AddLog($"遭遇 {EnemyName}");
        }
        private void BeginTurn() { Resource = perTurnResource; Draw(5 - hand.Count); Message = $"{EnemyName} 准备造成 {EnemyDamage} 点伤害"; }
        public void PlayCard(int index, string targetId = null)
        {
            if (combat != null) { Atomic(() => PlayCombatCard(index, targetId)); return; }
            if (Phase != NativePhase.Combat || index < 0 || index >= hand.Count) return;
            var id = hand[index]; var card = CardFor(id); if (card.cost > Resource) { Message = "资源不足"; return; }
            Resource -= card.cost; EnemyHealth = Math.Max(0, EnemyHealth - card.damage); Block += card.block; hand.RemoveAt(index); discard.Add(id); Draw(card.draw); AddLog($"使用 {card.name}");
            if (EnemyHealth <= 0) WinCombat();
        }
        public void EndTurn()
        {
            if (combat != null) { Atomic(EndCombatTurn); return; }
            if (Phase != NativePhase.Combat) return;
            var damage = Math.Max(0, EnemyDamage - Block); Block = Math.Max(0, Block - EnemyDamage); Health -= damage; AddLog($"{EnemyName} 造成 {damage} 点伤害");
            discard.AddRange(hand); hand.Clear(); if (Health <= 0) Finish(false); else BeginTurn();
        }
        private void WinCombat()
        {
            Gold += random.Integer("native:gold", 20, 60); Score += 40; AddLog($"击败 {EnemyName}");
            if (IsBossNode) { Score += 200; Phase = NativePhase.Reward; Message = "首领已倒下，选择奖励。"; }
            else { Phase = NativePhase.Map; Message = "战斗胜利，获得代币。"; }
        }
        public void ChooseReward(int option) => Atomic(() => ChooseRewardCore(option));
        private void ChooseRewardCore(int option)
        {
            RequirePhase(NativePhase.Reward);
            if (rewardIds.Count > 0) { ClaimContentReward(option); return; }
            if (option < 0 || option > 2) throw new ArgumentOutOfRangeException(nameof(option));
            if (option == 0) { Gold += 150; Message = "获得 150 代币"; }
            else if (option == 1) { Health = Math.Min(MaxHealth, Health + Mathf.CeilToInt(MaxHealth * .3f)); Message = "恢复 30% 生命"; }
            else { var pool = new[] { "card.throw-rock", "card.sand-toss", "card.smash" }; AddCard(random.Pick("native:reward", pool)); Message = "获得一张新卡牌"; }
            if (!IsBossNode) { Phase = NativePhase.Map; return; }
            if (Floor >= content.mapRules.floorCount) Finish(true);
            else { Floor++; Node = 0; Score += 150; if (map != null) map = new RouteGenerator(content.mapRules, content.nodes, random).Generate(Floor); Phase = NativePhase.Map; }
        }
        public void BuyHeal() { RequirePhase(NativePhase.Shop); if (Gold < 100) { Message = "代币不足"; return; } Gold -= 100; Health = Math.Min(MaxHealth, Health + Mathf.CeilToInt(MaxHealth * .3f)); Message = "伤势得到处理"; revision++; }
        public void BuyCard() { RequirePhase(NativePhase.Shop); if (Gold < 50) { Message = "代币不足"; return; } Gold -= 50; AddCard("card.throw-rock"); Message = "购买了投掷石头"; revision++; }
        public void LeaveShop() { RequirePhase(NativePhase.Shop); Phase = setupShop ? NativePhase.ThemeSelect : NativePhase.Map; setupShop = false; Message = "离开商店"; revision++; }
        public void ResolveEvent(int option)
        {
            RequirePhase(NativePhase.Event);
            if (option == 0) { Health = Math.Min(MaxHealth, Health + 10); Message = "你从余火中恢复了生命"; }
            else { Gold += 60; Health = Math.Max(1, Health - 8); Message = "你冒险取得了 60 代币"; }
            Phase = NativePhase.Map;
            revision++;
        }
        public void Rest(bool heal)
        {
            RequirePhase(NativePhase.Rest);
            if (heal) { Health = Math.Min(MaxHealth, Health + Mathf.CeilToInt(MaxHealth * .3f)); Message = "休息后恢复了生命"; }
            else { Gold += 25; Message = "整理装备并发现 25 代币"; }
            Phase = NativePhase.Map;
            revision++;
        }
        private void Finish(bool victory) { Phase = NativePhase.Result; if (victory) Score += 800; Score += Math.Max(0, Health) * 2; Message = victory ? "你穿过了四层废土。" : $"你倒在了 {EnemyName} 面前。"; }
        public void ReturnMenu() { Phase = NativePhase.Menu; CharacterId = ""; resumePhase = NativePhase.Map; }
        private void Draw(int count)
        {
            for (var i = 0; i < count && hand.Count < 10; i++) { if (drawPile.Count == 0) { drawPile.AddRange(discard); discard.Clear(); Shuffle(drawPile); } if (drawPile.Count == 0) break; hand.Add(drawPile[0]); drawPile.RemoveAt(0); }
        }
        private void Shuffle(List<string> values) { var shuffled = random.Shuffle("native:deck", values); values.Clear(); values.AddRange(shuffled); }
        private void AddLog(string value) { log.Insert(0, value); if (log.Count > 8) log.RemoveAt(log.Count - 1); }

        public NativeRunSave Export() => new() { phase = (Phase == NativePhase.Menu || Phase == NativePhase.Settings || Phase == NativePhase.Encyclopedia ? resumePhase : Phase).ToString(), characterId = CharacterId, health = Health, maxHealth = MaxHealth, gold = Gold, floor = Floor, node = Node, score = Score, resource = Resource, block = Block, enemyHealth = EnemyHealth, enemyMaxHealth = EnemyMaxHealth, enemyDamage = EnemyDamage, enemyName = EnemyName, deck = new List<string>(deck), hand = new List<string>(hand), drawPile = new List<string>(drawPile), discard = new List<string>(discard), random = random.ExportState(), log = new List<string>(log), setup = Copy(setup), map = Copy(map), cardInstances = instances.ConvertAll(Copy), collectibles = new List<string>(collectibles), perTurnResource = perTurnResource, setupShop = setupShop,
            combat = Copy(combat), runStatuses = runStatuses.ConvertAll(Copy), encounteredEnemyIds = new List<string>(encounteredEnemyIds), revision = revision, battlesStarted = battlesStarted, battlesWon = battlesWon, damageTaken = damageTaken,
            rewardIds = new List<string>(rewardIds), rewardContinuation = rewardContinuation };
        public void Restore(NativeRunSave value)
        {
            if (value == null || value.schemaVersion < 1 || value.schemaVersion > 4 || !Enum.TryParse(value.phase, out NativePhase phase)) return;
            combat = value.schemaVersion >= 4 && !string.IsNullOrEmpty(value.combat?.encounterId) ? Copy(value.combat) : null;
            runStatuses.Clear(); if (value.runStatuses != null) runStatuses.AddRange(value.runStatuses.ConvertAll(Copy));
            encounteredEnemyIds.Clear(); if (value.encounteredEnemyIds != null) encounteredEnemyIds.AddRange(value.encounteredEnemyIds);
            revision = value.revision; battlesStarted = value.battlesStarted; battlesWon = value.battlesWon; damageTaken = value.damageTaken;
            rewardIds.Clear(); if (value.rewardIds != null) rewardIds.AddRange(value.rewardIds); rewardContinuation = value.rewardContinuation;
            setup = value.schemaVersion >= 3 ? Copy(value.setup) : null;
            map = value.schemaVersion >= 3 && value.map?.nodes?.Count > 0 ? Copy(value.map) : null;
            setupShop = value.schemaVersion >= 3 && value.setupShop;
            instances.Clear(); if (value.cardInstances != null) instances.AddRange(value.cardInstances.ConvertAll(Copy));
            collectibles.Clear(); if (value.collectibles != null) collectibles.AddRange(value.collectibles);
            perTurnResource = value.schemaVersion >= 3 ? value.perTurnResource : 3;
            Phase = phase; resumePhase = phase; CharacterId = value.characterId; Health = value.health; MaxHealth = value.maxHealth; Gold = value.gold; Floor = value.floor; Node = value.node; Score = value.score; Resource = value.resource; Block = value.block; EnemyHealth = value.enemyHealth; EnemyMaxHealth = value.enemyMaxHealth; EnemyDamage = value.enemyDamage; EnemyName = value.enemyName;
            deck.Clear(); deck.AddRange(value.deck ?? new List<string>());
            hand.Clear(); hand.AddRange(value.hand ?? new List<string>());
            log.Clear(); log.AddRange(value.log ?? new List<string>());
            drawPile.Clear(); discard.Clear();
            if (value.schemaVersion >= 2)
            {
                drawPile.AddRange(value.drawPile ?? new List<string>());
                discard.AddRange(value.discard ?? new List<string>());
                random = value.random?.seed == null ? new NamespacedRandom("20260908") : new NamespacedRandom(value.random);
            }
            else
            {
                // Legacy saves never recorded pile order. Reconstruct only cards outside the hand.
                drawPile.AddRange(deck);
                foreach (var card in hand) drawPile.Remove(card);
                random = new NamespacedRandom("20260908");
            }
            Message = value.schemaVersion == 1 ? "已恢复旧版进度；旧存档不含牌堆和随机状态，已重建剩余牌堆。" : "已恢复上次进度";
        }
    }
}
