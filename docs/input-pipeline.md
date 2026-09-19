# 输入管道

按键和鼠标事件怎么进来，怎么变成状态机能懂的标签。

## 采集

`Daemon.qml` 起一个进程读事件流：

```sh
libinput debug-events --show-keycodes              # 默认，跟所有设备
libinput debug-events --show-keycodes --device X   # 跟单个设备
evtest X                                           # 没有 libinput 时的退路
```

需要 `libinput`（或 `evtest`）在 PATH 里，且用户属于 `input` 组。
`requiredTool` / `inputToolMissing` 是派生绑定，切设备模式会立刻重算。

单行输出经 `SplitParser` 按换行切开，交给 `core/inputParse.js` 解析成：

| kind | 含义 |
| --- | --- |
| `key` | 键盘按键，`{name, pressed}` |
| `button` | 鼠标按键 |
| `scroll` | 滚轮方向 |
| `motion` | 指针移动增量（喂拖拽判定） |
| `axis` | 只有 evtest 回退路径才有 |

libinput ≥ 1.19 的行长这样（`KEYBOARD_KEY` 这个标记不能少）：

```
 event3   KEYBOARD_KEY            +2.285s	KEY_LEFTCTRL (29) pressed
```

内核 autorepeat（`value 2`）在解析层就返回 null，重复 press 由状态机的
`heldKeys` 守卫吸收。

## 标签映射

```js
displayKeyLabel("KEY_LEFTCTRL")  // "Ctrl"（手写，左右都映射成它）
displayKeyLabel("KEY_C")         // "C"（走 KeyMapper.getDisplayKey）
```

修饰键（`Ctrl/Shift/Alt/Super`）在 `Daemon.qml` 里手写，因为 `KeyMapper` 只认原始
evdev 拼写，会把 `KEY_LEFTCTRL` 变成 `LEFTCTRL`。状态机需要的是 `Ctrl`。

⚠️ `displayKeyLabel` 对已经是标签的输入是**幂等**的（`dk("Ctrl") === "Ctrl"`），
所以可以安全地重复调用。

## 物理键只用于快捷键

`physicalKeys` 存原始 evdev 码，**只**用来识别开关插件的快捷键
（`toggleShortcut`，默认 `Shift,F10`）。

它**不用来挡按键**——那曾经是 bug：这个数组只由匹配的 release 行清理，
一条 release 丢失，该键就永久卡在里面，之后每次按下都被静默吞掉，
表现成"按了两个键只出来一个"。

重复按下现在由状态机自己挡：`press()` 开头比较显示标签，已按住就直接返回原状态。
这条守卫同时覆盖鼠标和滚轮路径，而且能自愈（不依赖 release 一定到达）。

## 鼠标

- **按键**：按下即当作一个键进状态机，所以 `Ctrl+点击` 里修饰键和按钮在同一行，
  按钮键帽会显示按下动画
- **拖拽**：按住移动超过 `dragThreshold`（默认 **50px**）后，按钮键帽被 `Drag` 替换
  （keyviz 是把它从 `pressedKeys` 和最后一组里移除，再按下 `Drag`）
- **滚轮**：没有按下/松开，方向由 libinput 的 Wayland 轴约定决定（正值是"下"）。
  停 300ms 视为松开

鼠标事件要不要显示由 `showMouseEvents` 单独控制，但**同样要过过滤闸门**，
所以裸点击在 Hotkeys 模式下不显示。

## 设备列表

设备发现在 daemon 里（它拥有设备设置和输入进程），设置页只负责给"自动"这一项翻译文案。
daemon 未注册时设置页会降级为只有"All Keyboards (Auto)"一项，而不是打不开——
取实例的地方是防御式读取，见[排障](troubleshooting.md)。
