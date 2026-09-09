using System.IO;
using System.Linq;
using NUnit.Framework;
using RoguelikeCardFramework.Core;
using UnityEngine;

namespace RoguelikeCardFramework.Tests
{
    public sealed class CoreTests
    {
        private ContentDatabase content;

        [SetUp]
        public void SetUp()
        {
            var root = Path.Combine(Application.dataPath, "StreamingAssets", "wasteland", "data");
            content = new ContentDatabase(root);
        }

        [Test]
        public void LoadsExistingContentPack()
        {
            Assert.AreEqual(10, content.cards.Count);
            Assert.AreEqual(2, content.characters.Count);
            Assert.AreEqual(17, content.enemies.Count);
            Assert.AreEqual("拾荒者", content.characters["character.scavenger"].name);
        }

        [Test]
        public void StartsScavengerRunAndCombat()
        {
            var game = new NativeGameSession(content);
            game.NewRun("core-test");
            game.ChooseCharacter("character.scavenger");
            Assert.AreEqual(NativePhase.BoonSelect, game.Phase);
            Assert.AreEqual(80, game.Health);
            EnterCombat(game);
            Assert.AreEqual(NativePhase.Combat, game.Phase);
            Assert.AreEqual(5, game.Hand.Count);
            Assert.Greater(game.EnemyHealth, 0);
        }

        [Test]
        public void CombatSavePreservesFutureDrawsAndRandomState()
        {
            var original = new NativeGameSession(content);
            original.NewRun("save-replay"); original.ChooseCharacter("character.scavenger"); EnterCombat(original);
            original.PlayCard(0);
            var saved = JsonUtility.FromJson<NativeRunSave>(JsonUtility.ToJson(original.Export()));
            var restored = new NativeGameSession(content); restored.Restore(saved);
            for (var i = 0; i < 4; i++)
            {
                original.EndTurn(); restored.EndTurn();
                Assert.AreEqual(JsonUtility.ToJson(original.Export()), JsonUtility.ToJson(restored.Export()));
            }
        }

        [Test]
        public void RunSaveRoundTripsState()
        {
            var original = new NativeGameSession(content);
            original.NewRun("hunter-save"); original.ChooseCharacter("character.hunter"); EnterCombat(original);
            var restored = new NativeGameSession(content); restored.Restore(original.Export());
            Assert.AreEqual(original.Phase, restored.Phase);
            Assert.AreEqual(original.Health, restored.Health);
            Assert.AreEqual(original.Hand.Count, restored.Hand.Count);
            Assert.AreEqual("character.hunter", restored.CharacterId);
        }

        private static void EnterCombat(NativeGameSession game)
        {
            game.ChooseBoon(game.Setup.boonOffers.First(id => id != "boon.remove-three"));
            if (game.Phase == NativePhase.Shop) game.LeaveShop();
            game.ChooseTheme("theme.dust");
            for (var i = 0; i < 20 && game.Phase != NativePhase.Combat; i++)
            {
                var nodes = game.Map.nodes.Where(n => n.available).ToList();
                game.ChooseNode((nodes.Find(n => n.handlerId == "core.combat") ?? nodes[0]).id);
                if (game.Phase == NativePhase.Event) game.ResolveEvent(0);
                if (game.Phase == NativePhase.Rest) game.Rest(true);
                if (game.Phase == NativePhase.Shop) game.LeaveShop();
                if (game.Phase == NativePhase.Reward) game.ChooseReward(0);
            }
            Assert.AreEqual(NativePhase.Combat, game.Phase);
        }
    }
}
