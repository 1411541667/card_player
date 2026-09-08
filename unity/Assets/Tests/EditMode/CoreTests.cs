using System.IO;
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
            game.NewRun();
            game.ChooseCharacter("character.scavenger");
            Assert.AreEqual(NativePhase.Map, game.Phase);
            Assert.AreEqual(80, game.Health);
            game.ChooseNode("战斗");
            Assert.AreEqual(NativePhase.Combat, game.Phase);
            Assert.AreEqual(5, game.Hand.Count);
            Assert.Greater(game.EnemyHealth, 0);
        }

        [Test]
        public void RunSaveRoundTripsState()
        {
            var original = new NativeGameSession(content);
            original.NewRun(); original.ChooseCharacter("character.hunter"); original.ChooseNode("战斗");
            var restored = new NativeGameSession(content); restored.Restore(original.Export());
            Assert.AreEqual(original.Phase, restored.Phase);
            Assert.AreEqual(original.Health, restored.Health);
            Assert.AreEqual(original.Hand.Count, restored.Hand.Count);
            Assert.AreEqual("character.hunter", restored.CharacterId);
        }
    }
}
