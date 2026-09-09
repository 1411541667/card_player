using System;
using System.Collections.Generic;

namespace RoguelikeCardFramework.Core
{
    public sealed partial class ContentDatabase
    {
        public readonly Dictionary<string, NativeEncounter> encounters = new();
        public readonly Dictionary<string, NativeCollectible> collectibleDefinitions = new();
        public readonly Dictionary<string, NativeStatusDefinition> statuses = new();
        public readonly Dictionary<string, NativeRewardDefinition> rewards = new();
        public readonly Dictionary<string, int> resourceMaximums = new();
        public int handSize, handLimit, normalGoldMin, normalGoldMax, rewardChoiceCount;
        public bool discardHandAtEnd, clearBlockAtStart;
        private static List<NativeEffect> Effects(object value)
        {
            var result = new List<NativeEffect>();
            foreach (var item in MiniJson.Arr(value) ?? new List<object>())
            {
                var obj = MiniJson.Obj(item);
                result.Add(new NativeEffect { id = MiniJson.Str(obj, "effectId"), parameters = obj.TryGetValue("params", out var p) ? MiniJson.Obj(p) : new Dictionary<string, object>() });
            }
            return result;
        }
        private void LoadCombatContent(Dictionary<string, object> rules)
        {
            handSize = MiniJson.Int(rules, "handSize"); handLimit = MiniJson.Int(rules, "handLimit");
            rewardChoiceCount = MiniJson.Int(rules, "rewardChoiceCount");
            var turn = MiniJson.Obj(rules["turn"]); discardHandAtEnd = (bool)turn["discardHandAtEnd"]; clearBlockAtStart = (bool)turn["clearBlockAtStart"];
            var gold = MiniJson.Obj(rules["normalCombatGold"]); normalGoldMin = MiniJson.Int(gold, "min"); normalGoldMax = MiniJson.Int(gold, "max");
            foreach (var pair in MiniJson.Obj(rules["resources"]))
                if (MiniJson.Obj(pair.Value).TryGetValue("maximum", out var max)) resourceMaximums[pair.Key] = Convert.ToInt32(max);
            foreach (var item in MiniJson.Arr(Read("enemies.json")))
            {
                var obj = MiniJson.Obj(item); var enemy = enemies.Find(e => e.id == MiniJson.Str(obj, "id"));
                foreach (var value in MiniJson.Arr(obj["intents"]))
                {
                    var intent = MiniJson.Obj(value);
                    enemy.intents.Add(new NativeIntent { id = MiniJson.Str(intent, "id"), name = Text(MiniJson.Str(intent, "nameKey")), target = MiniJson.Str(intent, "target"), effects = Effects(intent["effects"]) });
                }
            }
            foreach (var item in MiniJson.Arr(Read("encounters.json")))
            {
                var obj = MiniJson.Obj(item); var id = MiniJson.Str(obj, "id");
                encounters.Add(id, new NativeEncounter { id = id, category = MiniJson.Str(obj, "category"), enemyCount = MiniJson.Int(obj, "enemyCount", 1), enemyIds = Strings(obj, "enemyIds"), rewardPool = Strings(obj, "rewardPool") });
            }
            foreach (var item in MiniJson.Arr(Read("statuses.json")))
            {
                var obj = MiniJson.Obj(item); var definition = new NativeStatusDefinition { stacking = MiniJson.Str(obj, "stacking") };
                if (obj.TryGetValue("triggers", out var triggers)) foreach (var trigger in MiniJson.Obj(triggers)) definition.triggers.Add(trigger.Key, Effects(trigger.Value));
                statuses.Add(MiniJson.Str(obj, "id"), definition);
            }
            foreach (var item in MiniJson.Arr(Read("collectibles.json")))
            {
                var obj = MiniJson.Obj(item); var definition = new NativeCollectible();
                if (obj.TryGetValue("onAcquire", out var acquire)) definition.onAcquire = Effects(acquire);
                if (obj.TryGetValue("triggers", out var triggers)) foreach (var value in MiniJson.Arr(triggers))
                {
                    var trigger = MiniJson.Obj(value);
                    definition.triggers.Add(new NativeTrigger { hook = MiniJson.Str(trigger, "hook"), cardTag = MiniJson.Str(trigger, "cardTag"), every = MiniJson.Int(trigger, "every"), effects = Effects(trigger["effects"]) });
                }
                collectibleDefinitions.Add(MiniJson.Str(obj, "id"), definition);
            }
            foreach (var item in MiniJson.Arr(Read("rewards.json")))
            {
                var obj = MiniJson.Obj(item); var id = MiniJson.Str(obj, "id");
                rewards.Add(id, new NativeRewardDefinition { id = id, name = Text(MiniJson.Str(obj, "nameKey")), type = MiniJson.Str(obj, "type"),
                    cardId = MiniJson.Str(obj, "cardId"), collectibleId = MiniJson.Str(obj, "collectibleId"), amount = obj.TryGetValue("amount", out var amount) ? Convert.ToDouble(amount) : 0 });
            }
        }
    }
}
