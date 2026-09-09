using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using RoguelikeCardFramework.Core;
using UnityEngine;

namespace RoguelikeCardFramework.Tests
{
    public sealed class RouteParityTests
    {
        [Serializable] public sealed class MapCase { public string seed; public int floor; public NativeMapState map; public List<RandomCounter> counters; }
        [Serializable] public sealed class SetupCase
        {
            public string seed, characterId, boonId;
            public List<string> offers, collectibles;
            public int health, maxHealth, gold, perTurnResource;
            public List<NativeCardInstance> cards;
            public NativeSetupState setup;
        }
        [Serializable] public sealed class Fixture { public List<MapCase> maps; public List<SetupCase> setups; }
        private ContentDatabase content;
        private Fixture fixture;
        [SetUp] public void Load()
        {
            content = new ContentDatabase(Path.Combine(Application.streamingAssetsPath, "wasteland", "data"));
            fixture = JsonUtility.FromJson<Fixture>(File.ReadAllText(Path.Combine(Application.dataPath, "Tests", "EditMode", "Fixtures", "web-route-parity.json")));
        }
        [Test] public void AllFloorsMatchWebNodesEdgesAndRandomCounters()
        {
            foreach (var reference in fixture.maps)
            {
                var random = new NamespacedRandom(reference.seed);
                var actual = new RouteGenerator(content.mapRules, content.nodes, random).Generate(reference.floor);
                Assert.AreEqual(JsonUtility.ToJson(reference.map), JsonUtility.ToJson(actual), $"{reference.seed}, floor {reference.floor}");
                CollectionAssert.AreEqual(reference.counters.Select(c => c.name + ":" + c.value), random.ExportState().counters.Select(c => c.name + ":" + c.value));
                foreach (var node in actual.nodes)
                    foreach (var id in node.connections) Assert.AreEqual(node.layer + 1, actual.nodes.Find(n => n.id == id).layer);
            }
        }
        [Test] public void AllSixBoonsMatchWebForBothCharacters()
        {
            foreach (var reference in fixture.setups)
            {
                var game = new NativeGameSession(content); game.NewRun(reference.seed); game.ChooseCharacter(reference.characterId);
                CollectionAssert.AreEqual(reference.offers, game.Setup.boonOffers);
                game.ChooseBoon(reference.boonId);
                while (game.Phase == NativePhase.BoonRemove) game.RemoveStartingCard(game.Deck[0]);
                var actual = game.Export();
                Assert.AreEqual(reference.health, actual.health); Assert.AreEqual(reference.maxHealth, actual.maxHealth);
                Assert.AreEqual(reference.gold, actual.gold); Assert.AreEqual(reference.perTurnResource, actual.perTurnResource);
                CollectionAssert.AreEqual(reference.collectibles, actual.collectibles);
                Assert.AreEqual(JsonUtility.ToJson(reference.setup), JsonUtility.ToJson(actual.setup));
                CollectionAssert.AreEqual(reference.cards.Select(JsonUtility.ToJson), actual.cardInstances.Select(JsonUtility.ToJson));
                var restored = new NativeGameSession(content);
                restored.Restore(JsonUtility.FromJson<NativeRunSave>(JsonUtility.ToJson(actual)));
                if (restored.Phase == NativePhase.Shop) restored.LeaveShop();
                restored.ChooseTheme("theme.dust");
                Assert.AreEqual(NativePhase.Map, restored.Phase); Assert.GreaterOrEqual(restored.Map.nodes.Count, 60);
            }
        }
        [Test] public void InvalidSetupCommandsDoNotChangeSave()
        {
            var game = new NativeGameSession(content); game.NewRun("validation"); game.ChooseCharacter("character.scavenger");
            var before = JsonUtility.ToJson(game.Export());
            Assert.Throws<ArgumentException>(() => game.ChooseBoon("missing"));
            Assert.Throws<InvalidOperationException>(() => game.ChooseTheme("theme.dust"));
            Assert.Throws<InvalidOperationException>(() => game.ChooseNode("战斗"));
            Assert.AreEqual(before, JsonUtility.ToJson(game.Export()));
        }
        [Test] public void RemovalCanResumeAndOnlyDeletesSelectedInstance()
        {
            var reference = fixture.setups.Find(c => c.boonId == "boon.remove-three");
            var game = new NativeGameSession(content); game.NewRun(reference.seed); game.ChooseCharacter(reference.characterId); game.ChooseBoon(reference.boonId);
            var removed = game.Deck[0]; game.RemoveStartingCard(removed); game.GoToMenu();
            var restored = new NativeGameSession(content); restored.Restore(JsonUtility.FromJson<NativeRunSave>(JsonUtility.ToJson(game.Export())));
            Assert.AreEqual(NativePhase.BoonRemove, restored.Phase); Assert.AreEqual(2, restored.Setup.pendingCardRemovals);
            Assert.False(restored.Deck.Contains(removed)); Assert.AreEqual(9, restored.Deck.Count);
            var before = JsonUtility.ToJson(restored.Export());
            Assert.Throws<ArgumentException>(() => restored.RemoveStartingCard(removed));
            Assert.AreEqual(before, JsonUtility.ToJson(restored.Export()));
            restored.RemoveStartingCard(restored.Deck[0]); restored.RemoveStartingCard(restored.Deck[0]);
            Assert.AreEqual(NativePhase.ThemeSelect, restored.Phase); Assert.AreEqual(7, restored.Deck.Count);
        }
        [TestCase(1)] [TestCase(2)] public void LegacyRunKeepsLegacyRouteAndDefinitionBasedCards(int version)
        {
            var json = "{\"schemaVersion\":" + version + ",\"phase\":\"Map\",\"characterId\":\"character.scavenger\",\"health\":80,\"maxHealth\":80,\"floor\":1,\"node\":2,\"deck\":[\"card.smash\",\"card.dodge\"]}";
            var game = new NativeGameSession(content); game.Restore(JsonUtility.FromJson<NativeRunSave>(json));
            Assert.IsNull(game.Map); Assert.AreEqual("card.smash", game.CardFor(game.Deck[0]).id);
            CollectionAssert.AreEqual(new[] { "休整", "战斗" }, game.MapChoices());
            game.ChooseNode("战斗"); Assert.AreEqual(NativePhase.Combat, game.Phase);
            var restored = new NativeGameSession(content); restored.Restore(JsonUtility.FromJson<NativeRunSave>(JsonUtility.ToJson(game.Export())));
            Assert.IsNull(restored.Map); Assert.AreEqual(NativePhase.Combat, restored.Phase);
            CollectionAssert.AreEqual(game.Hand, restored.Hand);
        }
        [Test] public void RouteProgressIsSavedAndInaccessibleNodesAreRejected()
        {
            var reference = fixture.setups.Find(c => c.boonId == "boon.max-health");
            var game = new NativeGameSession(content); game.NewRun(reference.seed); game.ChooseCharacter(reference.characterId);
            game.ChooseBoon(reference.boonId); game.ChooseTheme("theme.dust");
            var before = JsonUtility.ToJson(game.Export());
            Assert.Throws<InvalidOperationException>(() => game.ChooseNode(game.Map.nodes.Last().id));
            Assert.AreEqual(before, JsonUtility.ToJson(game.Export()));
            var first = game.Map.nodes.First(n => n.available);
            game.ChooseNode(first.id);
            Assert.True(game.Map.nodes.Find(n => n.id == first.id).visited);
            CollectionAssert.AreEquivalent(first.connections, game.Map.nodes.Where(n => n.available).Select(n => n.id));
            var restored = new NativeGameSession(content); restored.Restore(JsonUtility.FromJson<NativeRunSave>(JsonUtility.ToJson(game.Export())));
            Assert.AreEqual(JsonUtility.ToJson(game.Export()), JsonUtility.ToJson(restored.Export()));
            var snapshot = restored.Map; snapshot.nodes.Clear(); Assert.Greater(restored.Map.nodes.Count, 0);
        }
        [Test] public void MapInkSurvivesSaveAndCannotMutateSessionThroughSnapshot()
        {
            var game = new NativeGameSession(content); game.NewRun("ink-test"); game.ChooseCharacter("character.scavenger");
            game.ChooseBoon(game.Setup.boonOffers.First(id => id != "boon.gold-shop" && id != "boon.remove-three"));
            game.ChooseTheme("theme.dust");
            var cells = new List<NativeMapInk> { new NativeMapInk { x = 45, y = 89, color = 1 } };
            var before = JsonUtility.ToJson(game.Export().random);
            game.SetMapInk(cells); cells[0].x = 999;
            var restored = new NativeGameSession(content);
            restored.Restore(JsonUtility.FromJson<NativeRunSave>(JsonUtility.ToJson(game.Export())));
            Assert.AreEqual(45, restored.Map.ink[0].x);
            Assert.AreEqual(89, restored.Map.ink[0].y);
            Assert.AreEqual(1, restored.Map.ink[0].color);
            var snapshot = restored.Map; snapshot.ink.Clear();
            Assert.AreEqual(1, restored.Map.ink.Count);
            Assert.AreEqual(before, JsonUtility.ToJson(restored.Export().random));
        }
        [Test] public void OrdinaryRewardDoesNotAdvanceFloorAndBossRewardDoes()
        {
            var random = new NamespacedRandom("reward-test");
            foreach (var floor in new[] { 1, 4 })
            {
                var map = new RouteGenerator(content.mapRules, content.nodes, random).Generate(floor);
                foreach (var node in map.nodes.Where(n => n.handlerId == "core.reward" || n.handlerId == "core.boss"))
                {
                    map.currentNodeId = node.id;
                    var game = new NativeGameSession(content);
                    game.Restore(new NativeRunSave { phase = "Reward", characterId = "character.scavenger", health = 80, maxHealth = 80, floor = floor,
                        map = map, random = random.ExportState(), perTurnResource = 3 });
                    game.ChooseReward(0);
                    if (node.handlerId == "core.reward") { Assert.AreEqual(floor, game.Floor); Assert.AreEqual(NativePhase.Map, game.Phase); }
                    else if (floor == 4) Assert.AreEqual(NativePhase.Result, game.Phase);
                    else { Assert.AreEqual(floor + 1, game.Floor); Assert.True(game.Map.nodes.All(n => !n.visited)); }
                }
            }
        }
    }
}

