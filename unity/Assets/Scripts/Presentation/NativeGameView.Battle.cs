using System;
using System.Linq;
using RoguelikeCardFramework.Core;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
namespace RoguelikeCardFramework.Presentation
{
    public sealed partial class NativeGameView
    {
        private void Play(string id)
        {
            var index=game.Hand.ToList().IndexOf(id);if(index<0)return;
            Run(()=>game.PlayCard(index,selectedEnemy));
        }
        private RectTransform Card(Transform parent, NativeCard card, float x,float y,float width,float height,Action click,string cost=null,int key=0)
        {
            var p=Panel(parent,card.name,x,y,width,height);
            var color=Hex(card.type switch {"attack"=>"aa6259","defense"=>"5e8392","skill"=>"798c65",_=>"9a7855"});
            p.GetComponent<UiPanel>().border=Hex("c7bca3",.5f);
            Panel(p,"Type stripe",5,height-7,width-10,4,color,1);
            var badge=Panel(p,"Cost",-9,-9,34,34,Gold,17);Label(badge,cost??card.cost.ToString(),0,0,34,34,20,Hex("08111c"),true,TextAnchor.MiddleCenter);
            Icon(p,"icon_card",card.type,(width-44)/2,20,44);
            Label(p,card.name,9,74,width-18,37,17,Ink,true,TextAnchor.MiddleCenter);
            Label(p,card.description,12,116,width-24,height-155,14,Ink);
            Label(p,(card.type switch {"attack"=>"攻击","defense"=>"防御","skill"=>"技能",_=>"能力"})+(key>0?$"    {key}":""),10,height-30,width-20,22,12,Muted,false,TextAnchor.MiddleCenter);
            if(click!=null){var interaction=p.gameObject.AddComponent<HandInteraction>();interaction.onPlay=click;interaction.enableDrag=key>0;interaction.canvas=canvas;interaction.dropHeight=H*.56f;}
            return p;
        }
        private void Actor(string name,float x,float y,Color tint,int hp,int maxHp,int block,Action select=null,bool selected=false)
        {
            var actor=Panel(page,name,x-55,y-70,110,140,tint,14);actor.GetComponent<UiPanel>().border=selected?Gold:Color.clear;actor.GetComponent<UiPanel>().borderWidth=selected?3:0;
            Label(actor,name,-30,-35,170,30,18,Ink,true,TextAnchor.MiddleCenter);
            if(select!=null){var b=actor.gameObject.AddComponent<Button>();b.targetGraphic=actor.GetComponent<UiPanel>();b.onClick.AddListener(()=>select());}
            Panel(page,"Health track",x-62,y+80,124,14,Hex("242b2c"),7);
            Panel(page,"Health",x-62,y+80,124*Mathf.Clamp01((float)hp/Mathf.Max(1,maxHp)),14,Hex("65c48d"),7);
            Label(page,$"{hp} / {maxHp}"+(block>0?$"  ◈ {block}":""),x-90,y+100,180,25,15,Ink,false,TextAnchor.MiddleCenter);
        }
        private void Battle()
        {
            var battle=game.Combat; if(battle==null){Label(page,"该旧版战斗存档不支持图形战场，请开始新旅程。",60,150,900,50,22);return;}
            if(!battle.enemies.Any(e=>e.instanceId==selectedEnemy&&e.health>0))selectedEnemy=battle.enemies.FirstOrDefault(e=>e.health>0)?.instanceId;
            var floor=H*.55f;
            var ground=Area(page,"Ground",0,0,W,H).gameObject.AddComponent<UiLines>();ground.raycastTarget=false;ground.Line(new Vector2(W*.09f,floor+75),new Vector2(W*.94f,floor+75),Hex("a99e86",.22f),2);
            Actor(content.characters[game.CharacterId].name,W*.2f,floor,Hex("568078"),game.Health,game.MaxHealth,game.Block);
            Label(page,"回合 "+battle.turn,32,90,240,35,20,Muted);
            Label(page,string.Join("  /  ",battle.resources.Select(r=>ResourceName(r.id)+" "+r.amount)),32,128,350,40,22,Gold,true);
            for(var i=0;i<battle.enemies.Count;i++)
            {
                var enemy=battle.enemies[i];var def=content.enemies.Find(e=>e.id==enemy.definitionId);var x=battle.enemies.Count==1?W*.68f:W*(.58f+i*.30f/Mathf.Max(1,battle.enemies.Count-1));
                Actor(def.name,x,floor,Hex("b56576",enemy.health>0?1:.3f),enemy.health,def.health,enemy.block,()=>{selectedEnemy=enemy.instanceId;dirty=true;},selectedEnemy==enemy.instanceId);
                Label(page,enemy.health>0?game.EnemyIntentLabel(enemy):"已击败",x-100,floor-131,200,47,16,Gold,false,TextAnchor.MiddleCenter);
                var info=Button(page,$"{def.name}  {enemy.health}/{def.health}",W-286,86+i*48,260,40,()=>{selectedEnemy=enemy.instanceId;dirty=true;},selectedEnemy==enemy.instanceId,enemy.health>0);
                for(var s=0;s<enemy.statuses.Count;s++){var status=enemy.statuses[s];Label(page,content.Text(status.definitionId+".name")+" "+status.stacks,x-80,floor+125+s*20,180,22,13,Muted);}
            }
            var count=game.Hand.Count;var cw=Mathf.Clamp(W*.095f,104,122);var ch=cw*1.72f;var spacing=Mathf.Min(cw*.62f,(W-440-cw)/Mathf.Max(1,count-1));var start=(W-(cw+Mathf.Max(0,count-1)*spacing))/2;
            for(var i=0;i<count;i++){var id=game.Hand[i];var p=Card(page,game.CardFor(id),start+i*spacing,H-ch-12+Mathf.Abs(i-(count-1)/2f)*3,cw,ch,()=>Play(id),game.EffectiveCardCost(id).ToString(),i+1);}
            Button(page,$"抽牌堆 {game.DrawPileCount}",24,H-90,146,52,()=>Open("draw"));Button(page,$"弃牌堆 {game.DiscardPileCount}",24,H-151,146,52,()=>Open("discard"));
            Button(page,"结束回合  [Space]",W-206,H-82,182,58,()=>Run(game.EndTurn),true);
            for(var i=0;i<battle.statuses.Count;i++){var s=battle.statuses[i];var id=s.definitionId.Split('.').Last();Icon(page,"icon_battle",id,W*.2f-80+i*46,floor+134,26);Label(page,s.stacks.ToString(),W*.2f-54+i*46,floor+134,30,26,14,Gold);}
        }
    }
    public sealed class HandInteraction : MonoBehaviour,IPointerEnterHandler,IPointerExitHandler,IPointerClickHandler,IBeginDragHandler,IDragHandler,IEndDragHandler
    {
        public Action onPlay;public bool enableDrag;public Canvas canvas;public float dropHeight;
        private RectTransform rect;private Vector2 original;private int index;private bool hovered,dragging;
        private void Awake(){rect=GetComponent<RectTransform>();}
        public void OnPointerEnter(PointerEventData e){if(hovered)return;hovered=true;original=rect.anchoredPosition;index=rect.GetSiblingIndex();rect.SetAsLastSibling();rect.anchoredPosition=original+new Vector2(0,28);rect.localScale=Vector3.one*1.12f;}
        public void OnPointerExit(PointerEventData e){if(!dragging)Reset();}
        private void Reset(){if(!hovered)return;rect.anchoredPosition=original;rect.localScale=Vector3.one;rect.SetSiblingIndex(index);hovered=false;}
        public void OnPointerClick(PointerEventData e){if(e.button==PointerEventData.InputButton.Left&&!e.dragging)onPlay?.Invoke();}
        public void OnBeginDrag(PointerEventData e){if(!enableDrag)return;dragging=true;}
        public void OnDrag(PointerEventData e){if(dragging)rect.anchoredPosition+=e.delta/canvas.scaleFactor;}
        public void OnEndDrag(PointerEventData e){if(!dragging)return;dragging=false;var play=e.position.y/canvas.scaleFactor>dropHeight;Reset();if(play)onPlay?.Invoke();}
    }
}

