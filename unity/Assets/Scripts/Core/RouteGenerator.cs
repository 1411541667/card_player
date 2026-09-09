using System;
using System.Collections.Generic;
using System.Linq;

namespace RoguelikeCardFramework.Core
{
    /// <summary>Port of GameKernel.generateMap. Preserve ordering and RNG calls for web parity.</summary>
    public sealed class RouteGenerator
    {
        private readonly NativeMapRules rules;
        private readonly List<NativeNodeDefinition> definitions;
        private readonly NamespacedRandom random;
        private sealed class Slot { public int layer, column; public string handler; }
        private sealed class Edge { public NativeMapNode from, to; public bool mandatory; }
        public RouteGenerator(NativeMapRules rules, List<NativeNodeDefinition> definitions, NamespacedRandom random)
        { this.rules = rules; this.definitions = definitions; this.random = random; }
        private static int Round(double value) => (int)Math.Floor(value + .5); // JavaScript Math.round, not bankers' rounding.
        private List<NativeNodeDefinition> Definitions(string handler, int floor)
        {
            var result = definitions.Where(n => n.handlerId == handler && (n.floors == null || n.floors.Contains(floor))).ToList();
            if (result.Count == 0) throw new InvalidOperationException($"No definition for {handler} on floor {floor}.");
            return result;
        }
        private static string Icon(string handler, int floor) => handler == "core.boss" ? $"map.boss-{floor}" : handler.Replace("core.", "map.");
        public NativeMapState Generate(int floor)
        {
            if (floor < 1 || floor > rules.floorCount) throw new ArgumentOutOfRangeException(nameof(floor));
            var map = new NativeMapState();
            if (floor == 4)
            {
                var handlers = new[] { "core.event", "core.shop", "core.boss" };
                for (var layer = 0; layer < handlers.Length; layer++)
                {
                    var handler = handlers[layer]; var pool = Definitions(handler, floor);
                    var definition = handler == "core.event" ? pool.Find(n => n.eventPool?.Contains("event.piece-truth") == true) ?? pool[0] : pool[0];
                    map.nodes.Add(new NativeMapNode { id = $"floor-{floor}-node-{layer}-0", layer = layer, column = 0,
                        definitionId = definition.id, handlerId = handler, available = layer == 0, iconKey = Icon(handler, floor),
                        connections = layer < 2 ? new List<string> { $"floor-{floor}-node-{layer + 1}-0" } : new List<string>() });
                }
                return map;
            }
            var regular = random.Integer($"map:{floor}:count", rules.minNodes, rules.maxNodes) - 1;
            var shops = random.Integer($"map:{floor}:shops", rules.shopCount.min, rules.shopCount.max);
            var rewards = random.Integer($"map:{floor}:rewards", rules.rewardCount.min, rules.rewardCount.max);
            var rows = Math.Min(rules.rows, Math.Max(3, (int)Math.Ceiling((double)regular / Math.Max(1, rules.maxNodesPerRow))));
            var counts = Enumerable.Range(0, rows).Select(i => regular / rows + (i < regular % rows ? 1 : 0)).ToArray();
            var width = counts.Max(); var center = (width - 1) / 2.0;
            var restTarget = random.Integer($"map:{floor}:rests", rules.restCount.min, rules.restCount.max);
            var extraRests = Math.Max(0, restTarget - counts[rows - 1] - 2);
            var remaining = regular - shops - rewards - rules.eliteCount - (counts[rows - 1] + 2 + extraRests);
            if (remaining < 2) throw new InvalidOperationException("Map budgets leave no combat/event slots.");
            var combats = Math.Max(rules.eliteCount, Round(remaining * rules.remainingWeights.combat / (rules.remainingWeights.combat + rules.remainingWeights.@event)));
            if (remaining - combats < 0) throw new InvalidOperationException("Map budgets leave no event slots.");
            var build = new List<Slot>();
            for (var layer = 0; layer <= rows; layer++)
            {
                var count = layer == rows ? 1 : counts[layer];
                for (var column = 0; column < count; column++) build.Add(new Slot { layer = layer,
                    column = count == 1 ? width / 2 : Round((double)column / Math.Max(1, count - 1) * (width - 1)) });
            }
            build[build.Count - 1].handler = "core.boss";
            foreach (var slot in build.Where(s => s.layer == rows - 1)) slot.handler = "core.rest";
            Slot Nearest(int layer, int column, Slot exclude = null) => build.Where(s => s.layer == layer && s.handler == null && s != exclude)
                .OrderBy(s => Math.Abs(s.column - column)).FirstOrDefault(); // LINQ OrderBy is stable, like JS sort.
            var bases = new[] { Math.Max(0, (int)Math.Floor(width * .15)), Math.Min(width - 1, (int)Math.Floor(width * .85)) };
            var startA = Nearest(0, bases[0]); var startB = Nearest(0, bases[1], startA);
            if (startA == null || startB == null) throw new InvalidOperationException("Cannot allocate route starts.");
            var spineA = new List<Slot> { startA }; var spineB = new List<Slot> { startB };
            for (var i = 0; i < 4; i++)
            {
                var layer = 1 + Round((rows - 3) * i / 3.0); var t = (double)layer / rows;
                var a = Nearest(layer, Math.Max(0, Math.Min(counts[layer] - 1, Round(bases[0] + (center - bases[0]) * t))));
                var b = Nearest(layer, Math.Max(0, Math.Min(counts[layer] - 1, Round(bases[1] + (center - bases[1]) * t))), a);
                if (a == null || b == null) throw new InvalidOperationException("Cannot allocate guaranteed routes.");
                spineA.Add(a); spineB.Add(b);
            }
            var handlersA = new[] { "core.rest", "core.shop", "core.reward", "core.combat" };
            var handlersB = new[] { "core.rest", "core.reward", "core.shop", "core.combat" };
            for (var i = 0; i < 4; i++) { spineA[i + 1].handler = handlersA[i]; spineB[i + 1].handler = handlersB[i]; }
            foreach (var layer in new[] { 1, 1, 2, 2, 3 })
                random.Pick($"map:{floor}:elite:{layer}", build.Where(s => s.layer == layer && s.handler == null).ToList()).handler = "core.elite";
            var extras = Enumerable.Repeat("core.shop", Math.Max(0, shops - 2)).Concat(Enumerable.Repeat("core.reward", Math.Max(0, rewards - 2)))
                .Concat(Enumerable.Repeat("core.rest", extraRests));
            foreach (var handler in random.Shuffle($"map:{floor}:extras", extras))
                random.Pick($"map:{floor}:extra:{handler}", build.Where(s => s.handler == null && s.layer != 0 && s.layer != rows).ToList()).handler = handler;
            var fill = random.Shuffle($"map:{floor}:fill", build.Where(s => s.handler == null));
            for (var i = 0; i < fill.Count; i++) fill[i].handler = i < combats - rules.eliteCount ? "core.combat" : "core.event";
            foreach (var slot in build)
            {
                var definition = random.Pick($"map:{floor}:definition:{slot.layer}:{slot.column}", Definitions(slot.handler, floor));
                map.nodes.Add(new NativeMapNode { id = $"floor-{floor}-node-{slot.layer}-{slot.column}", layer = slot.layer, column = slot.column,
                    definitionId = definition.id, handlerId = slot.handler, available = slot.layer == 0, iconKey = Icon(slot.handler, floor) });
            }
            var nodes = map.nodes;
            for (var layer = 0; layer < rows; layer++)
            {
                var current = nodes.Where(n => n.layer == layer).OrderBy(n => n.column).ToList();
                var next = nodes.Where(n => n.layer == layer + 1).OrderBy(n => n.column).ToList();
                for (var i = 0; i < current.Count; i++) current[i].connections.Add(next[current.Count <= 1 ? 0 : Round((double)i * (next.Count - 1) / (current.Count - 1))].id);
                for (var i = 0; i < next.Count; i++)
                {
                    var source = current[next.Count <= 1 ? 0 : Round((double)i * (current.Count - 1) / (next.Count - 1))];
                    if (!source.connections.Contains(next[i].id)) source.connections.Add(next[i].id);
                }
            }
            var mandatory = new HashSet<string>();
            foreach (var spine in new[] { spineA, spineB })
                for (var i = 0; i < spine.Count - 1; i++)
                {
                    var from = nodes.Find(n => n.layer == spine[i].layer && n.column == spine[i].column);
                    var destination = nodes.Find(n => n.layer == spine[i + 1].layer && n.column == spine[i + 1].column);
                    for (var layer = from.layer + 1; layer <= destination.layer; layer++)
                    {
                        var to = layer == destination.layer ? destination : nodes.Where(n => n.layer == layer).OrderBy(n => Math.Abs(n.column - from.column)).First();
                        if (!from.connections.Contains(to.id)) from.connections.Add(to.id);
                        mandatory.Add(from.id + "->" + to.id); from = to;
                    }
                }
            bool Cross(NativeMapNode a, NativeMapNode b, Edge e) => (a.column < e.from.column && b.column > e.to.column) || (a.column > e.from.column && b.column < e.to.column);
            for (var layer = 0; layer < rows; layer++)
            {
                var kept = new List<Edge>();
                foreach (var from in nodes.Where(n => n.layer == layer))
                    foreach (var id in from.connections.ToArray())
                    {
                        var to = nodes.Find(n => n.id == id); var required = mandatory.Contains(from.id + "->" + id);
                        var conflicts = kept.Where(e => Cross(from, to, e)).ToList();
                        if (conflicts.Count == 0) kept.Add(new Edge { from = from, to = to, mandatory = required });
                        else if (required)
                        {
                            foreach (var edge in conflicts.Where(e => !e.mandatory))
                                if (edge.from.connections.Count > 1 && nodes.Count(n => n.connections.Contains(edge.to.id)) > 1) edge.from.connections.Remove(edge.to.id);
                            kept.Add(new Edge { from = from, to = to, mandatory = true });
                        }
                        else if (kept.Any(e => e.mandatory && Cross(from, to, e)) && from.connections.Count > 1 && nodes.Count(n => n.connections.Contains(id)) > 1) from.connections.Remove(id);
                    }
            }
            return map;
        }
    }
}
