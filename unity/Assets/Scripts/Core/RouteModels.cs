using System;
using System.Collections.Generic;

namespace RoguelikeCardFramework.Core
{
    [Serializable] public sealed class NativeRange { public int min, max; }
    [Serializable] public sealed class NativeMapWeights { public double combat, @event; }
    [Serializable] public sealed class NativeMapRules
    {
        public int floorCount, minNodes, maxNodes, rows, maxNodesPerRow, eliteCount;
        public NativeRange shopCount, rewardCount, restCount;
        public NativeMapWeights remainingWeights;
    }
    [Serializable] public sealed class NativeNodeDefinition
    {
        public string id, handlerId;
        public List<int> floors;
        public List<string> encounterPool, eventPool, rewardPool;
    }
    [Serializable] public sealed class NativeMapNode
    {
        public string id, definitionId, handlerId, iconKey;
        public int layer, column;
        public bool visited, available;
        public List<string> connections = new();
    }
    [Serializable] public sealed class NativeMapState
    {
        public string currentNodeId;
        public List<NativeMapNode> nodes = new();
    }
    [Serializable] public sealed class NativeCardInstance
    {
        public string instanceId, definitionId;
        public int upgradeLevel;
    }
    [Serializable] public sealed class NativeSetupState
    {
        public List<string> boonOffers = new();
        public string selectedBoonId, themeId;
        public int pendingCardRemovals;
    }
}
