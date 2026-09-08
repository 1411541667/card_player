using RoguelikeCardFramework.Core;
using UnityEngine;

public sealed class Bootstrap : MonoBehaviour
{
    private ContentSummary summary;
    private MetaProgressSave meta;
    private SaveStore saves;
    private ContentDatabase content;
    private NativeGameSession game;
    private GUIStyle title, heading, body, small, button;
    private Vector2 scroll;
    private bool fontConfigured;

    private void Awake()
    {
        Application.targetFrameRate = 60;
        saves = new SaveStore();
        meta = saves.Load();
        var contentRoot = System.IO.Path.Combine(Application.streamingAssetsPath, "wasteland", "data");
        summary = new JsonContentLoader(contentRoot).LoadSummary();
        content = new ContentDatabase(contentRoot);
        game = new NativeGameSession(content);
        var oldRun = saves.LoadRun(); if (oldRun != null) game.Restore(oldRun);
        if (System.Array.IndexOf(System.Environment.GetCommandLineArgs(), "--smoke-test") >= 0)
        {
            var smoke = new NativeGameSession(content); smoke.NewRun(); smoke.ChooseCharacter("character.scavenger"); smoke.ChooseNode("战斗");
            var ok = summary.cards == 10 && summary.characters == 2 && summary.enemies == 17 && smoke.Phase == NativePhase.Combat && smoke.Hand.Count == 5;
            Debug.Log(ok ? "NATIVE_SMOKE_OK" : "NATIVE_SMOKE_FAILED"); Application.Quit(ok ? 0 : 2); return;
        }
    }

    private void OnGUI()
    {
        // GUI.skin and other IMGUI APIs are only valid during OnGUI. Calling
        // them from Awake throws and leaves the player stuck after the splash.
        ConfigureFont();
        EnsureStyles(); GUI.color = Color.white; GUI.backgroundColor = new Color(.16f, .2f, .28f);
        GUI.Box(new Rect(0, 0, Screen.width, Screen.height), GUIContent.none);
        GUILayout.BeginArea(new Rect(Mathf.Max(20, Screen.width * .06f), 25, Mathf.Max(600, Screen.width * .88f), Screen.height - 50));
        GUILayout.Label("异变独行", title); GUILayout.Space(8);
        if (game.Phase != NativePhase.Menu && game.Phase != NativePhase.CharacterSelect && game.Phase != NativePhase.Encyclopedia && game.Phase != NativePhase.Settings)
            GUILayout.Label($"第 {game.Floor} 层 · 节点 {game.Node}/6    生命 {game.Health}/{game.MaxHealth}    代币 {game.Gold}    分数 {game.Score}", heading);
        GUILayout.Space(10); DrawPhase(); GUILayout.EndArea();
    }

    private void DrawPhase()
    {
        switch (game.Phase)
        {
            case NativePhase.Menu: DrawMenu(); break;
            case NativePhase.CharacterSelect: DrawCharacters(); break;
            case NativePhase.Map: DrawMap(); break;
            case NativePhase.Combat: DrawCombat(); break;
            case NativePhase.Reward: DrawReward(); break;
            case NativePhase.Shop: DrawShop(); break;
            case NativePhase.Event: DrawEvent(); break;
            case NativePhase.Rest: DrawRest(); break;
            case NativePhase.Result: DrawResult(); break;
            case NativePhase.Encyclopedia: DrawEncyclopedia(); break;
            case NativePhase.Settings: DrawSettings(); break;
        }
    }
    private void DrawMenu()
    {
        GUILayout.Label("Unity 原生版 · 无 HTML / 无 WebView2", heading); GUILayout.Label($"内容：{summary.cards} 张卡牌 · {summary.characters} 名角色 · {summary.enemies} 个敌人 · {summary.events} 个事件", body); GUILayout.Space(30);
        if (Action("开始新游戏")) game.NewRun();
        if (game.HasRun && Action("继续游戏")) game.ContinueRun();
        if (Action("百科")) game.Open(NativePhase.Encyclopedia);
        if (Action("设置")) game.Open(NativePhase.Settings);
        GUILayout.Label($"局外代币：{meta.metaCurrency}\n存档位置：{saves.Path}", small);
    }
    private void DrawCharacters()
    {
        GUILayout.Label("选择角色", heading); GUILayout.Label("选择一名角色进入风沙。", body);
        foreach (var pair in content.characters) if (Action($"{pair.Value.name}    生命 {pair.Value.health}    资源：{pair.Value.resource}")) game.ChooseCharacter(pair.Key);
        if (Action("返回")) game.ReturnMenu();
    }
    private void DrawMap()
    {
        GUILayout.Label("废土路线", heading); GUILayout.Label(game.Message, body); GUILayout.Space(16);
        foreach (var choice in game.MapChoices()) if (Action("前往：" + choice)) { game.ChooseNode(choice); AutoSave(); }
        Footer();
    }
    private void DrawCombat()
    {
        GUILayout.Label($"战斗：{game.EnemyName}", heading); GUILayout.Label($"敌人生命 {game.EnemyHealth}/{game.EnemyMaxHealth} · 下一次攻击 {game.EnemyDamage}\n你的资源 {game.Resource} · 防护 {game.Block}\n{game.Message}", body); GUILayout.Space(10);
        GUILayout.Label("手牌", heading);
        for (var i = 0; i < game.Hand.Count; i++) { var card = content.cards[game.Hand[i]]; if (Action($"{card.name}  [{card.cost}]    {card.description}")) { game.PlayCard(i); AutoSave(); break; } }
        if (Action("结束回合")) { game.EndTurn(); AutoSave(); }
        GUILayout.Label("战斗记录：\n" + string.Join("\n", game.Log), small);
    }
    private void DrawReward()
    {
        GUILayout.Label("首领奖励", heading); GUILayout.Label(game.Message, body);
        if (Action("150 代币")) game.ChooseReward(0);
        if (Action("恢复 30% 生命")) game.ChooseReward(1);
        if (Action("获得随机卡牌")) game.ChooseReward(2);
        AutoSaveOnRepaint();
    }
    private void DrawShop()
    {
        GUILayout.Label("废墟商店", heading); GUILayout.Label(game.Message, body);
        if (Action("治疗 30% 生命（100 代币）")) game.BuyHeal();
        if (Action("购买投掷石头（50 代币）")) game.BuyCard();
        if (Action("离开商店")) { game.LeaveShop(); AutoSave(); }
    }
    private void DrawEvent()
    {
        GUILayout.Label("风沙异闻", heading); GUILayout.Label(game.Message, body);
        if (Action("靠近余火：恢复 10 生命")) { game.ResolveEvent(0); AutoSave(); }
        if (Action("冒险搜索：失去 8 生命，获得 60 代币")) { game.ResolveEvent(1); AutoSave(); }
    }
    private void DrawRest()
    {
        GUILayout.Label("休整", heading); GUILayout.Label(game.Message, body);
        if (Action("休息：恢复 30% 生命")) { game.Rest(true); AutoSave(); }
        if (Action("整理装备：获得 25 代币")) { game.Rest(false); AutoSave(); }
    }
    private void DrawResult()
    {
        GUILayout.Label("探索结算", heading); GUILayout.Label(game.Message + $"\n最终分数：{game.Score}\n获得局外代币：{game.Score / 100}", body);
        if (Action("返回主菜单")) { meta.metaCurrency += game.Score / 100; saves.Save(meta); game.ReturnMenu(); }
    }
    private void DrawEncyclopedia()
    {
        GUILayout.Label("百科", heading); scroll = GUILayout.BeginScrollView(scroll, GUILayout.Height(Screen.height - 230));
        GUILayout.Label("角色", heading); foreach (var item in content.characters.Values) GUILayout.Label($"• {item.name} — 生命 {item.health}", body);
        GUILayout.Label("卡牌", heading); foreach (var item in content.cards.Values) GUILayout.Label($"• {item.name} [{item.type}] — {item.description}", body);
        GUILayout.Label("敌人", heading); foreach (var item in content.enemies) GUILayout.Label($"• {item.name} — 生命 {item.health}", body);
        GUILayout.EndScrollView(); if (Action("返回主菜单")) game.GoToMenu();
    }
    private void DrawSettings()
    {
        GUILayout.Label("设置", heading); GUILayout.Label("F11：切换全屏    Esc：返回菜单\n当前模式：" + (Screen.fullScreen ? "全屏" : "窗口"), body);
        if (Action("切换全屏/窗口")) Screen.fullScreen = !Screen.fullScreen;
        if (Action("保存全部进度")) { saves.Save(meta); if (game.HasRun) saves.SaveRun(game.Export()); }
        if (Action("返回主菜单")) game.GoToMenu();
    }
    private void Footer() { GUILayout.Space(15); if (Action("保存并返回主菜单")) { AutoSave(); game.GoToMenu(); } }
    private bool Action(string label) { return GUILayout.Button(label, button, GUILayout.MinHeight(46), GUILayout.MaxWidth(760)); }
    private void AutoSave() => saves.SaveRun(game.Export());
    private void AutoSaveOnRepaint() { if (Event.current.type == EventType.Repaint) AutoSave(); }
    private void Update() { if (Input.GetKeyDown(KeyCode.F11)) Screen.fullScreen = !Screen.fullScreen; if (Input.GetKeyDown(KeyCode.Escape) && game.Phase != NativePhase.Menu) game.GoToMenu(); }
    private void EnsureStyles()
    {
        if (title != null) return;
        title = new GUIStyle(GUI.skin.label) { fontSize = 36, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter, normal = { textColor = Color.white } };
        heading = new GUIStyle(GUI.skin.label) { fontSize = 22, fontStyle = FontStyle.Bold, wordWrap = true, normal = { textColor = new Color(.95f, .78f, .35f) } };
        body = new GUIStyle(GUI.skin.label) { fontSize = 18, wordWrap = true, normal = { textColor = new Color(.84f, .88f, .94f) } };
        small = new GUIStyle(body) { fontSize = 14 }; button = new GUIStyle(GUI.skin.button) { fontSize = 17, alignment = TextAnchor.MiddleLeft, padding = new RectOffset(18, 18, 8, 8), wordWrap = true };
    }

    private void ConfigureFont()
    {
        if (fontConfigured) return;
        // Keep the default Unity font as a safe fallback on machines without
        // the Chinese fonts. CreateDynamicFontFromOSFont may return null.
        var systemFont = Font.CreateDynamicFontFromOSFont(
            new[] { "Microsoft YaHei", "Microsoft YaHei UI", "SimHei", "Arial" }, 20);
        if (systemFont != null) GUI.skin.font = systemFont;
        fontConfigured = true;
    }
}
