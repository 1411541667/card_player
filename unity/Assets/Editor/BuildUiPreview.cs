using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;
public static class BuildUiPreview
{
    [MenuItem("Build/UI Preview Windows")]
    public static void Build()
    {
        var group=BuildTargetGroup.Standalone;
        var backend=PlayerSettings.GetScriptingBackend(group);
        try
        {
            PlayerSettings.SetScriptingBackend(group,ScriptingImplementation.Mono2x);
            var output=Path.GetFullPath(Path.Combine(Application.dataPath,"../../release/unity-ui-preview/异变独行.exe"));
            Directory.CreateDirectory(Path.GetDirectoryName(output));
            var report=BuildPipeline.BuildPlayer(new[]{"Assets/Scenes/Bootstrap.unity"},output,BuildTarget.StandaloneWindows64,BuildOptions.Development);
            if(report.summary.result!=BuildResult.Succeeded)throw new System.Exception("UI preview build failed: "+report.summary.result);
        }
        finally { PlayerSettings.SetScriptingBackend(group,backend); }
    }
}
