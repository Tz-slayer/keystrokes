import QtQuick
import QtQuick.Effects

Item {
    id: group
    required property var settings
    property var keys: []
    property bool latest: false
    property bool dying: false
    property bool entered: false
    signal contentGeometryChanged
    readonly property int duration: settings.animDuration
    readonly property real padX: settings.groupBackground ? settings.capFontSize * 0.4 : 0
    readonly property real padY: settings.groupBackground ? settings.capFontSize * (settings.styleParams.type === "minimal" ? 0.25 : 0.4) : 0
    readonly property real corner: (settings.styleParams.cornerRadius ?? 0.5) * settings.capFontSize * 1.75
    width: row.implicitWidth + padX * 2
    height: row.implicitHeight + padY * 2
    // The overlay commits size and absolute position in the same event turn.
    // Delaying this signal lets bottom/right anchored content visibly move first
    // and then animate back to its anchored edge.
    onWidthChanged: contentGeometryChanged()
    onHeightChanged: contentGeometryChanged()
    opacity: dying || (!entered && settings.config.showEventHistory) ? 0 : 1
    Behavior on opacity { NumberAnimation { duration: group.settings.config.showEventHistory ? group.duration : 0; easing.type: Easing.BezierSpline; easing.bezierCurve: group.dying ? [0.76,0,0.68,0,1,1] : [0.23,1,0.32,1,1,1] } }

    ListModel { id: caps }
    function sync() {
        const labels = keys.map(key => key.keyId || key.label);
        for (let i = caps.count - 1; i >= 0; i--) {
            if (!labels.includes(caps.get(i).keyId)) {
                if (!duration) caps.remove(i);
                else caps.setProperty(i, "dying", true);
            }
        }
        keys.forEach((key, index) => {
            let found = -1;
            for (let i = 0; i < caps.count; i++) if (caps.get(i).keyId === (key.keyId || key.label)) { found = i; break; }
            const value = {keyId: key.keyId || key.label, label: key.label, count: key.count,
                           animateIn: key.animateIn !== false, dying: false,
                           last: index === keys.length - 1};
            if (found < 0) caps.append(value);
            else caps.set(found, value);
        });
    }
    function removeLabel(label) {
        for (let i = 0; i < caps.count; i++) if (caps.get(i).keyId === label && caps.get(i).dying) { caps.remove(i); return; }
    }
    onKeysChanged: sync()
    Component.onCompleted: { sync(); Qt.callLater(() => entered = true); }

    Item {
        anchors.fill: parent
        // Shader effects are unavailable on Qt Quick's software backend.
        clip: group.settings.groupBackground && GraphicsInfo.api === GraphicsInfo.Software
        layer.enabled: group.settings.groupBackground && GraphicsInfo.api !== GraphicsInfo.Software
        layer.effect: MultiEffect { maskEnabled: true; maskSource: roundMask }
        Rectangle { anchors.fill: parent; radius: group.corner; color: group.settings.groupBackground ? group.settings.groupBackgroundColor : "transparent" }
        Row {
            id: row
            x: group.padX
            y: group.padY
            spacing: group.settings.capFontSize * (group.settings.styleParams.type === "minimal" ? 0.15 : 0.3)
            move: Transition { NumberAnimation { properties: "x,y"; duration: group.duration / 3; easing.type: Easing.BezierSpline; easing.bezierCurve: [0.23,1,0.32,1,1,1] } }
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
                    readonly property var curve: hiddenState ? [0.76,0,0.68,0,1,1] : [0.23,1,0.32,1,1,1]
                    width: cap.width
                    height: cap.height
                    opacity: group.settings.animType === "none" ? 1 : (hiddenState ? 0 : 1)
                    scale: group.settings.animType === "zoom" && hiddenState ? 0 : 1
                    transform: Translate {
                        x: group.settings.animType === "slide" && unit.hiddenState ? group.settings.capFontSize : 0
                        y: group.settings.animType === "float" && unit.hiddenState ? group.settings.capFontSize : 0
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
    Rectangle {
        id: roundMask
        anchors.fill: parent
        radius: group.corner
        color: "white"
        visible: false
        layer.enabled: true
    }
}
