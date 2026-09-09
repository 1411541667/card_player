using UnityEngine;

public sealed partial class Bootstrap
{
    private bool previewMode;
    private Texture2D presentationBackground;
    private GUIStyle panel;

    private void InitializePresentation()
    {
        previewMode = false;
        var path = System.IO.Path.Combine(Application.streamingAssetsPath, "presentation", "menu.jpg");
        if (System.IO.File.Exists(path))
        {
            presentationBackground = new Texture2D(2, 2);
            presentationBackground.LoadImage(System.IO.File.ReadAllBytes(path));
        }
    }

    private void DrawPresentation()
    {
        if (presentationBackground != null)
            GUI.DrawTexture(new Rect(0, 0, Screen.width, Screen.height), presentationBackground, ScaleMode.ScaleAndCrop);
        GUI.color = new Color(0.03f, 0.05f, 0.07f, 0.72f);
        GUI.DrawTexture(new Rect(0, 0, Screen.width, Screen.height), Texture2D.whiteTexture);
        GUI.color = Color.white;

        var width = Mathf.Min(900f, Screen.width - 48f);
        var height = Mathf.Min(Screen.height - 48f, 760f);
        var rect = new Rect((Screen.width - width) * .5f, (Screen.height - height) * .5f, width, height);
        GUI.Box(rect, GUIContent.none, panel);
        GUILayout.BeginArea(new Rect(rect.x + 32, rect.y + 26, rect.width - 64, rect.height - 52));
        GUILayout.Label("异变独行", title);
        GUILayout.Label("WASTELAND  //  尘沙", small);
        GUILayout.Space(18);
        DrawPhase();
        GUILayout.EndArea();
    }
}
