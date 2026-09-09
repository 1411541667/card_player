using System;
using System.Collections.Generic;

namespace RoguelikeCardFramework.Core
{
    public sealed partial class NativeGameSession
    {
        private readonly List<string> rewardIds = new();
        private string rewardContinuation;
        public IReadOnlyList<string> RewardIds => rewardIds.AsReadOnly();
        public string RewardLabel(string id) => content.rewards[id].name;
        private void ClaimContentReward(int index)
        {
            if (index < 0 || index >= rewardIds.Count) throw new ArgumentOutOfRangeException(nameof(index));
            var reward = content.rewards[rewardIds[index]];
            switch (reward.type)
            {
                case "currency": Gold += (int)reward.amount; break;
                case "healing": Health = Math.Min(MaxHealth, Health + (int)Math.Ceiling(MaxHealth * reward.amount)); break;
                case "card": AddCard(reward.cardId); break;
                case "collectible":
                    if (!collectibles.Contains(reward.collectibleId))
                    {
                        collectibles.Add(reward.collectibleId);
                        ExecuteCombatEffects(content.collectibleDefinitions[reward.collectibleId].onAcquire, "player", "player");
                    }
                    break;
                default: throw new InvalidOperationException("Unknown reward type: " + reward.type);
            }
            if (rewardContinuation == "next-floor")
            {
                Floor++; Score += 150; map = new RouteGenerator(content.mapRules, content.nodes, random).Generate(Floor);
            }
            rewardIds.Clear(); rewardContinuation = null; Phase = NativePhase.Map; Message = "已领取奖励。";
        }
    }
}
