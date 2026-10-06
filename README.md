# 异变独行

一款末日废土题材的 Roguelike 卡牌构筑游戏。构建产物同时提供网页版本与 Windows 桌面版本，两者共用同一套游戏内容与规则。

## 游戏介绍

世界观为末世科幻，主题「WASTELAND // 尘沙」。玩家扮演拾荒者在风化的废墟地图上攀爬四层，用行动力驱动卡牌与废土怪物、首领战斗；当生命降至 0 时本局结束，结束文案为「未知的风沙将你掩埋，你失去了意识」。

玩家选择角色后开始一段随机冒险，在地图上选择路线并逐步前进。冒险过程中可以：

- 通过战斗使用卡牌攻击敌人、获得防护或施加状态效果；
- 在事件、商店和休整地点做出选择；
- 获得新卡牌和收藏品，调整自己的卡组；
- 根据当前路线和资源安排下一步行动；
- 挑战每层首领，完成整段冒险。

每层地图由节点连接而成，玩家只能进入当前节点相邻的下一排节点，不可回头、不可重复进入；所有末路最终汇入该层唯一的首领节点。普通战斗胜利固定获得 20~60 商店代币，只有首领战与精英战胜利后进入三选一奖励。

每次冒险的地图、战斗和奖励都会受到随机种子影响，因此不同尝试会产生不同的卡组和路线组合。局内收集品、商店代币与本局结局分数只在本地保存，分数仅在一局结束后的结算页显示，并按每 100 分折算 1 个局外养成代币。

完整的规则、数值与版本记录见 [更新日志.md](更新日志.md)。

## 如何配置游玩

### 环境要求

- Node.js 22
- Windows 桌面版额外需要 .NET 8 SDK；生成安装包还需要 Inno Setup

### 网页版

```bash
npm install
npm run dev
```

然后打开终端显示的本地地址 `http://127.0.0.1:4173`。

常用命令：

```bash
npm test         # 内容校验 + 单元测试
npm run lint     # ESLint 检查
npm run build    # 内容校验 + 类型检查 + 构建
npm run preview  # 预览构建结果
npm run test:e2e # Playwright 端到端测试
```

### Windows 桌面版

桌面版基于 .NET 8、WebView2 与 PowerShell 打包，将网页版本封装为桌面程序：

```powershell
npm install
npm run package:windows
```

构建结果位于 `release/` 目录。运行已打包程序时不需要安装 Node.js 或 .NET，但系统需要 Microsoft Edge WebView2 Runtime。

### 内容维护

`src/content/wasteland/tables` 中的 CSV 是人工编辑源，`src/content/wasteland/data` 中的 JSON 是游戏实际读取的运行时数据。修改 CSV 后运行：

```bash
npm run content:sync   # CSV -> JSON
npm run content:check  # 校验两者是否一致
```

`npm test` 与 `npm run build` 都会自动执行 `content:check`，CSV 与 JSON 漂移时直接失败。

### 启动器图标

启动器图标由 `src/launcher-icon.svg` 生成。修改图形后重新生成：

```bash
npm run icon:build
```

这会先渲染出 `src/launcher-icon.png`，再打包成 `launcher/launcher.ico`。图标的来源和许可见 [CREDITS.md](CREDITS.md)。

## 游戏架构

### 技术栈

- 网页端：TypeScript + Vite，使用 Phaser 负责场景渲染，Preact 负责菜单和界面。
- 规则层：`GameKernel` 负责游戏状态、卡牌效果、地图、战斗、奖励和存档。
- 内容层：CSV 作为编辑源，转换为 JSON 供游戏运行时加载，并用 Zod 做强校验与引用完整性检查。
- Windows 版：基于 .NET 8、WebView2 和 PowerShell 打包，将网页版本封装为桌面程序。
- 测试：使用 Vitest、Playwright 和 ESLint 进行测试与检查。

### 分层与目录

| 层 | 目录 | 职责 | 关键技术 |
|---|---|---|---|
| 核心逻辑 | `src/game/` | 纯状态机 + 命令分发，无 UI 依赖，可单测 | `kernel.ts`（reducer）、`effects.ts`（效果注册表）、`random.ts`（确定性种子随机） |
| 内容数据 | `src/content/wasteland/` | 数据驱动，JSON 为运行时源，CSV 为可读镜像 | `content.ts` 用 Zod 校验 |
| UI 层 | `src/ui/` | 菜单、战斗、商店、事件、奖励等面板 | Preact + `App.tsx` |
| 画布层 | `src/phaser/` | 地图节点与战斗画面的图形渲染、镜头抖动/闪白 | Phaser 3.90 + `SceneBridge` 桥接 |
| 内容管线 | `scripts/` | `sync-content.mjs` 负责 CSV→JSON 同步与校验 | `content:sync` / `content:check` |
| 桌面外壳 | `launcher/` | WebView2 宿主程序与发布前的自检 | .NET 8 |
| 测试 | `tests/` | `vitest` 单测 + `playwright` 端到端 | `npm run test` / `test:e2e` |

### 设计要点

界面只负责显示状态和发送操作，游戏规则由核心逻辑统一处理，便于网页和桌面版本保持一致。

- 逻辑与渲染完全解耦：`GameKernel` 是纯函数式命令分发（`dispatch(command)` → `(snapshot, events)`），UI 与 Phaser 都是订阅者，利于平衡调试、回放与后续联网化。
- 确定性随机：`NamespacedRandom` 以 `seed + namespace + counter` 生成，同名命名空间保证可复现，存档可完整回滚（`exportState` / `restoreSave`）。
- 内容全量校验：`ContentRegistry` 启动时校验所有 id 引用、localization key、effect 注册、每层必须有 boss/combat 节点，杜绝「数据配错」类问题。
- 数据/镜像双轨：CSV 给策划改，JSON 给运行时读，`sync-content.mjs` 保证一致。
