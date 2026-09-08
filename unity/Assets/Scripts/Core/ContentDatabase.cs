using System.Collections.Generic;
using System.IO;

namespace RoguelikeCardFramework.Core
{
    public sealed class NativeCard
    {
        public string id, name, description, type, resource;
        public int cost, damage, block, draw;
    }
    public sealed class NativeCharacter { public string id, name, resource; public int health; public readonly List<string> deck = new(); }
    public sealed class NativeEnemy { public string id, name; public int health, damage; }

    public sealed class ContentDatabase
    {
        public readonly Dictionary<string, string> text = new();
        public readonly Dictionary<string, NativeCard> cards = new();
        public readonly Dictionary<string, NativeCharacter> characters = new();
        public readonly List<NativeEnemy> enemies = new();
        private readonly string root;

        public ContentDatabase(string rootPath) { root = rootPath; Load(); }
        public string Text(string key) => text.TryGetValue(key, out var value) ? value : key;

        private void Load()
        {
            var localization = MiniJson.Obj(Read("localization.json"));
            if (localization != null) foreach (var pair in localization) text[pair.Key] = pair.Value as string ?? pair.Key;
            foreach (var item in MiniJson.Arr(Read("cards.json")) ?? new List<object>())
            {
                var obj = MiniJson.Obj(item); var id = MiniJson.Str(obj, "id");
                var card = new NativeCard { id = id, name = Text(MiniJson.Str(obj, "nameKey")), description = Text(MiniJson.Str(obj, "descriptionKey")), type = MiniJson.Str(obj, "type") };
                var cost = MiniJson.Obj(obj["cost"]); card.resource = MiniJson.Str(cost, "resourceId"); card.cost = MiniJson.Int(cost, "amount");
                var effects = MiniJson.Arr(obj["effects"]); if (effects != null) foreach (var effectValue in effects) ApplyCardEffect(card, MiniJson.Obj(effectValue));
                cards[id] = card;
            }
            foreach (var item in MiniJson.Arr(Read("characters.json")) ?? new List<object>())
            {
                var obj = MiniJson.Obj(item); var character = new NativeCharacter { id = MiniJson.Str(obj, "id"), name = Text(MiniJson.Str(obj, "nameKey")), health = MiniJson.Int(obj, "maxHealth"), resource = MiniJson.Str(obj, "resourceId") };
                if (obj.TryGetValue("startingDeck", out var deck)) foreach (var card in MiniJson.Arr(deck)) character.deck.Add(card as string);
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
        }
        private object Read(string file) => MiniJson.Deserialize(File.ReadAllText(Path.Combine(root, file)));
        private static void ApplyCardEffect(NativeCard card, Dictionary<string, object> effect)
        {
            var id = MiniJson.Str(effect, "effectId"); var data = MiniJson.Obj(effect["params"]);
            if (id == "core.damage") card.damage += MiniJson.Int(data, "amount");
            if (id == "core.block") card.block += MiniJson.Int(data, "amount");
            if (id == "core.draw") card.draw += MiniJson.Int(data, "amount");
        }
    }
}
