# Agent Instructions

本项目为 DankMaterialShell (DMS) 插件 **Keystrokes**。本文档用于指导 Coding Agent（如 Codex、Claude Code、Gemini CLI 等）理解系统约束并安全地对代码库进行修改。

---

## 1. Read First

在进行任何代码与配置变更前，必须首先通读以下核心文档：

1. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) —— 系统的静态架构、模块职责、分层拓扑与核心数据模型。
2. [`docs/FLOWS.md`](docs/FLOWS.md) —— 运行时事件管道、状态机转换规则、生命周期与系统不变量。
3. [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) —— 本地调试机制、三层测试体系与排障方案。

---

## 2. Architecture & Layering Rules

修改代码时必须遵守以下架构分层守卫：

- **Core 绝对纯净**：
  - `core/*.js` 必须全部为纯函数，严禁引入可变全局状态。
  - `core/` 目录严禁 `import` 任何外部模块（包括 `ui/`、`settings/` 或外部库）。
- **UI 零 DMS 依赖**：
  - `ui/*.qml` 严禁出现任何 DankMaterialShell 的特定符号（包括 `qs.*`、`Theme`、`I18n`、`PluginService`、`Dank*`）。
  - `ui/` 仅允许依赖基础 QtQuick 与 Quickshell 核心对象（如 `Quickshell.screens`、`PanelWindow`）。
  - 所有宿主配置和合成器状态必须由 `Daemon.qml` 显式注入。
- **DMS 依赖边界收敛**：
  - 仅允许在根目录入口（`Daemon.qml`、`Widget.qml`、`Settings.qml`）以及 `settings/*` 中直接访问 DMS 服务。
- **单向数据流与单一修改通道**：
  - `Widget.qml` 和 `Settings.qml` 仅负责读写配置与调用 `Daemon` 显式暴露的接口，严禁直接篡改底层状态机。

---

## 3. Coding & Naming Rules

- **QML 文件命名防冲突**：
  - QML 同目录下文件名即组件类型名。**严禁**创建与 QtQuick / QtQuick.Controls 内置组件同名的文件（例如严禁使用 `Row.qml`，统一使用 `SettingRow.qml`）。
- **IPC 接口参数强类型**：
  - 在 `Daemon.qml` 的 `IpcHandler` 中声明槽函数时，所有参数必须显式声明类型（例如 `function trace(seconds: string): string`），严禁使用隐式 `QVariant`。
- **键的单一权威身份**：
  - 键在进入状态机前必须统一归一化为**显示标签（Display Label）**（例如 `Ctrl` 而非 `KEY_LEFTCTRL`）。
- **几何外扩原则**：
  - 分组底板**严禁使用 QML `clip: true`**。任何超出常规范围的装饰（计数徽章、微投影），必须通过 `core/groupFrame.js` 统一计算外扩边距。

---

## 4. Testing Requirements

修改代码后，必须在终端执行并通过以下自动化测试：

```bash
# 1. 运行核心逻辑与架构守卫测试 (必须使用显式 glob 通配符)
node --test tests/*.test.cjs

# 2. 运行文档死链与资源引用守卫
node tests/docs-links.cjs
```

- 若修改了 `core/events.js`，建议同步更新 `Daemon.qml` 中的 `buildStamp`，以确保运行时 trace 日志具有自证能力。
- 若修改了 `core/keyStyle.js` 中的默认值或字段，必须同步更新 `Settings.qml` 并确保 `tests/defaults-consistency.test.cjs` 测试通过。
- 发版时 `plugin.json`、`package.json` 与 `CHANGELOG.md` 的版本号必须三方一致（`plugin.json` 为唯一权威源），由 `tests/version-consistency.test.cjs` 守卫。

---

## 5. Documentation Sync Rules

代码产生变动时，必须联动更新对应文档：

```text
代码变更类型
   │
   ├── 模块结构 / 依赖拓扑 / 数据结构 ──────► docs/ARCHITECTURE.md
   │
   ├── 业务逻辑 / 状态机 / 运行时流程 ──────► docs/FLOWS.md
   │
   ├── 开发配置 / 调试手段 / 测试用例 ──────► docs/DEVELOPMENT.md
   │
   └── 用户可见的新功能 / 破坏性修改 ──────► CHANGELOG.md & README.md
```

---

## 6. Before Finishing Checklist

在提交任务前，请逐项核对：

- [ ] `node --test tests/*.test.cjs` 100% 通过（零失败）
- [ ] `node tests/docs-links.cjs` 检查通过（零死链、零未解析锚点）
- [ ] 未在 `core/` 或 `ui/` 引入违规的 DMS 依赖
- [ ] 对应修改已同步记录至相应文档中
