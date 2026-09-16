import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.Services
import "keyvizStyle.js" as KeyvizStyle
import "overlayLayout.js" as OverlayLayout

// A transparent click-through stage. Only Keyviz's per-group backgrounds paint.
PanelWindow {
    id: overlayWindow
    property var daemon: null
    readonly property var config: daemon ? daemon.config : KeyvizStyle.settings({})
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
    readonly property var styleParams: daemon ? daemon.styleParams : ({type: "lowprofile", cornerRadius: 0.5})
    readonly property bool isOverlayVisible: daemon && daemon.historyList.length > 0
    readonly property bool exitPending: groups.count > 0
    readonly property bool horizontal: config.flexDirection === "row"
    readonly property string alignment: config.position

    readonly property var availableScreenNames: Quickshell.screens.map(candidate => candidate.name)
    readonly property var focusedScreen: CompositorService.getFocusedScreen()
    // Both "" (the default) and the explicit sentinel mean "the screen holding
    // the focused workspace". The value is an OUTPUT name, so switching
    // workspaces inside one output does not move the overlay.
    readonly property bool followsFocus: config.monitorName === ""
        || config.monitorName === OverlayLayout.followFocusValue()
    readonly property string resolvedScreenName: OverlayLayout.screenName(
        config.monitorName, focusedScreen ? focusedScreen.name : "", availableScreenNames)
    // Committing `resolvedScreenName` straight to `screen` makes the surface
    // chase every transient focus flip: a workspace switch can briefly report
    // another output before it settles, and each move reproduces the overlay
    // (groups re-enter, which reads as a jump). Require the value to hold still.
    property string targetScreenName: resolvedScreenName
    Timer {
        id: screenSettle
        interval: 250
        repeat: false
        running: overlayWindow.followsFocus && overlayWindow.targetScreenName !== overlayWindow.resolvedScreenName
        onTriggered: overlayWindow.targetScreenName = overlayWindow.resolvedScreenName
    }
    onFollowsFocusChanged: {
        if (!overlayWindow.followsFocus)
            overlayWindow.targetScreenName = overlayWindow.resolvedScreenName;
    }
    screen: Quickshell.screens.find(candidate => candidate.name === targetScreenName)
        ?? focusedScreen ?? Quickshell.screens[0]
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    WlrLayershell.layer: WlrLayershell.Overlay
    WlrLayershell.namespace: "dms:keyviz"
    WlrLayershell.keyboardFocus: WlrLayershell.None
    WlrLayershell.exclusiveZone: -1
    exclusionMode: ExclusionMode.Ignore
    mask: Region {}

    function isKeyHeld(label) { return daemon && (daemon.keyboardState.heldKeys.includes(label) || daemon.heldKeys.includes(label)); }
    ListModel { id: groups }
    function sync() {
        const list = daemon ? daemon.historyList : [];
        for (let i = groups.count - 1; i >= 0; i--) {
            if (!list.some(entry => entry.uid === groups.get(i).uid)) {
                if (!animDuration) groups.remove(i);
                else groups.setProperty(i, "dying", true);
            }
        }
        list.forEach(entry => {
            const keys = entry.keys || (entry.isCombo ? entry.text.split(" + ") : [entry.text]).map(label => ({label, count: entry.count || 1}));
            const value = {uid: entry.uid, keyData: JSON.stringify(keys), dying: false};
            let found = -1;
            for (let i = 0; i < groups.count; i++) if (groups.get(i).uid === entry.uid) {found = i; break;}
            if (found < 0) groups.append(value);
            else groups.set(found, value);
        });
    }
    function removeGroup(uid) {
        for (let i = 0; i < groups.count; i++) if (groups.get(i).uid === uid && groups.get(i).dying) { groups.remove(i); return; }
    }
    Component.onCompleted: sync()
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
            delegate: KeyvizGroup {
                id: group
                required property int index
                required property int uid
                required property string keyData
                required dying
                settings: overlayWindow
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
                Behavior on x {
                    enabled: group.entered && !layout.suppressPositionAnimation
                    NumberAnimation { duration: overlayWindow.animDuration / 3; easing.type: Easing.BezierSpline; easing.bezierCurve: [0.23,1,0.32,1,1,1] }
                }
                Behavior on y {
                    enabled: group.entered && !layout.suppressPositionAnimation
                    NumberAnimation { duration: overlayWindow.animDuration / 3; easing.type: Easing.BezierSpline; easing.bezierCurve: [0.23,1,0.32,1,1,1] }
                }
                onDyingChanged: if (dying) removal.restart()
                Timer { id: removal; interval: overlayWindow.animDuration; onTriggered: overlayWindow.removeGroup(group.uid) }
            }
        }
    }
}
