using System;
using System.Collections.Generic;
using System.Globalization;

namespace RoguelikeCardFramework.Core
{
    // List-backed counters also round-trip through Unity JsonUtility.
    [Serializable] public sealed class RandomCounter { public string name; public long value; }
    [Serializable] public sealed class RandomState
    {
        public string seed;
        public List<RandomCounter> counters = new();
    }

    /// <summary>Bit-for-bit port of src/game/random.ts (UTF-16 FNV and uint32 sampling).</summary>
    public sealed class NamespacedRandom
    {
        private readonly string seed;
        private readonly Dictionary<string, long> counters = new(StringComparer.Ordinal);
        public NamespacedRandom(string seed) { this.seed = seed ?? throw new ArgumentNullException(nameof(seed)); }
        public NamespacedRandom(RandomState state) : this(state.seed)
        {
            foreach (var entry in state.counters) counters.Add(entry.name, entry.value);
        }
        public double Next(string scope)
        {
            counters.TryGetValue(scope, out var counter);
            counters[scope] = counter + 1;
            unchecked
            {
                uint hash = 2166136261;
                foreach (var character in seed + ":" + scope + ":" + counter.ToString(CultureInfo.InvariantCulture))
                    hash = (hash ^ character) * 16777619;
                uint current = hash + 0x6d2b79f5;
                current = (current ^ (current >> 15)) * (current | 1);
                current ^= current + (current ^ (current >> 7)) * (current | 61);
                return (current ^ (current >> 14)) / 4294967296.0;
            }
        }
        public int Integer(string scope, int minimum, int maximum)
        {
            if (maximum < minimum) throw new ArgumentOutOfRangeException(nameof(maximum));
            return (int)(minimum + Math.Floor(Next(scope) * ((double)maximum - minimum + 1)));
        }
        public T Pick<T>(string scope, IReadOnlyList<T> values)
        {
            if (values.Count == 0) throw new ArgumentException("Cannot pick from an empty collection.", nameof(values));
            return values[Integer(scope, 0, values.Count - 1)];
        }
        public List<T> Shuffle<T>(string scope, IEnumerable<T> values)
        {
            var result = new List<T>(values);
            for (var i = result.Count - 1; i > 0; i--)
            {
                var j = Integer(scope, 0, i);
                (result[i], result[j]) = (result[j], result[i]);
            }
            return result;
        }
        public RandomState ExportState()
        {
            var result = new RandomState { seed = seed };
            foreach (var entry in counters) result.counters.Add(new RandomCounter { name = entry.Key, value = entry.Value });
            return result;
        }
    }
}
