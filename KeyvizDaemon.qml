import QtQuick
import Quickshell
import Quickshell.Io
import qs.Common
import qs.Services
import qs.Widgets
import qs.Modules.Plugins
import "core/keyMapper.js" as KeyMapper
import "core/keyvizStyle.js" as KeyvizStyle
import "core/keyvizEvents.js" as KeyvizEvents
import "core/keycapColors.js" as KeycapColors
import "core/inputParse.js" as InputParse
import "ui"

PluginComponent {
    id: root

    pluginId: "keystrokes"
    pluginService: PluginService

    IpcHandler {
        target: "keystrokes"
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
    readonly property bool showNormalKeys: root.pluginData.showNormalKeys ?? false
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
    readonly property bool macSymbols: root.pluginData.macSymbols ?? false
    readonly property bool showModifierStatus: root.pluginData.showModifierStatus ?? false
    // Set by the overlay once it has rendered groups. The overlay window can be
    // re-created (output change, reload) while this daemon keeps running; the
    // rebuilt overlay then knows it must restore the existing keycaps at rest
    // instead of replaying their entrance animation.
    property bool overlayRendered: false

    // ── keyviz key_style.ts: text / layout ──────────────────────────────────
    // The overlay reads the resolved `config` for these; nothing here mirrors
    // them, because a second copy is a second thing to keep in sync.

    // ── keyviz key_style.ts: background ─────────────────────────────────────
    // keyviz draws a rounded panel behind EVERY group (key-overlay.tsx
    // groupStyle) and keeps the overlay window itself fully transparent.
    // keyviz's default is #ffffff99.
    readonly property color groupBackgroundColor: KeycapColors.cssColor(root.config.groupBackgroundCustom)
    property var historyList: []

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
    property bool mouseDragging: false
    property real dragDistanceX: 0
    property real dragDistanceY: 0

    // ── wheel state (keyviz SCROLL_LINGER_MS = 300) ──
    // A scroll keycap stays up while the wheel keeps turning and is dropped
    // once it has been idle for the linger interval.
    property bool scrollActive: false
    property int scrollDirection: 0

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
            baseColor: KeycapColors.cssColor(config.capColor), secondaryColor: KeycapColors.cssColor(config.secondaryColor),
            textColor: KeycapColors.cssColor(config.labelColor), borderColor: KeycapColors.cssColor(config.borderColor),
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
            if (typeof merged[key] === "string") merged[key] = KeycapColors.cssColor(merged[key]);
        });
        return merged;
    }

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

    // Host input for the overlay: the name of the output holding the focused
    // workspace, or "" when DMS cannot name one right now. Deliberately not
    // CompositorService.getFocusedScreen(): that one answers screens[0] for an
    // unnamed focus, which the overlay cannot tell apart from a real move, and a
    // workspace switch would then yank the surface to another monitor.
    readonly property string focusedOutputName: BarWidgetService.getFocusedScreenName() || ""

    // Host input for the mute keycap's icon: whether the audio sink is muted.
    // The same physical key means "muted" after one press and "unmuted" after
    // the next, so the icon has to follow the sink rather than the key. DMS's
    // audio service is the source of truth (the mute keybind on this shell is
    // `dms ipc call audio mute`); it learns about the toggle from PipeWire a
    // moment after the keypress, so the icon settles just after the keycap
    // lands and keeps tracking the state for as long as the cap is on screen.
    // Written without optional chaining: the runtime engine supports `?.`, but
    // qmllint cannot parse it and the project keeps the lint gate honest.
    readonly property bool systemMuted: {
        const sink = AudioService.sink;
        return (sink && sink.audio) ? sink.audio.muted : false;
    }

    // ── input devices ───────────────────────────────────────────────────────
    // The Control Center widget and the settings page offer the same list, so
    // the scan lives here and both read it; device labels come from the kernel
    // (never translated), while the "auto" entry is UI text that each surface
    // prepends in its own language.
    readonly property string autoDeviceValue: "all"
    property var deviceOptions: []
    property bool devicesScanning: false

    function scanDevices() {
        const script = `
import os, json, re
include_pattern = "kanata"
exclude_pattern = ["power button", "video bus", "speaker", "headphone", "lid switch", "touchpad", "extra buttons", "uinput", "server", "hitune", "inphic", "instant", "webcam", "video"]
devs = []
if os.path.exists('/proc/bus/input/devices'):
    with open('/proc/bus/input/devices', encoding='utf-8', errors='replace') as f:
        content = f.read()
    sections = content.strip().split('\\n\\n')
    for section in sections:
        name = ""
        handlers = ""
        for line in section.split('\\n'):
            if line.startswith('N: Name='):
                m = re.search(r'Name="([^"]+)"', line)
                if m: name = m.group(1)
            elif line.startswith('H: Handlers='):
                handlers = line.split('=')[1]
        if name and handlers:
            lower_name = name.lower()
            is_included = include_pattern in lower_name
            is_excluded = any(x in lower_name for x in exclude_pattern)
            if 'kbd' in handlers and (is_included or ('mouse' not in handlers and not is_excluded)):
                event_match = re.search(r'event(\\d+)', handlers)
                if event_match:
                    event_path = "/dev/input/event" + event_match.group(1)
                    devs.append((name + " (" + event_path.split('/')[-1] + ")", event_path))
print(json.dumps(devs))
`;
        root.devicesScanning = true;
        Proc.runCommand("keyviz.scanDevices", ["python3", "-c", script], (stdout, exitCode) => {
            root.devicesScanning = false;
            if (exitCode !== 0) {
                console.warn("[Keyviz] scanDevices command failed with exit code:", exitCode, stdout);
                return;
            }
            try {
                root.deviceOptions = JSON.parse(stdout.trim())
                    .map(entry => ({label: entry[0], value: entry[1]}));
            } catch (e) {
                console.warn("[Keyviz] Failed to parse scanDevices output:", e, stdout);
                root.deviceOptions = [];
            }
        });
    }

    Component.onCompleted: {
        if (!pluginService.pluginInstances[pluginId]) {
            const newInstances = Object.assign({}, pluginService.pluginInstances);
            newInstances[pluginId] = root;
            pluginService.pluginInstances = newInstances;
        }
        checkTools();
        scanStyles();
        scanDevices();
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

    // Press/release a label (a key name or a mouse keycap such as "ScrollDown")
    // through the state machine, exactly as the keyboard path does.
    function pressLabel(label) {
        if (!label) return;
        root.applyKeyboard(KeyvizEvents.press(root.keyboardState, label, Date.now(), root.eventConfig));
    }

    function releaseLabel(label) {
        if (!label || root.keyboardState.heldKeys.indexOf(label) === -1) return;
        root.applyKeyboard(KeyvizEvents.release(root.keyboardState, label, Date.now()));
    }

    // The drag replaces the held button instead of leaving it on screen.
    function dropLabel(label) {
        if (!label) return;
        root.applyKeyboard(KeyvizEvents.dropKey(root.keyboardState, label));
    }

    // Hold a set of keycaps for a moment so the press animation can be seen
    // without touching the keyboard (`dms ipc keystrokes test`).
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
                root.releaseLabel(root.scrollDirection > 0 ? "ScrollDown" : "ScrollUp");
            root.scrollActive = false;
            root.scrollDirection = 0;
        }
    }

    // keyviz's trigger rule. `heldKeys` is maintained in physical press order by
    // the state machine and already contains the key being handled, which is
    // exactly what the rule needs:
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
            isCombo: g.keys.length > 1, count: g.keys.length ? g.keys[g.keys.length-1].count : 1,
            keys: g.keys.map(k => ({label: root.displayKeyLabel(k.label), keyId: k.label,
                                    count: k.count, animateIn: k.animateIn !== false}))}));
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

    // keyviz: key_event.ts onMouseButtonPress. The button is pressed as a key,
    // so a held modifier and the button end up in the same group and the button
    // keycap shows the pressed animation.
    function handleMouseClick(buttonName) {
        if (!root.enabled || !root.showMouseEvents || !root.eventAllowed(buttonName)) return;
        // Arm drag tracking: keyviz remembers the press position and only swaps
        // the button keycap for Drag once the threshold is passed.
        root.mouseHeldButton = buttonName;
        root.mouseDragging = false;
        root.dragDistanceX = 0;
        root.dragDistanceY = 0;
        root.pressLabel(buttonName);
    }

    // keyviz: key_event.ts onMouseButtonRelease. A drag release releases the
    // `Drag` keycap; a plain release releases the button itself.
    function endMouseDrag() {
        if (root.mouseDragging)
            root.releaseLabel("Drag");
        else
            root.releaseLabel(root.mouseHeldButton);
        root.mouseHeldButton = "";
        root.mouseDragging = false;
        root.dragDistanceX = 0;
        root.dragDistanceY = 0;
    }

    // keyviz: key_event.ts onMouseMove. Turns a held button into a Drag keycap.
    // Needs no cursor position -- POINTER_MOTION deltas are enough, and they
    // already carry libinput's acceleration (raw evdev does not).
    function startDrag() {
        root.mouseDragging = true;
        // The button keycap is replaced, not left behind (keyviz drops it from
        // pressedKeys and from the last group before pressing Drag).
        root.dropLabel(root.mouseHeldButton);
        root.pressLabel("Drag");
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

    // evtest fallback (single-device mode without libinput): the parsed axis of
    // one REL_* line. Motion only feeds drag tracking, which is armed by a
    // button press that already passed the gate, so it needs no filter check.
    function handleRelativeAxis(axis, value) {
        if (!root.enabled || !root.showMouseEvents) return;
        const dir = InputParse.wheelDirection(axis, value);
        if (dir !== 0) {
            if (root.scrollActive && root.scrollDirection === dir) {
                scrollLingerTimer.restart();
                return;
            }
            root.showScrollKey(dir);
        } else if (root.mouseHeldButton !== "" && (axis === "REL_X" || axis === "REL_Y")) {
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
            root.releaseLabel(root.scrollDirection > 0 ? "ScrollDown" : "ScrollUp");
        root.scrollActive = true;
        root.scrollDirection = dir;
        // The wheel is simulated as a key press (keyviz onMouseWheel), so a held
        // modifier and the wheel tick share one group: Ctrl + wheel renders as
        // the same kind of combination as Ctrl + click, and a held Super (niri's
        // workspace switch) stays put instead of being redrawn.
        root.pressLabel(dir > 0 ? "ScrollDown" : "ScrollUp");
        scrollLingerTimer.restart();
    }

    function handleScroll(dir) {
        if (!root.enabled || !root.showMouseEvents) return;
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
                // Parsing lives in core/inputParse.js: it is pure, and the
                // wheel direction / motion pair / button labels are exactly the
                // parts worth having under test. Mouse events are dropped here
                // rather than in the parser, because "show mouse events" is a
                // plugin setting, not a property of the input line.
                const parsed = InputParse.event(data);
                if (parsed === null) return;
                switch (parsed.kind) {
                case "key":
                    if (parsed.pressed) root.handleKeyPress(parsed.name);
                    else root.handleKeyRelease(parsed.name);
                    break;
                case "button":
                    if (!root.showMouseEvents) return;
                    // The press goes through handleMouseClick, which runs the
                    // filter gate and then presses the button as a key, so a
                    // rejected button never becomes "held".
                    if (parsed.pressed) root.handleMouseClick(parsed.button);
                    else root.endMouseDrag();
                    break;
                case "scroll":
                    root.handleScroll(parsed.direction);
                    break;
                case "motion":
                    if (root.showMouseEvents) root.accumulateDrag(parsed.dx, parsed.dy);
                    break;
                case "axis":
                    // Only reached in the evtest fallback; libinput reports
                    // motion and the wheel as POINTER_* lines instead.
                    root.handleRelativeAxis(parsed.axis, parsed.value);
                    break;
                }
            }
        }

        stderr: StdioCollector {}
    }

    // Floating overlay window instance
    KeyvizOverlay {
        id: overlay
        daemon: root
        // The overlay layer is shell-agnostic, so the two compositor facts it
        // needs are resolved here, in the DMS-facing entry point:
        //   focusedOutputName  which output holds the focused workspace ("" when
        //                      the compositor cannot name one right now)
        //   fallbackScreen     a screen to place the surface on before the first
        //                      output is committed
        focusedOutputName: root.focusedOutputName
        fallbackScreen: CompositorService.getFocusedScreen()
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
