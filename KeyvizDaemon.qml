import QtQuick
import Quickshell
import Quickshell.Io
import qs.Common
import qs.Services
import qs.Widgets
import qs.Modules.Plugins
import "keyMapper.js" as KeyMapper

PluginComponent {
    id: root

    pluginId: "keyviz"
    pluginService: PluginService

    IpcHandler {
        target: "keyviz"
        enabled: true

        function toggle(): string {
            root.saveSetting("enabled", !root.enabled);
            return "SUCCESS";
        }

        function enable(): string {
            root.saveSetting("enabled", true);
            return "SUCCESS";
        }

        function disable(): string {
            root.saveSetting("enabled", false);
            return "SUCCESS";
        }

        // List currently loaded custom styles (JSON array of ids)
        function styles(): string {
            return JSON.stringify(Object.keys(root.customStyles || {}));
        }

        // Rescan ~/.config/DankMaterialShell/keyviz_styles/ for style JSONs
        function rescan(): string {
            root.scanStyles();
            return "SUCCESS";
        }

        // Show a sample keystroke without pressing anything (style preview).
        // Cycles: shortcut combo -> mouse click -> typing -> modifier + arrow.
        function test(): string {
            if (!root.enabled)
                root.saveSetting("enabled", true);
            root.testCounter++;
            const mode = root.testCounter % 4;
            if (mode === 1) {
                root.ctrlActive = true;
                root.altActive = true;
                root.handleKeyPress("KEY_T");
                root.ctrlActive = false;
                root.altActive = false;
            } else if (mode === 2) {
                root.addKeystroke("LMB Click", false);
            } else if (mode === 3) {
                root.textBuffer = "hello world";
                root.addKeystroke("hello world", false);
            } else {
                root.superActive = true;
                root.handleKeyPress("KEY_UP");
                root.superActive = false;
            }
            return "SUCCESS";
        }
    }

    // Configurable settings
    readonly property bool enabled: root.pluginData.enabled ?? true
    readonly property int fadeTimeout: root.pluginData.fadeTimeout ?? 1500
    readonly property bool showNormalKeys: root.pluginData.showNormalKeys ?? false
    readonly property int fontSize: root.pluginData.fontSize ?? 24
    readonly property string position: root.pluginData.position ?? "bottom_center"
    readonly property string selectedDevicePath: root.pluginData.selectedDevicePath ?? "all"
    readonly property bool showMouseClicks: root.pluginData.showMouseClicks ?? false
    readonly property string animationType: root.pluginData.animationType ?? "fade"
    readonly property int animationDuration: root.pluginData.animationDuration ?? 250
    readonly property string keycapStyle: root.pluginData.keycapStyle ?? "mechanical"
    readonly property bool showShortcuts: root.pluginData.showShortcuts ?? true
    readonly property string textColorMode: root.pluginData.textColorMode ?? "default"
    readonly property string textColorCustom: root.pluginData.textColorCustom ?? "#6750A4"
    readonly property string keycapTextColorMode: root.pluginData.keycapTextColorMode ?? "default"
    readonly property string keycapTextColorCustom: root.pluginData.keycapTextColorCustom ?? "#6750A4"
    readonly property int charLimit: root.pluginData.charLimit ?? 20
    readonly property bool roundedKeycaps: root.pluginData.roundedKeycaps ?? true
    readonly property int overlayOpacity: root.pluginData.overlayOpacity ?? 90
    readonly property int marginSize: root.pluginData.marginSize ?? 24
    readonly property bool showOnlyModifiers: root.pluginData.showOnlyModifiers ?? false
    readonly property bool ignoreFilterKeys: root.pluginData.ignoreFilterKeys ?? true
    readonly property bool macSymbols: root.pluginData.macSymbols ?? false
    readonly property bool showModifierStatus: root.pluginData.showModifierStatus ?? false
    readonly property string customSeparator: root.pluginData.customSeparator ?? "+"
    readonly property int historyLimit: root.pluginData.historyLimit ?? 1
    readonly property string bgColorMode: root.pluginData.bgColorMode ?? "default"
    readonly property string bgColorCustom: root.pluginData.bgColorCustom ?? "#1e2326"
    property var historyList: []

    // Monotonic id so the overlay can tell "new group" (animate in) apart
    // from "text updated in place" (e.g. the typing buffer growing)
    property int historyUidCounter: 0
    property int testCounter: 0

    // ── custom keycap styles ──
    // User JSON style files are read from ~/.config/DankMaterialShell/keyviz_styles/
    // (one style per file, see README). id = filename without .json
    property var customStyles: ({})

    // Resolved skin parameters consumed by the overlay's Keycap renderer.
    // Built-ins use the keyviz look (white cap / dark base, theme-independent);
    // custom styles fall back per-field to the defaults of their type.
    readonly property var styleParams: {
        const minimal = {
            type: "minimal",
            textColor: Theme.surfaceText
        };
        const elevated = {
            type: "elevated",
            baseColor: "#ffffff",
            secondaryColor: "#1a1a1a",
            textColor: "#1a1a1a",
            borderColor: "#1a1a1a",
            borderWidth: 0,
            cornerRadius: 0.45,
            gradient: true,
            shadowOpacity: 0.25
        };
        const mechanical = {
            type: "mechanical",
            baseColor: "#ffffff",
            secondaryColor: "#1a1a1a",
            textColor: "#1a1a1a",
            borderColor: "#1a1a1a",
            borderWidth: 0,
            cornerRadius: 0.45,
            gradient: false,
            shadowOpacity: 0
        };
        const builtin = root.keycapStyle === "minimal"
            ? minimal
            : (root.keycapStyle === "mechanical" ? mechanical : elevated);
        const custom = (root.customStyles || {})[root.keycapStyle];
        if (!custom)
            return builtin;
        const base = custom.type === "minimal"
            ? minimal
            : (custom.type === "mechanical" ? mechanical : elevated);
        return Object.assign({}, base, custom);
    }

    // Output state
    property string displayText: ""
    property string textBuffer: ""

    // Modifiers state
    property bool ctrlActive: false
    property bool shiftActive: false
    property bool altActive: false
    property bool superActive: false

    // Required tools check.
    // libinput can follow a single device via `--device`, so evtest is now only a
    // fallback for systems without libinput. inputToolMissing/requiredTool are
    // derived bindings so switching device mode re-evaluates them immediately.
    property bool hasLibinput: false
    property bool hasEvtest: false
    property bool notInInputGroup: false

    readonly property bool inputToolMissing: root.selectedDevicePath === "all"
        ? !root.hasLibinput
        : (!root.hasLibinput && !root.hasEvtest)
    readonly property string requiredTool: root.selectedDevicePath === "all"
        ? "libinput"
        : (root.hasLibinput ? "libinput" : "evtest")
    readonly property bool inputBroken: inputToolMissing || notInInputGroup

    Component.onCompleted: {
        if (!pluginService.pluginInstances[pluginId]) {
            const newInstances = Object.assign({}, pluginService.pluginInstances);
            newInstances[pluginId] = root;
            pluginService.pluginInstances = newInstances;
        }
        checkTools();
        scanStyles();
    }

    // Scan ~/.config/DankMaterialShell/keyviz_styles/ for user style JSONs
    function scanStyles() {
        console.log("[Keyviz] Scanning custom styles");
        styleScanProc.running = false;
        styleScanProc.running = true;
    }

    Process {
        id: styleScanProc
        command: ["python3", "-c", `
import os, json
d = os.path.expanduser("~/.config/DankMaterialShell/keyviz_styles")
out = {}
if os.path.isdir(d):
    for f in sorted(os.listdir(d)):
        if not f.endswith(".json"):
            continue
        try:
            data = json.load(open(os.path.join(d, f), encoding="utf-8"))
            if isinstance(data, dict) and isinstance(data.get("type"), str):
                out[f[:-5]] = data
        except Exception as e:
            print("skipped " + f + ": " + str(e), file=os.sys.stderr)
print(json.dumps(out))
`]
        stdout: SplitParser {
            splitMarker: "\n"
            onRead: data => {
                const line = data.trim();
                if (line.length === 0)
                    return;
                if (!line.startsWith("{")) {
                    console.warn("[Keyviz] style scan:", line);
                    return;
                }
                try {
                    root.customStyles = JSON.parse(line);
                    console.log("[Keyviz] Loaded custom styles:", Object.keys(root.customStyles).join(", ") || "(none)");
                } catch (e) {
                    console.warn("[Keyviz] Failed to parse custom style scan output:", e);
                }
            }
        }
        stderr: StdioCollector {}
    }

    onSelectedDevicePathChanged: {
        inputProc.running = false;
        inputRestartTimer.restart();
    }

    Timer {
        id: inputRestartTimer
        interval: 200
        onTriggered: inputProc.running = true
    }

    Timer {
        id: fadeTimer
        interval: root.fadeTimeout
        onTriggered: {
            root.displayText = "";
            root.textBuffer = "";
            root.historyList = [];
        }
    }

    function checkTools() {
        libinputCheck.running = false;
        libinputCheck.running = true;
        evtestCheck.running = false;
        evtestCheck.running = true;
        groupCheck.running = false;
        groupCheck.running = true;
    }

    Process {
        id: libinputCheck
        command: ["sh", "-c", "command -v libinput >/dev/null 2>&1"]
        running: false
        onExited: (exitCode) => {
            root.hasLibinput = (exitCode === 0);
        }
    }

    Process {
        id: evtestCheck
        command: ["sh", "-c", "command -v evtest >/dev/null 2>&1"]
        running: false
        onExited: (exitCode) => {
            root.hasEvtest = (exitCode === 0);
        }
    }

    Process {
        id: groupCheck
        command: ["sh", "-c", "id -nG | tr ' ' '\n' | grep -qx input"]
        running: false
        onExited: (exitCode) => {
            root.notInInputGroup = (exitCode !== 0);
        }
    }

    function getActiveModifiersString() {
        let combo = [];
        if (root.ctrlActive) combo.push("Ctrl");
        if (root.altActive) combo.push("Alt");
        if (root.shiftActive) combo.push("Shift");
        if (root.superActive) combo.push("Super");
        return combo.join(" + ");
    }

    function addKeystroke(text, isCombo) {
        fadeTimer.stop();
        let newList = root.historyList.slice();
        const lastItem = newList.length > 0 ? newList[newList.length - 1] : null;
        if (lastItem && !lastItem.isCombo && !isCombo) {
            // Continuing typing stream: update the entry in place so the
            // overlay animates it only when it first appears
            lastItem.text = text;
        } else {
            root.historyUidCounter++;
            newList.push({ uid: root.historyUidCounter, text: text, isCombo: isCombo });
            while (newList.length > root.historyLimit) {
                newList.shift();
            }
        }
        root.historyList = newList;
        root.displayText = "has_content";
        fadeTimer.start();
    }

    function updateModifierDisplay() {
        if (root.showOnlyModifiers) {
            root.textBuffer = "";
            root.addKeystroke(getActiveModifiersString(), true);
        }
    }

    function handleKeyPress(keyName) {
        if (!root.enabled) return;

        if (root.ignoreFilterKeys) {
            if (keyName === "KEY_CAPSLOCK" || keyName === "KEY_NUMLOCK" || keyName === "KEY_SCROLLLOCK") {
                return;
            }
        }

        // 1. Modifiers tracking
        if (keyName === "KEY_LEFTCTRL" || keyName === "KEY_RIGHTCTRL") {
            root.ctrlActive = true;
            updateModifierDisplay();
            return;
        }
        if (keyName === "KEY_LEFTSHIFT" || keyName === "KEY_RIGHTSHIFT") {
            root.shiftActive = true;
            updateModifierDisplay();
            return;
        }
        if (keyName === "KEY_LEFTALT" || keyName === "KEY_RIGHTALT") {
            root.altActive = true;
            updateModifierDisplay();
            return;
        }
        if (keyName === "KEY_LEFTMETA" || keyName === "KEY_RIGHTMETA") {
            root.superActive = true;
            updateModifierDisplay();
            return;
        }

        // 2. Active modifiers combo logic
        const hasModifiers = root.ctrlActive || root.altActive || root.superActive;
        if (hasModifiers) {
            if (root.showShortcuts) {
                let combo = [];
                if (root.ctrlActive) combo.push("Ctrl");
                if (root.altActive) combo.push("Alt");
                if (root.shiftActive) combo.push("Shift");
                if (root.superActive) combo.push("Super");
                combo.push(KeyMapper.getDisplayKey(keyName));

                root.textBuffer = ""; // Reset standard typing buffer
                root.addKeystroke(combo.join(" + "), true);
            }
            return;
        }

        // 3. Normal keys typing logic
        if (root.showNormalKeys) {
            const keyChar = KeyMapper.getChar(keyName, root.shiftActive);
            if (keyChar !== "") {
                root.textBuffer += keyChar;
                if (root.textBuffer.length > root.charLimit) {
                    root.textBuffer = root.textBuffer.slice(-root.charLimit);
                }
                root.addKeystroke(root.textBuffer, false);
                return;
            }

            // Handles backspace deletion
            if (keyName === "KEY_BACKSPACE") {
                if (root.textBuffer.length > 0) {
                    root.textBuffer = root.textBuffer.slice(0, -1);
                    root.addKeystroke(root.textBuffer, false);
                } else {
                    root.addKeystroke("Backspace", false);
                }
                return;
            }

            // Treat other control keys as standalone items
            const label = KeyMapper.getDisplayKey(keyName);
            if (label !== "") {
                root.textBuffer = ""; // Reset buffer
                root.addKeystroke(label, false);
            }
        }
    }

    function handleKeyRelease(keyName) {
        if (keyName === "KEY_LEFTCTRL" || keyName === "KEY_RIGHTCTRL") {
            root.ctrlActive = false;
        } else if (keyName === "KEY_LEFTSHIFT" || keyName === "KEY_RIGHTSHIFT") {
            root.shiftActive = false;
        } else if (keyName === "KEY_LEFTALT" || keyName === "KEY_RIGHTALT") {
            root.altActive = false;
        } else if (keyName === "KEY_LEFTMETA" || keyName === "KEY_RIGHTMETA") {
            root.superActive = false;
        }
    }

    function handleMouseClick(buttonName) {
        if (!root.enabled || !root.showMouseClicks) return;
        root.textBuffer = "";
        root.addKeystroke(buttonName, false);
    }

    // Input monitoring process
    Process {
        id: inputProc
        command: {
            let cmd;
            if (selectedDevicePath === "all")
                cmd = ["libinput", "debug-events", "--show-keycodes"];
            else if (root.hasLibinput)
                cmd = ["libinput", "debug-events", "--show-keycodes", "--device", selectedDevicePath];
            else
                cmd = ["evtest", selectedDevicePath];
            console.log("[Keyviz] Starting input process:", JSON.stringify(cmd));
            return cmd;
        }
        running: root.enabled && !root.inputToolMissing

        stdout: SplitParser {
            splitMarker: "\n"
            onRead: data => {
                if (data.includes("EV_KEY")) {
                    const keyMatch = data.match(/(KEY_[A-Z0-9_]+)/);
                    if (keyMatch) {
                        const keyName = keyMatch[1];
                        if (data.includes("value 1")) {
                            root.handleKeyPress(keyName);
                        } else if (data.includes("value 0")) {
                            root.handleKeyRelease(keyName);
                        }
                    }
                } else if (data.includes("KEYBOARD_KEY")) {
                    const keyMatch = data.match(/(KEY_[A-Z0-9_]+)/);
                    if (keyMatch) {
                        const keyName = keyMatch[1];
                        if (data.includes("pressed")) {
                            root.handleKeyPress(keyName);
                        } else if (data.includes("released")) {
                            root.handleKeyRelease(keyName);
                        }
                    }
                } else if (root.showMouseClicks && data.includes("POINTER_BUTTON")) {
                    if (data.includes("pressed")) {
                        let btnName = "Mouse Click";
                        if (data.includes("BTN_LEFT") || data.includes("(272)")) btnName = "LMB Click";
                        else if (data.includes("BTN_RIGHT") || data.includes("(273)")) btnName = "RMB Click";
                        else if (data.includes("BTN_MIDDLE") || data.includes("(274)")) btnName = "MMB Click";
                        root.handleMouseClick(btnName);
                    }
                }
            }
        }

        stderr: StdioCollector {}
    }

    // Floating overlay window instance
    KeyvizOverlay {
        id: overlay
        daemon: root
        // Stay visible a moment longer so exit animations can play out
        visible: root.enabled && (overlay.isOverlayVisible || overlay.exitPending)
    }

    Component.onDestruction: {
        if (pluginService && pluginService.pluginInstances && pluginService.pluginInstances[pluginId] === root) {
            const newInstances = Object.assign({}, pluginService.pluginInstances);
            delete newInstances[pluginId];
            pluginService.pluginInstances = newInstances;
        }
    }

    function saveSetting(key, value) {
        try {
            pluginService.savePluginData(pluginId, key, value);
            if (pluginData) pluginData[key] = value;
        } catch(e) {
            console.warn("[Keyviz] Failed to save setting:", key, e);
        }
    }
}
