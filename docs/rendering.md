# 渲染与皮肤

键帽怎么画出来，以及不能碰的几条线。

## 皮肤

四款，几何与配色按上游 1:1 移植：

| id | 设置页显示 |
| --- | --- |
| `minimal` | Minimal |
| `laptop` | Laptop |
| `lowprofile` | Low Profile（**默认**） |
| `pbt` | PBT |

存量设置里可能还有 `elevated` / `mechanical`，它们是旧别名，
分别落到 `lowprofile` / `pbt`。未知 id 一律落 PBT。

## 配色与动画

- **14 套上游配色**，可在设置页直接套用（会覆盖主色/次色/文字色/边框色）
- **五种动画**：`none` / `fade` / `zoom` / `float` / `slide`，默认 `fade`
- `animationDuration` 默认 **250ms**，可设 0–2000。入场、退场、重排共用它；
  重排（键帽移位、历史行上下移动）用 **1/3** 的时长，约 83ms
- 进场和离场用**不同的缓动曲线**，同一个属性也一样（`core/motion.js`）

## 分组面板不裁剪

`ui/Group.qml` 的背景矩形和 Row 是**兄弟节点**，背景只画在后面。
**不许给它加 `clip` 或 mask**——以前加过，右上角 press-count 徽章被圆角切掉。

要"包住"内容靠**放大面板**，不靠裁剪。外溢量统一由 `core/groupFrame.js` 定义：

- 徽章直径 0.75em，外挑 d/4
- canvas 外溢（边框 + laptop 阴影）
- 圆角安全内缩 `r*(1-1/√2)`
- `margin = max(pad, 圆角安全内缩)`，背景关闭时 margin 为 0（没有圆角就没有切口）

Keycap 的计数徽章（`objectName: keyviz-press-count`）必须复用同一份常量，
否则预留量和绘制位置会漂移。

动画位移（slide / float 会平移 ±1em）**故意不预留**：瞬时且淡出，上游也不留，
而且既然没有裁剪，也不会被切，只是短暂画到面板外面一点。

## 计数徽章什么时候出现

`ui/Keycap.qml` 里三重条件：非 minimal 皮肤 + `count > 1` + 设置里开了 press count。

所以 `Ctrl×5+C×1` 里，只有 Ctrl 有角标（C 只按了一次）。

## 布局

- 9 个位置可选（上/中/下 × 左/中/右），默认 `bottom_center`
- `marginX` / `marginY` 控制边距，各 0–200，默认 100
- 显示器选择：跟随焦点（`@focused`）、锁定某个输出（`@primary` 或具体名字）
  判定统一走 `core/overlayLayout.js` 的 `followsFocus()`，
  它接受 `undefined` / `""` / `"@focused"`（空串是历史遗留的自动哨兵）

## 分层约束

`core/` 和 `ui/` **零 DMS 依赖**：不能出现 `qs.*`、`Theme`、`I18n`、`PluginService`。
这样它们可以无头测试，将来也可能剥离成独立应用。

`dms/widgets/*` 是 DMS 控件的 vendored 副本，**保持接近上游**，不要为了复用去改。
插件自己写的行外壳在 `settings/SettingRow.qml` 里另有一份。

⚠️ **QML 文件名就是类型名**，同目录隐式导入优先于模块导入。
所以不能出现 `Row.qml` 这种与 QtQuick 撞名的文件——行组件因此改叫 `SettingRow.qml`。
`tests/module-imports.test.cjs` 守这条。
