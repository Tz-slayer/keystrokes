import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.Common
import qs.Widgets
import "./dms-common"
import "KeyIcons.js" as KeyIcons

// Keyviz-style keystroke overlay.
// Animation model (mirrors mulaRahul/keyviz):
//   - Each group (history row) fades in/out.
//   - Each keycap plays its own entry animation: none/fade/zoom/float/slide,
//     with Easing.OutQuint (keyviz easeOutQuint) and a small per-key stagger.
//   - Remaining rows shift smoothly (animationDuration/3, like keyviz layout).
//   - Rows animate out before removal (exit variant of the same preset).
//   - While a key is held down its keycap stays depressed (keyviz isPressed):
//     minimal scales to 0.95, the other skins slide the cap face into its base
//     wall. Always 100ms easeInOutExpo, independent of animationDuration.
PanelWindow {
    id: overlayWindow

    property var daemon: null


    // ── keyviz animation settings ──
    readonly property string animType: daemon ? daemon.animationType : "fade"
    readonly property int animDuration: daemon ? daemon.animationDuration : 250
    // keyviz offsets float/slide by the font size
    readonly property real animDistance: daemon ? daemon.fontSize : 24

    readonly property bool isCentered: daemon ? (daemon.position === "bottom_center" || daemon.position === "top_center") : false
    // Optional text between caps. keyviz uses none; empty string here means
    // "gap only", which is the keyviz look.
    readonly property string customSeparator: daemon ? daemon.customSeparator : ""
    // keyviz: key_style.ts -> layout.showPressCount (default true)
    readonly property bool showPressCount: daemon ? daemon.showPressCount : true
    readonly property bool isOverlayVisible: daemon && (daemon.displayText !== "" || (daemon.showModifierStatus && (daemon.ctrlActive || daemon.altActive || daemon.shiftActive || daemon.superActive)))

    // Keep the window alive briefly so exit animations can finish
    property bool exitPending: false
    onIsOverlayVisibleChanged: {
        if (isOverlayVisible) {
            exitPending = false;
            exitTimer.stop();
        } else {
            exitPending = true;
            exitTimer.restart();
        }
    }

    Timer {
        id: exitTimer
        interval: overlayWindow.animDuration + 120
        onTriggered: overlayWindow.exitPending = false
    }

    // Dynamic positioning based on settings (e.g. "bottom_center", "top_left", etc.)
    anchors.bottom: daemon ? daemon.position.includes("bottom") : false
    anchors.top: daemon ? daemon.position.includes("top") : false
    anchors.left: isCentered || (daemon ? daemon.position.includes("left") : false)
    anchors.right: isCentered || (daemon ? daemon.position.includes("right") : false)

    // Wayland specific window properties
    WlrLayershell.layer: WlrLayershell.Overlay
    WlrLayershell.keyboardFocus: WlrLayershell.None // Absolutely critical: do not steal focus
    WlrLayershell.exclusiveZone: -1
    exclusionMode: ExclusionMode.Ignore

    WlrLayershell.margins {
        left: daemon ? daemon.marginSize : 24
        right: daemon ? daemon.marginSize : 24
        top: daemon ? daemon.marginSize : 24
        bottom: daemon ? daemon.marginSize : 24
    }

    // Click-through. This window is display-only, but when `position` is a
    // centred one (the default, "bottom_center") `implicitWidth` below is the
    // whole screen width, so the surface spans a full-width band and would
    // otherwise swallow every pointer event along that edge.
    //
    // `WlrLayershell.keyboardFocus: None` above does not help here -- it opts
    // out of *keyboard* focus only. Quickshell's `mask` is the pointer lever
    // (QsWindow.mask: "The clickthrough mask. Defaults to null. If non null
    // then the clickable areas of the window will be determined by the
    // provided region."). An empty Region makes nothing clickable, so all
    // clicks and hover pass through to whatever is underneath. This is also
    // how DMS implements its own click-through desktop widgets
    // (DesktopPluginWrapper.qml: `mask: root.clickThrough ? emptyMask : null`).
    Region { id: emptyMask }

    mask: emptyMask

    // Dummy text to calculate a unified height based on current font size
    StyledText {
        id: dummyText
        visible: false
        font.pixelSize: daemon ? daemon.fontSize : 24
        font.bold: true
        text: "A"
    }

    readonly property real unifiedHeight: dummyText.implicitHeight + Theme.spacingXS * 2

    function resolveColor(mode, custom) {
        if (mode === "custom") return custom ? Qt.color(custom) : Theme.primary;
        if (mode === "default") return Theme.primary;
        return Theme.roleColor(mode);
    }

    function getOverlayKeyText(keyText) {
        if (!daemon || !daemon.macSymbols) return keyText;
        const macMap = {
            "Ctrl": "⌃",
            "Alt": "⌥",
            "Shift": "⇧",
            "Super": "⌘",
            "Enter": "⏎",
            "Backspace": "⌫",
            "Tab": "⇥",
            "Esc": "⎋",
            "Space": "␣"
        };
        return macMap[keyText] || keyText;
    }

    // True while `label` is still physically held down (keyviz pressedKeys).
    // Called from keycap bindings, so it re-evaluates when heldKeys changes.
    function isKeyHeld(label) {
        const held = daemon ? daemon.heldKeys : null;
        if (!held) return false;
        for (let i = 0; i < held.length; i++) {
            if (held[i] === label) return true;
        }
        return false;
    }

    readonly property color resolvedTextColor: daemon ? overlayWindow.resolveColor(daemon.textColorMode, daemon.textColorCustom) : Theme.primary
    readonly property color resolvedKeycapTextColor: daemon ? overlayWindow.resolveColor(daemon.keycapTextColorMode, daemon.keycapTextColorCustom) : Theme.primary
    readonly property bool roundedKeycaps: daemon ? daemon.roundedKeycaps : true
    readonly property color resolvedBgColor: {
        // Elevated theme container instead of flat surface: follows the
        // DMS light/dark palette and reads as a proper floating card.
        if (!daemon) return Theme.withAlpha(Theme.surfaceContainerHigh, 0.95);
        if (daemon.bgColorMode === "default") return Theme.withAlpha(Theme.surfaceContainerHigh, 0.95);
        if (daemon.bgColorMode === "custom") return Qt.color(daemon.bgColorCustom);
        return Theme.roleColor(daemon.bgColorMode);
    }

    // Match window size to container size
    implicitWidth: isCentered ? (screen ? screen.width : 1920) : cardContainer.width
    implicitHeight: cardContainer.height
    color: "transparent"

    // ── history model mirror ──
    // Mirrors daemon.historyList (JS array) into a ListModel so rows can be
    // animated out (dying) before actually being removed from the positioner.
    // Removal is per-row: each delegate starts its own death timer, so rapid
    // keystrokes can never defer each other's cleanup.
    ListModel { id: historyModel }

    function removeUid(uid) {
        for (let i = 0; i < historyModel.count; i++) {
            if (historyModel.get(i).uid === uid) {
                historyModel.remove(i);
                return;
            }
        }
    }

    function syncHistoryModel() {
        const list = daemon ? daemon.historyList : [];

        // Single-line mode replaces in place (like keyviz replace mode):
        // no exit row is kept around, so the card never grows a second row.
        const singleLine = daemon && daemon.historyLimit === 1;
        if (singleLine && list.length === 1 && historyModel.count === 1) {
            const current = historyModel.get(0);
            const e = list[0];
            if (!current.dying && current.uid !== e.uid) {
                historyModel.set(0, { uid: e.uid, lineText: e.text, isCombo: e.isCombo,
                                      count: e.count ?? 1, dying: false });
                return;
            }
        }

        for (let i = 0; i < historyModel.count; i++) {
            const entry = historyModel.get(i);
            if (!entry.dying && !list.some(e => e.uid === entry.uid))
                historyModel.setProperty(i, "dying", true);
        }

        for (let j = 0; j < list.length; j++) {
            const e = list[j];
            let found = false;
            for (let i = 0; i < historyModel.count; i++) {
                const entry = historyModel.get(i);
                if (entry.uid === e.uid) {
                    found = true;
                    if (entry.lineText !== e.text)
                        historyModel.setProperty(i, "lineText", e.text);
                    if (entry.count !== (e.count ?? 1))
                        historyModel.setProperty(i, "count", e.count ?? 1);
                    break;
                }
            }
            if (!found)
                historyModel.append({ uid: e.uid, lineText: e.text, isCombo: e.isCombo,
                                      count: e.count ?? 1, dying: false });
        }
    }

    Component.onCompleted: syncHistoryModel()

    Connections {
        target: overlayWindow.daemon
        function onHistoryListChanged() {
            overlayWindow.syncHistoryModel();
        }
    }

    // Keyviz easing for all overlay animations: easeOutQuint
    readonly property int animEasing: Easing.OutQuint

    // ── keycap skin params, resolved by the daemon (built-in or user JSON) ──
    readonly property real capFontSize: daemon ? daemon.fontSize : 24
    readonly property var styleParams: daemon && daemon.styleParams
        ? daemon.styleParams
        : ({ type: "mechanical", baseColor: "#ffffff", secondaryColor: "#1a1a1a",
             textColor: "#1a1a1a", borderColor: "#1a1a1a",
             borderWidth: 0, cornerRadius: 0.45, gradient: false, shadowOpacity: 0 })

    // ── keyviz press animation ──
    // keyviz animates every keycap while its key is held down
    // (src/components/keycaps/*.tsx), always over 0.1s with easeInOutExpo and
    // independently of the enter/exit animation duration setting:
    //   minimal    -> scale 0.95                       (minimal.tsx)
    //   elevated   -> cap face slides down 0.25em      (lowprofile.tsx)
    //   mechanical -> cap face slides down 0.15em      (pbt.tsx)
    // Qt's Easing.BezierSpline wants the curve as points rather than the four
    // CSS numbers: [x1, y1, x2, y2, endX, endY]. These values were verified to
    // reproduce cubic-bezier(0.86, 0.00, 0.07, 1.00) exactly.
    component PressAnimation: NumberAnimation {
        duration: 100
        easing.type: Easing.BezierSpline
        easing.bezierCurve: [0.86, 0.0, 0.07, 1.0, 1.0, 1.0]
    }

    // Keycap renderer replicating the keyviz keycap layouts
    // (src/components/keycaps/base.tsx):
    //   icon variant   - icon on top + label at the bottom (arrows: icon only);
    //                    modifier icons align right (keyviz iconAlignment "flex-end")
    //   symbol variant - secondary symbol stacked above the label, centered
    //   text variant   - plain centered label
    // Skins: minimal (no body) / elevated (raised cap on a base wall + drop
    // shadow) / mechanical (cap face on a dark base wall).
    // All icon/glyph/label data comes from KeyIcons.js (ported from keymaps.ts).
    component Keycap: Item {
        id: keycap

        property string label: ""
        // true while this key is still physically held down (keyviz isPressed)
        property bool pressed: false
        // Consecutive repeat count; 0 (or 1) hides the keyviz press-count badge.
        property int pressCount: 0

        readonly property real fs: overlayWindow.capFontSize
        readonly property var sp: overlayWindow.styleParams
        readonly property bool isMinimal: sp.type === "minimal"
        readonly property bool isElevated: sp.type === "elevated"
        readonly property bool isMechanical: sp.type === "mechanical"
        readonly property real capRadius: Math.max(0, (sp.cornerRadius ?? 0.45)) * fs
        // Height of the base wall that stays visible below the cap face at rest.
        // keyviz lowprofile leaves 0.25em; pbt leaves more, but 0.25em keeps the
        // dark band from dominating the keycap. Must stay >= pressDepth, or the
        // face would sink past the bottom of the base.
        readonly property real wallHeight: isMinimal ? 0 : fs * 0.25
        // How far the cap face travels down while the key is held.
        readonly property real pressDepth: !pressed
            ? 0
            : (isMechanical ? fs * 0.15 : (isElevated ? fs * 0.25 : 0))

        readonly property var kd: KeyIcons.display(label)
        readonly property bool hasIcon: kd.icon !== undefined
        readonly property bool iconOnly: hasIcon && kd.category === "arrow"
        readonly property bool iconLayout: hasIcon && !iconOnly
        readonly property bool symbolLayout: !hasIcon && kd.symbol !== undefined
        readonly property bool alignRight: kd.category === "modifier"
        readonly property string displayLabel: kd.shortLabel !== undefined ? kd.shortLabel : kd.label

        // Uniform size: every keycap is the same width, like a physical key.
        // keyviz instead sets `minWidth` and lets the cap grow for long labels
        // (lowprofile.tsx:25 `minWidth: text.size * (isModifier ? 2.5 : 2.25)`),
        // which makes a row of caps look ragged. Here the width is fixed and
        // the label scales down to fit instead (see the fontSizeMode usage on
        // the label texts below).
        width: fs * 2.25
        height: {
            if (isMinimal)
                return (iconLayout || iconOnly) ? fs * 2.25 : overlayWindow.unifiedHeight;
            // keyviz lowprofile: 2.5em container = 2.25em face + 0.25em wall.
            // (pbt uses 2.75em/2.2em; we use the lowprofile ratio for both skins
            // so the dark band stays slim.) The press animation stays inside the
            // layout box because the face never travels further than the wall.
            return fs * 2.5;
        }

        // minimal has no cap body to sink, so keyviz scales the whole keycap
        scale: (isMinimal && pressed) ? 0.95 : 1
        Behavior on scale {
            PressAnimation {}
        }

        // ── elevated: soft drop shadow under the whole cap ──
        // Sits behind the base wall, so its top edge has to track the cap face
        // as well — otherwise it peeks out above the base once the cap sinks.
        Rectangle {
            visible: keycap.isElevated
            anchors.fill: parent
            anchors.topMargin: keycap.fs * 0.15 + keycap.pressDepth
            radius: keycap.capRadius
            color: Qt.rgba(0, 0, 0, keycap.sp.shadowOpacity ?? 0.25)
        }

        // ── base wall: the socket the cap face sinks into ──
        // Bottom-anchored and only as tall as the face plus the visible wall, so
        // its top edge moves down together with the face. A full-height base
        // would be exposed above the face the moment the face moves down.
        // keyviz builds it the same way: lowprofile's base is
        // `position: absolute; bottom: 0` and exactly as tall as the face.
        Rectangle {
            id: baseWall
            visible: keycap.isMechanical || keycap.isElevated
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            height: keycap.height - keycap.pressDepth
            radius: keycap.capRadius
            color: keycap.sp.secondaryColor
            border.width: keycap.sp.borderWidth ?? 0
            border.color: keycap.sp.borderColor

            Behavior on height {
                PressAnimation {}
            }
        }

        // ── moving cap face: carries the cap body and its content ──
        Item {
            id: capFace
            width: parent.width
            height: parent.height
            y: keycap.pressDepth
            Behavior on y {
                PressAnimation {}
            }

            // ── mechanical: flat cap face, full width, wall shows at the bottom ──
            Rectangle {
                visible: keycap.isMechanical
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                height: parent.height - keycap.wallHeight
                radius: keycap.capRadius
                color: keycap.sp.baseColor
                border.width: keycap.sp.borderWidth ?? 0
                border.color: keycap.sp.borderColor
            }

            // ── elevated: raised cap body ──
            Rectangle {
                visible: keycap.isElevated
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                height: parent.height - keycap.wallHeight
                radius: keycap.capRadius
                color: keycap.sp.baseColor
                border.width: keycap.sp.borderWidth ?? 0
                border.color: keycap.sp.borderColor
                gradient: keycap.sp.gradient ? elevatedGrad : null

                Gradient {
                    id: elevatedGrad
                    GradientStop { position: 0.0; color: Qt.lighter(keycap.sp.baseColor, 1.08) }
                    GradientStop { position: 1.0; color: keycap.sp.baseColor }
                }
            }

            // ── icon variant: arrows show the icon alone ──
            KeyIcon {
                visible: keycap.iconOnly
                name: keycap.kd.icon || ""
                color: keycap.sp.textColor
                size: keycap.fs * 0.8
                anchors.centerIn: parent
                anchors.verticalCenterOffset: -keycap.wallHeight / 2
            }

            // ── icon variant: icon on top (right-aligned for modifiers) ──
            KeyIcon {
                visible: keycap.iconLayout
                name: keycap.kd.icon || ""
                color: keycap.sp.textColor
                size: keycap.fs * 0.5
                anchors.top: parent.top
                anchors.topMargin: keycap.fs * 0.35
                anchors.right: keycap.alignRight ? parent.right : undefined
                anchors.rightMargin: keycap.fs * 0.3
                anchors.horizontalCenter: keycap.alignRight ? undefined : parent.horizontalCenter
            }

            // ── icon variant: label at the bottom ──
            StyledText {
                id: capLabel
                visible: keycap.iconLayout
                anchors.bottom: parent.bottom
                anchors.bottomMargin: keycap.wallHeight + keycap.fs * 0.3
                anchors.right: keycap.alignRight ? parent.right : undefined
                anchors.rightMargin: keycap.fs * 0.3
                anchors.horizontalCenter: keycap.alignRight ? undefined : parent.horizontalCenter
                width: keycap.width - keycap.fs * 0.28
                fontSizeMode: Text.HorizontalFit
                minimumPixelSize: Math.round(keycap.fs * 0.26)
                elide: Text.ElideRight
                horizontalAlignment: keycap.alignRight ? Text.AlignRight : Text.AlignHCenter
                font.pixelSize: keycap.fs * 0.5
                color: keycap.sp.textColor
                text: keycap.displayLabel
            }

            // ── symbol variant: symbol stacked over the label, centered ──
            Column {
                id: symbolStack
                visible: keycap.symbolLayout
                anchors.centerIn: parent
                anchors.verticalCenterOffset: -keycap.wallHeight / 2
                spacing: keycap.fs * 0.08

                StyledText {
                    id: capSymbol
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: keycap.width - keycap.fs * 0.28
                    fontSizeMode: Text.HorizontalFit
                    minimumPixelSize: Math.round(keycap.fs * 0.26)
                    elide: Text.ElideRight
                    horizontalAlignment: Text.AlignHCenter
                    font.pixelSize: keycap.fs * 0.56
                    color: keycap.sp.textColor
                    text: keycap.kd.symbol || ""
                }
                StyledText {
                    id: capSub
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: keycap.width - keycap.fs * 0.28
                    fontSizeMode: Text.HorizontalFit
                    minimumPixelSize: Math.round(keycap.fs * 0.26)
                    elide: Text.ElideRight
                    horizontalAlignment: Text.AlignHCenter
                    font.pixelSize: keycap.fs * 0.56
                    font.weight: Font.DemiBold
                    color: keycap.sp.textColor
                    text: keycap.displayLabel
                }
            }

            // ── text variant: plain centered label ──
            StyledText {
                id: capPlain
                visible: !keycap.hasIcon && !keycap.symbolLayout
                anchors.centerIn: parent
                anchors.verticalCenterOffset: -keycap.wallHeight / 2
                // Keep the cap a fixed width: shrink the label instead of
                // letting a long one stretch the cap.
                width: keycap.width - keycap.fs * 0.28
                fontSizeMode: Text.HorizontalFit
                minimumPixelSize: Math.round(keycap.fs * 0.3)
                elide: Text.ElideRight
                horizontalAlignment: Text.AlignHCenter
                font.pixelSize: keycap.fs
                color: keycap.sp.textColor
                text: keycap.displayLabel
            }
        }

        // ── keyviz press-count badge (press-count.tsx) ──
        // An inverted badge pinned to the top-right corner of the keycap and
        // translated a quarter of its own size outwards. keyviz shows it only
        // on the last key of the newest group, and only once that key has been
        // pressed more than once in a row.
        Rectangle {
            id: pressBadge

            readonly property real d: keycap.fs * 0.75
            readonly property bool active: keycap.pressCount > 1 && overlayWindow.showPressCount

            width: d
            height: d
            radius: d / 2                     // keyviz border.radius default 0.5 -> 50%
            // Inverted: painted with the key's text colour, number in the cap colour.
            color: keycap.sp.textColor
            z: 10                             // keyviz: "z-10"
            visible: active
            scale: active ? 1 : 0.01
            anchors.top: parent.top
            anchors.right: parent.right
            anchors.topMargin: -d / 4
            anchors.rightMargin: -d / 4

            Behavior on scale {
                enabled: overlayWindow.animType !== "none"
                NumberAnimation {
                    duration: overlayWindow.animDuration / 2
                    easing.type: overlayWindow.animEasing
                }
            }

            StyledText {
                anchors.centerIn: parent
                font.pixelSize: keycap.fs * 0.4
                font.bold: true
                // minimal has no cap body, so fall back to the card background.
                color: keycap.sp.baseColor ?? overlayWindow.resolvedBgColor
                text: String(keycap.pressCount)
            }
        }
    }

    // Animated unit: wraps a keycap (+ separator), plain text, or mouse
    // indicator. Plays the keyviz entry variant when created, with a small
    // stagger based on its position inside the group.
    component AnimBox: Item {
        id: animBox

        default property alias contentData: contentRow.data

        property int unitIndex: 0
        // Set by the combo delegate when the cap it is about to build is already
        // on screen for the current row. Such a cap must not replay the entry
        // animation at all.
        //
        // keyviz gets this for free: each cap is keyed on the key name and React
        // keeps the unchanged elements mounted (key-overlay.tsx:120), so holding
        // Ctrl and going from Ctrl+I to Ctrl+H only animates H. A Repeater over a
        // plain JS array cannot do that -- reassigning the array rebuilds every
        // delegate -- so the combo delegate tells us here whether this cap was
        // already visible.
        // True when this cap was already on screen for the current row, so it
        // must not replay the entry animation.
        //
        // keyviz gets this for free: each cap is keyed on the key name and React
        // keeps the unchanged elements mounted (key-overlay.tsx:120), so holding
        // Ctrl and going from Ctrl+I to Ctrl+H only animates H. A Repeater over a
        // plain JS array cannot do that -- reassigning the array rebuilds every
        // delegate -- so the combo delegate supplies a predicate below.
        //
        // This is deliberately set imperatively (in Component.onCompleted), not
        // from a binding: the predicate also mutates the row's registry, and a
        // binding that writes to a property it reads is a binding loop.
        property bool reused: false
        property bool entryDone: overlayWindow.animType === "none"
        // Optional predicate returning true when this cap is already on screen.
        // Called exactly once, during construction.
        property var alreadyEntered: null
        // Emitted once the cap has actually appeared, so the registry can record
        // it. Not emitted when the cap was reused.
        signal entered

        width: contentRow.implicitWidth
        height: contentRow.implicitHeight

        Row {
            id: contentRow
            spacing: (daemon && daemon.macSymbols) ? Theme.spacingXS : Theme.spacingS
        }

        opacity: entryDone ? 1 : 0
        scale: overlayWindow.animType === "zoom" ? (entryDone ? 1 : 0) : 1

        transform: Translate {
            x: (overlayWindow.animType === "slide" && !animBox.entryDone) ? overlayWindow.animDistance : 0
            y: (overlayWindow.animType === "float" && !animBox.entryDone) ? overlayWindow.animDistance : 0

            Behavior on x {
                NumberAnimation {
                    duration: overlayWindow.animDuration
                    easing.type: overlayWindow.animEasing
                }
            }
            Behavior on y {
                NumberAnimation {
                    duration: overlayWindow.animDuration
                    easing.type: overlayWindow.animEasing
                }
            }
        }

        // `enabled: !reused` is what actually stops a reused cap from fading:
        // `opacity` is initialised to 0 before onCompleted runs, so flipping
        // `entryDone` would otherwise drive this Behavior and fade the cap back
        // in. With it disabled the value snaps straight to 1.
        Behavior on opacity {
            enabled: !animBox.reused
            NumberAnimation {
                duration: overlayWindow.animDuration
                easing.type: overlayWindow.animEasing
            }
        }
        Behavior on scale {
            enabled: !animBox.reused
            NumberAnimation {
                duration: overlayWindow.animDuration
                easing.type: overlayWindow.animEasing
            }
        }

        Timer {
            id: entryTimer
            interval: animBox.unitIndex * 40 + 1
            onTriggered: {
                animBox.entryDone = true;
                animBox.entered();
            }
        }

        Component.onCompleted: {
            if (animBox.alreadyEntered !== null && animBox.alreadyEntered()) {
                // Order matters: flip `reused` first so the Behaviors above are
                // disabled, then `entryDone`, so opacity/scale snap to their
                // final values instead of fading in from 0.
                animBox.reused = true;
                animBox.entryDone = true;
            } else {
                entryTimer.restart();
            }
        }
    }

    // Modifier pill with keyviz-style highlight pop in/out
    component ModifierPill: StyledRect {
        id: pill

        required property bool active
        required property string label

        height: overlayWindow.unifiedHeight
        width: pillText.implicitWidth + Theme.spacingM * 2
        radius: overlayWindow.roundedKeycaps ? height / 2 : 0
        color: Theme.primaryContainer
        border.color: Theme.withAlpha(Theme.outline, 0.15)
        border.width: 1

        visible: opacity > 0.01
        opacity: active ? 1 : 0
        scale: active ? 1 : 0.8

        Behavior on opacity {
            NumberAnimation {
                duration: overlayWindow.animDuration / 2
                easing.type: overlayWindow.animEasing
            }
        }
        Behavior on scale {
            NumberAnimation {
                duration: overlayWindow.animDuration / 2
                easing.type: overlayWindow.animEasing
            }
        }

        StyledText {
            id: pillText
            anchors.centerIn: parent
            font.pixelSize: daemon ? daemon.fontSize - 4 : 20
            font.bold: true
            color: Theme.onPrimary
            text: overlayWindow.getOverlayKeyText(pill.label)
        }
    }

    StyledRect {
        id: cardContainer

        // Match contents with padding
        width: contentColumn.implicitWidth + Theme.spacingXL * 2
        height: contentColumn.implicitHeight + Theme.spacingL * 2

        anchors.top: (daemon && daemon.position.includes("top")) ? parent.top : undefined
        anchors.bottom: (daemon && daemon.position.includes("bottom")) ? parent.bottom : undefined
        anchors.left: (daemon && daemon.position.includes("left")) ? parent.left : undefined
        anchors.right: (daemon && daemon.position.includes("right")) ? parent.right : undefined
        anchors.horizontalCenter: isCentered ? parent.horizontalCenter : undefined

        // Smooth size changes while groups enter/exit
        Behavior on width {
            NumberAnimation {
                duration: overlayWindow.animDuration / 3
                easing.type: overlayWindow.animEasing
            }
        }
        Behavior on height {
            NumberAnimation {
                duration: overlayWindow.animDuration / 3
                easing.type: overlayWindow.animEasing
            }
        }

        radius: Theme.cornerRadius
        color: overlayWindow.resolvedBgColor
        border.color: Theme.withAlpha(Theme.outline, 0.15)
        border.width: 1

        opacity: overlayWindow.isOverlayVisible ? (daemon ? daemon.overlayOpacity / 100.0 : 0.9) : 0.0
        Behavior on opacity {
            NumberAnimation {
                duration: overlayWindow.animDuration
                easing.type: overlayWindow.animEasing
            }
        }

        Column {
            id: contentColumn
            // Anchor to the screen-facing edge instead of centering: while the
            // card animates its height (exit rows still occupying layout), the
            // content must not slide vertically (the "bounce" bug)
            anchors.top: (daemon && daemon.position.includes("top")) ? parent.top : undefined
            anchors.bottom: (daemon && daemon.position.includes("bottom")) ? parent.bottom : undefined
            anchors.left: (!isCentered && daemon && daemon.position.includes("left")) ? parent.left : undefined
            anchors.right: (!isCentered && daemon && daemon.position.includes("right")) ? parent.right : undefined
            anchors.horizontalCenter: isCentered ? parent.horizontalCenter : undefined

            // The card is sized as content + 2x padding, so an edge-anchored
            // content column would sit flush against that edge and leave double
            // padding on the opposite side (visibly off-centre keycaps). Inset it
            // by exactly one padding step on the anchored edges so the keycaps end
            // up centred in the card while still tracking a fixed edge (no bounce).
            anchors.topMargin: (daemon && daemon.position.includes("top")) ? Theme.spacingL : 0
            anchors.bottomMargin: (daemon && daemon.position.includes("bottom")) ? Theme.spacingL : 0
            anchors.leftMargin: (!isCentered && daemon && daemon.position.includes("left")) ? Theme.spacingXL : 0
            anchors.rightMargin: (!isCentered && daemon && daemon.position.includes("right")) ? Theme.spacingXL : 0

            spacing: Theme.spacingS

            // keyviz group fade on entry
            add: Transition {
                NumberAnimation {
                    property: "opacity"
                    from: 0
                    to: 1
                    duration: overlayWindow.animDuration
                    easing.type: overlayWindow.animEasing
                }
            }
            // keyviz layout: displaced rows shift with duration/3
            move: Transition {
                NumberAnimation {
                    property: "y"
                    duration: overlayWindow.animDuration / 3
                    easing.type: overlayWindow.animEasing
                }
            }

            Repeater {
                model: historyModel

                delegate: Row {
                    id: groupRow

                    required property int index
                    required property int uid
                    required property string lineText
                    required property bool isCombo
                    required property bool dying
                    // Consecutive repeat count for the keyviz press-count badge.
                    required property int count

                    // Per-row removal: play the exit animation, then take the
                    // row out of the model. Independent per row, so bursts of
                    // keystrokes never defer each other's cleanup.
                    onDyingChanged: {
                        if (dying)
                            deathTimer.restart();
                    }

                    Timer {
                        id: deathTimer
                        interval: overlayWindow.animDuration + 40
                        onTriggered: overlayWindow.removeUid(groupRow.uid)
                    }

                    readonly property var keysList: isCombo ? lineText.split(" + ") : []
                    readonly property bool isMouseClick: lineText === "LMB Click" || lineText === "RMB Click" || lineText === "MMB Click" || lineText === "Mouse Click"
                    // keyviz only lets the newest group's keys render as pressed
                    readonly property bool isLatestGroup: index === historyModel.count - 1

                    // ── entry-animation registry ──
                    // The keycap Repeater below is fed by a plain JS array, so any
                    // change to the combo rebuilds all of its delegates and every
                    // cap replays its entry animation. That made Ctrl blink on
                    // every Ctrl+I -> Ctrl+H. keyviz never does this: caps are
                    // keyed on the key name and React keeps the unchanged elements
                    // mounted (key-overlay.tsx:120). Reproduce it by remembering
                    // which labels already animated in for this row and carrying
                    // the survivors across a text change.
                    property string animatedText: ""
                    property var animatedLabels: []

                    // Called once per combo keycap, right after it is built.
                    function hasAnimated(label) {
                        if (animatedText !== lineText) {
                            // The row moved on to another combo: forget the labels
                            // that are gone, keep the ones still on screen.
                            animatedText = lineText;
                            animatedLabels = animatedLabels.filter(l => keysList.indexOf(l) !== -1);
                        }
                        return animatedLabels.indexOf(label) !== -1;
                    }

                    function noteAnimated(label) {
                        if (animatedLabels.indexOf(label) === -1)
                            animatedLabels = animatedLabels.concat([label]);
                    }

                    spacing: overlayWindow.capFontSize * ((daemon && daemon.macSymbols) ? 0.2 : 0.3)
                    anchors.horizontalCenter: isCentered ? parent.horizontalCenter : undefined

                    // keyviz exit variants, applied to the whole group
                    opacity: dying ? 0 : 1
                    scale: (overlayWindow.animType === "zoom" && dying) ? 0 : 1

                    transform: Translate {
                        x: (overlayWindow.animType === "slide" && groupRow.dying) ? overlayWindow.animDistance : 0
                        y: (overlayWindow.animType === "float" && groupRow.dying) ? overlayWindow.animDistance : 0

                        Behavior on x {
                            NumberAnimation {
                                duration: overlayWindow.animDuration
                                easing.type: overlayWindow.animEasing
                            }
                        }
                        Behavior on y {
                            NumberAnimation {
                                duration: overlayWindow.animDuration
                                easing.type: overlayWindow.animEasing
                            }
                        }
                    }

                    Behavior on opacity {
                        NumberAnimation {
                            duration: overlayWindow.animDuration
                            easing.type: overlayWindow.animEasing
                        }
                    }
                    Behavior on scale {
                        NumberAnimation {
                            duration: overlayWindow.animDuration
                            easing.type: overlayWindow.animEasing
                        }
                    }

                    // Render keycaps for combinations
                    Repeater {
                        model: groupRow.isCombo ? groupRow.keysList : 0

                        delegate: AnimBox {
                            unitIndex: index
                            // Captured here so the calls below can reach it;
                            // inside the nested Keycap `label` would be ambiguous.
                            property string capLabel: modelData

                            alreadyEntered: () => groupRow.hasAnimated(capLabel)
                            onEntered: groupRow.noteAnimated(capLabel)

                            Row {
                                spacing: overlayWindow.capFontSize * 0.3

                                Keycap {
                                    anchors.verticalCenter: parent.verticalCenter
                                    label: capLabel
                                    pressed: groupRow.isLatestGroup && overlayWindow.isKeyHeld(capLabel)
                                    // keyviz: only the last key of the newest group
                                    // carries the badge (press-count.tsx via
                                    // `lastest` in laptop/lowprofile/pbt.tsx).
                                    pressCount: (groupRow.isLatestGroup && index === groupRow.keysList.length - 1) ? groupRow.count : 0
                                }

                                // keyviz has no separator at all -- it just puts
                                // a `columnGap: text.size * 0.3` between caps
                                // (key-overlay.tsx:38-47), which is the row
                                // `spacing` below. The separator is kept purely
                                // as an opt-in setting for people who want one;
                                // with the default empty string it is hidden.
                                StyledText {
                                    visible: index < groupRow.keysList.length - 1 && customSeparator !== ""
                                    anchors.verticalCenter: parent.verticalCenter
                                    font.pixelSize: daemon ? daemon.fontSize : 24
                                    font.bold: true
                                    color: Theme.outline
                                    text: customSeparator
                                }
                            }
                        }
                    }

                    // Render mouse click indicator as a keycap
                    AnimBox {
                        visible: groupRow.isMouseClick

                        Keycap {
                            anchors.verticalCenter: parent.verticalCenter
                            label: groupRow.lineText
                            pressed: groupRow.isLatestGroup && overlayWindow.isKeyHeld(groupRow.lineText)
                        }
                    }

                    // Render standard text for normal typing
                    AnimBox {
                        visible: !groupRow.isCombo && !groupRow.isMouseClick

                        StyledText {
                            anchors.verticalCenter: parent.verticalCenter
                            font.pixelSize: daemon ? daemon.fontSize : 24
                            font.bold: true
                            color: overlayWindow.resolvedTextColor
                            text: overlayWindow.getOverlayKeyText(groupRow.lineText)

                            height: overlayWindow.unifiedHeight
                            verticalAlignment: Text.AlignVCenter
                        }
                    }
                }
            }

            // Divider between history and active modifiers
            Separator {
                id: modifierDivider
                visible: daemon && daemon.showModifierStatus && (daemon.ctrlActive || daemon.altActive || daemon.shiftActive || daemon.superActive) && daemon.historyList.length > 0
            }

            // Real-time held modifiers status bar
            Row {
                id: modifierStatusRow
                visible: daemon && daemon.showModifierStatus && (daemon.ctrlActive || daemon.altActive || daemon.shiftActive || daemon.superActive)
                spacing: Theme.spacingS
                anchors.horizontalCenter: isCentered ? parent.horizontalCenter : undefined

                ModifierPill {
                    active: daemon && daemon.ctrlActive
                    label: "Ctrl"
                }

                ModifierPill {
                    active: daemon && daemon.altActive
                    label: "Alt"
                }

                ModifierPill {
                    active: daemon && daemon.shiftActive
                    label: "Shift"
                }

                ModifierPill {
                    active: daemon && daemon.superActive
                    label: "Super"
                }
            }
        }
    }
}
