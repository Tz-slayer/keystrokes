import QtQuick
import Quickshell
import Quickshell.Io
import qs.Common
import qs.Services
import qs.Widgets
import qs.Modules.Plugins
import "keyMapper.js" as KeyMapper
import "keyvizStyle.js" as KeyvizStyle
import "keyvizEvents.js" as KeyvizEvents

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

        // Switch the keycap skin by id: minimal | laptop | lowprofile | pbt,
        // or any custom style id. The legacy ids elevated / mechanical are
        // still accepted and mapped onto lowprofile / pbt.
        function setStyle(id: string): string {
            root.saveSetting("keycapStyle", id);
            return "SUCCESS";
        }

        // Show a sample keystroke without pressing anything (style preview).
        // Cycles: shortcut combo -> mouse click -> typing -> modifier + arrow.
        // Each keycap is briefly "held" so the keyviz press animation plays too.
        function test(): string {
            if (!root.enabled) root.saveSetting("enabled", true);
            let state = KeyvizEvents.initialState();
            ["Ctrl", "Shift", "A"].forEach(label => {
                state = KeyvizEvents.press(state, label, Date.now(), root.eventConfig);
            });
            root.applyKeyboard(state);
            previewReleaseTimer.restart();
            return "SUCCESS";
        }
        function exportStyle(): string { return JSON.stringify(KeyvizStyle.exportStyle(root.pluginData), null, 2); }
        function importStyle(json: string): string {
            try {
                const values = KeyvizStyle.importStyle(JSON.parse(json));
                Object.keys(values).forEach(key => root.saveSetting(key, values[key]));
                return "SUCCESS";
            } catch (error) { return "ERROR: " + error.message; }
        }

    }

    readonly property var config: KeyvizStyle.settings(root.pluginData)
    property var keyboardState: KeyvizEvents.initialState()
    property var physicalKeys: []
    readonly property var eventConfig: Object.assign({}, config, {allowedKeys: parseKeys(config.allowedKeys), displayLabel: key => root.displayKeyLabel(key)})

    // Configurable settings
    // Every fallback below must equal the matching `defaultValue` in
    // KeyvizSettings.qml, otherwise a setting the user never touched renders one
    // way and displays another. The values themselves follow keyviz's own
    // defaults (src/stores/key_style.ts, src/stores/key_event.ts).
    readonly property bool enabled: root.pluginData.enabled ?? true
    // keyviz: key_event.ts lingerDurationMs, 5000
    readonly property int fadeTimeout: root.config.fadeTimeout
    readonly property bool showNormalKeys: root.pluginData.showNormalKeys ?? false
    // keyviz: key_style.ts text.size, 32
    readonly property int fontSize: root.config.fontSize
    readonly property string position: root.config.position
    readonly property string selectedDevicePath: root.pluginData.selectedDevicePath ?? "all"
    // keyviz calls this showMouseEvents (key_event.ts) and it gates clicks,
    // drag and the wheel alike. The old key is still honoured so existing
    // installs keep their toggle.
    readonly property bool showMouseEvents: root.pluginData.showMouseEvents ?? root.pluginData.showMouseClicks ?? false
    // keyviz: key_event.ts dragThreshold, default 50. Distance in logical px the
    // pointer has to travel while a button is held before it becomes a Drag.
    readonly property int dragThreshold: root.pluginData.dragThreshold ?? 50

    // Mouse events go through the same gate as keys, because keyviz feeds
    // clicks, drags and the wheel straight into `onKeyPress` and lets
    // `ignoreEvent` decide them with everything else. So a bare click or wheel
    // tick is dropped by the default "modifiers" filter, while Ctrl+click and
    // Ctrl+wheel are shown -- and, as for keys, the decision belongs to the
    // first key held. The label is appended when it is not on `heldKeys` yet,
    // mirroring upstream's push-then-test order.
    function eventAllowed(label) {
        const held = root.heldKeys.indexOf(label) !== -1
            ? root.heldKeys : root.heldKeys.concat([label]);
        return KeyvizEvents.shouldShow(root.eventFilter, held, root.allowedKeys);
    }
    readonly property string animationType: root.config.animationType
    readonly property int animationDuration: root.config.animationDuration
    // keyviz: key_style.ts appearance.style, "lowprofile". The pre-parity skins
    // (elevated / mechanical) live on only as aliases in keycapSkinAliases below,
    // so a stored "elevated" still resolves to lowprofile.
    readonly property string keycapStyle: root.config.keycapStyle
    readonly property bool showShortcuts: root.pluginData.showShortcuts ?? true
    readonly property string textColorMode: root.pluginData.textColorMode ?? "default"
    readonly property string textColorCustom: root.pluginData.textColorCustom ?? "#6750A4"
    readonly property string keycapTextColorMode: root.pluginData.keycapTextColorMode ?? "default"
    readonly property string keycapTextColorCustom: root.pluginData.keycapTextColorCustom ?? "#6750A4"
    readonly property int charLimit: root.pluginData.charLimit ?? 20
    readonly property bool roundedKeycaps: root.pluginData.roundedKeycaps ?? true
    readonly property int overlayOpacity: root.pluginData.overlayOpacity ?? 100
    readonly property int marginSize: root.pluginData.marginSize ?? 24
    // keyviz: key_event.ts `filter`, default "modifiers". The plugin used to
    // ship `showOnlyModifiers` for this; the gate below supersedes it (it also
    // covers combinations and press order), so the old key is only read for the
    // migration. Typing mode is only reachable with no filter, mirroring
    // keyvizStyle.js's migration.
    readonly property string eventFilter: {
        if (root.pluginData.eventFilter !== undefined)
            return root.pluginData.eventFilter;
        if (root.pluginData.showNormalKeys === true)
            return "none";
        return "modifiers";
    }
    // keyviz: key_event.ts `allowedKeys`, a list of raw key names. Stored here as
    // the comma-separated string the settings page edits.
    readonly property var allowedKeys: String(root.pluginData.allowedKeys ?? "Ctrl,Super,Alt")
        .split(",").map(function (s) { return s.trim(); }).filter(function (s) { return s !== ""; })
    readonly property bool ignoreFilterKeys: root.pluginData.ignoreFilterKeys ?? true
    readonly property bool macSymbols: root.pluginData.macSymbols ?? false
    readonly property bool showModifierStatus: root.pluginData.showModifierStatus ?? false
    // keyviz: key_style.ts -> layout.showPressCount, default true
    readonly property bool showPressCount: root.config.showPressCount
    // keyviz puts no separator between caps, only a gap (key-overlay.tsx:
    // `columnGap: text.size * 0.3`). Default to empty to match; set it to "+"
    // or anything else to get the old behaviour back.
    readonly property string customSeparator: root.pluginData.customSeparator ?? ""
    readonly property int historyLimit: root.config.showEventHistory ? root.config.maxHistory : 1

    // ── keyviz key_style.ts: text / layout ──────────────────────────────────
    // These decide how a keycap's content is built (base.tsx) and how it is
    // aligned inside the face. Defaults are keyviz's own.
    readonly property string textVariant: root.config.textVariant
    readonly property string textCaps: root.config.textCaps
    readonly property string textAlignment: root.config.textAlignment
    readonly property bool showIcon: root.config.showIcon
    readonly property bool showSymbol: root.config.showSymbol
    readonly property string iconAlignment: root.config.iconAlignment

    // ── keyviz key_style.ts: background ─────────────────────────────────────
    // keyviz draws a rounded panel behind EVERY group (key-overlay.tsx
    // groupStyle) and keeps the overlay window itself fully transparent.
    // keyviz's default is #ffffff99; the mode/custom pair mirrors how this
    // plugin's other colour settings pick a DMS role or a literal colour.
    readonly property bool groupBackground: root.config.groupBackground
    readonly property string groupBackgroundMode: root.pluginData.groupBackgroundMode ?? "custom"
    readonly property string groupBackgroundCustom: root.config.groupBackgroundCustom
    // Qt parses an 8-digit hex string as #AARRGGBB, but keyviz writes CSS
    // colours (#RRGGBBAA -- its default group panel is #ffffff99, i.e. white at
    // 60%). Reading those two the same way silently turns the panel opaque, so
    // 8-digit values are decoded explicitly as CSS here.
    function cssColor(v) {
        if (typeof v !== "string") return v;
        if (/^#[0-9a-f]{4}$/i.test(v)) v = "#" + v.slice(1).split("").map(c => c+c).join("");
        const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(v);
        if (m)
            return Qt.rgba(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255,
                           parseInt(m[3], 16) / 255, parseInt(m[4], 16) / 255);
        return Qt.color(v);
    }
    readonly property color groupBackgroundColor: root.cssColor(root.config.groupBackgroundCustom)
    readonly property string bgColorMode: root.pluginData.bgColorMode ?? "default"
    readonly property string bgColorCustom: root.pluginData.bgColorCustom ?? "#1e2326"
    property var historyList: []

    // Consecutive-repeat counter behind the keyviz press-count badge.
    property string lastKeystrokeText: ""
    property int repeatCount: 1

    // ── physically held keys (keyviz `pressedKeys`) ──
    // Display labels of the keys currently held down, in press order. The
    // overlay reads this to play the keyviz press animation on the matching
    // keycap, and it keeps the overlay alive while a displayed key is held.
    property var heldKeys: []

    // ── mouse drag state (keyviz key_event.ts onMouseMove) ──
    // Label of the button currently down, and the distance travelled since the
    // press. No cursor position is involved: libinput's POINTER_MOTION already
    // carries accelerated per-event deltas, so accumulating them approximates
    // the distance the pointer covered on screen.
    property string mouseHeldButton: ""
    // Modifiers that were down when the button went down, e.g. "Ctrl + ".
    // keyviz renders Ctrl + click as a real combination (onKeyPress pushes the
    // button onto the group the modifier already started), so the drag that may
    // follow has to carry the same prefix instead of collapsing to a bare Drag.
    property string mouseDragPrefix: ""
    property bool mouseDragging: false
    property real dragDistanceX: 0
    property real dragDistanceY: 0

    // ── wheel state (keyviz SCROLL_LINGER_MS = 300) ──
    // A scroll keycap stays up while the wheel keeps turning and is dropped
    // once it has been idle for the linger interval.
    property bool scrollActive: false
    property int scrollDirection: 0

    // Monotonic id so the overlay can tell "new group" (animate in) apart
    // from "text updated in place" (e.g. the typing buffer growing)
    property int historyUidCounter: 0
    property int testCounter: 0

    // ── custom keycap styles ──
    // User JSON style files are read from ~/.config/DankMaterialShell/keyviz_styles/
    // (one style per file, see README). id = filename without .json
    property var customStyles: ({})

    // ── keycap skins ────────────────────────────────────────────────────────
    // keyviz ships four (src/components/keycaps/*.tsx). Colours and geometry are
    // key_style.ts defaults: cap #ffffff, base wall #1a1a1a, label #000000,
    // border #1a1a1a at 2px, corner radius 0.5, gradient on.
    //
    // This plugin used to offer three skins called minimal / elevated /
    // mechanical. The two non-keyviz names are aliased onto the keyviz skins
    // they were imitating, so existing settings and custom style JSONs that
    // still say "elevated" or "mechanical" keep working.
    readonly property var keycapSkinAliases: ({
        "elevated": "lowprofile",
        "mechanical": "pbt"
    })

    readonly property string keycapSkin: {
        const raw = root.keycapStyle;
        return root.keycapSkinAliases[raw] ?? raw;
    }

    // Resolved skin parameters consumed by the overlay's Keycap renderer.
    // Built-ins use the keyviz look (white cap / dark base, theme-independent);
    // custom styles fall back per-field to the defaults of their skin.
    readonly property var styleParams: {
        const common = {
            baseColor: root.cssColor(config.capColor), secondaryColor: root.cssColor(config.secondaryColor),
            textColor: root.cssColor(config.labelColor), borderColor: root.cssColor(config.borderColor),
            borderWidth: config.borderEnabled ? config.borderWidth : 0,
            cornerRadius: config.borderRadius, gradient: config.useGradient
        };
        const skins = {
            // no body at all -- only the label/icon is drawn
            "minimal": Object.assign({}, common, { type: "minimal", borderWidth: 0, gradient: false }),
            // one face, inset highlight + drop shadow, never moves on press
            "laptop": Object.assign({}, common, { type: "laptop" }),
            // 2.5em box: 2.25em face sliding 0.25em into a 2.25em base wall
            "lowprofile": Object.assign({}, common, { type: "lowprofile", gradient: false }),
            // 2.75em shell holding a 2.2em inset face sliding 0.15em
            "pbt": Object.assign({}, common, { type: "pbt" })
        };
        const builtin = skins[root.keycapSkin] ?? skins["pbt"];
        const custom = (root.customStyles || {})[root.keycapStyle];
        if (!custom)
            return builtin;
        // A custom JSON may still declare one of the legacy type names.
        const customSkin = root.keycapSkinAliases[custom.type] ?? custom.type;
        const base = skins[customSkin] ?? builtin;
        const merged = Object.assign({}, base, custom);
        merged.type = skins[customSkin] !== undefined ? customSkin : base.type;
        ["baseColor", "secondaryColor", "textColor", "borderColor"].forEach(key => {
            if (typeof merged[key] === "string") merged[key] = root.cssColor(merged[key]);
        });
        return merged;
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
        // The old process will not report its releases: drop held state so a
        // key can never stay stuck "pressed" across a device switch.
        root.physicalKeys = [];
        root.applyKeyboard(KeyvizEvents.initialState());
        inputRestartTimer.restart();
    }

    onEnabledChanged: {
        if (!root.enabled) root.applyKeyboard(KeyvizEvents.initialState());
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
            // keyviz keeps a keycap on screen as long as its key is held
            if (root.hasHeldVisibleKey()) {
                fadeTimer.restart();
                return;
            }
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

    // Map a raw keycode to the exact label used in the history/combo text, so
    // the overlay can match a held key against a rendered keycap.
    function displayKeyLabel(keyName) {
        if (keyName === "KEY_LEFTCTRL" || keyName === "KEY_RIGHTCTRL") return "Ctrl";
        if (keyName === "KEY_LEFTSHIFT" || keyName === "KEY_RIGHTSHIFT") return "Shift";
        if (keyName === "KEY_LEFTALT" || keyName === "KEY_RIGHTALT") return "Alt";
        if (keyName === "KEY_LEFTMETA" || keyName === "KEY_RIGHTMETA") return "Super";
        return KeyMapper.getDisplayKey(keyName);
    }

    // Track a key/button going down or up. Mirrors keyviz's pressedKeys array.
    function setKeyHeld(label, down) {
        const idx = root.heldKeys.indexOf(label);
        if (down) {
            if (idx !== -1) return;
            const next = root.heldKeys.slice();
            next.push(label);
            root.heldKeys = next;
        } else {
            if (idx === -1) return;
            const next = root.heldKeys.slice();
            next.splice(idx, 1);
            root.heldKeys = next;
        }
    }

    // keyviz never expires a keycap while its key is still held down
    // (tick() keeps any key that is in pressedKeys). Mirror that, but only for
    // keys that are actually on screen — an unrelated held key must not pin the
    // overlay open forever.
    function hasHeldVisibleKey() {
        if (root.heldKeys.length === 0) return false;
        for (let i = 0; i < root.historyList.length; i++) {
            const entry = root.historyList[i];
            // A combo row holds several labels; a non-combo row is a single
            // label (mouse click, or a standalone key when showNormalKeys is on).
            // Both can be in the pressed state, so both must keep the overlay up.
            const keys = entry.isCombo ? entry.text.split(" + ") : [entry.text];
            for (let j = 0; j < keys.length; j++) {
                if (root.heldKeys.indexOf(keys[j]) !== -1) return true;
            }
        }
        return false;
    }

    // Hold a set of keycaps for a moment so the press animation can be seen
    // without touching the keyboard (`dms ipc keyviz test`).
    Timer {
        id: previewReleaseTimer
        interval: 420
        onTriggered: {
            let state = root.keyboardState;
            state.heldKeys.forEach(label => { state = KeyvizEvents.release(state, label, Date.now()); });
            root.applyKeyboard(state);
        }
    }

    // keyviz: key_event.ts SCROLL_LINGER_MS = 300. The wheel has no press/release
    // of its own, so the "key" is considered released once it has been quiet for
    // this long; a later scroll then starts a fresh keycap instead of silently
    // reusing the old one.
    Timer {
        id: scrollLingerTimer
        interval: 300
        onTriggered: {
            if (root.scrollDirection !== 0 && root.scrollActive)
                root.setKeyHeld(root.scrollDirection > 0 ? "ScrollDown" : "ScrollUp", false);
            root.scrollActive = false;
            root.scrollDirection = 0;
        }
    }

    function previewPress(labels) {
        root.heldKeys = labels;
        previewReleaseTimer.restart();
    }

    function mouseButtonLabel(data) {
        if (data.includes("BTN_LEFT") || data.includes("(272)")) return "LMB Click";
        if (data.includes("BTN_RIGHT") || data.includes("(273)")) return "RMB Click";
        if (data.includes("BTN_MIDDLE") || data.includes("(274)")) return "MMB Click";
        return "Mouse Click";
    }

    // `forceNewEntry` opts out of the in-place rewrite of a trailing non-combo
    // entry, so a keycap can be appended even when the newest entry happens to
    // be plain text. Needed by the button -> Drag swap, which must not silently
    // overwrite an unrelated keycap.
    function addKeystroke(text, isCombo, forceNewEntry) {
        fadeTimer.stop();
        // keyviz counts consecutive repeats of the same key event: KeyEvent is
        // constructed with pressedCount 1 and press() bumps it when the key is
        // already in the last group (types/event.ts:206-213, key_event.ts:158).
        // The daemon works with rendered combo strings, so the equivalent is
        // "the same keystroke text again". Held modifier + repeated key is the
        // canonical case: hold Ctrl and tap I twice -> "Ctrl + I", "Ctrl + I".
        if (text === root.lastKeystrokeText)
            root.repeatCount++;
        else
            root.repeatCount = 1;
        root.lastKeystrokeText = text;

        let newList = root.historyList.slice();
        const lastItem = newList.length > 0 ? newList[newList.length - 1] : null;
        if (!forceNewEntry && lastItem && !lastItem.isCombo && !isCombo) {
            // Continuing typing stream: update the entry in place so the
            // overlay animates it only when it first appears
            lastItem.text = text;
            lastItem.count = root.repeatCount;
        } else {
            root.historyUidCounter++;
            newList.push({ uid: root.historyUidCounter, text: text, isCombo: isCombo,
                           count: root.repeatCount });
            while (newList.length > root.historyLimit) {
                newList.shift();
            }
        }
        root.historyList = newList;
        root.displayText = "has_content";
        fadeTimer.start();
    }

    // keyviz's trigger rule. `heldKeys` is maintained in physical press order by
    // setKeyHeld() and already contains the key being handled, which is exactly
    // what the rule needs:
    //   - a lone modifier passes, because it *is* a modifier
    //   - Ctrl-then-A passes, because the first pressed key is a modifier
    //   - A-then-Ctrl does NOT, because A was pressed first
    //   - Shift counts, so Shift+A is a shortcut
    // See keyvizEvents.shouldShow for the upstream derivation.
    function parseKeys(value) {
        return String(value || "").split(",").map(k => k.trim()).filter(k => k !== "")
            .map(k => k === "Comma" ? "," : k);
    }

    function applyKeyboard(state) {
        root.keyboardState = state;
        root.heldKeys = state.heldKeys.map(key => root.displayKeyLabel(key));
        root.ctrlActive = root.heldKeys.includes("Ctrl");
        root.altActive = root.heldKeys.includes("Alt");
        root.shiftActive = root.heldKeys.includes("Shift");
        root.superActive = root.heldKeys.includes("Super");
        root.historyList = state.groups.map(g => ({uid: g.uid, text: g.keys.map(k => root.displayKeyLabel(k.label)).join(" + "),
            isCombo: true, count: g.keys.length ? g.keys[g.keys.length-1].count : 1,
            keys: g.keys.map(k => ({label: root.displayKeyLabel(k.label), keyId: k.label,
                                    count: k.count, animateIn: k.animateIn !== false}))}));
        root.displayText = state.groups.length ? "has_content" : "";
    }

    function handleKeyPress(keyName) {
        if (root.physicalKeys.includes(keyName)) return;
        root.physicalKeys = root.physicalKeys.concat([keyName]);
        const label = root.displayKeyLabel(keyName);
        const labels = root.physicalKeys.map(root.displayKeyLabel);
        const shortcut = root.parseKeys(config.toggleShortcut);
        if (shortcut.length && shortcut.length === labels.length && shortcut.every((key, index) => key === labels[index])) {
            root.saveSetting("enabled", !root.enabled);
            root.applyKeyboard(KeyvizEvents.initialState());
            return;
        }
        if (!root.enabled || !label) return;
        fadeTimer.stop();
        root.applyKeyboard(KeyvizEvents.press(root.keyboardState, keyName, Date.now(), root.eventConfig));
    }

    function handleKeyRelease(keyName) {
        root.physicalKeys = root.physicalKeys.filter(key => key !== keyName);
        const label = root.displayKeyLabel(keyName);
        root.applyKeyboard(KeyvizEvents.release(root.keyboardState, keyName, Date.now()));
    }

    Timer {
        interval: 50
        repeat: true
        running: root.enabled && root.keyboardState.groups.length > 0
        onTriggered: {
            const next = KeyvizEvents.tick(root.keyboardState, Date.now(), root.eventConfig);
            if (next !== root.keyboardState) root.applyKeyboard(next);
        }
    }

    // Active Ctrl/Alt/Super in keyviz order. Shift is left out on purpose: the
    // plugin treats Shift + key as typing, not as a shortcut.
    function activeModifiers() {
        let m = [];
        if (root.ctrlActive) m.push("Ctrl");
        if (root.altActive) m.push("Alt");
        if (root.superActive) m.push("Super");
        return m;
    }

    function handleMouseClick(buttonName) {
        if (!root.enabled || !root.showMouseEvents || !root.eventAllowed(buttonName)) return;
        root.textBuffer = "";
        // Arm drag tracking: keyviz remembers the press position and only swaps
        // the button keycap for Drag once the threshold is passed.
        const mods = root.activeModifiers();
        root.mouseDragPrefix = mods.length > 0 ? mods.join(" + ") + " + " : "";
        root.mouseHeldButton = buttonName;
        root.mouseDragging = false;
        root.dragDistanceX = 0;
        root.dragDistanceY = 0;
        if (mods.length > 0)
            root.addKeystroke(root.mouseDragPrefix + buttonName, true);
        else
            root.addKeystroke(buttonName, false);
    }

    function endMouseDrag() {
        // startDrag() holds the bare "Drag" label; the modifier prefix only ever
        // affects the rendered text, so release the same key it was held with.
        if (root.mouseDragging)
            root.setKeyHeld("Drag", false);
        root.mouseHeldButton = "";
        root.mouseDragPrefix = "";
        root.mouseDragging = false;
        root.dragDistanceX = 0;
        root.dragDistanceY = 0;
    }

    // keyviz: key_event.ts onMouseMove. Turns a held button into a Drag keycap.
    // Needs no cursor position -- POINTER_MOTION deltas are enough, and they
    // already carry libinput's acceleration (raw evdev does not).
    function startDrag() {
        root.mouseDragging = true;
        root.setKeyHeld(root.mouseHeldButton, false);
        root.setKeyHeld("Drag", true);
        const last = root.historyList.length > 0
            ? root.historyList[root.historyList.length - 1] : null;
        const lastIsButton = last && !last.isCombo && last.text === root.mouseHeldButton;
        const label = root.mouseDragPrefix + "Drag";
        root.addKeystroke(label, root.mouseDragPrefix !== "", !lastIsButton);
    }

    function accumulateDrag(dx, dy) {
        if (root.mouseDragging || root.mouseHeldButton === "") return;
        root.dragDistanceX += dx;
        root.dragDistanceY += dy;
        if (Math.sqrt(root.dragDistanceX * root.dragDistanceX
                      + root.dragDistanceY * root.dragDistanceY) <= root.dragThreshold)
            return;
        root.startDrag();
    }

    function handlePointerMotion(data) {
        if (!root.enabled || !root.showMouseEvents) return;
        // libinput prints "  1.28/ -1.28 ( +1.00/ -1.00)": the first pair is the
        // accelerated dx/dy, the parenthesised one the raw device deltas. The
        // accelerated pair is the one that matches what the cursor does on
        // screen, so it is the pair keyviz's dragThreshold should be measured
        // against.
        const m = data.match(/([+-]?[\d.]+)\/\s*([+-]?[\d.]+)/);
        if (!m) return;
        root.accumulateDrag(parseFloat(m[1]), parseFloat(m[2]));
    }

    // evtest fallback (single-device mode without libinput): one axis per line,
    // e.g. "Event: time ... type 2 (EV_REL), code 0 (REL_X), value 12".
    function handleRelativeAxis(data) {
        // Motion, not a press: it only feeds drag tracking, which is armed by a
        // button press that already passed the gate. No separate filter check.
        if (!root.enabled || !root.showMouseEvents || root.mouseHeldButton === "") return;
        const codeMatch = data.match(/code\s+(\d+)\s+\((REL_[A-Z_]+)\)/);
        const valueMatch = data.match(/value\s+(-?\d+)/);
        if (!codeMatch || !valueMatch) return;
        const axis = codeMatch[2];
        const value = parseInt(valueMatch[1]);
        if (axis === "REL_WHEEL" || axis === "REL_HWHEEL") {
            if (value === 0) return;
            // REL_WHEEL +1 is physically up (X11 button 4), which is -1 here.
            const dir = value > 0 ? -1 : 1;
            if (root.scrollActive && root.scrollDirection === dir) {
                scrollLingerTimer.restart();
                return;
            }
            root.showScrollKey(dir);
        } else if (axis === "REL_X" || axis === "REL_Y") {
            root.accumulateDrag(axis === "REL_X" ? value : 0,
                                axis === "REL_Y" ? value : 0);
        }
    }

    // keyviz: key_event.ts onMouseWheel + the SCROLL_LINGER_MS release in tick().
    // Direction: libinput reports the wheel on the Wayland axis convention where
    // positive is "down". Measured on this machine with a uinput pointer:
    // REL_WHEEL +1 (physically up, X11 button 4) -> "vert -15.00/-120.0".
    function showScrollKey(dir) {
        // Reverse direction mid-scroll: drop the old keycap first so it does not
        // linger in `heldKeys`.
        if (root.scrollActive && root.scrollDirection !== 0 && root.scrollDirection !== dir)
            root.setKeyHeld(root.scrollDirection > 0 ? "ScrollDown" : "ScrollUp", false);
        root.scrollActive = true;
        root.scrollDirection = dir;
        const label = dir > 0 ? "ScrollDown" : "ScrollUp";
        root.setKeyHeld(label, true);
        root.textBuffer = "";
        // Ctrl + wheel is a real shortcut (browser zoom); render it as the same
        // kind of combination as Ctrl + click instead of a bare wheel keycap.
        const mods = root.activeModifiers();
        const prefix = mods.length > 0 ? mods.join(" + ") + " + " : "";
        root.addKeystroke(prefix + label, prefix !== "", false);
        scrollLingerTimer.restart();
    }

    function handleScroll(data) {
        if (!root.enabled || !root.showMouseEvents) return;
        // "vert 15.00/120.0* horiz 0.00/0.0 (wheel)"
        const m = data.match(/vert\s+(-?[\d.]+)\/(-?[\d.]+)/);
        if (!m) return;
        // The angle (second value) is the notch count * 120; the first value is
        // the unaccelerated remainder.
        // Touchpad scrolling (POINTER_SCROLL_FINGER / _CONTINUOUS) reports a
        // plain pixel delta with no v120 component, so fall back to it.
        let value = parseFloat(m[2]);
        if (!(value > 0) && !(value < 0))
            value = parseFloat(m[1]);
        if (!(value > 0) && !(value < 0)) return;
        const dir = value > 0 ? 1 : -1;
        // The gate runs once the direction is known, so it can name the label
        // keyviz would have pushed.
        if (!root.eventAllowed(dir > 0 ? "ScrollDown" : "ScrollUp")) return;
        // While the wheel keeps turning the same way, keep the existing keycap
        // (mirrors keyviz, which holds the key in `pressedKeys`).
        if (root.scrollActive && root.scrollDirection === dir) {
            scrollLingerTimer.restart();
            return;
        }
        root.showScrollKey(dir);
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
        running: !root.inputToolMissing

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
                } else if (root.showMouseEvents && data.includes("POINTER_BUTTON")) {
                    if (data.includes("pressed")) {
                        const btnName = root.mouseButtonLabel(data);
                        root.setKeyHeld(btnName, true);
                        root.handleMouseClick(btnName);
                    } else if (data.includes("released")) {
                        root.setKeyHeld(root.mouseButtonLabel(data), false);
                        root.endMouseDrag();
                    }
                } else if (root.showMouseEvents && data.includes("POINTER_SCROLL_")) {
                    // Covers POINTER_SCROLL_WHEEL / _FINGER / _CONTINUOUS.
                    root.handleScroll(data);
                } else if (root.showMouseEvents && data.includes("POINTER_MOTION")
                           && !data.includes("POINTER_MOTION_ABSOLUTE")) {
                    root.handlePointerMotion(data);
                } else if (root.showMouseEvents && data.includes("EV_REL")) {
                    // Only reached in the evtest fallback; libinput reports
                    // motion and the wheel as POINTER_* lines instead.
                    root.handleRelativeAxis(data);
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
            pluginData = Object.assign({}, pluginData, {[key]: value});
        } catch(e) {
            console.warn("[Keyviz] Failed to save setting:", key, e);
        }
    }
}
