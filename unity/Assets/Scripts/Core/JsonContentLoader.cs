using System;
using System.IO;
using UnityEngine;

namespace RoguelikeCardFramework.Core
{
    public sealed class JsonContentLoader
    {
        private readonly string root;
        public JsonContentLoader(string rootPath) { root = rootPath; }

        public ContentSummary LoadSummary()
        {
            return new ContentSummary
            {
                cards = Count("cards.json"),
                characters = Count("characters.json"),
                enemies = Count("enemies.json"),
                events = Count("events.json")
            };
        }

        private int Count(string file)
        {
            var path = Path.Combine(root, file);
            if (!File.Exists(path)) return 0;
            try
            {
                var json = File.ReadAllText(path);
                var items = MiniJson.Arr(MiniJson.Deserialize(json));
                return items == null ? 0 : items.Count;
            }
            catch (Exception error)
            {
                Debug.LogWarning($"Unable to read content {file}: {error.Message}");
                return 0;
            }
        }

    }
}
