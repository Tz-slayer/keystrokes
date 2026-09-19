pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import qs.Common
import qs.Widgets
import qs.Services
import qs.Modules.Plugins
import "dms/widgets"

PluginComponent {
    id: root

    pluginId: "keystrokes"
    pluginService: PluginService

    // Same defensive read as Settings.qml: an unregistered or failed daemon must
    // not take the control-center widget down with it.
    readonly property var daemon: PluginService.pluginInstances
        ? PluginService.pluginInstances["keystrokes"]
        : null
    // Device discovery belongs to the daemon (it owns the device setting and the
    // input process); the widget only labels the "auto" entry, which is UI text
    // and therefore translated here.
    readonly property var deviceChoices: [{ label: I18n.tr("All Keyboards (Auto)"), value: "all" }]
        .concat(root.daemon ? root.daemon.deviceOptions : [])
    readonly property bool devicesScanning: root.daemon ? root.daemon.devicesScanning : false

    function deviceLabelFor(value) {
        for (var i = 0; i < root.deviceChoices.length; i++) {
            if (root.deviceChoices[i].value === value)
                return root.deviceChoices[i].label;
        }
        return I18n.tr("All Keyboards (Auto)");
    }

    ccWidgetIcon: "keyboard"
    ccWidgetPrimaryText: I18n.tr("Keystrokes")
    ccWidgetSecondaryText: daemon && daemon.enabled ? I18n.tr("Active") : I18n.tr("Disabled")
    ccWidgetIsActive: daemon ? daemon.enabled : false
    ccDetailHeight: 360

    onCcWidgetToggled: {
        if (daemon) {
            daemon.saveSetting("enabled", !daemon.enabled);
        }
    }

    ccDetailContent: Component {
        Rectangle {
            id: detailRoot
            radius: Theme.cornerRadius
            color: Theme.nestedSurface
            border.color: Theme.outlineMedium
            border.width: Theme.layerOutlineWidth
            implicitHeight: childrenRect.height

            Item {
                id: headerRow
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                height: Math.max(headerLabel.implicitHeight, headerControls.implicitHeight) + Theme.spacingS * 2

                StyledText {
                    id: headerLabel
                    text: I18n.tr("Keystrokes")
                    font.pixelSize: Theme.fontSizeLarge
                    font.weight: Font.Medium
                    color: Theme.surfaceText
                    anchors.left: parent.left
                    anchors.leftMargin: Theme.spacingM
                    anchors.verticalCenter: parent.verticalCenter
                }

                Row {
                    id: headerControls
                    anchors.right: parent.right
                    anchors.rightMargin: Theme.spacingM
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: Theme.spacingS

                    DankActionButton {
                        iconName: "settings"
                        buttonSize: 28
                        iconSize: 16
                        iconColor: Theme.surfaceVariantText
                        tooltipText: I18n.tr("Settings")
                        tooltipSide: "bottom"
                        onClicked: PopoutService.openSettingsWithTab("plugins")
                    }

                    DankActionButton {
                        iconName: root.daemon?.enabled ? "visibility" : "visibility_off"
                        iconColor: root.daemon?.enabled ? Theme.primary : Theme.surfaceVariantText
                        buttonSize: 28
                        iconSize: 16
                        tooltipText: root.daemon?.enabled ? I18n.tr("Disable") : I18n.tr("Enable")
                        tooltipSide: "bottom"
                        onClicked: {
                            if (root.daemon)
                                root.daemon.saveSetting("enabled", !root.daemon.enabled);
                        }
                    }
                }
            }

            Column {
                id: detailColumn
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: headerRow.bottom
                anchors.margins: Theme.spacingM
                anchors.topMargin: Theme.spacingS
                spacing: Theme.spacingS

                Column {
                    width: parent.width
                    spacing: Theme.spacingXS

                    StyledText {
                        text: I18n.tr("Device")
                        font.pixelSize: Theme.fontSizeMedium
                        font.weight: Font.Medium
                        color: Theme.surfaceText
                    }

                    DankDropdown {
                        width: parent.width
                        compactMode: true
                        enabled: !root.devicesScanning
                        currentValue: root.devicesScanning
                            ? I18n.tr("Scanning devices…")
                            : root.deviceLabelFor(root.daemon ? root.daemon.selectedDevicePath : "all")
                        options: root.deviceChoices.map(function(o) { return o.label; })
                        onValueChanged: (newValue) => {
                            for (var i = 0; i < root.deviceChoices.length; i++) {
                                if (root.deviceChoices[i].label === newValue) {
                                    if (root.daemon)
                                        root.daemon.saveSetting("selectedDevicePath", root.deviceChoices[i].value);
                                    break;
                                }
                            }
                        }
                    }
                }

                Grid {
                    width: parent.width
                    columns: 2
                    spacing: Theme.spacingS
                    rowSpacing: Theme.spacingXS

                    DankToggle {
                        text: I18n.tr("Normal Keys")
                        onToggled: {
                            if (root.daemon)
                                root.daemon.saveSetting("showNormalKeys", checked);
                        }
                        Binding on checked {
                            value: root.daemon ? root.daemon.showNormalKeys : false
                        }
                    }

                    DankToggle {
                        text: I18n.tr("Mouse Events")
                        onToggled: {
                            if (root.daemon)
                                root.daemon.saveSetting("showMouseEvents", checked);
                        }
                        Binding on checked {
                            value: root.daemon ? root.daemon.showMouseEvents : false
                        }
                    }

                    DankToggle {
                        text: I18n.tr("Shortcuts")
                        onToggled: {
                            if (root.daemon)
                                root.daemon.saveSetting("showShortcuts", checked);
                        }
                        Binding on checked {
                            value: root.daemon ? root.daemon.showShortcuts : true
                        }
                    }

                    DankToggle {
                        text: I18n.tr("macOS Symbols")
                        onToggled: {
                            if (root.daemon)
                                root.daemon.saveSetting("macSymbols", checked);
                        }
                        Binding on checked {
                            value: root.daemon ? root.daemon.macSymbols : false
                        }
                    }

                    DankToggle {
                        text: I18n.tr("Held Modifiers")
                        onToggled: {
                            if (root.daemon)
                                root.daemon.saveSetting("showModifierStatus", checked);
                        }
                        Binding on checked {
                            value: root.daemon ? root.daemon.showModifierStatus : false
                        }
                    }
                }

                // Input access warning
                StyledRect {
                    width: parent.width
                    height: errorText.implicitHeight + Theme.spacingS * 2
                    color: Theme.nestedSurface
                    border.color: Theme.error
                    border.width: Theme.layerOutlineWidth
                    radius: Theme.cornerRadius / 2
                    visible: root.daemon ? root.daemon.inputBroken : false

                    StyledText {
                        id: errorText
                        width: parent.width - Theme.spacingS * 2
                        anchors.centerIn: parent
                        text: root.daemon && root.daemon.inputToolMissing
                            ? I18n.tr("Missing input tools (%1)").arg(root.daemon.requiredTool)
                            : I18n.tr("User not in 'input' group.")
                        color: Theme.error
                        font.pixelSize: Theme.fontSizeSmall
                        wrapMode: Text.WordWrap
                    }
                }
            }
        }
    }
}
