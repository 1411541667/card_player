using System;
using System.IO;
using UnityEngine;

namespace RoguelikeCardFramework.Core
{
    [Serializable] public sealed class MetaProgressSave
    {
        public int schemaVersion = 1;
        public int metaCurrency;
        public string[] unlockedCharacters = Array.Empty<string>();
        public string[] unlockedCards = Array.Empty<string>();
        public string[] discoveredStory = Array.Empty<string>();
    }

    public sealed class SaveStore
    {
        private readonly string path;
        public SaveStore(string gameName = "异变独行")
        {
            path = System.IO.Path.Combine(Application.persistentDataPath, "meta-progress.json");
        }
        public string Path => path;
        public MetaProgressSave Load()
        {
            try { return File.Exists(path) ? JsonUtility.FromJson<MetaProgressSave>(File.ReadAllText(path)) ?? new MetaProgressSave() : new MetaProgressSave(); }
            catch (Exception error) { Debug.LogWarning($"Save load failed: {error.Message}"); return new MetaProgressSave(); }
        }
        public void Save(MetaProgressSave value)
        {
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(path));
            File.WriteAllText(path, JsonUtility.ToJson(value, true));
        }
        public void SaveRun(NativeRunSave value)
        {
            var runPath = System.IO.Path.Combine(System.IO.Path.GetDirectoryName(path), "run.json"); Directory.CreateDirectory(System.IO.Path.GetDirectoryName(runPath)); File.WriteAllText(runPath, JsonUtility.ToJson(value, true));
        }
        public NativeRunSave LoadRun()
        {
            var runPath = System.IO.Path.Combine(System.IO.Path.GetDirectoryName(path), "run.json");
            try { return File.Exists(runPath) ? JsonUtility.FromJson<NativeRunSave>(File.ReadAllText(runPath)) : null; } catch { return null; }
        }
    }
}
