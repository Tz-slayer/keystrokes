# 排障

## 完全没有键帽出现

按顺序查：

1. **工具在不在**：需要 `libinput`（或 `evtest`）。看 daemon 日志里的
   `requiredTool` / `inputToolMissing`。
2. **在不在 input 组**：不在的话读不到 `/dev/input/*`。
   `id -nG` 里要有 `input`，加入后需重新登录。
3. **插件开着吗**：`dms ipc keystrokes toggle`。
4. **过滤太严**：默认 Hotkeys 模式只显示**以修饰键开头**的序列。
   单按一个字母不显示是**正常的**，`C` 先按、`Ctrl` 后按也不算，见[过滤与热键](filtering.md)。

## 改了代码没生效

先判断运行实例到底加载的是哪一版——别猜。

Quickshell 的编译缓存文件名是**源文件绝对路径的 sha1**，后缀 `.jsc`：

```sh
python3 -c "import hashlib;print(hashlib.sha1('/home/tz/.config/DankMaterialShell/plugins/keystrokes/core/events.js').hexdigest())"
ls -la ~/.cache/quickshell/qmlcache/<上面的哈希>.jsc
```

看到那个文件的 mtime 就能证明某版本被编译过。

补充两点：

- 插件目录通常是**符号链接**指向仓库，所以"部署副本和仓库文件 md5 相同"是必然的，
  不构成证据。
- `dms ipc keystrokes trace 0` 的日志头部会打印 `buildStamp`（手写的版本标记），
  用来确认跑的是哪个 revision。

## 设置页点开是空的

页面里一个控件都没有 = QML 编译失败，DMS 吞掉了错误。

最常见的原因是**类型名撞车**：QML 文件名就是类型名，同目录隐式导入优先于模块导入。
曾经 `settings/Row.qml` 遮蔽了 QtQuick 的 `Row`，所有 `Row { spacing: ... }` 编译报错，
整页空白。现在行组件叫 `SettingRow.qml`，并有测试守着。

验证手段：用最小 `qs.*` mock 在 offscreen 下真实加载 `Settings.qml`，
看有没有 `is not a type` / `cannot assign`。qmllint 抓不到这类问题
（它解析不了 `qs.*`，会放弃未限定名分析）。

## 计数看起来不对

先对照这几条，它们各自都曾被当成 bug 修错过方向：

- 连按 4 次 Ctrl 再 Ctrl+C 应该是 `Ctrl×5+C×1`（累加，不是归零）
- 键帽消失后再按同一个键，从 1 开始（计数和显示同生命周期）
- `Ctrl` 松开后再按 `R`，R **不应该**出现（那不是热键）

详见[事件与计数](event-model.md)和[生命周期](lifecycle.md)。

## 怀疑某个键被上报了两次

同一块键盘可能暴露多个 event 节点，libinput 会把它们的输出交错在一起，
于是同一次物理按下被当成两次。用 trace 采集：

```sh
dms ipc keystrokes trace 20    # 采 20 秒，期间操作
dms ipc keystrokes trace 0     # 取回日志
```

每行格式：

```
down KEY_LEFTCTRL -> Ctrl  held=[Ctrl]  row=[Ctrlx1]
down C  (label path)  held=[Ctrl,C]  row=[Ctrlx1+Cx1]
```

- `down <原始码> -> <标签>` 是键盘路径
- `down <标签>  (label path)` 是鼠标 / 滚轮 / IPC 路径
- `drop <标签>` 是拖拽接管

原始拼写和显示标签并排记录，就是为了看它们有没有分叉——分叉会让同一个键在
`heldKeys` 里存成两种写法，表现成计数重置加重复键帽。

对照检查：

```sh
libinput debug-events --show-keycodes --device /dev/input/eventN   # 单节点
libinput debug-events --show-keycodes                              # 全部节点
```

同一个物理按键若在两个 `eventN` 上出现，就是多节点重复上报。

## 测试跑不起来

用显式 glob：

```sh
node --test tests/*.test.cjs
```

`node --test tests/`（传目录）在 Node v24 上会报
`Cannot find module '.../tests'` / `tests 1 / fail 1`——那是调用方式问题，不是测试挂了。
真失败会有 `✖` 行和堆栈。
