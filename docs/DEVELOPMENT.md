# Development Guide

## 1. Requirements

开发与测试 Keystrokes 需要以下软硬件环境：

- **操作系统**：Linux（推荐基于 Wayland 的合成器如 Hyprland、Niri、Sway，亦支持 X11）。
- **运行时环境**：
  - [Quickshell](https://github.com/outfoxxed/quickshell) (v0.0.9+)
  - [DankMaterialShell](https://github.com/AvengeMedia/DankMaterialShell) (DMS v1.5.0+)
- **底座输入工具**：
  - `libinput` CLI（包名通常为 `libinput` 或 `libinput-tools`，提供 `debug-events`）
  - 可选备选：`evtest`
- **系统权限**：
  - 当前用户必须隶属于 `input` 用户组，方可读取 `/dev/input/event*` 原始输入设备：
    ```bash
    sudo usermod -aG input $USER
    # 加入后必须完全注销并重新登录
    ```
- **开发与测试工具链**：
  - Node.js (v18+ / v20+ / v24+，推荐使用内置 test runner)
  - Qt6 QML 开发套件（如需运行真实离屏渲染测试，需安装 `qt6-declarative` / `qmltestrunner`）

---

## 2. Setup

### 本地工作区初始化与软链接

将仓库克隆到本地，并软链接到 DMS 插件目录：

```bash
# 1. 克隆代码库
git clone https://github.com/Tz-slayer/keystrokes.git
cd keystrokes

# 2. 建立软链接至 DMS 插件目录
mkdir -p ~/.config/DankMaterialShell/plugins
ln -s "$(pwd)" ~/.config/DankMaterialShell/plugins/keystrokes
```

### 验证权限与工具可用性

```bash
# 验证用户组是否包含 input
id -nG | grep -w input

# 验证 libinput 是否可正常读取按键
libinput debug-events --show-keycodes
```

---

## 3. Build & Run

由于本项目基于 QML 与 JavaScript 解释型架构构建，无需显式编译（AOT）流程。

### 加载与热重载

1. 打开 DMS 控制中心（Control Center），在“插件管理”中启用 **Keystrokes**。
2. 修改代码后，可通过以下方式刷新插件：
   ```bash
   # 重启 DMS 守护进程以重新加载 QML
   dms restart
   ```

### 清除 Quickshell 字节码缓存

Quickshell 在加载 QML 时会将文件预编译为 `.jsc` 缓存文件。若发现代码修改后没有生效，通常是因为缓存未自动失效。

缓存路径为源文件绝对路径的 SHA-1 哈希：
```bash
# 计算特定文件的缓存对应哈希
python3 -c "import hashlib; print(hashlib.sha1('/home/tz/.config/DankMaterialShell/plugins/keystrokes/core/events.js').hexdigest())"

# 或者一键清空全部 quickshell 缓存
rm -rf ~/.cache/quickshell/qmlcache/*
```

---

## 4. Debug & Telemetry

### 4.1 动态事件追踪 (Trace)

当遇到“按键无响应”或“某个按键被上报两次”等疑难问题时，使用内置的 IPC trace 机制收集真实的输入流与状态快照：

```bash
# 启动 20 秒事件追踪采集（期间进行键盘与鼠标操作）
dms ipc keystrokes trace 20

# 采集完成后取回日志
dms ipc keystrokes trace 0
```

日志输出示例：
```text
# 2026-09-20T00:48:00Z
# enabled=true filter=modifiers history=false tool=libinput broken=false
# recording 20s -- press the keys now
down KEY_LEFTCTRL -> Ctrl  held=[Ctrl]  row=[Ctrlx1]
down KEY_C -> C  held=[Ctrl,C]  row=[Ctrlx1+Cx1]
up KEY_C -> C  held=[Ctrl]  row=[Ctrlx1]
up KEY_LEFTCTRL -> Ctrl  held=[]  row=[Ctrlx1]
```
- 原始按键码（`KEY_LEFTCTRL`）与映射后的标签（`Ctrl`）并排输出，便于排查键名分叉问题。

### 4.2 版本标记确认 (`buildStamp`)

在 `core/events.js` 与 `Daemon.qml` 中维护手写的版本标识字符串 `buildStamp`。通过 trace 日志头部的版本戳，可在不重启的情况下确凿证明正在运行的代码 revision。

### 4.3 样式与动效快速预览

无需敲击物理键盘，即可触发一套预置的完整入场、连击、修饰键退场动画：
```bash
dms ipc keystrokes test
```

---

## 5. Testing

Keystrokes 拥有一套三层测试体系，保障逻辑、分层与渲染的健壮性。

```bash
# 1. 运行核心逻辑与架构守卫测试 (注意：必须使用显式 glob 通配符)
node --test tests/*.test.cjs

# 2. 运行文档链接与图片有效性守卫
node tests/docs-links.cjs

# 3. 运行真实 Qt 离屏渲染测试 (需安装 qmltestrunner)
qmltestrunner -input tests/keycap-regression.test.cjs -platform offscreen
```

### 测试矩阵说明

| 测试分层 | 测试文件 | 校验内容 |
| --- | --- | --- |
| **纯逻辑层**<br>(Node.js VM 沙箱) | `event-parity.test.cjs`<br>`input-parse.test.cjs`<br>`overlay-layout.test.cjs`<br>`motion.test.cjs`<br>`group-frame.test.cjs`<br>`list-model-sync.test.cjs`<br>`icons-parity.test.cjs` | 验证事件状态机数学完备性、Keyviz 移植对齐、输入解析、调和算法与几何外扩 |
| **架构守卫层**<br>(静态分析与契约) | `layering.test.cjs`<br>`module-imports.test.cjs`<br>`settings-style.test.cjs`<br>`defaults-consistency.test.cjs`<br>`version-consistency.test.cjs`<br>`docs-links.cjs` | 守卫 `core/` 与 `ui/` 零 DMS 依赖、防止 QML 文件名遮蔽 QtQuick 类型、守卫默认值绝对一致、守卫 `plugin.json`/`package.json`/`CHANGELOG.md` 三方版本号一致、杜绝文档死链（覆盖 `README.md`、`AGENTS.md`、`CHANGELOG.md` 与 `docs/*.md`） |
| **真实渲染层**<br>(Qt6 Offscreen) | `keycap-regression.test.cjs`<br>`keycap-function-row.qml`<br>`count-badge.qml` | 启动无头真实 QtQuick 场景图，确保零 QML 警告（QWARN）与样式保真 |

> [!NOTE]
> 在 Node.js v24+ 环境中，直接执行 `node --test tests/`（传入目录）会导致模块解析报错，务必使用显式文件匹配：`node --test tests/*.test.cjs`。

---

## 6. Code Style & Layering Conventions

在编写或修改代码时，必须遵守以下约定：

1. **分层严格隔离**：
   - `core/` 目录下的所有 JS 文件必须为**纯函数**，无模块 import，无全局变量，无副作用。
   - `core/` 和 `ui/` 目录内**严禁出现 DMS 特有符号**（如 `qs.*`、`Theme`、`I18n`、`PluginService`、`Dank*`）。
2. **QML 组件命名防遮蔽**：
   - QML 中同目录下的文件名就是组件类型名，其优先级高于外部模块导入。
   - 绝不可使用 `Row.qml`、`Column.qml`、`Text.qml`、`Button.qml` 等与 QtQuick 重名的名称。
3. **IPC 方法参数类型强校验**：
   - `Daemon.qml` 内的 `IpcHandler` 中，所有对外暴露的方法参数**必须带有显式类型标注**（如 `function trace(seconds: string): string`）。
4. **几何向外膨胀**：
   - 绘制按键外框或背景时，**严禁添加 `clip: true`**。凡有外挑装饰（徽章、微投影），必须通过 `core/groupFrame.js` 计算并外扩面板。

---

## 7. Adding a New Feature Guide

### 场景 A：增加一个新的特殊按键映射
1. 打开 `core/keyMapper.js`，在 `KEY_MAP` 字典中添加对应的 Linux evdev 编码到显示标签的映射。
2. 若该键需要展示矢量图标（而非文本），在 `core/KeyIcons.js` 的 `DISPLAY` 中注册其短名，并在 `ICONS` 中填入标准 SVG 路径。
3. 运行 `node --test tests/icons-parity.test.cjs` 验证图标路径有效且能正确解析。

### 场景 B：增加一个新的用户配置项
1. 打开 `core/keyStyle.js`：
   - 在 `FIELDS` 数组中登记新增的配置键名；
   - 在 `DEFAULTS` 对象中指定默认值；
   - 在 `settings()` 函数中补充该字段的边界校验或归一化逻辑。
2. 同步更新 `Daemon.qml` 的属性声明与默认值。
3. 同步更新 `Settings.qml` 中的 `defaultValue`。
4. 在 `settings/ParitySettings.qml` 中添加对应的配置行（使用 `SettingRow.qml` 包装）。
5. 运行 `node --test tests/defaults-consistency.test.cjs` 验证默认值一致性。

### 场景 C：添加新的 IPC 控制命令
1. 打开 `Daemon.qml`，定位到 `IpcHandler`。
2. 声明带明确类型的函数，例如：
   ```qml
   function setHistoryLimit(limit: string): string {
       const val = parseInt(limit, 10);
       if (isNaN(val)) return "ERROR: invalid number";
       root.saveSetting("maxHistory", val);
       return "SUCCESS";
   }
   ```
3. 重启 DMS 后即可通过终端调用：`dms ipc keystrokes setHistoryLimit 10`。

---

## 8. Troubleshooting

### 现象 1：按键没有任何反应，屏幕无键帽
1. **检查输入工具**：终端执行 `which libinput`，若不存在请安装 `libinput`。
2. **检查用户组权限**：执行 `groups`，确认输出包含 `input`。若无，执行 `sudo usermod -aG input $USER` 并注销重登。
3. **检查插件开关**：执行 `dms ipc keystrokes toggle` 确保插件处于启用状态。
4. **检查过滤模式**：默认处于 `Hotkeys` 模式，此时必须先按修饰键（如先按 `Ctrl` 再按 `C`）。单独敲击字母或先按字母再按修饰键是不会显示的。

### 现象 2：修改了代码但运行时未生效
1. 检查 Quickshell 缓存：执行 `rm -rf ~/.cache/quickshell/qmlcache/*`。
2. 检查软链接：确保 `~/.config/DankMaterialShell/plugins/keystrokes` 确实指向当前工作区，而非另一个独立拷贝。
3. 确认 `buildStamp`：修改 `core/events.js` 中的版本标记，通过 `dms ipc keystrokes trace 0` 查看输出头部的标识。

### 现象 3：打开设置页面一片空白
- **根本原因**：QML 编译期错误（DMS 会吞掉异常导致静默空白）。
- **排查方式**：检查近期是否在 `settings/` 或项目根目录下新增了与 QtQuick 基础控件同名的 QML 文件（如 `Row.qml`、`Item.qml`）。
- **自动化守卫**：运行 `node --test tests/module-imports.test.cjs` 定位命名冲突。

### 现象 4：组合键出现按键重复或计数意外归零
- 运行 `dms ipc keystrokes trace 20` 采集击键日志。
- 查看日志中原始键名（如 `KEY_LEFTCTRL`）是否正确映射为了统一的显示标签（`Ctrl`）。若分叉为不同字符串，将导致状态机判定为两个不同按键。
- 确认是否敲击间隔超过了 `fadeTimeout`（默认 5000ms），键帽完全下屏后计数会自然归零。

### 现象 5：同一个物理键被上报了两次
- 部分带有额外媒体键的机械键盘会在系统注册两个或多个 `/dev/input/eventX` 节点。
- 对比排查：
  ```bash
  libinput debug-events --show-keycodes                              # 所有设备
  libinput debug-events --show-keycodes --device /dev/input/eventX   # 单设备
  ```
- 若确认有多节点交错，可在设置面板的“Input Device”下拉框中选择具体的专用键盘设备。
