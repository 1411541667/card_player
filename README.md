# 异变独行（Roguelike Card Framework）

一款末日废土题材的 Roguelike 卡牌构筑游戏。玩家选择角色和祝福，组建卡组，在四层地图中探索战斗，处理事件、商店和休整节点，收集卡牌与收藏品，挑战每层首领。

同一套 Web 游戏可在浏览器中运行，也可以封装成离线 Windows 桌面软件。

## 游戏内容

- 角色：拾荒者、猎人
- 流程：角色选择 → 祝福/删牌 → 主题选择 → 四层地图 → 首领战
- 玩法：卡牌战斗、敌人意图、护盾与状态效果、奖励、商店、事件、休整和存档
- 内容：卡牌、敌人、首领、收藏品、祝福、地图节点和本地化文本

## 技术栈

- 网页：TypeScript、Vite、Phaser 3、Preact
- 规则核心：TypeScript `GameKernel`、Zod、确定性随机数
- 内容数据：CSV（编辑源）与 JSON（运行时）
- Windows 桌面：.NET 8 WinForms、Microsoft Edge WebView2
- Windows 发布：PowerShell、Inno Setup
- 测试与 CI：Vitest、Playwright、CircleCI

## 运行网页版本

需要 Node.js 22：

```bash
npm install
npm run dev
```

打开终端显示的地址，默认是 `http://127.0.0.1:4173`。

常用检查：

```bash
npm run content:check
npm test
npm run lint
npm run build
```

生产网页输出到 `dist/`。

## 生成 Windows 桌面版

需要 Node.js 22 和 .NET 8 SDK。生成安装包还需要 Inno Setup；没有 Inno Setup 时仍会生成可直接运行的目录。

```powershell
npm install
npm run package:windows
```

输出位置：

- 可运行目录：`release/stage-{version}/`
- 主程序：`release/stage-{version}/GameLauncher.exe`
- 安装包：`release/Roguelike-Card-Framework-{version}-Setup.exe`

桌面版使用 WebView2 加载同一份 `dist/`，不维护第二套游戏规则。接收安装包的用户不需要安装 Node.js 或 .NET，但 Windows 需要 Microsoft Edge WebView2 Runtime。

## 内容维护

策划表位于 `src/content/wasteland/tables`。修改后同步并检查运行时 JSON：

```bash
npm run content:sync
npm run content:check
```

## CircleCI

- 普通分支和 Pull Request：检查内容同步、运行单元测试和 ESLint，并构建网页产物。
- `v*` 版本标签：网页检查通过后，额外使用 Windows executor 生成桌面发布包。
- 构建结果可从 CircleCI artifacts 下载。

## 目录概览

- `src/game`：游戏规则核心
- `src/ui`、`src/phaser`：界面与场景渲染
- `src/content/wasteland`：内容数据和资源
- `launcher`：WebView2 Windows 桌面外壳
- `installer`：Windows 安装器配置
- `tests`：网页单元测试和端到端测试
