# keyviz 非鼠标功能复刻与验证

本篇里的 **keyviz** 一律指上游项目 [mulaRahul/keyviz](https://github.com/mulaRahul/keyviz)；
本插件自称 **keystrokes**，需要区分时写全名。

基线：本地 `keyviz` 提交 `ee7fda1`，以 `key_style.ts`、`key_event.ts`、
`settings/{general,appearance,keycap}.tsx`、`keycaps/*.tsx` 和 `key-overlay.tsx` 为准。

## 设置覆盖

| keyviz 设置组 | 插件实现 | 验证 |
|---|---|---|
| appearance | 显示器、横/竖方向、九宫格位置、X/Y 边距及联动、五种动画、时长、四种皮肤 | 配置序列化测试、QML 编译、真实预览 |
| layout | 图标、符号、次数角标、修饰键图标对齐 | QML 布局矩阵 |
| color | 面色、底色、渐变 | 各皮肤真实绘制；OKLab 颜色测试 |
| modifier | 独立高亮开关与面/底/字/边框四种颜色 | 修饰键与普通键分色、透明度测试 |
| text | 字号、颜色、三种文字变体、大小写、九宫格对齐 | 四皮肤 × 三变体 × 九位置 × 六类按键的尺寸检查 |
| border | 开关、小数宽度、颜色、圆角 | QML 绘制、样式 JSON 往返 |
| background | 分组背景开关及 CSS alpha-last 颜色 | 内边距测试、软件/硬件绘制测试 |
| general | 全部/修饰键/自定义过滤、历史开关、数量、全局切换快捷键 | 事件测试、输入进程集成 |
| linger | 松开后按键独立过期；按住期间保留 | 状态机测试 |
| presets / import-export | 14 种配色、随机化、原版样式 JSON、Minimal/icon 选项联动 | 配色分支、严格导入验证、往返测试 |

所有设置均已连接到运行时；旧键帽皮肤名及 margin/history/normal-key 设置保留迁移。
设置界面使用 DMS 控件，定制过滤用文本列表，快捷键支持输入或录制；不是原版 React 设置窗口的视觉复制。
Mouse 相关设置与指针定位不属于本次复刻范围（指针定位的排查结论见文末）。导入的 mouse 段仅保存用于原样导出。

## 结构

目录按依赖划分：`core/` 与 `ui/` 不依赖 DMS，只有根目录的三个入口可以引用 `qs.*`、`Theme`、`I18n` 等 shell 侧 API。

- `core/keyvizStyle.js`：默认值、校验、迁移、原版 JSON 转换、配色。
- `core/keyvizEvents.js`：不可变按键状态、过滤、分组、计数和过期。
- `core/keyvizMotion.js`：缓动曲线与动画变体（fade/zoom/float/slide）的唯一描述。
- `core/listModelSync.js`：历史行与键帽共用的 ListModel 对账（原地更新 + dying + 延时移除）。
- `core/inputParse.js`：libinput/evtest 行解析（按键、按键位、滚轮方向、指针增量）。
- `core/overlayLayout.js`：分组绝对定位与显示器解析。
- `KeyvizDaemon.qml`（DMS 入口）：输入进程、设备扫描、物理键身份、全局快捷键、插件持久化；把焦点输出名注入 overlay。
- `ui/KeyvizOverlay.qml`：透明点击穿透窗口、显示器与分组排列。
- `ui/KeyvizGroup.qml`：按身份保留键帽、独立进出动画、分组背景及圆角裁剪。
- `ui/Keycap.qml` / `ui/KeycapSurface.qml`：字体、几何、按压反馈、边框与渐变阴影。

## 验证

```sh
node --test tests/*.test.cjs
/usr/lib/qt6/bin/qmllint KeyvizDaemon.qml KeyvizSettings.qml ui/*.qml settings/*.qml core/*.js
QT_QPA_PLATFORM=offscreen /usr/lib/qt6/bin/qmltestrunner -input tests/keycap-preview.qml
QT_QPA_PLATFORM=wayland QSG_RHI_BACKEND=opengl /usr/lib/qt6/bin/qmltestrunner -input tests/keycap-preview.qml
```

`tests/layering.test.cjs` 保证 `core/` 与 `ui/` 不引入 DMS；`tests/keycap-regression.test.cjs`
在临时目录里镜像 `ui/`+`core/`+`fonts/`，用真实 Qt Quick 渲染并断言几何。

Node 套件还启动真实 Qt Quick 组件进行布局和绘制测试，不只是文本断言。
`core/` 各模块语句覆盖率 95–100%（`keyMapper.js` 89%、`keycapColors.js` 74% 为剩余缺口）；
QML 使用运行时断言与截图检查。预览生成 `/tmp/keyviz-parity-preview.png`。
设置页在独立 Quickshell 环境中编译、实例化并导出 JSON。

## 明确的边界

- Qt 与 WebView 的字体抗锯齿、阴影卷积及超色域映射仍可能产生像素差异。
  此处没有声称逐像素相等，也没有把生成预览冒充为原版截图差分。
- 软件渲染不支持 Qt 的 shader 遮罩：回退为矩形内容裁剪，背景本身仍是圆角。
  正常硬件渲染使用圆角遮罩。两条路径均验证键帽实际可见。
- 修正了上游释放第一个键时未刷新时间的索引判断错误，避免长按松开后立即消失。
- 输入来自 Linux evdev/libinput 的物理按键；IME 组合文本及其他系统的布局翻译不是此插件的输入模型。
- 独立 QtQuick 文件可能被 DMS 缓存。更新渲染组件后需完整重启 DMS，不能仅凭 daemon reload 成功认定新画面已加载。
- 空显示器值跟随**焦点 workspace 所在的屏幕**，不是跟随 workspace：取值来自 `NiriService.currentOutput`
  （输出名），所以同一块屏内上下切 workspace 不会移动 overlay，只有焦点落到另一块屏时才跟过去。
  该值需稳定 250ms 才提交，避免切换过程中的瞬时输出翻转被追着跑（每移动一次层壳表面都会重建 overlay，
  看起来就是跳跃）。另有 `@primary` 钉死在第一块屏、完全不移动——这也是原版的行为，因为 keyviz 会把空的
  `monitor` 钉到 `monitors[0]`（appearance.tsx:28-29）。指定输出名则固定到该输出。
  分组位置使用屏幕内绝对目标坐标，避免底部/右侧历史项删除时父容器缩放与子项位移动画重复补偿。

## 指针定位：为什么没有光标涟漪

上游有三个特性锚定**指针绝对位置**——点击涟漪、常驻高亮、跟随光标的按钮指示器。
本插件均未实现，原因记录如下（负面结论，代码里无处安放，故存于此）。

Wayland 客户端无法自行读取该位置，读原始设备节点也不行：`/dev/input/event*` 只携带**相对**增量
（`REL_X` / `REL_Y`）加按键与滚轮状态。光标位置属于合成器，不属于内核。

本机用 `uinput` 虚拟指针实测，向 `REL_X` 写入 20 次相同的 `10`：

| | 原始 evdev | libinput `POINTER_MOTION` |
|---|---|---|
| 慢速（间隔 50 ms） | 每次都是 `10` | 3.50、9.00，之后 10.00 → 合计 **92.5 px** |
| 快速（间隔 1 ms） | 每次都是 `10` | 9.20、17.54，之后 20.00 → 合计 **186.7 px** |

即原始增量不是像素：同样 200 设备单位，仅因速度不同就变成 92.5 px 或 186.7 px。
libinput 的位移值已含加速度，积分它比积分原始 evdev 贴近光标得多，但仍需要一个起始种子、
每输出的缩放系数、屏幕边缘钳制，以及能挺过合成器 warp 的手段——这些客户端都拿不到。
逐项排查过目标环境：

- **niri**（26.04）——`niri msg` 提供 `outputs`、`workspaces`、`windows`、`layers`、
  `focused-output`、`focused-window`、`pick-window`、`pick-color`、`event-stream` 等，
  但**没有光标位置查询**，也没有任何光标相关的 `action`。
- **Quickshell** 不提供全局光标 API（`Quickshell/Wayland` 只通过 screencopy 接触光标，
  那是截图像素，不是坐标）。
- 点击穿透的 layer-shell 表面收不到指针移动；而不穿透的那个会吞掉下层所有应用的点击。
- 本机跑着 **Xwayland**（`-rootless`），`xdotool getmouselocation` 确实返回可与
  `xdotool mousemove` 往返的绝对坐标。但**尚未确认**它跟踪的是否为合成器光标，
  还是仅在指针位于 X 客户端之上时才更新，因此没有任何逻辑依赖它。

上游在**事件层面**所做的一切（按键键帽、`Drag`、`ScrollUp`/`ScrollDown`）都无需上述能力，
仅凭 `/dev/input` 即可实现。要让涟漪真正锚定光标，需要合成器配合（IPC 查询或
`wl_pointer` 式的全局），而 niri 目前不提供。

