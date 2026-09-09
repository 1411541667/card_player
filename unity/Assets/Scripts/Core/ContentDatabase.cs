using System.Collections.Generic;
using System.IO;
using System;
using UnityEngine;

namespace RoguelikeCardFramework.Core
{
    public sealed class NativeCard
    {
        public string id, name, description, type, resource, target, playDestination;
        public List<string> tags;
        public List<NativeEffect> effects;
        public int cost, damage, block, draw;
        public readonly List<NativeCard> upgrades = new();
    }
    public sealed class NativeCharacter { public string id, name, resource; public int health; public readonly List<string> deck = new(); public List<string> collectibles; }
    public sealed class NativeEnemy { public string id, name; public int health, damage; public List<NativeIntent> intents = new(); }

    public sealed partial class ContentDatabase
    {
        public readonly Dictionary<string, string> text = new();
        public readonly Dictionary<string, NativeCard> cards = new();
        public readonly Dictionary<string, NativeCharacter> characters = new();
        public readonly List<NativeEnemy> enemies = new();
        public NativeMapRules mapRules;
        public readonly List<NativeNodeDefinition> nodes = new();
        public readonly List<string> startingBoons = new(), startingCollectibles = new(), startingDeck = new();
        public readonly Dictionary<string, int> resourcePerTurn = new();
        public int startingGold, minimumDeckSize;
        private readonly string root;

        public ContentDatabase(string rootPath) { root = rootPath; Load(); }
        public string Text(string key) => text.TryGetValue(key, out var value) ? value : key;

        private void Load()
        {
            var localization = MiniJson.Obj(Read("localization.json"));
            if (localization != null) foreach (var pair in localization) text[pair.Key] = pair.Value as string ?? pair.Key;
            var rules = MiniJson.Obj(Read("rules.json"));
            mapRules = JsonUtility.FromJson<MapEnvelope>(File.ReadAllText(Path.Combine(root, "rules.json"))).map;
            // JsonUtility turns omitted lists into empty lists. Preserve missing floors as null:
            // web semantics distinguish unrestricted nodes from an explicitly empty floor list.
            foreach (var item in MiniJson.Arr(Read("nodes.json")))
            {
                var obj = MiniJson.Obj(item);
                nodes.Add(new NativeNodeDefinition { id = MiniJson.Str(obj, "id"), handlerId = MiniJson.Str(obj, "handlerId"),
                    floors = obj.TryGetValue("floors", out var floors) ? MiniJson.Arr(floors).ConvertAll(v => Convert.ToInt32(v)) : null,
                    encounterPool = Strings(obj, "encounterPool"), eventPool = Strings(obj, "eventPool"), rewardPool = Strings(obj, "rewardPool") });
            }
            startingGold = MiniJson.Int(rules, "startingGold");
            minimumDeckSize = MiniJson.Int(MiniJson.Obj(MiniJson.Obj(rules["shop"])["removal"]), "minimumDeckSize");
            foreach (var id in MiniJson.Arr(rules["startingBoonIds"])) startingBoons.Add((string)id);
            foreach (var id in MiniJson.Arr(rules["startingCollectibleIds"])) startingCollectibles.Add((string)id);
            foreach (var id in MiniJson.Arr(rules["startingDeck"])) startingDeck.Add((string)id);
            foreach (var pair in MiniJson.Obj(rules["resources"])) resourcePerTurn.Add(pair.Key, MiniJson.Int(MiniJson.Obj(pair.Value), "perTurn"));
            foreach (var item in MiniJson.Arr(Read("cards.json")) ?? new List<object>())
            {
                var obj = MiniJson.Obj(item); var id = MiniJson.Str(obj, "id");
                var card = new NativeCard { id = id, name = Text(MiniJson.Str(obj, "nameKey")), description = Text(MiniJson.Str(obj, "descriptionKey")), type = MiniJson.Str(obj, "type") };
                var cost = MiniJson.Obj(obj["cost"]); card.resource = MiniJson.Str(cost, "resourceId"); card.cost = MiniJson.Int(cost, "amount");
                var effects = MiniJson.Arr(obj["effects"]); if (effects != null) foreach (var effectValue in effects) ApplyCardEffect(card, MiniJson.Obj(effectValue));
                card.effects = Effects(obj["effects"]); card.tags = Strings(obj, "tags") ?? new List<string>();
                card.target = MiniJson.Str(obj, "target"); card.playDestination = MiniJson.Str(obj, "playDestination");
                if (obj.TryGetValue("upgrades", out var upgrades)) foreach (var value in MiniJson.Arr(upgrades))
                {
                    var upgrade = MiniJson.Obj(value);
                    var level = new NativeCard { id = id, name = card.name, type = card.type, resource = card.resource, cost = card.cost,
                        description = upgrade.ContainsKey("descriptionKey") ? Text(MiniJson.Str(upgrade, "descriptionKey")) : card.description };
                    if (upgrade.TryGetValue("cost", out var upgradedCost)) { level.cost = MiniJson.Int(MiniJson.Obj(upgradedCost), "amount"); level.resource = MiniJson.Str(MiniJson.Obj(upgradedCost), "resourceId"); }
                    foreach (var effect in MiniJson.Arr(upgrade.TryGetValue("effects", out var upgradedEffects) ? upgradedEffects : obj["effects"])) ApplyCardEffect(level, MiniJson.Obj(effect));
                    level.effects = Effects(upgrade.TryGetValue("effects", out var fullEffects) ? fullEffects : obj["effects"]);
                    level.tags = card.tags; level.target = card.target; level.playDestination = card.playDestination;
                    card.upgrades.Add(level);
                }
                cards[id] = card;
            }
            foreach (var item in MiniJson.Arr(Read("characters.json")) ?? new List<object>())
            {
                var obj = MiniJson.Obj(item); var character = new NativeCharacter { id = MiniJson.Str(obj, "id"), name = Text(MiniJson.Str(obj, "nameKey")), health = MiniJson.Int(obj, "maxHealth"), resource = MiniJson.Str(obj, "resourceId") };
                if (obj.TryGetValue("startingDeck", out var deck)) foreach (var card in MiniJson.Arr(deck)) character.deck.Add(card as string);
                if (obj.TryGetValue("startingCollectibleIds", out var collectibles)) character.collectibles = MiniJson.Arr(collectibles).ConvertAll(v => (string)v);
                characters[character.id] = character;
            }
            foreach (var item in MiniJson.Arr(Read("enemies.json")) ?? new List<object>())
            {
                var obj = MiniJson.Obj(item); var enemy = new NativeEnemy { id = MiniJson.Str(obj, "id"), name = Text(MiniJson.Str(obj, "nameKey")), health = MiniJson.Int(obj, "maxHealth") };
                if (obj.TryGetValue("intents", out var intents) && MiniJson.Arr(intents).Count > 0)
                {
                    var intent = MiniJson.Obj(MiniJson.Arr(intents)[0]);
                    foreach (var effectValue in MiniJson.Arr(intent["effects"])) { var effect = MiniJson.Obj(effectValue); if (MiniJson.Str(effect, "effectId") == "core.damage") enemy.damage = MiniJson.Int(MiniJson.Obj(effect["params"]), "amount"); }
                }
                enemies.Add(enemy);
            }
            LoadCombatContent(rules);
        }
        private object Read(string file) => MiniJson.Deserialize(File.ReadAllText(Path.Combine(root, file)));
        [Serializable] private sealed class MapEnvelope { public NativeMapRules map; }
        private static List<string> Strings(Dictionary<string, object> obj, string key) => obj.TryGetValue(key, out var value) ? MiniJson.Arr(value).ConvertAll(v => (string)v) : null;
        private static void ApplyCardEffect(NativeCard card, Dictionary<string, object> effect)
        {
            var id = MiniJson.Str(effect, "effectId"); var data = MiniJson.Obj(effect["params"]);
            if (id == "core.damage") card.damage += MiniJson.Int(data, "amount");
            if (id == "core.block") card.block += MiniJson.Int(data, "amount");
            if (id == "core.draw") card.draw += MiniJson.Int(data, "amount");
        }
    }
}
