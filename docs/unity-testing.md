# Unity 迁移验收方法

## 一键自动验证

先关闭本工程的 Unity 编辑器。在仓库根目录打开 PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-unity.ps1
```

脚本先运行真实网页规则以检查参考数据是否过期、两端内容是否一致，再启动 Unity EditMode 测试。成功时输出测试通过数量，以及 `test-results/unity-check-时间戳.xml` 和 `.log` 的完整路径。任一检查失败都会返回非零退出状态。Unity 安装路径不同可传入 `-UnityPath '你的路径\Editor\Unity.exe'`。本工程使用 Unity 2022.3.62f3c1。

如正在编辑器里开发，可使用 `Window > General > Test Runner`，选择 EditMode → Run All，避免另开批量实例造成项目锁冲突。自动测试不读取或覆盖个人游戏存档。

## 手动试玩检查

1. Unity Hub → Add，选择 `D:\lz\lz\project\rougulike\unity`；打开 `Assets/Scenes/Bootstrap.unity`，点击 Play。
2. 开始新游戏，选择拾荒者或猎人。应出现三个祝福候选。删牌祝福应删除三张指定实例；金币祝福离开商店后应进入主题选择。
3. 选择尘沙。地图应显示多行节点，只有可达节点可点击；进入一个节点后，后续选择受它的连接限制。
4. 进入战斗，选择存活敌人为目标后出牌。检查费用、护盾、回血、敌人意图和回合切换；消耗牌不应在后续洗牌中回来。
5. 按 Esc 返回菜单，再继续游戏；停止 Play 后重新运行并继续，检查路线、手牌、敌人状态和回合是否保持。试玩会写入游戏存档，存档目录可在主菜单查看。
6. 普通奖励回到本层地图；非最终层首领奖励推进楼层。第四层击败最终首领直接进入结算。

根目录 `GameLauncher.exe` 和 `release` 中的旧安装包不代表刚修改的 Unity 源码；本轮验收请从 Unity 编辑器运行。正式安装包仍需要单独构建验证。

## 网页参考数据

只检查参考数据及内容同步：

```powershell
.\node.exe scripts\export-unity-parity.mjs --check
```

网页规则有意变化时运行 `node scripts/export-unity-parity.mjs` 更新参考文件，再运行 Unity 测试。不要仅通过刷新参考数据来掩盖 Unity 与网页规则的差异。

完整迁移边界见 [迁移计划](unity-migration-plan.md)。UI 美术、事件、商店等未迁移模块不能仅凭已有测试通过就判定与网页完全一致。
