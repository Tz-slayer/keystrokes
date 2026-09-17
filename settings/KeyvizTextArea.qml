import QtQuick
import QtQuick.Controls
import qs.Common
import qs.Widgets

// Multi-line twin of `DankTextField` (DMS ships no text area). The field tokens
// are the same ones DankTextField resolves, so the JSON editor reads as part of
// the same form instead of a stock Qt control.
StyledRect {
    id: root

    property alias text: area.text
    property alias textArea: area
    property string placeholderText: ""
    property bool readOnly: false

    implicitHeight: 180
    color: Theme.popupFieldColor
    border.color: area.activeFocus ? Theme.popupFieldFocusedBorderColor : Theme.popupFieldBorderColor
    border.width: 1
    radius: Theme.cornerRadius

    Flickable {
        id: flickable
        anchors.fill: parent
        anchors.margins: Theme.spacingS
        clip: true
        contentWidth: width
        contentHeight: Math.max(height, area.implicitHeight + Theme.spacingS * 2)
        boundsBehavior: Flickable.StopAtBounds

        TextArea.flickable: TextArea {
            id: area
            wrapMode: TextArea.Wrap
            selectByMouse: true
            readOnly: root.readOnly
            placeholderText: root.placeholderText
            color: Theme.surfaceText
            placeholderTextColor: Theme.outline
            selectionColor: Theme.primaryContainer
            selectedTextColor: Theme.primary
            font.pixelSize: Theme.fontSizeMedium
            font.family: Theme.fontFamily
            leftPadding: Theme.spacingXS
            rightPadding: Theme.spacingXS
            topPadding: Theme.spacingXS
            bottomPadding: Theme.spacingXS
            background: null

            MouseArea {
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.IBeamCursor
                acceptedButtons: Qt.NoButton
            }
        }
    }

    DankScrollbar {
        targetFlickable: flickable
        anchors.right: flickable.right
        anchors.top: flickable.top
        anchors.bottom: flickable.bottom
    }
}
