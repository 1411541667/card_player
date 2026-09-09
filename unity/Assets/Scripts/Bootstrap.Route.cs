using System.Linq;
using RoguelikeCardFramework.Core;
using UnityEngine;

public sealed partial class Bootstrap
{
    private Vector2 routeScroll, deckScroll;
    private static string BoonLabel(string id) => id switch
    {
        "boon.max-card" => "炉火淬炼：随机将一张初始卡牌强化至最高等级",
        "boon.max-health" => "顽强血肉：最大生命增加 30%，并恢复至上限",
        "boon.gold-shop" => "意外横财：获得 100 代币，进入开局商店",
        "boon.resource" => "备用电池：每回合资源增加 1",
        "boon.greedy-coin" => "贪婪的金币：获得同名收集品",
        "boon.remove-three" => "轻装上路：从初始牌组中删除 3 张牌",
        _ => id
    };
    private void DrawBoons()
    {
        GUILayout.Label("选择开局祝福", heading);
        foreach (var id in game.Setup.boonOffers)
            if (Action(BoonLabel(id))) { game.ChooseBoon(id); AutoSave(); break; }
        Footer();
    }
    private void DrawStartingRemoval()
    {
        GUILayout.Label($"轻装上路 · 还需删除 {game.Setup.pendingCardRemovals} 张", heading);
        string selected = null;
        deckScroll = GUILayout.BeginScrollView(deckScroll, GUILayout.Height(350));
        foreach (var id in game.Deck)
        {
            var card = game.CardFor(id);
            if (Action($"{card.name} [{card.cost}] · {card.description}")) selected = id;
        }
        GUILayout.EndScrollView();
        if (selected != null) { game.RemoveStartingCard(selected); AutoSave(); }
        Footer();
    }
    private void DrawThemes()
    {
        GUILayout.Label("选择主题", heading);
        if (Action("尘沙 · 进入四层废土")) { game.ChooseTheme("theme.dust"); routeScroll = Vector2.zero; AutoSave(); }
        Footer();
    }
    private void DrawRouteBoard()
    {
        var map = game.Map;
        if (map == null)
        {
            foreach (var id in game.MapChoices()) if (Action("前往：" + id)) { game.ChooseNode(id); AutoSave(); break; }
            return;
        }
        GUILayout.Label("高亮节点可进入；箭头数字指向下一行路线。", small);
        string selected = null;
        routeScroll = GUILayout.BeginScrollView(routeScroll, GUILayout.Height(Mathf.Min(380, Screen.height * .45f)));
        foreach (var row in map.nodes.GroupBy(n => n.layer))
        {
            GUILayout.Label($"第 {row.Key + 1} 行", small);
            GUILayout.BeginHorizontal();
            foreach (var node in row)
            {
                GUI.enabled = node.available && !node.visited;
                var label = game.NodeLabel(node.id).Split('·').Last().Trim();
                var next = string.Join("、", node.connections.Select(id => (map.nodes.Find(n => n.id == id).column + 1).ToString()));
                if (GUILayout.Button($"{node.column + 1}. {label}{(node.visited ? " ✓" : "")}\n{(next.Length > 0 ? "→ " + next : "终点")}", GUILayout.MinWidth(100), GUILayout.Height(58))) selected = node.id;
            }
            GUI.enabled = true; GUILayout.EndHorizontal();
        }
        GUILayout.EndScrollView();
        if (selected != null) { game.ChooseNode(selected); AutoSave(); }
    }
}
