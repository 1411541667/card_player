using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using RoguelikeCardFramework.Core;
using UnityEngine;

namespace RoguelikeCardFramework.Tests
{
    public sealed class RewardParityTests
    {
        [Serializable] public sealed class RewardCase
        {
            public string name;
            public NativeRunSave initial;
            public int health, gold, floor, revision;
            public List<NativeCardInstance> cards;
            public List<string> collectibles;
            public NativeMapState map;
            public RandomState random;
        }
        [Serializable] public sealed class Fixture { public List<RewardCase> rewards; }
        [Test] public void WebRewardEffectsAndNextFloorMatchAfterReload()
        {
            var content = new ContentDatabase(Path.Combine(Application.streamingAssetsPath, "wasteland", "data"));
            var fixture = JsonUtility.FromJson<Fixture>(File.ReadAllText(Path.Combine(Application.dataPath, "Tests", "EditMode", "Fixtures", "web-reward-parity.json")));
            foreach (var reference in fixture.rewards)
            {
                var game = new NativeGameSession(content); game.Restore(JsonUtility.FromJson<NativeRunSave>(JsonUtility.ToJson(reference.initial)));
                var before = JsonUtility.ToJson(game.Export()); Assert.Throws<ArgumentOutOfRangeException>(() => game.ChooseReward(3));
                Assert.AreEqual(before, JsonUtility.ToJson(game.Export())); game.ChooseReward(0); var actual = game.Export();
                Assert.AreEqual(reference.health, actual.health, reference.name); Assert.AreEqual(reference.gold, actual.gold, reference.name);
                Assert.AreEqual(reference.floor, actual.floor, reference.name); Assert.AreEqual(reference.revision, actual.revision, reference.name);
                CollectionAssert.AreEqual(reference.cards.Select(JsonUtility.ToJson), actual.cardInstances.Select(JsonUtility.ToJson), reference.name);
                CollectionAssert.AreEqual(reference.collectibles, actual.collectibles, reference.name);
                Assert.AreEqual(JsonUtility.ToJson(reference.map), JsonUtility.ToJson(actual.map), reference.name);
                Assert.AreEqual(JsonUtility.ToJson(reference.random), JsonUtility.ToJson(actual.random), reference.name);
                Assert.AreEqual(NativePhase.Map, game.Phase); Assert.AreEqual(0, game.RewardIds.Count);
                Assert.Throws<InvalidOperationException>(() => game.ChooseReward(0));
            }
        }
    }
}
