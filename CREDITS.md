# 第三方素材与许可

本文件记录项目中使用的外部素材及其许可条款。

## 启动器图标

`src/launcher-icon.svg` 中的防毒面具剪影来自 game-icons.net：

- 图标名称：`gas-mask`
- 作者：Skoll
- 来源：https://game-icons.net/1x1/skoll/gas-mask.html
- 原始文件：https://raw.githubusercontent.com/game-icons/icons/master/skoll/gas-mask.svg
- 许可：Creative Commons Attribution 3.0 Unported (CC BY 3.0)
- 许可全文：https://creativecommons.org/licenses/by/3.0/

> Icons made by Skoll (https://game-icons.net) from game-icons.net, licensed under CC BY 3.0.

本项目对原始素材做了以下修改：将白色剪影重新着色为 `#ebe6d9`，并合成到深色圆角底板（`#161a1b` 底板 + `#2f3436` 描边）上，以匹配游戏界面配色。

## 生成流程

图标由源码到最终产物经过两步，修改后需按顺序重新执行：

```bash
node scripts/render-launcher-icon.mjs                                  # SVG -> src/launcher-icon.png
powershell -ExecutionPolicy Bypass -File scripts/make-launcher-icon.ps1 # PNG -> launcher/launcher.ico
```

`launcher/launcher.ico` 会被 `launcher/GameLauncher.csproj` 作为 `ApplicationIcon` 使用，并随 `npm run package:windows` 复制到发布目录。

## 其他素材

游戏内的卡牌、状态、地图等图标位于 `src/content/wasteland/assets/`，均为本项目自行绘制的抽象占位图形，不包含第三方素材。
