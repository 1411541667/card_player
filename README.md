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
```

## Windows 桌面发行

仓库现在同时提供网页版本和 Unity 原生 Windows 版本。原生工程位于 `unity/`，使用 Unity 2022.3.62f3c1 LTS、Windows x64 IL2CPP，不依赖 HTML、WebView2 或 Node.js。工程源码、内容数据和编辑器构建脚本已纳入版本控制；Unity 生成的 `Library/`、`Temp/`、`Build/` 等缓存目录按 `.gitignore` 排除。

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

## Architecture

- `src/game`: deterministic simulation, commands, events, content validation, RNG, node/effect registries, and saves.
- `src/phaser`: disposable rendering objects and the simulation-to-scene bridge.
- `src/ui`: Preact DOM overlays, input feedback, responsive layout, and debug tooling.
- `src/content/wasteland/data`: generated/validated JSON definitions loaded by the game.
- `src/content/wasteland/tables`: human-editable CSV sources for cards, characters, enemies, bosses, events, rewards, and collectibles.
- `scripts/sync-content.mjs`: synchronizes editable CSV values into runtime JSON and detects drift.

The UI sends `GameCommand` objects to `GameKernel`. The kernel validates and applies each command
atomically, emits `DomainEvent` records, and publishes a cloned `GameSnapshot`. Rendering code never
owns or mutates simulation state.

See [docs/wasteland-v1.md](docs/wasteland-v1.md) for the implemented design and
[docs/content-authoring.md](docs/content-authoring.md) for extension instructions.
