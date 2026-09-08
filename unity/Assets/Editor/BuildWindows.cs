using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

public static class BuildWindows
{
    [MenuItem("Build/Windows x64")]
    public static void Build()
    {
        var repositoryRoot = Path.GetFullPath(Path.Combine(Application.dataPath, "..", ".."));
        var version = System.Environment.GetEnvironmentVariable("UNITY_GAME_VERSION") ?? "0.1.0";
        PlayerSettings.bundleVersion = version;
        PlayerSettings.productName = "异变独行";
        PlayerSettings.companyName = "RoguelikeCardFramework";
        var output = Path.Combine(repositoryRoot, "release", "unity-stage-" + version, "异变独行.exe");
        Directory.CreateDirectory(Path.GetDirectoryName(output));
        var report = BuildPipeline.BuildPlayer(new[] { "Assets/Scenes/Bootstrap.unity" }, output, BuildTarget.StandaloneWindows64, BuildOptions.None);
        if (report.summary.result != BuildResult.Succeeded) throw new System.Exception("Unity Windows build failed: " + report.summary.result);
    }
}
