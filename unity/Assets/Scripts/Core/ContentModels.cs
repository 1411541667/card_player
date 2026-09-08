using System;
using System.Collections.Generic;

namespace RoguelikeCardFramework.Core
{
    [Serializable] public sealed class ContentTable<T> { public List<T> items = new(); }
    [Serializable] public sealed class CardDefinition { public string id; public string nameKey; public string type; public int cost; }
    [Serializable] public sealed class CharacterDefinition { public string id; public string nameKey; public int maxHealth; public string resourceId; }
    [Serializable] public sealed class EnemyDefinition { public string id; public string nameKey; public int maxHealth; }
    [Serializable] public sealed class EventDefinition { public string id; public string titleKey; }
    [Serializable] public sealed class ContentSummary
    {
        public int cards;
        public int characters;
        public int enemies;
        public int events;
        public string packId = "wasteland";
        public string packVersion = "1";
    }
}
