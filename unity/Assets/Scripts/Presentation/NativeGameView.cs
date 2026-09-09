using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using RoguelikeCardFramework.Core;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using UnityEngine.Video;

namespace RoguelikeCardFramework.Presentation
{
    public sealed partial class NativeGameView : MonoBehaviour
    {
        private NativeGameSession game;
        private ContentDatabase content;
        private MetaProgressSave meta;
        private Action save, finish;
        private Canvas canvas;
        private RectTransform screen, page;
        private Font font;
        private VideoPlayer video;
        private RenderTexture videoTexture;
        private RawImage backdrop;
        private Texture2D fallback;
        private readonly Dictionary<string, Texture2D> icons = new();
        private string modal, error, selectedEnemy;
        private bool dirty = true;
        private NativePhase renderedPhase;
        private Vector2 renderedSize;
        private float W => screen.rect.width;
        private float H => screen.rect.height;
        private static Color Hex(string hex, float alpha = 1) { ColorUtility.TryParseHtmlString("#" + hex, out var c); c.a = alpha; return c; }
        private static readonly Color Ink = Hex("ebe6d9"), Muted = Hex("aaa591"), Gold = Hex("d0a25f"), Line = Hex("c7bca3", .24f), Surface = Hex("141819", .97f), Danger = Hex("c7766f");

        public void Initialize(NativeGameSession session, ContentDatabase database, MetaProgressSave progress, Action persist, Action finishRun)
        {
            game = session; content = database; meta = progress; save = persist; finish = finishRun;
            font = Font.CreateDynamicFontFromOSFont(new[] { "Microsoft YaHei UI", "Microsoft YaHei", "SimHei", "Arial" }, 20);
            if (font == null) font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            canvas = new GameObject("GameCanvas", typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster)).GetComponent<Canvas>();
            canvas.transform.SetParent(transform, false); canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvas.GetComponent<CanvasScaler>(); scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1280, 720); scaler.matchWidthOrHeight = .5f;
            screen = canvas.GetComponent<RectTransform>();
            if (FindObjectOfType<EventSystem>() == null) new GameObject("UI EventSystem", typeof(EventSystem), typeof(StandaloneInputModule)).transform.SetParent(transform);
            var background = Area(screen, "Background", 0, 0, 1280, 720); Stretch(background);
            var bg = background.gameObject.AddComponent<UiPanel>(); bg.top = Hex("101620"); bg.bottom = Hex("080b10"); bg.radius = 0; bg.borderWidth = 0; bg.raycastTarget = false;
            backdrop = Area(screen, "Menu video", 0, 0, 1280, 720).gameObject.AddComponent<RawImage>(); Stretch(backdrop.rectTransform);
            backdrop.raycastTarget = false; backdrop.color = new Color(.85f, .85f, .85f, .5f);
            var folder = Path.Combine(Application.streamingAssetsPath, "presentation");
            if (File.Exists(Path.Combine(folder, "menu.jpg"))) { fallback = new Texture2D(2, 2); fallback.LoadImage(File.ReadAllBytes(Path.Combine(folder, "menu.jpg"))); backdrop.texture = fallback; }
            if (File.Exists(Path.Combine(folder, "menu.mp4")))
            {
                video = gameObject.AddComponent<VideoPlayer>(); video.playOnAwake = false; video.isLooping = true; video.audioOutputMode = VideoAudioOutputMode.None;
                video.source = VideoSource.Url; video.url = Path.Combine(folder, "menu.mp4"); video.renderMode = VideoRenderMode.RenderTexture;
                videoTexture = new RenderTexture(1280, 720, 0); video.targetTexture = videoTexture; video.aspectRatio = VideoAspectRatio.FitOutside;
                video.prepareCompleted += _ => { if (game.Phase == NativePhase.Menu) { backdrop.texture = videoTexture; video.Play(); } };
                video.errorReceived += (_, message) => Debug.LogWarning("Menu video fallback: " + message); video.Prepare();
            }
            Canvas.ForceUpdateCanvases(); Render();
        }
        private static RectTransform Area(Transform parent, string name, float x, float y, float width, float height)
        {
            var rect = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>(); rect.SetParent(parent, false);
            rect.anchorMin = rect.anchorMax = rect.pivot = new Vector2(0, 1); rect.anchoredPosition = new Vector2(x, -y); rect.sizeDelta = new Vector2(width, height); return rect;
        }
        private static void Stretch(RectTransform rect) { rect.anchorMin = Vector2.zero; rect.anchorMax = Vector2.one; rect.offsetMin = rect.offsetMax = Vector2.zero; }
        private RectTransform Panel(Transform parent, string name, float x, float y, float width, float height, Color? tint = null, float radius = 12)
        {
            var rect = Area(parent, name, x, y, width, height); var graphic = rect.gameObject.AddComponent<UiPanel>();
            graphic.top = tint ?? Hex("1d2222", .97f); graphic.bottom = tint ?? Hex("0a0d0f", .97f); graphic.border = Line; graphic.radius = radius; return rect;
        }
        private Text Label(Transform parent, string text, float x, float y, float width, float height, int size = 16, Color? tint = null, bool bold = false, TextAnchor align = TextAnchor.UpperLeft)
        {
            var label = Area(parent, text.Length > 25 ? text.Substring(0, 25) : text, x, y, width, height).gameObject.AddComponent<Text>();
            label.font = font; label.text = text; label.fontSize = size; label.color = tint ?? Ink; label.fontStyle = bold ? FontStyle.Bold : FontStyle.Normal;
            label.alignment = align; label.supportRichText = false; label.raycastTarget = false; label.horizontalOverflow = HorizontalWrapMode.Wrap; label.verticalOverflow = VerticalWrapMode.Truncate; label.lineSpacing = 1.1f; return label;
        }
        private Button Button(Transform parent, string text, float x, float y, float width, float height, Action action, bool primary = false, bool enabled = true)
        {
            var rect = Panel(parent, text, x, y, width, height, primary ? Gold : Hex("242a2a", .97f), 8);
            rect.GetComponent<UiPanel>().border = primary ? Gold : Hex("c7bca3", .5f);
            var button = rect.gameObject.AddComponent<Button>(); button.targetGraphic = rect.GetComponent<UiPanel>(); button.interactable = enabled;
            var colors = button.colors; colors.highlightedColor = new Color(1.22f, 1.16f, 1.07f); colors.pressedColor = new Color(.8f, .8f, .8f); colors.disabledColor = new Color(.6f, .6f, .6f, .42f); button.colors = colors;
            button.onClick.AddListener(() => action?.Invoke());
            Label(rect, text, 16, 0, width - 32, height, 16, primary ? Hex("08111c") : Ink, primary, TextAnchor.MiddleLeft);
            return button;
        }
        private void Icon(Transform parent, string group, string name, float x, float y, float size, float alpha = 1)
        {
            var key = group + "/" + name;
            if (!icons.TryGetValue(key, out var texture))
            {
                var path = Path.Combine(Application.streamingAssetsPath, "presentation", group, name + ".png");
                if (!File.Exists(path)) return;
                texture = new Texture2D(2, 2); texture.LoadImage(File.ReadAllBytes(path)); icons[key] = texture;
            }
            var image = Area(parent, key, x, y, size, size).gameObject.AddComponent<RawImage>(); image.texture = texture; image.color = new Color(1, 1, 1, alpha); image.raycastTarget = false;
        }
        private static string ResourceName(string id) => id switch { "action" => "行动力", "serum" => "能量剂", _ => id };
        private void Run(Action command)
        {
            try { command(); save(); error = null; }
            catch (Exception ex) { error = ex.Message; Debug.LogWarning(ex.Message); }
            dirty = true;
        }
        private void Open(string name) { modal = name; dirty = true; }
        private void Update()
        {
            if (game == null) return;
            if (Input.GetKeyDown(KeyCode.F11)) Screen.fullScreen = !Screen.fullScreen;
            if (Input.GetKeyDown(KeyCode.Escape)) { modal = modal == null ? (game.Phase == NativePhase.Menu ? "settings" : "pause") : null; dirty = true; }
            if (modal == null && game.Phase == NativePhase.Combat)
            {
                if (Input.GetKeyDown(KeyCode.Space)) Run(game.EndTurn);
                for (var i = 0; i < Mathf.Min(9, game.Hand.Count); i++) if (Input.GetKeyDown(KeyCode.Alpha1 + i)) Play(game.Hand[i]);
            }
        }
        private void LateUpdate()
        {
            if (game != null && (dirty || renderedPhase != game.Phase || renderedSize != new Vector2(W, H))) Render();
        }
        public void Refresh() { dirty = true; }
        private void Render()
        {
            dirty = false; renderedPhase = game.Phase; renderedSize = new Vector2(W, H);
            if (page != null) { page.gameObject.SetActive(false); Destroy(page.gameObject); }
            page = Area(screen, "Screen " + game.Phase, 0, 0, W, H);
            var menu = game.Phase == NativePhase.Menu; backdrop.gameObject.SetActive(menu);
            if (video != null && video.isPrepared) { if (menu && !video.isPlaying) { backdrop.texture = videoTexture; video.Play(); } else if (!menu) video.Pause(); }
            switch (game.Phase)
            {
                case NativePhase.Menu: Menu(); break;
                case NativePhase.CharacterSelect: Characters(); break;
                case NativePhase.BoonSelect: Boons(); break;
                case NativePhase.BoonRemove: RemoveCards(); break;
                case NativePhase.ThemeSelect: Themes(); break;
                case NativePhase.Map: Map(); break;
                case NativePhase.Combat: Battle(); break;
                case NativePhase.Reward: Rewards(); break;
                case NativePhase.Shop: Shop(); break;
                case NativePhase.Event: Event(); break;
                case NativePhase.Rest: Rest(); break;
                case NativePhase.Result: Result(); break;
                case NativePhase.Settings: modal = "settings"; break;
                case NativePhase.Encyclopedia: modal = "encyclopedia"; break;
            }
            if (game.HasRun && game.Phase != NativePhase.Menu && game.Phase != NativePhase.CharacterSelect && game.Phase != NativePhase.BoonSelect && game.Phase != NativePhase.BoonRemove && game.Phase != NativePhase.ThemeSelect) Hud();
            else if (!menu) Button(page, "设置", W - 110, 18, 92, 38, () => Open("pause"));
            if (modal != null) Modal();
            if (!string.IsNullOrEmpty(error))
            {
                var banner = Panel(page, "Error", (W - 650) / 2, 82, 650, 48, Danger, 8);
                Label(banner, error, 14, 6, 548, 36, 15, Hex("2a080d")); Button(banner, "关闭", 558, 5, 78, 38, () => { error = null; dirty = true; });
            }
        }
        private void OnDestroy()
        {
            if (video != null) video.Stop(); if (videoTexture != null) { videoTexture.Release(); Destroy(videoTexture); }
            foreach (var texture in icons.Values) Destroy(texture); if (fallback != null) Destroy(fallback); if (font != null) Destroy(font);
        }
    }
}

