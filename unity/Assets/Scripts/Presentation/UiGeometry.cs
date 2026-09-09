using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace RoguelikeCardFramework.Presentation
{
    // Rounded, vertically shaded panels match the web CSS without runtime textures per widget.
    public sealed class UiPanel : MaskableGraphic
    {
        public Color top = Color.white, bottom = Color.white, border = Color.clear;
        public float radius = 10, borderWidth = 1;
        protected override void OnPopulateMesh(VertexHelper vh)
        {
            vh.Clear(); var r = rectTransform.rect; var rad = Mathf.Min(radius, Mathf.Min(r.width, r.height) / 2);
            const int count = 32; var outer = new Vector2[count]; var inner = new Vector2[count];
            for (var i = 0; i < count; i++)
            {
                var corner = i / 8; var angle = (corner * 90 + (i % 8) * 90f / 7) * Mathf.Deg2Rad;
                var center = new Vector2(corner == 0 || corner == 3 ? r.xMax - rad : r.xMin + rad, corner < 2 ? r.yMax - rad : r.yMin + rad);
                outer[i] = center + new Vector2(Mathf.Cos(angle), Mathf.Sin(angle)) * rad;
                inner[i] = center + new Vector2(Mathf.Cos(angle), Mathf.Sin(angle)) * Mathf.Max(0, rad - borderWidth);
            }
            Color Shade(Vector2 p) => Color.Lerp(bottom, top, Mathf.InverseLerp(r.yMin, r.yMax, p.y)) * color;
            vh.AddVert(r.center, Shade(r.center), Vector2.zero);
            for (var i = 0; i < count; i++) vh.AddVert(inner[i], Shade(inner[i]), Vector2.zero);
            for (var i = 0; i < count; i++) vh.AddTriangle(0, i + 1, (i + 1) % count + 1);
            for (var i = 0; i < count; i++)
            {
                var next = (i + 1) % count; var offset = vh.currentVertCount;
                vh.AddVert(outer[i], border * color, Vector2.zero); vh.AddVert(outer[next], border * color, Vector2.zero);
                vh.AddVert(inner[next], border * color, Vector2.zero); vh.AddVert(inner[i], border * color, Vector2.zero);
                vh.AddTriangle(offset, offset + 1, offset + 2); vh.AddTriangle(offset, offset + 2, offset + 3);
            }
        }
    }
    public sealed class UiLines : MaskableGraphic
    {
        public struct Segment { public Vector2 from, to; public Color color; public float width; }
        public readonly List<Segment> segments = new();
        public void Line(Vector2 from, Vector2 to, Color tint, float width = 1) => segments.Add(new Segment { from = from, to = to, color = tint, width = width });
        protected override void OnPopulateMesh(VertexHelper vh)
        {
            vh.Clear();
            foreach (var s in segments)
            {
                var a = new Vector2(s.from.x, -s.from.y); var b = new Vector2(s.to.x, -s.to.y);
                var direction = (b - a).normalized; var normal = new Vector2(-direction.y, direction.x) * s.width * .5f;
                var i = vh.currentVertCount;
                vh.AddVert(a - normal, s.color, Vector2.zero); vh.AddVert(a + normal, s.color, Vector2.zero);
                vh.AddVert(b + normal, s.color, Vector2.zero); vh.AddVert(b - normal, s.color, Vector2.zero);
                vh.AddTriangle(i, i + 1, i + 2); vh.AddTriangle(i, i + 2, i + 3);
            }
        }
    }
}
