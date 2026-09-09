using System;
using System.Linq;
using RoguelikeCardFramework.Core;
using UnityEngine;
using UnityEngine.UI;
namespace RoguelikeCardFramework.Presentation
{
    public sealed partial class NativeGameView
    {
        private RectTransform Sheet(string step, string title, float height = 360, float width = 820)
        {
            width = Mathf.Min(width, W - 48); height = Mathf.Min(height, H - 160);
            var p = Panel(page, title, (W-width)/2, (H-height)/2, width, height);
            Label(p, step, 30, 24, width-60, 25, 13, Muted);
            Label(p, title, 30, 57, width-60, 48, 32, Ink, true); return p;
        }
        private void Choice(Transform parent, string title, string description, float x, float y, float width, float height, Action action, bool enabled = true)
        {
            var b = Button(parent, "", x,y,width,height,action,false,enabled);
            var p = b.transform;
            Panel(p,"Accent", 16,0,width-32,3,enabled ? Gold : Muted,0);
            Label(p,title,20,25,width-40,42,24, enabled?Ink:Muted,true);
            Label(p,description,20,79,width-40,height-91,16,Muted);
        }
        private void Menu()
        {
            Label(page,"异变独行",32,28,640,108,80,Ink,true);
            var y = Mathf.Max(155,H-445);
            Label(page,"WASTELAND // 尘沙",28,y,400,25,14,Muted);
            var start=y+36;
            Button(page, game.HasRun ? "继续游戏" : "开始游戏",28,start,320,58,()=>Run(()=>{if(game.HasRun)game.ContinueRun();else game.NewRun();}),true);
            Button(page,"设置",28,start+72,320,58,()=>Open("settings"));
            Button(page,"百科",28,start+144,320,58,()=>Open("encyclopedia"));
            Button(page,"统计",28,start+216,320,58,()=>Open("stats"));
            Button(page,"账号管理",28,start+288,320,58,()=>Open("account"));
            Label(page,$"当前账号：本地旅人   ·   局外代币 {meta.metaCurrency}",28,H-36,600,25,13,Muted);
        }
        private void Characters()
        {
            var p=Sheet("STEP 01 // 选择角色","谁走进风沙？"); var w=(p.rect.width-76)/3; var i=0;
            foreach(var c in content.characters.Values)
            {
                var character=c;
                Choice(p,c.name,content.Text(c.id+".description")+$"\n\n生命 {c.health}   ·   {ResourceName(c.resource)}\n"+string.Join("、",(c.collectibles??content.startingCollectibles).Select(id=>content.Text(id+".name"))),30+i*(w+8),112,w,218,()=>Run(()=>game.ChooseCharacter(character.id)));i++;
            }
            Choice(p,"未知旅人","更多身影，尚未抵达。",30+i*(w+8),112,w,218,null,false);
        }
        private static string BoonName(string id) => id switch {"boon.max-card"=>"炉火淬炼","boon.max-health"=>"顽强血肉","boon.gold-shop"=>"意外横财","boon.resource"=>"备用电池","boon.greedy-coin"=>"贪婪的金币","boon.remove-three"=>"轻装上路",_=>id};
        private static string BoonDescription(string id) => id switch {"boon.max-card"=>"将一张随机初始卡牌强化至最高等级。","boon.max-health"=>"最大生命增加 30%，并恢复至上限。","boon.gold-shop"=>"获得 100 代币，进入开局商店。","boon.resource"=>"每回合资源增加 1。","boon.greedy-coin"=>"获得收集品：贪婪的金币。","boon.remove-three"=>"从初始牌组中删除 3 张牌。",_=>id};
        private void Boons()
        {
            var p=Sheet("STEP 02 // 开局增益","只带走一项");var offers=game.Setup.boonOffers;var w=(p.rect.width-60-(offers.Count-1)*12)/offers.Count;
            for(var i=0;i<offers.Count;i++){var id=offers[i];Choice(p,BoonName(id),BoonDescription(id),30+i*(w+12),112,w,218,()=>Run(()=>game.ChooseBoon(id)));}
        }
        private void Themes()
        {
            var p=Sheet("STEP 03 // 地图主题","选择前进方向");var w=(p.rect.width-84)/3;
            Choice(p,"尘沙","穿过废墟与风沙，寻找离开的道路。\n\n四层旅程",30,112,w,218,()=>Run(()=>game.ChooseTheme("theme.dust")));
            Choice(p,"暗林","尚未开放",42+w,112,w,218,null,false);Choice(p,"寂原","尚未开放",54+w*2,112,w,218,null,false);
        }
        private RectTransform ScrollArea(Transform parent, float x,float y,float width,float height,float contentHeight)
        {
            var viewport=Area(parent,"Scroll viewport",x,y,width,height);viewport.gameObject.AddComponent<RectMask2D>();
            var bg=viewport.gameObject.AddComponent<Image>();bg.color=Color.clear;
            var body=Area(viewport,"Scroll content",0,0,width,Mathf.Max(height,contentHeight));
            var scroll=viewport.gameObject.AddComponent<ScrollRect>();scroll.viewport=viewport;scroll.content=body;scroll.horizontal=false;scroll.movementType=ScrollRect.MovementType.Clamped;scroll.scrollSensitivity=30;return body;
        }
        private void RemoveCards()
        {
            var p=Sheet("STEP 02 // 轻装上路",$"还需移除 {game.Setup.pendingCardRemovals} 张卡牌",540,1000);
            var rows=Mathf.CeilToInt(game.Deck.Count/6f);var body=ScrollArea(p,24,116,p.rect.width-48,p.rect.height-136,rows*236);
            for(var i=0;i<game.Deck.Count;i++){var id=game.Deck[i];Card(body,game.CardFor(id),24+(i%6)*148,(i/6)*236,128,214,()=>Run(()=>game.RemoveStartingCard(id)));}
        }
        private void Hud()
        {
            var p=Panel(page,"HUD",16,12,W-32,56);
            Label(p,$"尘沙  /  第 {game.Floor} 层",18,0,240,56,18,Ink,true,TextAnchor.MiddleLeft);
            Label(p,$"生命 {game.Health} / {game.MaxHealth}     代币 {game.Gold}",248,0,340,56,16,Gold,false,TextAnchor.MiddleLeft);
            Button(p,"卡包",p.rect.width-312,9,92,38,()=>Open("deck"));Button(p,"收集品",p.rect.width-212,9,100,38,()=>Open("collectibles"));Button(p,"设置",p.rect.width-104,9,88,38,()=>Open("pause"));
        }
        private void Modal()
        {
            var overlay=Panel(page,"Modal backdrop",0,0,W,H,Hex("000000",.72f),0);var saved=page;page=overlay;
            var title=modal switch {"draw"=>"抽牌堆","discard"=>"弃牌堆","deck"=>"卡包","collectibles"=>"收集品","encyclopedia"=>"百科","stats"=>"旅程统计","account"=>"账号管理",_=>"设置"};
            var p=Sheet("WASTELAND // 尘沙",title,Mathf.Min(560,H-110),960);
            Button(p,"关闭",p.rect.width-106,20,82,38,()=>Open(null));
            if(modal=="deck"||modal=="encyclopedia"||modal=="draw"||modal=="discard")
            {
                var cards=modal=="encyclopedia"?content.cards.Values.ToList():(modal=="draw"?game.Export().drawPile.OrderBy(id=>game.CardFor(id).name).ToList():modal=="discard"?game.Export().discard:game.Deck.ToList()).Select(game.CardFor).ToList();
                var body=ScrollArea(p,24,115,p.rect.width-48,p.rect.height-137,Mathf.Ceil(cards.Count/6f)*230);
                for(var i=0;i<cards.Count;i++)Card(body,cards[i],10+i%6*148,i/6*230,128,214,null);
            }
            else if(modal=="collectibles")
            {
                var ids=game.Collectibles;var body=ScrollArea(p,30,120,p.rect.width-60,p.rect.height-144,ids.Count*100);
                for(var i=0;i<ids.Count;i++){Label(body,content.Text(ids[i]+".name"),0,i*100,p.rect.width-80,30,22,Gold);Label(body,content.Text(ids[i]+".description"),0,i*100+35,p.rect.width-80,60,16,Muted);}
                if(ids.Count==0)Label(body,"尚未获得收集品",0,0,600,40,18,Muted);
            }
            else if(modal=="stats") Label(p,$"局外代币  {meta.metaCurrency}\n\n当前旅程分数  {game.Score}\n当前楼层  {game.Floor}",30,125,700,220,22);
            else if(modal=="account") Label(p,"本地旅人\n\n当前进度保存在本机。多账号切换尚未开放。",30,125,700,180,22);
            else
            {
                Button(p,Screen.fullScreen?"切换窗口模式  ·  F11":"切换全屏模式  ·  F11",30,124,360,48,()=>{Screen.fullScreen=!Screen.fullScreen;dirty=true;});
                Label(p,"战斗：点击手牌出牌；点击敌人选择目标。\n数字 1–9 出牌，Space 结束回合，Esc 关闭面板。",30,194,820,70,17,Muted);
                if(game.HasRun){Button(p,"保存并返回主菜单",30,286,360,48,()=>{save();game.GoToMenu();Open(null);});Button(p,"开始新旅程",410,286,300,48,()=>Open("new-run"));}
                if(modal=="new-run"){Label(p,"开始新旅程将替换当前旅程。",30,350,680,35,18,Danger);Button(p,"确认开始",30,396,260,46,()=>{Open(null);Run(()=>game.NewRun());},true);}
            }
            page=saved;
        }
        private void Rewards()
        {
            var p=Sheet("REWARD // 战利品","带走你的收获",380,960);var n=game.RewardIds.Count;
            if(n==0)n=3;var w=(p.rect.width-60-(n-1)*12)/n;
            for(var i=0;i<n;i++){var index=i;var text=game.RewardIds.Count>0?game.RewardLabel(game.RewardIds[i]):new[]{"150 代币","恢复 30% 生命","获得随机卡牌"}[i];Choice(p,"奖励 "+(i+1),text,30+i*(w+12),116,w,230,()=>Run(()=>game.ChooseReward(index)));}
        }
        private void Shop(){var p=Sheet("SHOP // 废墟商店","风沙中的交易",410);Choice(p,"补给治疗","恢复 30% 生命\n\n100 代币",30,116,360,210,()=>Run(game.BuyHeal));Choice(p,"投掷石头","将卡牌加入卡包\n\n50 代币",406,116,384,210,()=>Run(game.BuyCard));Button(p,"离开商店",p.rect.width-210,350,180,40,()=>Run(game.LeaveShop));}
        private void Event(){var p=Sheet("EVENT // 风沙异闻","废墟里的余火",380);Choice(p,"靠近余火","恢复 10 生命",30,116,368,224,()=>Run(()=>game.ResolveEvent(0)));Choice(p,"冒险搜索","失去 8 生命，获得 60 代币",414,116,376,224,()=>Run(()=>game.ResolveEvent(1)));}
        private void Rest(){var p=Sheet("REST // 休整","停下脚步",380);Choice(p,"休息","恢复 30% 生命",30,116,368,224,()=>Run(()=>game.Rest(true)));Choice(p,"整理装备","获得 25 代币",414,116,376,224,()=>Run(()=>game.Rest(false)));}
        private void Result(){var p=Sheet("RESULT // 旅程结束","风沙记得你的足迹",380);Label(p,game.Message+$"\n\n最终分数  {game.Score}     获得局外代币  {game.Score/100}",30,125,760,140,20);Button(p,"返回主菜单",30,290,300,54,()=>Run(finish),true);}
    }
}



