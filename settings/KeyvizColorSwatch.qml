import QtQuick
import qs.Common
import qs.Services
import qs.Widgets
import "../core/keycapColors.js" as KeycapColors

// One colour setting as a swatch: the circle *is* the value, so several related
// colours fit in a single row instead of one row each. Clicking opens DMS's own
// colour picker, which carries an opacity slider -- keyviz writes #RRGGBBAA
// (its group panel is #ffffff99, white at 60%), so alpha has to survive.
//
// The hex literal is gone from the page on purpose; it is one hover away in the
// tooltip, and exact values still go through Style Import / Export.
Item {
    id: root

    required property string settingKey
    property string caption: ""
    property string description: ""
    property string defaultValue: "#ffffff"
    property string value: defaultValue
    property bool initialized: false
    // Marks this for the group row that collects its swatches.
    readonly property bool isSwatch: true

    width: 56
    height: implicitHeight
    implicitWidth: 56
    implicitHeight: caption !== "" ? 62 : 44
    opacity: enabled ? 1 : 0.5
    Behavior on opacity { NumberAnimation { duration: Theme.shortDuration } }

    readonly property bool isDirty: value !== defaultValue
    readonly property color previewColor: {
        const c = KeycapColors.cssToRgba(root.value);
        return c ? Qt.rgba(c.r, c.g, c.b, c.a) : "transparent";
    }

    function settings() {
        let item = parent;
        while (item) {
            if (item.saveValue !== undefined && item.loadValue !== undefined) return item;
            item = item.parent;
        }
        return null;
    }
    function load() {
        const owner = settings();
        if (!owner) return;
        const loaded = owner.loadValue(settingKey, defaultValue);
        value = (typeof loaded === "string" && loaded !== "") ? loaded : defaultValue;
        initialized = true;
    }
    function applyValue(next) {
        value = next;
        const owner = settings();
        if (owner && initialized) owner.saveValue(settingKey, next);
    }
    function resetToDefault() {
        applyValue(defaultValue);
    }
    function openPicker() {
        const modal = PopoutService && PopoutService.colorPickerModal;
        if (!modal) return;
        modal.selectedColor = root.previewColor;
        modal.pickerTitle = root.description !== "" ? root.description : root.caption;
        modal.onColorSelectedCallback = function (picked) {
            root.applyValue(KeycapColors.toCss(picked.r, picked.g, picked.b, picked.a));
        };
        modal.show();
    }

    Component.onCompleted: Qt.callLater(load)

    Column {
        anchors.horizontalCenter: parent.horizontalCenter
        spacing: Theme.spacingXS

        Item {
            width: 40
            height: 40
            anchors.horizontalCenter: parent.horizontalCenter

            // Checkerboard: a flat circle would paint a translucent value as if
            // it were opaque, and alpha is what keyviz's panel colour carries.
            Rectangle {
                anchors.fill: parent
                radius: 20
                color: Theme.surfaceContainerHighest
                clip: true
                Column {
                    anchors.fill: parent
                    Repeater {
                        model: 5
                        Row {
                            property int row: index
                            Repeater {
                                model: 5
                                Rectangle {
                                    width: 8
                                    height: 8
                                    color: ((row + index) % 2) ? Theme.surfaceContainer : Theme.surfaceContainerHighest
                                }
                            }
                        }
                    }
                }
            }

            Rectangle {
                anchors.fill: parent
                radius: 20
                color: root.previewColor
                border.color: hovered ? Theme.primary : Theme.outlineMedium
                border.width: Theme.layerOutlineWidth
            }

            // Reads as "differs from the default", which is what the row's reset
            // affordance acts on.
            Rectangle {
                width: 8
                height: 8
                radius: 4
                color: Theme.primary
                anchors.top: parent.top
                anchors.right: parent.right
                visible: root.isDirty
            }

            MouseArea {
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onEntered: tooltip.show(root.tooltipText, parent)
                onExited: tooltip.hide()
                onClicked: root.openPicker()
            }
        }

        StyledText {
            visible: root.caption !== ""
            width: root.width
            horizontalAlignment: Text.AlignHCenter
            text: root.caption
            font.pixelSize: Theme.fontSizeSmall
            color: Theme.surfaceVariantText
            elide: Text.ElideRight
        }
    }

    readonly property bool hovered: hoverHandler.hovered
    HoverHandler { id: hoverHandler }
    readonly property string tooltipText: (root.description !== "" ? root.description : root.caption)
        + (root.description !== "" || root.caption !== "" ? "\n" : "") + root.value

    DankTooltipV2 { id: tooltip }
}
