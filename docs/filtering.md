# 过滤与热键

什么该显示，什么该丢掉。判据在 `core/events.js` 的 `isAllowedSequence()`。

## 三种模式

| 设置页显示 | 存的值 | 行为 |
| --- | --- | --- |
| Off — All Keys | `none` | 全部显示 |
| **Hotkeys** | `modifiers` | 序列里含**任一修饰键**就显示，用内置集合 `Ctrl, Shift, Alt, Super, Fn, Function` |
| **Custom** | `custom` | 只用你自己填的 Allowed Keys 列表 |

**容易踩的一点**：Hotkeys 模式**不看** Allowed Keys 列表，它用的是内置修饰键集合。
设置页里那个输入框只在选中 Custom 时才可编辑（`enabled: filterSetting.value === "custom"`），
所以选着 Hotkeys 填列表是存不进去的。

匹配规则是「序列里**任一**键命中」，不是全部命中。列表写 `Ctrl`，那 `Ctrl+A` 整体都会显示
（包括 A）——这样组合键才完整可见。

逗号这个键要写成 `Comma`，不能用 `,`。

## 判定只看「还按住」的键

```js
const previousLabels = row.keys.filter(key => heldKeys.includes(keyId(key.label)))...
return [...heldKeys, ...previousLabels].some(label => set.includes(label));
```

`previousLabels` 取的是上一行的成员中**仍然按住**的那些。松开的键会逗留在行里
（这样 `Ctrl+C+V` 读成一行），但**不能替下一个键背书**。

这条不是可有可无的洁癖。`Ctrl` 按下 → 松开 → 按 `R`：

- 若把已松开的 Ctrl 也算进去，R 就借到了修饰键身份，屏幕上一个孤零零的 `R`
- 上游不会这样：`ignoreEvent(pressedKeys)` 里的 `pressedKeys` 只含物理按住的键

## 与上游的差异（有意）

上游：

```ts
ignoreEvent(pressedKeys) {
    if (state.filter === "modifiers") return !MODIFIERS.has(pressedKeys[0]);
    ...
}
```

只看 `pressedKeys[0]`——**第一个**按住的键。两键同时按下时谁先被内核上报是竞态，
于是同一个手势一会儿显示、一会儿消失，用户感知成"识别间隔太严格"。
上游还有意让 `A` 先按、`Ctrl` 后按不算热键。

这里改成"序列里任一键是修饰键就显示"：

- `Ctrl+C` 和 `C+Ctrl` 都显示，各自计数
- 代价：`A` 先按、`Ctrl` 后按也算热键了（放弃了上游这条语义）

这是为了让录屏时组合键稳定出画面。`A+B` 这种完全没有修饰键的仍然不显示，
要显示得用 Off — All Keys。

## 鼠标和滚轮同样过闸

keyviz 把点击、拖拽、滚轮都直接送进 `onKeyPress`，由同一道闸决定。
所以裸点击、滚轮默认是不显示的（Hotkeys 模式下它们不含修饰键），
而 `Ctrl+点击`、`Ctrl+滚轮` 会显示。

单独开关鼠标事件的是 `showMouseEvents`（旧的 `showMouseClicks` 仍然认）。

## 被丢掉的键去哪了

门禁拒绝时，这个键**仍会进 `heldKeys`**，只是不建行。这样修饰键随后到达时，
组是从 `heldKeys` 播种的整组，先到的那个键不会永久卡在 `heldKeys` 里却永远不上屏。
