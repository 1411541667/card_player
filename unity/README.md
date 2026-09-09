# 异变独行 Unity 原生版

Unity 2022.3.62f3c1 LTS / Windows x64。

这是从网页版本迁移的原生客户端工程。当前已接入可复现随机数、角色/祝福/删牌/主题开局流程、四层地图生成与节点推进、内容驱动战斗和奖励及原生 JSON 存档。地图、祝福、战斗回放和奖励效果通过网页参考数据比对；事件/商店/休整升级、网页存档兼容和正式 UGUI 仍在迁移中。当前可操作界面使用 IMGUI。

原生存档为 `NativeRunSave` schema 4，保存地图、开局状态、独立卡牌实例、战斗牌堆/状态/敌人意图/资源和奖励候选；可读取 schema 1/2/3 的旧原生存档。旧存档中正在进行的简化战斗会按旧规则继续，新地图节点战斗采用新的规则。它不是网页端 `RunSaveV2`，不可直接互换。

详细进度和验证方式见 [迁移计划](../docs/unity-migration-plan.md)。在仓库根目录执行 `node scripts/export-unity-parity.mjs --check` 检查网页参考数据，再在 Unity Test Runner 中运行 EditMode 测试。

一键验证（先关闭此工程的 Unity 编辑器）：在仓库根目录执行 `powershell -ExecutionPolicy Bypass -File .\scripts\test-unity.ps1`。手动试玩步骤和报告位置见 [验收说明](../docs/unity-testing.md)。

打开工程后运行 `Assets/Scenes/Bootstrap.unity`。内容原始 JSON 位于 `Assets/StreamingAssets/wasteland/data`，存档位于 Unity 的 `Application.persistentDataPath`。

Windows 构建：在 Unity 菜单选择 `Build > Windows x64`，输出到仓库的 `release/unity-stage-0.1.0`。Windows Build Support (IL2CPP) 已启用。

重复发行：修改根目录 `package.json` 的版本号后，在仓库根目录执行 `npm run package:unity:windows`，脚本会调用 Unity IL2CPP、编译 Inno Setup，并输出 `release/异变独行-{version}-Setup.exe`。
