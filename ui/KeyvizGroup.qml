import QtQuick
import "../core/groupFrame.js" as GroupFrame
import "../core/keyvizMotion.js" as KeyvizMotion
import "../core/listModelSync.js" as ListModelSync

Item {
    id: group
    required property var settings
    property var keys: []
    property bool latest: false
    property bool dying: false
    property bool entered: false
    // True when this group belongs to a re-created overlay window: the keycaps
    // were already on screen, so the group must not fade in again.
    property bool restored: false
    signal contentGeometryChanged
    readonly property int duration: settings.animDuration
    readonly property real fs: settings.capFontSize
    readonly property real padX: settings.groupBackground ? fs * 0.4 : 0
    readonly property real padY: settings.groupBackground ? fs * (settings.styleParams.type === "minimal" ? 0.25 : 0.4) : 0
    readonly property real corner: (settings.styleParams.cornerRadius ?? 0.5) * fs * 1.75

    // ── the panel is a background, never a clip ──
    // Nothing in this group sets `clip` or masks its children: a decoration
    // that reaches past the box (the press-count badge, the canvas spread of a
    // keycap surface) is drawn in full and the *panel* is grown to cover it
    // instead. `overflow` is how far content can reach past the row, and the
    // padding is widened when the corner radius would otherwise bite into it.
    readonly property var overflow: GroupFrame.overflow(fs, {
        type: settings.styleParams.type,
        borderWidth: settings.styleParams.borderWidth,
        pressCount: settings.showPressCount
    })
    readonly property real marginX: settings.groupBackground ? GroupFrame.margin(padX, corner) : 0
    readonly property real marginY: settings.groupBackground ? GroupFrame.margin(padY, corner) : 0
    readonly property var frame: GroupFrame.frame(row.implicitWidth, row.implicitHeight,
        group.overflow, marginX, marginY)
    // The box the panel must cover, in panel coordinates. Exposed so the
    // invariant is checkable from outside instead of only reasoned about.
    readonly property rect contentRect: Qt.rect(marginX, marginY,
        row.implicitWidth + overflow.left + overflow.right,
        row.implicitHeight + overflow.top + overflow.bottom)
    width: frame.width
    height: frame.height
    // The overlay commits size and absolute position in the same event turn.
    // Delaying this signal lets bottom/right anchored content visibly move first
    // and then animate back to its anchored edge.
    onWidthChanged: contentGeometryChanged()
    onHeightChanged: contentGeometryChanged()
    opacity: dying || (!entered && settings.config.showEventHistory) ? 0 : 1
    Behavior on opacity {
        NumberAnimation {
            duration: group.settings.config.showEventHistory ? group.duration : 0
            easing.type: Easing.BezierSpline
            easing.bezierCurve: KeyvizMotion.curve(group.dying)
        }
    }

    ListModel { id: caps }
    function sync() {
        ListModelSync.reconcile(caps, keys, {
            keyField: "keyId",
            keyOf: key => key.keyId || key.label,
            animate: duration > 0,
            valueOf: (key, index) => ({
                keyId: key.keyId || key.label,
                label: key.label,
                count: key.count,
                animateIn: key.animateIn !== false,
                dying: false,
                last: index === keys.length - 1
            })
        });
    }
    function removeLabel(label) {
        ListModelSync.removeByKey(caps, "keyId", label);
    }
    onKeysChanged: sync()
    Component.onCompleted: { sync(); if (restored) entered = true; else Qt.callLater(() => entered = true); }

    // The background and the keycaps are siblings, not a masked container:
    // the panel is painted first and only ever *behind*, so nothing it holds
    // can be cut by it. (Enter/exit offsets may carry a fading keycap past the
    // panel for a moment, as they do in keyviz -- that is a translation, not a
    // clip, and reserving a whole font size for it would visibly unbalance the
    // padding.)
    Rectangle {
        anchors.fill: parent
        radius: group.corner
        color: group.settings.groupBackground ? group.settings.groupBackgroundColor : "transparent"
    }
    Row {
        id: row
        x: group.frame.x
        y: group.frame.y
        spacing: group.settings.capFontSize * (group.settings.styleParams.type === "minimal" ? 0.15 : 0.3)
        move: Transition {
            NumberAnimation {
                properties: "x,y"
                duration: KeyvizMotion.reflowDuration(group.duration)
                easing.type: Easing.BezierSpline
                easing.bezierCurve: KeyvizMotion.enterCurve()
            }
        }
        Repeater {
            model: caps
            delegate: Item {
                id: unit
                required property string keyId
                required property string label
                required property int count
                required property bool animateIn
                required property bool dying
                required property bool last
                // A held modifier copied into a new shortcut group already
                // entered with the previous shortcut. Render it at rest;
                // only the newly pressed key uses the entrance variant.
                property bool entered: !animateIn
                readonly property bool hiddenState: dying || group.dying || !entered
                readonly property var curve: KeyvizMotion.curve(unit.hiddenState)
                width: cap.width
                height: cap.height
                opacity: KeyvizMotion.opacity(group.settings.animType, unit.hiddenState)
                scale: KeyvizMotion.scale(group.settings.animType, unit.hiddenState)
                transform: Translate {
                    x: KeyvizMotion.offset(group.settings.animType, "x", group.settings.capFontSize, unit.hiddenState)
                    y: KeyvizMotion.offset(group.settings.animType, "y", group.settings.capFontSize, unit.hiddenState)
                    Behavior on x { NumberAnimation { duration: group.duration; easing.type: Easing.BezierSpline; easing.bezierCurve: unit.curve } }
                    Behavior on y { NumberAnimation { duration: group.duration; easing.type: Easing.BezierSpline; easing.bezierCurve: unit.curve } }
                }
                Behavior on opacity { NumberAnimation { duration: group.duration; easing.type: Easing.BezierSpline; easing.bezierCurve: unit.curve } }
                Behavior on scale { NumberAnimation { duration: group.duration; easing.type: Easing.BezierSpline; easing.bezierCurve: unit.curve } }
                onDyingChanged: if (dying) removal.restart()
                Timer { id: removal; interval: group.duration; onTriggered: group.removeLabel(unit.keyId) }
                Component.onCompleted: Qt.callLater(() => entered = true)
                Keycap {
                    id: cap
                    settings: group.settings
                    label: unit.label
                    pressed: group.latest && !unit.dying && group.settings.isKeyHeld(unit.keyId)
                    animateInitialPress: unit.animateIn
                    pressCount: unit.last ? unit.count : 0
                }
            }
        }
    }
}
