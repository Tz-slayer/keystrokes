# 架构

这一页只讲**东西放在哪、谁依赖谁、改动该落在哪一层**。行为规则在各自的分册里，
不在这里重复。

## 运行时拓扑

```
DankMaterialShell
├── Daemon.qml    常驻。拉输入子进程 → 状态机 → IPC。配置的解析结果也在这里
├── Widget.qml    控制中心小组件：开关、设备、几个常用设置（写设置，不碰状态机）
└── Settings.qml  设置页入口 → settings/ParitySettings.qml 是各分组行
```

三者互不相识地拿到对方：`PluginService.pluginInstances["keystrokes"]`。
Widget 与 Settings **只读写设置、调用 daemon 暴露的函数**；状态机是 daemon 的私有物。
设置页读不到 daemon 时必须降级（少一个设备列表），而不是整页打不开。

## 依赖方向

```
        Settings.qml / Widget.qml          Daemon.qml
                 │                              │
                 └──────────┬───────────────────┘
                            ▼                   │
                      core/*.js  ◄──────────────┤   （纯逻辑，零 import）
                            ▲                   │
                      ui/*.qml ◄────────────────┘
```

| 规则 | 守卫 |
| --- | --- |
| `core/`、`ui/` 不出现 `qs.*` / `Theme` / `I18n` / `PluginService` / `Dank*` / `Styled*` | `tests/layering.test.cjs` |
| `ui/` 不 reach 进 `Settings.qml` / `Widget.qml` / `settings/*` | 同上 |
| `core/` 不 import 任何东西（连 `ui/` 也不）——它只有函数，没有状态 | 无（靠 import 表为空） |
| DMS 只出现在根目录三个入口 + `dms/widgets/`（vendored）+ `settings/*` | 同上 |

⚠️ `ui/` **允许**用 Quickshell 本身（`Overlay.qml` 要拿 `Quickshell.screens` 并开
`PanelWindow`）——禁的是 DMS 那一层。所以无头测试能跑 `ui/`，但需要 Qt 环境。

## 一跳一跳的数据形状

| 跳 | 进 | 出 | 在哪 |
| --- | --- | --- | --- |
| 输入 | 内核事件 | 一行文本 | `Daemon.qml` 的 `Process`（libinput，退回 evtest） |
| 解析 | 一行文本 | `{kind, name, pressed}` | `core/inputParse.js` |
| 标签 | evdev 码 | `Ctrl` | `Daemon.displayKeyLabel`（表在 `core/keyMapper.js`） |
| 状态 | `(state, label, now, config)` | **新** `state` | `core/events.js` |
| 投影 | `state` | `historyList` | `Daemon.applyKeyboard` |
| 渲染 | `historyList` | `ListModel` 行 → 键帽 | `ui/Overlay.qml` |

状态机是**纯函数式的**：每次 `press` / `release` / `tick` 返回新对象；
**没有变化时返回原对象**，调用方靠同一性判断跳过重绑（`tick` 每 50ms 跑，这是它便宜的原因）。
所以 `applyKeyboard` 里的赋值顺序无所谓，快照不会在中途被改。

## 状态与两级投影

`core/events.js` 的 state：

| 字段 | 含义 |
| --- | --- |
| `heldKeys` | **物理**按住（被门禁拒掉的也在里面） |
| `shownKeys` | 门禁**放行**的子集——唯一驱动键帽按压动效的集合 |
| `groups[]` | 屏幕上的行：`{uid, keys[{label, count, lastPressedAt, animateIn}]}` |
| `nextUid` | 行身份发号器 |
| `pending` / `pendingRepeat` | 两个"等下一个键裁决"的悬置问题 |

daemon 侧再投一次影，给 QML 一个扁平结构：

```
keyboardState ──applyKeyboard──> historyList ──reconcile(按 uid)──> ListModel
   （原样）        （补 label/text）                                  （渲染）
```

`cap()` 同时保留 `keyId`（状态机自己的键）与 `label`（画出来的字）。
**别把 `keyId` 再走一遍 `KeyMapper`** —— 已映射的 `Ctrl` 会变成 `LEFTCTRL`。

## 边界靠注入，不靠查询

- overlay **不查 compositor**：只收 `focusedOutputName` / `fallbackScreen`，
  查询在 daemon（`BarWidgetService`）。
- overlay **不读 DMS 服务**：`daemon` 为 `null` 时退回 `KeyStyle.settings({})` 与默认
  `styleParams`。能这么写才有无头测试。
- `systemMuted` 故意是 `var` 不是 `bool`：没有宿主时必须是 `undefined`（保留上游静态图标），
  被强转成 `false` 就等于宣称"没静音"。
- **判定只写一份**：`core/overlayLayout.followsFocus()` 同时被 overlay 和设置页调用。
  这里曾各写一份，于是下拉显示"跟随"、overlay 按别的规则摆。

## 配置流

```
pluginData（DMS 持久化）
   │ core/keyStyle.settings()：迁移旧键 → 逐键 validate（非法值落回默认）
   ▼
config ──┬─> eventConfig    （+ allowedKeys 数组 + displayLabel 注入）
         ├─> styleParams    （皮肤几何，daemon 算好交给 overlay）
         └─> overlay 的只读绑定
```

两条硬规矩：

1. **一个行为只有一个设置键。** `showNormalKeys` 与 `eventFilter` 曾是两个入口指同一行为，
   结果 Widget 开关开着 = 实际全显示，而设置页仍显示默认的 Hotkeys。现在开关也写 `eventFilter`，
   daemon 启动时把解析结果落盘一次，**页面永远显示生效值**。
2. **daemon 的每个默认值必须等于 `Settings.qml` 的 `defaultValue`**，
   否则没动过的设置会"显示一个样、跑起来另一个样"。守卫 `tests/defaults-consistency.test.cjs`。

## 进程与定时器

| 谁 | 节奏 | 干什么 |
| --- | --- | --- |
| 输入 `Process` | 常驻 | 输入源；`running` 由设备选择与 `inputBroken` 决定 |
| `tick` Timer（50ms） | **只在有行时跑** | 键过期、行消失（`Events.tick`） |
| 渲染层 Timer | 按需 | `dying` → 真删；退场动画走完才销毁 |
| screen commit Timer | 250ms | 输出还没就绪时重试把 surface 放上去 |
| trace Timer | 按需 | `dms ipc keystrokes trace N` |

空转不轮询是刻意的：`running: groups.length > 0`。

## IPC 面

`dms ipc keystrokes …`：`toggle` / `enable` / `disable` / `setStyle <id>` / `test` /
`exportStyle` / `importStyle <json>` / `trace <seconds>`。

⚠️ `IpcHandler` 的函数**参数必须标类型**。不标会被推断成 `QVariant`，IPC 直接拒绝注册，
命令静默不存在（只在加载时一条 warning，qmllint 查不出来）。

## 测试架构

三层，`node --test tests/*.test.cjs` 一把跑完（**必须显式 glob**）。

| 层 | 文件 | 守什么 |
| --- | --- | --- |
| 纯逻辑（vm 加载 `core/`） | `event-parity` `input-parse` `overlay-layout` `motion` `group-frame` `list-model-sync` `icons-parity` | 状态机与几何 |
| 结构守卫 | `layering` `module-imports` `settings-style` `defaults-consistency` `docs-links` | 分层、命名、默认值一致、链接 |
| 真实 Qt（`qmltestrunner` + offscreen） | `keycap-regression` `keycap-function-row` `count-badge` | 渲染与零 QWARN |

vm 加载的两个坑：`events.js` 要**单独**加载（`isModifier` 在两个文件里同名，同 context 加载会互相覆盖）；
vm 里 `.map()` 返回的是**另一个 realm 的数组**，与宿主比较前先用 `plain()` 归一。
`loadCore` 的 vm **不代表 QML** —— 判断"QML 能否看见某个导出"必须实测。

## 改动落在哪一层

| 想改 | 动这里 | 顺手要做的 |
| --- | --- | --- |
| 事件规则、计数、行 | `core/events.js` | 同步 `Daemon.qml` 的 `buildStamp`（日志自证） |
| 键码 → 标签 | `core/keyMapper.js` 的 `KEY_MAP` | —— |
| 键帽的图标/短标签 | `core/KeyIcons.js` 的 `DISPLAY` / `ICONS` | 图标名必须能在 `ICONS` 解析，否则画出空白键帽 |
| 键帽外观 | `ui/Keycap.qml`、`ui/KeycapSurface.qml` | 外溢量统一进 `core/groupFrame.js` |
| 摆放、多屏 | `core/overlayLayout.js` | overlay 与设置页共用，别各写一份 |
| 新增设置项 | `core/keyStyle.js` 的 `DEFAULTS`/`FIELDS` | `Settings.qml` 默认值 + `ParitySettings.qml` 一行 |
| 设置页的排版 | `settings/SettingRow.qml` | 别在 `SettingsCard` 里直接放原生控件 |

新文件的命名：**QML 文件名就是类型名**，同目录隐式导入优先于模块导入，
所以不能与 QtQuick 撞名（`Row.qml` 曾让设置页整页空白）。守卫 `tests/module-imports.test.cjs`。
