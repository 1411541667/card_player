# 异变独行（Roguelike Card Framework）

一款末日废土题材的 Roguelike 卡牌构筑游戏。玩家选择角色和祝福，组建卡组，在四层地图中探索战斗，处理事件、商店和休整节点，收集卡牌与收藏品，挑战每层首领。

项目同时提供网页版本和 Unity 原生 Windows 版本。

## 游戏内容

- 角色：拾荒者、猎人
- 流程：角色选择 → 祝福/删牌 → 主题选择 → 四层地图 → 首领战
- 玩法：卡牌战斗、敌人意图、护盾与状态效果、奖励、商店、事件、休整和存档
- 内容：卡牌、敌人、首领、收藏品、祝福、地图节点和本地化文本
- Unity 版支持可拖拽路线图、地图标记、战斗界面、菜单视频背景及原生存档

## 技术栈

- 网页：TypeScript、Vite、Phaser 3、Preact
- 规则核心：TypeScript `GameKernel`、Zod、确定性随机数
- 内容数据：CSV（编辑源）与 JSON（运行时）
- 原生客户端：Unity 2022.3.62f3c1 LTS、C#、uGUI/Canvas、VideoPlayer
- Windows 发布：IL2CPP、PowerShell、Inno Setup 7
- 测试：Vitest、Playwright、Unity Test Framework/EditMode

## 开启网页版本

需要 Node.js（建议 18+）：

```bash
npm install
npm run dev
```

然后打开终端显示的本地地址（通常是 `http://localhost:5173`）。

常用命令：

```bash
npm run build    # 构建网页版本
npm test         # 运行网页单元测试
npm run lint     # 代码检查
```

## 开启 Unity 原生版本

需要安装 Unity `2022.3.62f3c1`，并勾选 Windows Build Support / IL2CPP。

1. 用 Unity Hub 打开仓库中的 `unity/` 文件夹。
2. 打开场景 `unity/Assets/Scenes/Bootstrap.unity`。
3. 点击 Unity 编辑器的 Play 按钮开始游戏。

Unity 菜单 `Build > Windows x64` 可生成 Windows 版本。修改根目录 `package.json` 的版本号后，也可以执行：

```powershell
npm run package:unity:windows
```

安装包输出到 `release/异变独行-{version}-Setup.exe`。快速界面预览可使用 Unity 菜单 `Build > UI Preview Windows`。

## 内容与测试

策划数据位于 `src/content/wasteland/tables`，同步到 JSON：

```bash
npm run content:sync
npm run content:check
```

检查网页与 Unity 的固定 seed 参考数据：

```bash
node scripts/export-unity-parity.mjs --check
```

Unity EditMode 验收（运行前请关闭 Unity 编辑器）：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-unity.ps1
```

详细迁移进度和手动验收步骤见 [docs/unity-migration-plan.md](docs/unity-migration-plan.md) 与 [docs/unity-testing.md](docs/unity-testing.md)。

## 目录概览

- `src/game`：网页规则核心
- `src/ui`、`src/phaser`：网页界面与场景渲染
- `src/content/wasteland`：游戏内容数据和资源
- `unity/Assets/Scripts/Core`：Unity 原生规则
- `unity/Assets/Scripts/Presentation`：Unity uGUI 界面
- `tests`、`unity/Assets/Tests`：网页与 Unity 测试
