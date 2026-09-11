# Roguelike Card Framework

A browser roguelike deckbuilder framework plus the first playable post-apocalyptic content pack.
Phaser renders the isometric route and combat field, Preact owns text-heavy UI, and a serializable
TypeScript kernel owns all rules.

The active `src/content/wasteland` pack contains the Scavenger, a character/boon/theme setup flow,
four floors, four bosses, events, rewards, collectibles, JSON runtime tables, and matching human-editable CSV tables. Content remains
separate from the engine and can still be replaced without editing the kernel.

## Commands

```bash
npm install
npm run dev
npm run build
npm test
npm run lint
npm run test:e2e
npm run content:check
npm run content:sync
node scripts/export-unity-parity.mjs --check
powershell -ExecutionPolicy Bypass -File .\scripts\test-unity.ps1
```

## Windows 桌面发行

仓库现在同时提供网页版本和 Unity 原生 Windows 版本。原生工程位于 `unity/`，使用 Unity 2022.3.62f3c1 LTS、Windows x64 IL2CPP，不依赖 HTML、WebView2 或 Node.js。工程源码、内容数据和编辑器构建脚本已纳入版本控制；Unity 生成的 `Library/`、`Temp/`、`Build/` 等缓存目录按 `.gitignore` 排除。

Unity 客户端现已使用运行时生成的 Canvas/uGUI Presentation 层，覆盖菜单、开局、可拖拽路线图、战斗、奖励和其他页面；菜单支持视频背景，地图、卡牌和战斗图标由网页端 SVG 资源生成。右键可在路线图上标记，左键拖动地图，`Esc` 打开暂停菜单，`F11` 切换全屏。

迁移中的源码验收请参照 [Unity 测试说明](docs/unity-testing.md)。关闭 Unity 编辑器后，在仓库根目录执行 `powershell -ExecutionPolicy Bypass -File .\scripts\test-unity.ps1`，可检查网页参考数据并运行 Unity EditMode 测试。现有安装包不自动包含最新源码修改；规则同步进度和未完成模块见 [迁移计划](docs/unity-migration-plan.md)。Unity 菜单中的 `Build > UI Preview Windows` 可生成较快的 Mono 开发预览版到 `release/unity-ui-preview`。

打开 Unity 工程后运行 `Assets/Scenes/Bootstrap.unity`，或在 Unity 菜单执行 `Build > Windows x64` 生成 `release/unity-stage-{version}`。修改根目录 `package.json` 的 `version` 后，可使用自动化脚本构建并打包安装程序：

```powershell
npm run package:unity:windows
```

安装包输出为 `release/异变独行-{version}-Setup.exe`。旧 WebView2 流程仅保留为迁移参考。

该脚本要求本机安装 Unity 2022.3.62f3c1（含 Windows Build Support / IL2CPP）和 Inno Setup 7；构建过程中会执行 Unity 原生 smoke test。

桌面版使用 WebView2 在独立窗口运行，不会打开系统浏览器。安装 Microsoft .NET 8 SDK 和 Inno Setup 后，修改 `package.json` 中的 `version`，执行：

```powershell
npm run package:windows
```

脚本会自动检查内容、运行测试和 lint、构建前端、发布 Windows 程序并生成 `release/Roguelike-Card-Framework-{version}-Setup.exe`。没有 Inno Setup 时仍会生成 `release/stage-{version}` 可运行目录。

正式版本使用 Git 标签（例如 `v0.2.0`）标记；安装升级不会删除用户存档。

The main menu includes settings, encounter-unlocked encyclopedia entries, and the last three run
records. Use the backtick key or the **开发面板** button to inspect state, set fixture resources, jump to
nodes, view domain events, and import or export a `RunSaveV2` document.

## 技术栈

| 范围 | 采用技术 | 职责 |
| --- | --- | --- |
| 网页运行时 | TypeScript、Vite、Phaser 3、Preact | Vite 提供开发与构建；Phaser 绘制路线和战斗场景；Preact 承担菜单、卡牌、面板与调试界面。 |
| 网页规则与数据 | TypeScript、Zod、JSON、CSV | 可序列化的确定性规则核心、内容校验及配置驱动的角色、卡牌、敌人、事件、奖励与收藏品。 |
| 网页测试 | Vitest、Playwright、ESLint | 单元测试、浏览器端到端测试与静态检查。 |
| 原生客户端 | Unity 2022.3.62f3c1 LTS、C#、uGUI/Canvas、VideoPlayer | Windows x64 原生运行时；运行时生成的 Canvas/uGUI 页面、路线导航、战斗界面及菜单视频背景。 |
| 原生构建与测试 | IL2CPP、Unity Test Framework、PowerShell、Inno Setup 7 | Windows 安装包、EditMode 测试、smoke test 和安装程序生成。 |
| 资源处理 | Node.js、Sharp | 将网页 SVG 图标转换为 Unity PNG，同步菜单图片/视频并记录源文件哈希。 |

## 架构

### 网页端：规则、渲染与界面分离

`GameKernel` 是网页端的唯一规则入口。UI 只发送 `GameCommand`；核心进行校验并原子化地应用变化，记录 `DomainEvent`，随后发布克隆的 `GameSnapshot`。Phaser 与 Preact 只消费快照，不直接修改游戏状态。

```text
Preact UI / Phaser 场景
          │ GameCommand
          ▼
GameKernel ──► ContentRegistry + Effect / Node 注册表 + 命名空间 RNG
          │
          ├──► DomainEvent 日志
          ├──► GameSnapshot（渲染）
          └──► RunSaveV2（保存 / 恢复）
```

- `src/game`：确定性模拟、命令、事件、内容校验、随机数、节点/效果注册及保存。
- `src/phaser`：一次性渲染对象与规则快照到场景的桥接。
- `src/ui`：Preact DOM 覆盖层、响应式布局、输入反馈与开发工具。
- `src/content/wasteland/data`：游戏加载的 JSON 运行时定义。
- `src/content/wasteland/tables`：供策划编辑的 CSV 源；`scripts/sync-content.mjs` 将其同步到 JSON 并检测漂移。

### Unity 原生端：规则会话与 Presentation 层分离

Unity 客户端的 `Bootstrap` 只负责加载内容、存档与初始化。`NativeGameSession` 及其分部文件管理开局、路线、战斗、奖励、命名空间随机数和 `NativeRunSave`；`Presentation` 层使用 Canvas/uGUI 将会话状态显示为菜单、地图、战斗和奖励页面。表现层通过会话 API 发起操作，不拥有规则状态。

```text
Bootstrap（加载内容 / 存档）
          │
          ├──► NativeGameSession（路线 / 战斗 / 奖励 / 存档 / RNG）
          │             │
          │             └──► StreamingAssets 内容 JSON
          │
          └──► NativeGameView（Canvas/uGUI、地图拖拽/标记、菜单媒体）
```

- `unity/Assets/Scripts/Core`：原生规则会话、内容数据库、路线、战斗、奖励、随机数和原生存档。
- `unity/Assets/Scripts/Presentation`：运行时 Canvas/uGUI 页面、战斗界面、可拖拽/标记地图和自绘 UI 图形。
- `unity/Assets/StreamingAssets`：内容 JSON、菜单媒体与 PNG 图标。
- `unity/Assets/Tests/EditMode`：固定 seed 的网页/Unity 路线、战斗、奖励和随机数一致性测试。

### 内容与一致性验证链路

```text
CSV 配置 ──sync-content──► 网页 JSON ──同步──► Unity StreamingAssets JSON
                                      │
真实 TypeScript GameKernel ──export-unity-parity──► 固定 seed 参考夹具
                                      │
                                      └── Unity EditMode 测试进行字段级投影比对
```

当网页规则有意调整时，运行 `node scripts/export-unity-parity.mjs` 更新 Unity 参考夹具；常规验证使用 `--check`，避免用刷新夹具掩盖两端行为差异。`scripts/sync-unity-ui-assets.mjs` 则负责网页视觉资源到 Unity 资源的同步。

See [docs/wasteland-v1.md](docs/wasteland-v1.md) for the implemented design and
[docs/content-authoring.md](docs/content-authoring.md) for extension instructions.
