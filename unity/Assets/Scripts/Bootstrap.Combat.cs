using System;
using System.Linq;
using RoguelikeCardFramework.Core;
using UnityEngine;

public sealed partial class Bootstrap
{
    private string combatTarget, combatError;
    private Vector2 combatScroll;
    private void DrawNativeCombat()
    {
        var battle = game.Combat;
        if (!battle.enemies.Any(e => e.instanceId == combatTarget && e.health > 0)) combatTarget = battle.enemies.FirstOrDefault(e => e.health > 0)?.instanceId;
        GUILayout.Label($"战斗 · 回合 {battle.turn}", heading);
        GUILayout.Label($"生命 {game.Health}/{game.MaxHealth} · 防护 {game.Block} · " + string.Join(" / ", battle.resources.Select(r => $"{r.id}: {r.amount}")), body);
        if (battle.statuses.Count > 0) GUILayout.Label("状态：" + string.Join("、", battle.statuses.Select(s => $"{content.Text(s.definitionId + ".name")} {s.stacks}")), small);
        combatScroll = GUILayout.BeginScrollView(combatScroll, GUILayout.Height(Mathf.Min(420, Screen.height * .53f)));
        foreach (var enemy in battle.enemies)
        {
            var definition = content.enemies.Find(e => e.id == enemy.definitionId);
            GUI.enabled = enemy.health > 0;
            if (Action($"{(combatTarget == enemy.instanceId ? "▶ " : "")}{definition.name} · {enemy.health}/{definition.health} · 防护 {enemy.block}\n意图：{game.EnemyIntentLabel(enemy)}")) combatTarget = enemy.instanceId;
            GUI.enabled = true;
            if (enemy.statuses.Count > 0) GUILayout.Label(string.Join("、", enemy.statuses.Select(s => $"{content.Text(s.definitionId + ".name")} {s.stacks}")), small);
        }
        GUILayout.Label($"手牌 · 抽牌堆 {game.DrawPileCount} / 弃牌堆 {game.DiscardPileCount} / 消耗 {battle.exhaust.Count}", small);
        int selected = -1;
        for (var i = 0; i < game.Hand.Count; i++)
        {
            var id = game.Hand[i]; var card = game.CardFor(id);
            if (Action($"{card.name} [{game.EffectiveCardCost(id)} {card.resource}] · {card.description}")) selected = i;
        }
        GUILayout.EndScrollView();
        if (selected >= 0) CombatAction(() => game.PlayCard(selected, combatTarget));
        if (game.Phase == NativePhase.Combat && Action("结束回合")) CombatAction(game.EndTurn);
        if (!string.IsNullOrEmpty(combatError)) GUILayout.Label(combatError, small);
    }
    private void CombatAction(Action action)
    {
        try { action(); combatError = ""; AutoSave(); }
        catch (InvalidOperationException error) { combatError = error.Message; }
        catch (ArgumentException error) { combatError = error.Message; }
    }
}
