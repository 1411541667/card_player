# 异变独行

一款末日废土题材的 Roguelike 卡牌构筑游戏。

## 架构

项目包含网页版本和 Windows 桌面版本，两者使用同一套游戏内容和规则设计。

- 网页端：TypeScript + Vite，使用 Phaser 负责场景渲染，Preact 负责菜单和界面。
- 规则层：`GameKernel` 负责游戏状态、卡牌效果、地图、战斗、奖励和存档。
- 内容层：CSV 作为编辑源，转换为 JSON 供游戏运行时加载。
- Windows 版：基于 .NET 8、WebView2 和 PowerShell 打包，将网页版本封装为桌面程序。
- 测试：使用 Vitest、Playwright 和 ESLint 进行测试与检查。

界面只负责显示状态和发送操作，游戏规则由核心逻辑统一处理，便于网页和桌面版本保持一致。

## 大致玩法

玩家选择角色后开始一段随机冒险，在地图上选择路线并逐步前进。

冒险过程中可以：

- 通过战斗使用卡牌攻击敌人、获得防护或施加状态效果；
- 在事件、商店和休整地点做出选择；
- 获得新卡牌和收藏品，调整自己的卡组；
- 根据当前路线和资源安排下一步行动；
- 挑战每层首领，完成整段冒险。

每次冒险的地图、战斗和奖励都会受到随机种子影响，因此不同尝试会产生不同的卡组和路线组合。

## 如何游玩

### 网页版

需要 Node.js 22：

```bash
npm install
npm run dev
```

然后打开终端显示的本地地址，通常是 `http://127.0.0.1:4173`。

常用命令：

```bash
npm test       # 运行测试
npm run build  # 构建网页版本
```

### Windows 桌面版

需要 Node.js 22 和 .NET 8 SDK。生成安装包还需要 Inno Setup：

```powershell
npm install
npm run package:windows
```

构建结果位于 `release/` 目录。桌面版使用 WebView2 运行网页版本，用户运行已打包程序时不需要安装 Node.js 或 .NET，但系统需要 Microsoft Edge WebView2 Runtime。

### 内容维护

修改 `src/content/wasteland/tables` 中的内容后，运行以下命令同步并检查运行时数据：

```bash
npm run content:sync
npm run content:check
```
