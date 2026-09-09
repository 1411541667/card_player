using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
namespace RoguelikeCardFramework.Presentation
{
    public sealed partial class NativeGameView
    {
        private float mapScroll;private int displayedFloor;
        private static float Jitter(string id,int axis){unchecked{var hash=axis*97;foreach(var c in id)hash=hash*31+c;return (float)(System.Math.Abs((long)hash)%200)/100-1;}}
        private static Color NodeColor(string kind)=>Hex(kind switch {"combat"=>"b64d48","elite"=>"8a5bbd","boss"=>"d1a45b","shop"=>"3d85c9","event"=>"d2a72b","reward"=>"54a366",_=>"66707d"});
        private void Map()
        {
            var map=game.Map;if(map==null){var i=0;foreach(var choice in game.MapChoices()){var id=choice;Button(page,id,220,160+60*i++,420,48,()=>Run(()=>game.ChooseNode(id)));}return;}
            if(displayedFloor!=game.Floor){displayedFloor=game.Floor;mapScroll=0;}
            var maxLayer=Mathf.Max(1,map.nodes.Max(n=>n.layer));var maxColumn=Mathf.Max(1,map.nodes.Max(n=>n.column));var compact=map.nodes.Count==3;
            var margin=Mathf.Max(96,Mathf.Round(W/6));var world=compact?W:2*margin+Mathf.Max(maxLayer*150,W*.66f);var contentWidth=compact?Mathf.Min(560,W*.55f):world-margin*2;
            var left=compact?(W-contentWidth)/2:margin;var height=Mathf.Min(900,Mathf.Round(H*.72f));var top=Mathf.Round((H-height)/2);
            var viewport=Area(page,"Map viewport",0,76,W,H-76);viewport.gameObject.AddComponent<RectMask2D>();var hit=viewport.gameObject.AddComponent<Image>();hit.color=Color.clear;
            var body=Area(viewport,"Map world",0,-76,world,H);var scroll=viewport.gameObject.AddComponent<MapNavigation>();scroll.viewport=viewport;scroll.content=body;scroll.horizontal=true;scroll.vertical=false;scroll.movementType=ScrollRect.MovementType.Clamped;scroll.scrollSensitivity=70;
            body.anchoredPosition=new Vector2(-Mathf.Clamp(mapScroll,0,world-W),76);scroll.onValueChanged.AddListener(_=>mapScroll=-body.anchoredPosition.x);
            var paper=Panel(body,"Dust map",left-28,compact?(H-274)/2:top-28,contentWidth+56,compact?274:height+56,Hex("765536"),18);var pg=paper.GetComponent<UiPanel>();pg.bottom=Hex("4d3525");pg.border=Hex("caa46a",.9f);pg.borderWidth=2;
            var lines=Area(body,"Terrain and routes",0,0,world,H).gameObject.AddComponent<UiLines>();lines.raycastTarget=false;
            for(var l=0;l<7;l++)for(var step=1;step<=60;step++){float X(int k)=>left-16+k/60f*(contentWidth+32);float Y(int k)=>top+25+l*height/8+Mathf.Sin(k*.26f+l)*8+Mathf.Cos(k*.11f)*3;lines.Line(new Vector2(X(step-1),Y(step-1)),new Vector2(X(step),Y(step)),Hex("d3ae7a",.1f));}
            var positions=map.nodes.ToDictionary(n=>n.id,n=>new Vector2(left+(float)n.layer/maxLayer*contentWidth+(compact?0:Jitter(n.id,1)*14),compact?H/2:top+(float)n.column/maxColumn*height+Jitter(n.id,2)*10));
            foreach(var node in map.nodes)foreach(var id in node.connections)
            {
                var a=positions[node.id];var b=positions[id];var control=(a+b)/2+new Vector2(0,Jitter(node.id,3)*24);
                Vector2 Curve(float t)=>((1-t)*(1-t))*a+2*(1-t)*t*control+t*t*b;
                var steps=Mathf.CeilToInt(Vector2.Distance(a,b)/5);for(var j=0;j<steps;j+=2)lines.Line(Curve((float)j/steps),Curve((float)Mathf.Min(j+1,steps)/steps),Hex("9c8a6b",node.visited?.85f:.55f),2);
            }
            foreach(var node in map.nodes)
            {
                var n=node;var point=positions[n.id];var kind=n.handlerId.Split('.').Last();var size=kind=="boss"?48:38;var available=n.available&&!n.visited;
                if(available){var ring=Panel(body,"Available",point.x-size/2-10,point.y-size/2-10,size+20,size+20,Color.clear,40).GetComponent<UiPanel>();ring.border=Hex("ffe9b8");ring.borderWidth=3;}
                var p=Panel(body,game.NodeLabel(n.id),point.x-size/2-4,point.y-size/2-4,size+8,size+8,NodeColor(kind),40);p.GetComponent<UiPanel>().color=new Color(1,1,1,available?1:.55f);
                var b=p.gameObject.AddComponent<Button>();b.targetGraphic=p.GetComponent<UiPanel>();b.interactable=available;b.onClick.AddListener(()=>Run(()=>game.ChooseNode(n.id)));
                Icon(p,"icon_map",kind,4,4,size,available?1:.62f);
                if(n.visited)Label(p,"✓",size-2,-7,24,24,19,Gold,true);
            }
            var ink=Area(body,"Map ink",0,0,world,H).gameObject.AddComponent<UiLines>();ink.raycastTarget=false;scroll.ink=ink;
            foreach(var cell in map.ink??new List<RoguelikeCardFramework.Core.NativeMapInk>())scroll.cells[new Vector2Int(cell.x,cell.y)]=cell.color;scroll.Redraw();
            scroll.changed=cells=>{game.SetMapInk(cells);save();};
            Button(page,"画笔",W-430,H-58,90,38,()=>scroll.erase=false);Button(page,"橡皮",W-332,H-58,90,38,()=>scroll.erase=true);Button(page,"清空",W-234,H-58,90,38,()=>{scroll.cells.Clear();scroll.Redraw();scroll.changed(new List<RoguelikeCardFramework.Core.NativeMapInk>());});
            var legend=Panel(page,"Legend",16,H*.29f,124,282,Hex("141819",.93f));var kinds=new[]{"combat","elite","boss","shop","event","reward","rest"};var names=new[]{"战斗","精英","首领","商店","事件","奖励","休整"};
            for(var i=0;i<kinds.Length;i++){Icon(legend,"icon_map",kinds[i],12,10+i*38,25);Label(legend,names[i],48,10+i*38,70,28,15,Ink,false,TextAnchor.MiddleLeft);}
            Label(page,$"第 {game.Floor} 层  //  尘沙\n左键拖动 / 滚轮平移，右键绘画",20,H-70,400,56,16,Muted);
        }
    }
}

