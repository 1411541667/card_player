using System;
using System.Collections.Generic;

namespace RoguelikeCardFramework.Core
{
    public sealed class NativeEffect { public string id; public Dictionary<string, object> parameters; }
    public sealed class NativeIntent { public string id, name, target; public List<NativeEffect> effects; }
    public sealed class NativeEncounter { public string id, category; public int enemyCount = 1; public List<string> enemyIds, rewardPool; }
    public sealed class NativeTrigger { public string hook, cardTag; public int every; public List<NativeEffect> effects; }
    public sealed class NativeCollectible { public List<NativeTrigger> triggers = new(); public List<NativeEffect> onAcquire = new(); }
    public sealed class NativeStatusDefinition { public string stacking; public Dictionary<string, List<NativeEffect>> triggers = new(); }
    public sealed class NativeRewardDefinition { public string id, name, type, cardId, collectibleId; public double amount; }
    [Serializable] public sealed class NativeStatus
    {
        public string definitionId, scope;
        public int stacks, duration;
        public bool hasDuration;
    }
    [Serializable] public sealed class NativeResource { public string id; public int amount; }
    [Serializable] public sealed class NativeCombatEnemy
    {
        public string instanceId, definitionId;
        public int health, block, intentIndex;
        public List<NativeStatus> statuses = new();
    }
    [Serializable] public sealed class NativeCombatState
    {
        public string encounterId;
        public int turn = 1, cardsDrawn, angerAttacksUsed, concealAttacksUsed;
        public List<NativeCombatEnemy> enemies = new();
        public List<NativeResource> resources = new();
        public List<NativeStatus> statuses = new();
        public List<string> exhaust = new();
    }
}
