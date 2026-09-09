using RoguelikeCardFramework.Core;
using UnityEngine;

public sealed class Bootstrap : MonoBehaviour
{
    private ContentSummary summary;
    private MetaProgressSave meta;
    private SaveStore saves;
    private ContentDatabase content;
    private NativeGameSession game;
    private bool preview;
    private void Awake()
    {
        Application.targetFrameRate = 60;
        saves = new SaveStore();
        meta = saves.Load();
        var contentRoot = System.IO.Path.Combine(Application.streamingAssetsPath, "wasteland", "data");
        summary = new JsonContentLoader(contentRoot).LoadSummary();
        content = new ContentDatabase(contentRoot);
        game = new NativeGameSession(content);
        preview = System.Array.IndexOf(System.Environment.GetCommandLineArgs(), "--ui-preview") >= 0;
        var oldRun = preview ? null : saves.LoadRun(); if (oldRun != null) game.Restore(oldRun);
        game.GoToMenu();
        if (System.Array.IndexOf(System.Environment.GetCommandLineArgs(), "--smoke-test") >= 0)
        {
            var smoke = new NativeGameSession(content); smoke.NewRun("smoke"); smoke.ChooseCharacter("character.scavenger");
            smoke.ChooseBoon(smoke.Setup.boonOffers[0]);
            if (smoke.Phase == NativePhase.Shop) smoke.LeaveShop();
            while (smoke.Phase == NativePhase.BoonRemove) smoke.RemoveStartingCard(smoke.Deck[0]);
            smoke.ChooseTheme("theme.dust");
            var ok = summary.cards == 10 && summary.characters == 2 && summary.enemies == 17 && smoke.Phase == NativePhase.Map && smoke.Map.nodes.Count >= 60;
            Debug.Log(ok ? "NATIVE_SMOKE_OK" : "NATIVE_SMOKE_FAILED"); Application.Quit(ok ? 0 : 2); return;
        }
        gameObject.AddComponent<RoguelikeCardFramework.Presentation.NativeGameView>().Initialize(game, content, meta, AutoSave, FinishRun);
    }


    private void AutoSave() { if (!preview) saves.SaveRun(game.Export()); }
    private void FinishRun() { meta.metaCurrency += game.Score / 100; if (!preview) saves.Save(meta); game.ReturnMenu(); }
}

