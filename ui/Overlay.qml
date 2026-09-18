import QtQuick
import Quickshell
import Quickshell.Wayland
import "../core/keyStyle.js" as KeyStyle
import "../core/overlayLayout.js" as OverlayLayout
import "../core/motion.js" as Motion
import "../core/listModelSync.js" as ListModelSync

// A transparent click-through stage. Only Keyviz's per-group backgrounds paint.
PanelWindow {
    id: overlayWindow
    property var daemon: null
    // ── host-provided screen inputs ──
    // The compositor lookup lives in the host (the DMS daemon), not here: this
    // file must run without DankMaterialShell, and the two facts the overlay
    // actually needs are just "which output holds the focused workspace" and "a
    // screen to fall back on before the first commit".
    // "" means the host cannot name the focused output right now.
    property string focusedOutputName: ""
    property var fallbackScreen: null
    readonly property var config: daemon ? daemon.config : KeyStyle.settings({})
    readonly property real capFontSize: config.fontSize
    readonly property string animType: config.animationType
    readonly property int animDuration: animType === "none" ? 0 : config.animationDuration
    readonly property int animEasing: Easing.OutQuint
    readonly property string textVariant: config.textVariant
    readonly property string textCaps: config.textCaps
    readonly property string textAlignment: config.textAlignment
    readonly property string iconAlignment: config.iconAlignment
    readonly property bool showIcon: config.showIcon
    readonly property bool showSymbol: config.showSymbol
    readonly property bool showPressCount: config.showPressCount
    readonly property bool groupBackground: config.groupBackground
    readonly property color groupBackgroundColor: daemon ? daemon.groupBackgroundColor : "#99ffffff"
    // Host-supplied audio state for the mute keycap's icon. Deliberately `var`:
    // an absent host must stay `undefined` (which keeps the upstream static
    // icon) rather than coerce to `false`, which would claim "unmuted".
    readonly property var systemMuted: daemon ? daemon.systemMuted : undefined
    readonly property var styleParams: daemon ? daemon.styleParams : ({type: "lowprofile", cornerRadius: 0.5})
    readonly property bool isOverlayVisible: daemon && daemon.historyList.length > 0
    readonly property bool exitPending: groups.count > 0
    readonly property bool horizontal: config.flexDirection === "row"
    readonly property string alignment: config.position

    readonly property var availableScreenNames: Quickshell.screens.map(candidate => candidate.name)
    // Automatic mode: the surface sits on whatever output holds the focused
    // workspace. The value is an OUTPUT name, so switching workspaces inside one
    // output does not move the overlay. The rule itself lives in
    // core/overlayLayout.js -- the settings page asks the same function to render
    // "Display", and the second copy that used to live here is what let the
    // dropdown and the overlay disagree about what counted as automatic.
    readonly property bool followsFocus: OverlayLayout.followsFocus(config.monitorName)
    // "" means "the compositor cannot name the focused output right now": hold
    // the output we are already on instead of guessing. See the note on
    // OverlayLayout.focusedTarget -- a workspace switch can drop the focused
    // output for a moment, and a lookup that answers "the first screen" cannot
    // be told apart from a real move to the first output.
    readonly property string resolvedScreenName: OverlayLayout.focusedTarget(
        followsFocus, config.monitorName, focusedOutputName, availableScreenNames)
    // Committing `resolvedScreenName` straight to `screen` makes the surface
    // chase every transient focus flip: each move reproduces the overlay
    // (every keycap re-enters, which reads as a refresh). Require the value to
    // hold still for the whole interval, and never follow an unknown focus.
    property string targetScreenName: ""

    function commitScreen() {
        if (!overlayWindow.resolvedScreenName) return;
        if (overlayWindow.resolvedScreenName === overlayWindow.targetScreenName) return;
        overlayWindow.targetScreenName = overlayWindow.resolvedScreenName;
    }

    Timer {
        id: screenSettle
        interval: 250
        repeat: false
        onTriggered: overlayWindow.commitScreen()
    }

    onResolvedScreenNameChanged: {
        // Unknown focus (a workspace switch in flight): keep the current output.
        if (!overlayWindow.resolvedScreenName || overlayWindow.resolvedScreenName === overlayWindow.targetScreenName) {
            screenSettle.stop();
            return;
        }
        // First placement and a pinned output must land immediately.
        if (!overlayWindow.targetScreenName || !overlayWindow.followsFocus) {
            screenSettle.stop();
            overlayWindow.commitScreen();
            return;
        }
        // Any change re-arms the timer, so only a value that survives the whole
        // interval is committed.
        screenSettle.restart();
    }

    onFollowsFocusChanged: {
        if (!overlayWindow.followsFocus) {
            screenSettle.stop();
            overlayWindow.commitScreen();
        }
    }
    screen: Quickshell.screens.find(candidate => candidate.name === targetScreenName)
        ?? fallbackScreen ?? Quickshell.screens[0]
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    WlrLayershell.layer: WlrLayershell.Overlay
    WlrLayershell.namespace: "dms:keystrokes"
    WlrLayershell.keyboardFocus: WlrLayershell.None
    WlrLayershell.exclusiveZone: -1
    exclusionMode: ExclusionMode.Ignore
    mask: Region {}

    function isKeyHeld(label) { return daemon && (daemon.keyboardState.heldKeys.includes(label) || daemon.heldKeys.includes(label)); }
    // A re-created overlay window (a real output change, or a reload that
    // leaves the daemon alive) must not replay entrance animations for keycaps
    // that are already on screen. The daemon outlives the window, so it can
    // tell a rebuild apart from a first run.
    property bool firstPaint: true
    property bool restoring: false

    ListModel { id: groups }
    function sync() {
        const restore = overlayWindow.firstPaint && daemon && daemon.overlayRendered;
        overlayWindow.firstPaint = false;
        if (daemon) daemon.overlayRendered = true;
        overlayWindow.restoring = restore;
        ListModelSync.reconcile(groups, daemon ? daemon.historyList : [], {
            keyField: "uid",
            keyOf: entry => entry.uid,
            animate: animDuration > 0,
            valueOf: entry => {
                const source = entry.keys || (entry.isCombo ? entry.text.split(" + ") : [entry.text]).map(label => ({label, count: entry.count || 1}));
                // Restored caps were already on screen before the rebuild: render
                // them at rest instead of re-playing the entrance variant.
                const keys = restore ? source.map(key => Object.assign({}, key, {animateIn: false})) : source;
                return {uid: entry.uid, keyData: JSON.stringify(keys), dying: false};
            }
        });
        overlayWindow.restoring = false;
    }
    function removeGroup(uid) {
        ListModelSync.removeByKey(groups, "uid", uid);
    }
    Component.onCompleted: { commitScreen(); sync(); }
    Connections { target: overlayWindow.daemon; function onHistoryListChanged() { overlayWindow.sync(); } }

    Item {
        id: layout
        anchors.fill: parent
        readonly property real gap: overlayWindow.capFontSize * 0.5
        // Key by the model's stable uid. Repeater updates delegate indices before
        // itemRemoved, so an index-keyed cache can briefly send the next item to
        // the removed item's old position.
        property var groupTargets: ({})
        property bool suppressPositionAnimation: false

        function requestGeometry() {
            recomputeGeometry(true);
        }

        function recomputeGeometry(animate) {
            const shouldAnimate = animate === undefined ? true : animate;
            if (!shouldAnimate)
                suppressPositionAnimation = true;
            const sizes = [];
            const uids = [];
            for (let i = 0; i < repeater.count; i++) {
                const item = repeater.itemAt(i);
                sizes.push({width: item ? item.width : 0, height: item ? item.height : 0});
                uids.push(item ? item.uid : -1);
            }
            const positions = OverlayLayout.targets(
                overlayWindow.horizontal, overlayWindow.alignment,
                overlayWindow.config.marginX, overlayWindow.config.marginY,
                width, height, sizes, gap);
            groupTargets = OverlayLayout.byId(uids, positions);
            if (!shouldAnimate)
                Qt.callLater(() => suppressPositionAnimation = false);
        }

        // A window moved to another output must land directly at that output's
        // anchored position. Reflow animation is reserved for history changes.
        onWidthChanged: recomputeGeometry(false)
        onHeightChanged: recomputeGeometry(false)
        onGapChanged: requestGeometry()
        Connections {
            target: overlayWindow
            function onHorizontalChanged() { layout.requestGeometry(); }
            function onAlignmentChanged() { layout.requestGeometry(); }
            function onConfigChanged() { layout.requestGeometry(); }
        }
        Repeater {
            id: repeater
            model: groups
            // Repeater emits these after its delegate/model change is complete.
            // Position immediately so a new group never renders for one frame at
            // (0, 0); later content-size changes remain frame-coalesced below.
            onItemAdded: layout.recomputeGeometry()
            onItemRemoved: layout.recomputeGeometry()
            delegate: Group {
                id: group
                required property int index
                required property int uid
                required property string keyData
                required dying
                settings: overlayWindow
                restored: overlayWindow.restoring
                keys: JSON.parse(keyData)
                latest: daemon && daemon.historyList.length > 0 && uid === daemon.historyList[daemon.historyList.length-1].uid
                readonly property bool hasTarget: Object.prototype.hasOwnProperty.call(layout.groupTargets, String(uid))
                readonly property var targetGeometry: hasTarget
                    ? layout.groupTargets[String(uid)] : ({x: 0, y: 0})
                visible: hasTarget
                x: targetGeometry.x
                y: targetGeometry.y
                onContentGeometryChanged: layout.requestGeometry()
                // `entered` is still false during the synchronous first layout,
                // so only subsequent history reflows animate.
                // Reflow only: a moved group slides to its new position, while
                // the first placement lands directly (see `entered`).
                Behavior on x {
                    enabled: group.entered && !layout.suppressPositionAnimation
                    NumberAnimation {
                        duration: Motion.reflowDuration(overlayWindow.animDuration)
                        easing.type: Easing.BezierSpline
                        easing.bezierCurve: Motion.enterCurve()
                    }
                }
                Behavior on y {
                    enabled: group.entered && !layout.suppressPositionAnimation
                    NumberAnimation {
                        duration: Motion.reflowDuration(overlayWindow.animDuration)
                        easing.type: Easing.BezierSpline
                        easing.bezierCurve: Motion.enterCurve()
                    }
                }
                onDyingChanged: if (dying) removal.restart()
                Timer { id: removal; interval: overlayWindow.animDuration; onTriggered: overlayWindow.removeGroup(group.uid) }
            }
        }
    }
}
