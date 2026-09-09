using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace RoguelikeCardFramework.Core
{
    public sealed partial class NativeGameSession
    {
        private NativeSetupState setup;
        private NativeMapState map;
        private readonly List<NativeCardInstance> instances = new();
        private readonly List<string> collectibles = new();
        private int perTurnResource = 3;
        private bool setupShop;
        private static T Copy<T>(T value) where T : class => value == null ? null : JsonUtility.FromJson<T>(JsonUtility.ToJson(value));
        public NativeSetupState Setup => Copy(setup);
        public NativeMapState Map => Copy(map);
        public IReadOnlyList<string> Deck => deck.AsReadOnly();
        public IReadOnlyList<string> Collectibles => collectibles.AsReadOnly();
        private bool IsBossNode => map == null ? Node >= 6 : map.nodes.Find(n => n.id == map.currentNodeId)?.handlerId == "core.boss";
        private void RequirePhase(NativePhase expected)
        {
            if (Phase != expected) throw new InvalidOperationException($"Expected {expected}, got {Phase}.");
        }
        private void AddCard(string definitionId, string instanceId = null)
        {
            if (!content.cards.ContainsKey(definitionId)) throw new ArgumentException("Unknown card: " + definitionId);
            var id = instanceId ?? $"card-{deck.Count}-{revision}-{definitionId}";
            instances.Add(new NativeCardInstance { instanceId = id, definitionId = definitionId }); deck.Add(id);
        }
        public NativeCard CardFor(string instanceId)
        {
            var instance = instances.Find(c => c.instanceId == instanceId);
            var definition = content.cards[instance?.definitionId ?? instanceId];
            return instance != null && instance.upgradeLevel > 0 ? definition.upgrades[instance.upgradeLevel - 1] : definition;
        }
        public void ChooseBoon(string id)
        {
            RequirePhase(NativePhase.BoonSelect);
            if (!setup.boonOffers.Contains(id)) throw new ArgumentException("Boon is not offered: " + id);
            switch (id)
            {
                case "boon.max-card":
                    var eligible = instances.Where(c => content.cards[c.definitionId].upgrades.Count > 0).ToList();
                    var selected = random.Pick("setup:max-card", eligible);
                    selected.upgradeLevel = content.cards[selected.definitionId].upgrades.Count;
                    break;
                case "boon.max-health": MaxHealth = (int)Math.Ceiling(MaxHealth * 1.3); Health = MaxHealth; break;
                case "boon.gold-shop": Gold += 100; setupShop = true; break;
                case "boon.resource": perTurnResource++; break;
                case "boon.greedy-coin": if (!collectibles.Contains("collectible.greedy-coin")) collectibles.Add("collectible.greedy-coin"); break;
                case "boon.remove-three": setup.pendingCardRemovals = 3; break;
                default: throw new ArgumentException("Unknown boon: " + id);
            }
            setup.selectedBoonId = id;
            Phase = setupShop ? NativePhase.Shop : setup.pendingCardRemovals > 0 ? NativePhase.BoonRemove : NativePhase.ThemeSelect;
            Message = "已选择开局祝福。";
            revision++;
        }
        public void RemoveStartingCard(string instanceId)
        {
            RequirePhase(NativePhase.BoonRemove);
            if (!deck.Contains(instanceId)) throw new ArgumentException("Card is not in deck.");
            if (deck.Count <= content.minimumDeckSize) throw new InvalidOperationException("Minimum deck size reached.");
            deck.Remove(instanceId); instances.RemoveAll(c => c.instanceId == instanceId); setup.pendingCardRemovals--;
            if (setup.pendingCardRemovals == 0) Phase = NativePhase.ThemeSelect;
            revision++;
        }
        public void ChooseTheme(string id)
        {
            RequirePhase(NativePhase.ThemeSelect);
            if (id != "theme.dust") throw new ArgumentException("Theme is unavailable: " + id);
            var generated = new RouteGenerator(content.mapRules, content.nodes, random).Generate(Floor);
            setup.themeId = id; map = generated; Phase = NativePhase.Map; Message = "选择路线起点。";
            revision++;
        }
        public string NodeLabel(string id)
        {
            var node = map?.nodes.Find(n => n.id == id);
            if (node == null) return id;
            var label = node.handlerId switch { "core.combat" => "战斗", "core.elite" => "精英战", "core.boss" => "首领战", "core.shop" => "商店", "core.event" => "事件", "core.reward" => "奖励", "core.rest" => "休整", _ => node.handlerId };
            return $"第 {node.layer + 1} 行 · 路线 {node.column + 1} · {label}";
        }
        public void SetMapInk(System.Collections.Generic.IEnumerable<NativeMapInk> cells)
        {
            RequirePhase(NativePhase.Map);
            map.ink = cells.Take(6000).Select(c => new NativeMapInk { x = c.x, y = c.y, color = c.color }).ToList();
        }
        private void EnterRouteNode(string id)
        {
            var node = map.nodes.Find(n => n.id == id);
            if (node == null || !node.available || node.visited) throw new InvalidOperationException("Map node is not available: " + id);
            foreach (var candidate in map.nodes) candidate.available = node.connections.Contains(candidate.id);
            node.visited = true; map.currentNodeId = id; Node++; Score += 10;
            switch (node.handlerId)
            {
                case "core.combat": case "core.elite": case "core.boss":
                    var definition = content.nodes.Find(n => n.id == node.definitionId);
                    StartEncounter(random.Pick($"node:{node.id}:encounter", definition.encounterPool)); break;
                case "core.shop": Phase = NativePhase.Shop; break;
                case "core.event": Phase = NativePhase.Event; break;
                case "core.rest": Phase = NativePhase.Rest; break;
                case "core.reward":
                    var pool = random.Shuffle($"node:{node.id}:reward", content.nodes.Find(n => n.id == node.definitionId).rewardPool);
                    rewardIds.Clear(); rewardIds.Add(random.Pick($"node:{node.id}:fixed-reward", pool)); rewardContinuation = "map";
                    Phase = NativePhase.Reward; break;
                default: throw new InvalidOperationException("Unknown node handler: " + node.handlerId);
            }
            if (Phase != NativePhase.Combat) Message = NodeLabel(id);
        }
    }
}

