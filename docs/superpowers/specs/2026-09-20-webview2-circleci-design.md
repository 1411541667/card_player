# 非 Unity 桌面载体与 CircleCI 设计

## 目标

将 TypeScript、Vite、Phaser 和 Preact 网页游戏确立为唯一产品实现，彻底移除 Unity 工程及其专用工具链。Windows 桌面版使用现有的 .NET 8 WinForms WebView2 外壳加载同一份 Web 构建产物，并通过 Inno Setup 生成安装包。CircleCI 负责持续验证 Web 核心，并在版本标签上生成 Windows 安装包。

## 范围

### 删除

- 整个 `unity/` 目录，包括受 Git 管理的源码、资源、项目配置、测试，以及本机生成的 `Library`、`Temp`、`Logs`、`obj` 和 `UserSettings`。
- `docs/unity-migration-plan.md` 与 `docs/unity-testing.md`。
- `scripts/export-unity-parity.mjs`、`scripts/package-unity-windows.ps1`、`scripts/sync-unity-ui-assets.mjs` 与 `scripts/test-unity.ps1`。
- `installer/roguelike-unity.iss`。
- `package.json`、`README.md` 和 `.gitignore` 中仅服务于 Unity 的命令、说明和规则。
- 仅与 Unity 构建或测试有关的本地生成结果。

### 保留

- `src/game` 中的游戏规则和 `src/content/wasteland` 中的内容源、运行时数据与通用素材。
- Vite、Phaser、Preact、Vitest 和 Playwright Web 技术栈。
- `launcher/` 中的 .NET 8 WebView2 桌面外壳及 `installer/roguelike.iss`。
- `scripts/package-windows.ps1` 代表的非 Unity Windows 发布路径。

## 软件载体

### Web 版本

Vite 构建 `dist/`，浏览器直接运行。现有游戏逻辑、内容加载和存档行为保持不变。

### Windows 桌面版本

`.NET 8 WinForms + WebView2` 外壳从安装目录加载 `dist/index.html`。外壳负责窗口、WebView2 数据目录、导航限制和错误提示，不复制游戏规则。安装包采用 self-contained `win-x64` 发布，因此用户不需要预装 .NET；系统仍需要 Microsoft Edge WebView2 Runtime。

桌面外壳必须限制外部导航和新窗口，禁用开发者工具、默认上下文菜单及状态栏。启动时若缺少游戏文件或 WebView2 Runtime，应显示中文错误并安全退出。

## 构建与数据流

1. `npm ci` 按锁文件安装依赖。
2. 内容一致性检查确认 CSV 与运行时 JSON 同步。
3. ESLint、Vitest 和 TypeScript/Vite 构建验证 Web 实现。
4. Web 构建生成 `dist/`。
5. Windows 发布作业执行 `dotnet publish`，将 `dist/` 放入桌面程序发布目录。
6. Inno Setup 将桌面程序封装为版本化安装包。

游戏规则和内容只在 Web 源码中维护，桌面版消费相同的 `dist/`，从结构上消除双端规则漂移。

## CircleCI

仓库当前没有 `.circleci/config.yml`，因此没有可复用的 CircleCI 基线数据。首版配置使用两个职责明确的作业。

### `web-verify`

- 使用 Node 22 Linux 容器。
- 以 `package-lock.json` 校验和为键缓存 npm 下载目录，不缓存 `node_modules`。
- 执行内容检查、lint、单元测试和生产构建，避免在多个作业中重复安装与构建。
- 保存 `dist/` 作为可下载构建产物；测试报告具备兼容格式后再接入 `store_test_results`，不伪造空报告。
- 对普通分支、Pull Request、`main` 和版本标签运行。

### `windows-package`

- 使用 CircleCI Windows executor。
- 仅在匹配 `v*` 的标签上运行，并依赖通过标签过滤的 `web-verify`。
- 安装 Node、.NET 8 和 Inno Setup 所需工具，执行正式 Windows 打包命令。
- 保存最终安装包和必要日志为 CircleCI artifacts。
- 不包含任何 Unity、Unity Hub 或 Unity license 步骤。

现有 `.github/workflows/windows-release.yml` 将被删除，避免标签推送时 CircleCI 与 GitHub Actions 重复生成发布包。CircleCI 首版只生成可下载 artifact，不自动创建 GitHub Release，也不引入发布凭据。

## 可靠性与安全边界

- npm 缓存只用于加速，缺失时不得影响构建正确性。
- 发布作业使用标签过滤，普通分支不能触发安装包发布。
- CircleCI 不保存整个项目目录或 `node_modules` 工作区。
- 不在配置中写入密钥；未来若上传 GitHub Release，应使用受限 CircleCI context。
- 桌面外壳只加载打包内容并拦截非本地导航。

## 验证与验收

本地验收：

- 仓库中除历史 Git 记录外不再存在 Unity 文件或有效 Unity 引用。
- `npm run content:check`、`npm test`、`npm run lint` 和 `npm run build` 全部通过。
- `dotnet publish launcher/GameLauncher.csproj -c Release -r win-x64 --self-contained true` 通过。
- Windows 打包脚本能产生包含桌面程序和 `dist/` 的 staging 目录；若安装了 Inno Setup，还应产生安装包。
- 启动桌面程序后能显示游戏首页，且不存在 Unity 运行时依赖。
- CircleCI YAML 通过本地可用的配置解析或 CircleCI CLI 校验；若本机无 CLI，则明确记录未执行远端验证。

上线后基线：记录 `web-verify` 和 `windows-package` 的运行时间、缓存命中率、失败率与重试次数。连续三次成功运行后再判断是否需要拆分或并行化。目标是 Web 验证稳定通过，npm 缓存可复用，普通提交不消耗 Windows executor。

## 回滚

本次改动保持为独立提交。若 CircleCI 或桌面载体出现问题，可回退该提交恢复 Unity 文件和旧发布流程。CircleCI 配置采用两个小作业，不使用动态配置，便于单独禁用 Windows 发布作业或恢复 GitHub Actions。
