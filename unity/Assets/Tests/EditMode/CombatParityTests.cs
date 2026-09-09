using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using RoguelikeCardFramework.Core;
using UnityEngine;

namespace RoguelikeCardFramework.Tests
{
    public sealed class CombatParityTests
    {
        [Serializable] public sealed class View
        {
            public bool active;
            public string phase;
            public int health, gold, block, resource, revision, battlesStarted, battlesWon, damageTaken;
            public List<string> hand, drawPile, discard;
            public List<string> rewardIds;
            public string rewardContinuation;
            public List<NativeStatus> statuses;
            public List<RandomCounter> counters;
            public NativeCombatState combat;
        }
        [Serializable] public sealed class Step { public string kind, nodeId, targetId; public int index; public View expected; }
        [Serializable] public sealed class Battle { public string name; public NativeRunSave initial; public List<Step> steps; }
        [Serializable] public sealed class Fixture { public List<Battle> battles; }
        private ContentDatabase content;
        private Fixture fixture;
        [SetUp] public void Load()
        {
            content = new ContentDatabase(Path.Combine(Application.streamingAssetsPath, "wasteland", "data"));
            fixture = JsonUtility.FromJson<Fixture>(File.ReadAllText(Path.Combine(Application.dataPath, "Tests", "EditMode", "Fixtures", "web-combat-parity.json")));
        }
        [TestCase("scavenger-normal")] [TestCase("hunter-squad")] [TestCase("guards-upgraded")] [TestCase("elite")]
        [TestCase("boss-1")] [TestCase("boss-2")] [TestCase("boss-3")] [TestCase("boss-4")] [TestCase("defeat")]
        public void ReplaysEveryWebCombatSnapshotIncludingSaveRestore(string name)
        {
            var battle = fixture.battles.Find(b => b.name == name); var game = new NativeGameSession(content); game.Restore(battle.initial);
            for (var i = 0; i < battle.steps.Count; i++)
            {
                var restored = new NativeGameSession(content); restored.Restore(JsonUtility.FromJson<NativeRunSave>(JsonUtility.ToJson(game.Export())));
                var step = battle.steps[i]; Apply(game, step); Apply(restored, step);
                Assert.AreEqual(JsonUtility.ToJson(game.Export()), JsonUtility.ToJson(restored.Export()), $"Save continuation: {name}, step {i}");
                var actual = Project(game); var expected = step.expected;
                // Unity serializes null custom classes as empty objects: compare combat only while active.
                if (expected.active) Assert.AreEqual(JsonUtility.ToJson(expected.combat), JsonUtility.ToJson(actual.combat), $"Combat: {name}, step {i} ({step.kind})");
                expected.combat = null; actual.combat = null;
                Assert.AreEqual(JsonUtility.ToJson(expected), JsonUtility.ToJson(actual), $"State: {name}, step {i} ({step.kind})");
            }
        }
        [Test] public void InvalidTargetAndInsufficientResourceAreAtomic()
        {
            var reference = fixture.battles.Find(b => b.name == "hunter-squad");
            var game = new NativeGameSession(content); game.Restore(reference.initial); Apply(game, reference.steps[0]);
            var attack = game.Hand.ToList().FindIndex(id => game.CardFor(id).target == "enemy"); Assert.GreaterOrEqual(attack, 0);
            var before = JsonUtility.ToJson(game.Export());
            Assert.Throws<InvalidOperationException>(() => game.PlayCard(attack, "missing-target"));
            Assert.Throws<InvalidOperationException>(() => game.PlayCard(attack));
            Assert.AreEqual(before, JsonUtility.ToJson(game.Export()));
            var save = game.Export(); foreach (var resource in save.combat.resources) resource.amount = 0;
            game.Restore(save); before = JsonUtility.ToJson(game.Export());
            Assert.Throws<InvalidOperationException>(() => game.PlayCard(attack, game.Combat.enemies[0].instanceId));
            Assert.AreEqual(before, JsonUtility.ToJson(game.Export()));
        }
        [Test] public void UnsupportedEffectRollsBackResourceAndRandomState()
        {
            var reference = fixture.battles[0]; var game = new NativeGameSession(content); game.Restore(reference.initial); Apply(game, reference.steps[0]);
            var card = game.CardFor(game.Hand[0]); var effects = card.effects;
            card.effects = new List<NativeEffect> { new NativeEffect { id = "unknown.effect", parameters = new Dictionary<string, object>() } };
            var before = JsonUtility.ToJson(game.Export());
            try { Assert.Throws<InvalidOperationException>(() => game.PlayCard(0, game.Combat.enemies[0].instanceId)); Assert.AreEqual(before, JsonUtility.ToJson(game.Export())); }
            finally { card.effects = effects; }
        }
        [Test] public void OldCombatSaveRemainsPlayableUntilNextEncounter()
        {
            var game = new NativeGameSession(content);
            game.Restore(new NativeRunSave { schemaVersion = 3, phase = "Combat", characterId = "character.scavenger", health = 80, maxHealth = 80,
                floor = 1, node = 1, resource = 3, perTurnResource = 3, enemyHealth = 20, enemyMaxHealth = 20, enemyDamage = 5, enemyName = "旧版敌人",
                deck = new List<string> { "card.smash" }, hand = new List<string> { "card.smash" } });
            Assert.IsNull(game.Combat); game.PlayCard(0); game.EndTurn(); Assert.AreEqual(13, game.EnemyHealth); Assert.AreEqual(75, game.Health);
        }
        private static void Apply(NativeGameSession game, Step step)
        {
            switch (step.kind) { case "enter": game.ChooseNode(step.nodeId); break; case "play": game.PlayCard(step.index, step.targetId); break; case "end": game.EndTurn(); break; default: throw new Exception("Unknown fixture command"); }
        }
        private static View Project(NativeGameSession game)
        {
            var save = game.Export(); var active = game.Combat != null;
            return new View { active = active, phase = game.Phase.ToString(), health = save.health, gold = save.gold, block = save.block, resource = save.resource,
                revision = save.revision, battlesStarted = save.battlesStarted, battlesWon = save.battlesWon, damageTaken = save.damageTaken,
                hand = save.hand, drawPile = save.drawPile, discard = save.discard, combat = save.combat, statuses = active ? save.combat.statuses : save.runStatuses,
                rewardIds = save.rewardIds, rewardContinuation = save.rewardContinuation,
                counters = save.random.counters.Where(c => new[] { "combat:", "encounter:", "node:", "collectible:", "reward:" }.Any(prefix => c.name.StartsWith(prefix, StringComparison.Ordinal))).ToList() };
        }
    }
}
