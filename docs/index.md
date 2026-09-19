# Keystrokes —— 文档总览

一个 DankMaterialShell 插件：把按键和鼠标操作实时画成键帽，录屏和教学用。
从上游 [mulaRahul/keyviz](https://github.com/mulaRahul/keyviz) 移植，键帽外观与动画按 1:1 对齐。

这一页讲整体结构和阅读顺序。**具体规则都在分册里**，本页只放导航和几条全局不变量。

## 数据流

```
键盘 / 鼠标
   │  libinput debug-events --show-keycodes（无 libinput 时退回 evtest）
   ▼
core/inputParse.js       把一行文本解析成 {kind, name, pressed}
   ▼
Daemon.displayKeyLabel   原始 evdev 码 → 显示标签（KEY_LEFTCTRL → Ctrl）
   ▼
core/events.js           不可变状态机：分组、计数、过期
   ▼
ui/Overlay.qml           行 → 键帽，配动画画出
```

四个环节各自的细节：

| 环节 | 分册 |
| --- | --- |
| 输入怎么进来、怎么变成标签 | [输入管道](input-pipeline.md) |
| 按键怎么成组、计数怎么算 | [事件与计数](event-model.md) |
| 键帽在屏幕上活多久、计数何时归零 | [生命周期](lifecycle.md) |
| 什么该显示、什么该丢掉 | [过滤与热键](filtering.md) |
| 画成什么样 | [渲染与皮肤](rendering.md) |
| 出问题怎么查 | [排障](troubleshooting.md) |

## 分层

```
plugin.json              插件清单
Daemon.qml               后台：输入进程 + 状态机 + IPC
Widget.qml               控制中心小组件
Settings.qml             设置页入口（settings/ 下是各分组）
core/*.js                纯逻辑：状态机、解析、布局、颜色、动画词汇
ui/*.qml                 渲染：Overlay / Group / Keycap
dms/widgets/*.qml        DMS 控件的 vendored 副本，尽量不动
```

`core/` 和 `ui/` **不允许依赖 DMS**（不出现 `qs.*`、`Theme`、`PluginService`）。
这样它们才能无头测试，将来也可能剥离成独立应用。`tests/layering.test.cjs` 守这条线。

反过来，只有三个入口文件允许碰 DMS。compositor 查询（当前焦点在哪个输出）也属于入口层：
overlay 只接受注入进来的 `focusedOutputName`。

## 五条全局不变量

改动前先确认这几条，它们各自都踩过坑：

1. **键的身份只有一个：显示标签。** 不是调用方传进来时的拼写。
   否则 `KEY_LEFTCTRL` 和 `Ctrl` 会被当成两个键，屏幕上出现两个键帽。
2. **count = 这个键被按下的次数，永不回退。**
   连按 4 次 Ctrl 再按 Ctrl+C 是 `Ctrl×5+C×1`。把和弦里的修饰键落回 1
   看起来就是计数自己重置了。
3. **计数活多久 = 键帽活多久。** 键帽消失即手势结束，下次从 1 开始。
4. **手势只由「还按住」的键构成。** 松开的键会逗留在行里（这样 `Ctrl+C+V`
   才读成一行），但不能替下一个键背书。
5. **QML 文件名就是类型名。** 同目录隐式导入优先于模块导入，所以不能叫 `Row.qml`
   这类与 QtQuick 撞名的名字——设置页曾经因此整页空白。

## 排障入口

```sh
dms ipc keystrokes trace 20    # 采 20 秒
dms ipc keystrokes trace 0     # 取回日志
```

日志逐行记录每个事件的原始拼写、显示标签、按住的键、当行计数快照。
怀疑"这个键是不是被上报了两次"时用得上。详见[排障](troubleshooting.md)。

## 验证

```sh
node --test tests/*.test.cjs     # 状态机、解析、布局、分层守卫、文档链接
```

注意用显式 glob：直接 `node --test tests/`（传目录）在 Node v24 上会报
`Cannot find module`，是调用方式问题，不是测试挂了。
