using System;
using System.Collections.Generic;
using System.Linq;
using RoguelikeCardFramework.Core;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
namespace RoguelikeCardFramework.Presentation
{
    // Pointer coordinates live in map space, so marks travel with the map while panning.
    public sealed class MapNavigation : ScrollRect, IPointerDownHandler, IPointerUpHandler
    {
        public UiLines ink; public Action<List<NativeMapInk>> changed;public int brush;public bool erase;
        public readonly Dictionary<Vector2Int,int> cells=new();private Vector2 last;private bool drawing;
        private static readonly Color[] colors={new Color(.92f,.82f,.57f),new Color(.8f,.28f,.25f),new Color(.25f,.61f,.8f)};
        public void Redraw()
        {
            ink.segments.Clear();foreach(var cell in cells){var p=new Vector2(cell.Key.x*3,cell.Key.y*3+1.5f);ink.Line(p,p+Vector2.right*3,colors[Mathf.Clamp(cell.Value,0,2)],3);}ink.SetVerticesDirty();
        }
        private Vector2 Point(PointerEventData e){RectTransformUtility.ScreenPointToLocalPointInRectangle(content,e.position,e.pressEventCamera,out var p);return new Vector2(p.x,-p.y);}
        private void Paint(Vector2 from,Vector2 to)
        {
            var steps=Mathf.Max(1,Mathf.CeilToInt(Vector2.Distance(from,to)/1.5f));
            for(var i=0;i<=steps;i++){var p=Vector2.Lerp(from,to,(float)i/steps);var key=new Vector2Int(Mathf.FloorToInt(p.x/3),Mathf.FloorToInt(p.y/3));if(p.x<0||p.x>content.rect.width||p.y<0||p.y>content.rect.height)continue;
                if(erase){for(var x=-2;x<=2;x++)for(var y=-2;y<=2;y++)cells.Remove(key+new Vector2Int(x,y));}else if(cells.Count<6000||cells.ContainsKey(key))cells[key]=brush;}
            Redraw();
        }
        public void OnPointerDown(PointerEventData e){if(e.button!=PointerEventData.InputButton.Right)return;drawing=true;last=Point(e);Paint(last,last);}
        public void OnPointerUp(PointerEventData e){if(e.button==PointerEventData.InputButton.Right&&drawing){drawing=false;changed?.Invoke(cells.Select(c=>new NativeMapInk{x=c.Key.x,y=c.Key.y,color=c.Value}).ToList());}}
        public override void OnBeginDrag(PointerEventData e){if(e.button==PointerEventData.InputButton.Left)base.OnBeginDrag(e);}
        public override void OnDrag(PointerEventData e){if(e.button==PointerEventData.InputButton.Right&&drawing){var p=Point(e);Paint(last,p);last=p;}else base.OnDrag(e);}
        public override void OnEndDrag(PointerEventData e){if(e.button==PointerEventData.InputButton.Left)base.OnEndDrag(e);else OnPointerUp(e);}
    }
}
