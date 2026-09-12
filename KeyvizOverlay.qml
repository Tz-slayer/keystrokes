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
PanelWindow {
    id: overlayWindow

    property var daemon: null

    // ── keyviz animation settings ──
    readonly property string animType: daemon ? daemon.animationType : "fade"
    readonly property int animDuration: daemon ? daemon.animationDuration : 250
    // keyviz offsets float/slide by the font size
    readonly property real animDistance: daemon ? daemon.fontSize : 24

    readonly property bool isCentered: daemon ? (daemon.position === "bottom_center" || daemon.position === "top_center") : false
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

    readonly property color resolvedTextColor: daemon ? overlayWindow.resolveColor(daemon.textColorMode, daemon.textColorCustom) : Theme.primary
    readonly property color resolvedKeycapTextColor: daemon ? overlayWindow.resolveColor(daemon.keycapTextColorMode, daemon.keycapTextColorCustom) : Theme.primary
    readonly property bool roundedKeycaps: daemon ? daemon.roundedKeycaps : true
    readonly property color resolvedBgColor: {
        if (!daemon) return Theme.withAlpha(Theme.surface, 0.85);
        if (daemon.bgColorMode === "default") return Theme.withAlpha(Theme.surface, 0.85);
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
                historyModel.set(0, { uid: e.uid, lineText: e.text, isCombo: e.isCombo, dying: false });
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
                    break;
                }
            }
            if (!found)
                historyModel.append({ uid: e.uid, lineText: e.text, isCombo: e.isCombo, dying: false });
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

    // Keycap renderer replicating the keyviz keycap layouts
    // (src/components/keycaps/base.tsx):
    //   icon variant   - icon on top + label at the bottom (arrows: icon only);
    //                    modifier icons align right (keyviz iconAlignment "flex-end")
    //   symbol variant - secondary symbol stacked above the label, centered
    //   text variant   - plain centered label
    // Skins: minimal (no body) / elevated (drop shadow) / mechanical (base wall).
    // All icon/glyph/label data comes from KeyIcons.js (ported from keymaps.ts).
    component Keycap: Item {
        id: keycap

        property string label: ""

        readonly property real fs: overlayWindow.capFontSize
        readonly property var sp: overlayWindow.styleParams
        readonly property bool isMinimal: sp.type === "minimal"
        readonly property bool isElevated: sp.type === "elevated"
        readonly property bool isMechanical: sp.type === "mechanical"
        readonly property real capRadius: Math.max(0, (sp.cornerRadius ?? 0.45)) * fs
        readonly property real wallHeight: isMechanical ? fs * 0.38 : 0

        readonly property var kd: KeyIcons.display(label)
        readonly property bool hasIcon: kd.icon !== undefined
        readonly property bool iconOnly: hasIcon && kd.category === "arrow"
        readonly property bool iconLayout: hasIcon && !iconOnly
        readonly property bool symbolLayout: !hasIcon && kd.symbol !== undefined
        readonly property bool alignRight: kd.category === "modifier"
        readonly property string displayLabel: kd.shortLabel !== undefined ? kd.shortLabel : kd.label

        width: {
            if (iconOnly)
                return Math.max(fs * 2.25, fs * 1.8);
            if (iconLayout)
                return Math.max(fs * 2.25, Math.max(capLabel.implicitWidth, fs * 0.5) + fs * 1.0);
            if (symbolLayout)
                return Math.max(fs * 2.25, Math.max(capSymbol.implicitWidth, capSub.implicitWidth) + fs * 0.9);
            if (isMinimal)
                return capPlain.implicitWidth;
            return Math.max(fs * 2.25, capPlain.implicitWidth + fs * 1.0);
        }
        height: {
            if (isMinimal)
                return (iconLayout || iconOnly) ? fs * 2.25 : overlayWindow.unifiedHeight;
            return isMechanical ? fs * 2.5 : fs * 2.25;
        }

        // ── elevated: drop shadow under the cap ──
        Rectangle {
            visible: keycap.isElevated
            anchors.fill: parent
            anchors.topMargin: keycap.fs * 0.15
            radius: keycap.capRadius
            color: Qt.rgba(0, 0, 0, keycap.sp.shadowOpacity ?? 0.3)
        }

        // ── elevated: cap body ──
        Rectangle {
            visible: keycap.isElevated
            anchors.fill: parent
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

        // ── mechanical: dark base wall ──
        Rectangle {
            visible: keycap.isMechanical
            anchors.fill: parent
            radius: keycap.capRadius
            color: keycap.sp.secondaryColor
            border.width: keycap.sp.borderWidth ?? 0
            border.color: keycap.sp.borderColor
        }

        // ── mechanical: cap face, full width, wall shows at the bottom ──
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
                font.pixelSize: keycap.fs * 0.56
                color: keycap.sp.textColor
                text: keycap.kd.symbol || ""
            }
            StyledText {
                id: capSub
                anchors.horizontalCenter: parent.horizontalCenter
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
            font.pixelSize: keycap.fs
            color: keycap.sp.textColor
            text: keycap.displayLabel
        }
    }

    // Animated unit: wraps a keycap (+ separator), plain text, or mouse
    // indicator. Plays the keyviz entry variant when created, with a small
    // stagger based on its position inside the group.
    component AnimBox: Item {
        id: animBox

        default property alias contentData: contentRow.data

        property int unitIndex: 0
        property bool entryDone: overlayWindow.animType === "none"

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

        Timer {
            id: entryTimer
            interval: animBox.unitIndex * 40 + 1
            onTriggered: animBox.entryDone = true
        }

        Component.onCompleted: entryTimer.restart()
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

                            Row {
                                spacing: overlayWindow.capFontSize * 0.3

                                Keycap {
                                    anchors.verticalCenter: parent.verticalCenter
                                    label: modelData
                                }

                                // Render separator unless it is the last item
                                StyledText {
                                    visible: index < groupRow.keysList.length - 1
                                    anchors.verticalCenter: parent.verticalCenter
                                    font.pixelSize: daemon ? daemon.fontSize : 24
                                    font.bold: true
                                    color: Theme.outline
                                    text: daemon ? daemon.customSeparator : "+"
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
