# 异变独行 Unity 原生版

Unity 2022.3.62f3c1 LTS / Windows x64。

这是从网页版本迁移的原生客户端工程。当前阶段提供核心初始化、内容包读取和局外进度 JSON 存档验证；后续按迁移计划接入完整规则、地图、战斗和 UGUI。

打开工程后运行 `Assets/Scenes/Bootstrap.unity`。内容原始 JSON 位于 `Assets/StreamingAssets/wasteland/data`，存档位于 Unity 的 `Application.persistentDataPath`。

Windows 构建：在 Unity 菜单选择 `Build > Windows x64`，输出到仓库的 `release/unity-stage-0.1.0`。Windows Build Support (IL2CPP) 已启用。

重复发行：修改根目录 `package.json` 的版本号后，在仓库根目录执行 `npm run package:unity:windows`，脚本会调用 Unity IL2CPP、编译 Inno Setup，并输出 `release/异变独行-{version}-Setup.exe`。
