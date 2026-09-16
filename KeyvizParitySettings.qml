import QtQuick
import QtQuick.Controls
import Quickshell
import qs.Common
import qs.Widgets
import "./dms-common"
import "overlayLayout.js" as OverlayLayout

Column {
    id: root
    width: parent.width
    spacing: Theme.spacingM
    property bool marginsLinked: false
    // "" follows the SCREEN of the focused workspace (switching workspaces inside
    // one output does not move the overlay). "@primary" pins it to the first
    // output for anyone who wants no motion at all -- that is also what keyviz
    // does, since it pins appearance.monitor to monitors[0] (appearance.tsx:28-29).
    readonly property var monitorOptions: [{ label: I18n.tr("Follow focused output"), value: "" },
        { label: I18n.tr("Primary Display (never moves)"), value: OverlayLayout.primaryValue() }].concat(
        Quickshell.screens.map(screen => ({ label: screen.name + " (" + screen.width + "×" + screen.height + ")", value: screen.name })))

    SettingsCard {
        SectionTitle { text: I18n.tr("Keyviz Filtering & History"); icon: "filter_alt" }
        SelectionSettingPlus {
            id: filterSetting
            settingKey: "eventFilter"
            label: I18n.tr("Event Filter")
            options: [{ label: I18n.tr("Off — All Keys"), value: "none" }, { label: I18n.tr("Hotkeys"), value: "modifiers" }, { label: I18n.tr("Custom"), value: "custom" }]
            defaultValue: "modifiers"
        }
        KeyvizValueSetting {
            settingKey: "allowedKeys"; kind: "keys"
            label: I18n.tr("Allowed Keys")
            description: I18n.tr("Comma-separated names, for example Ctrl,Super,Alt,A,Enter. Use Comma for the comma key. A sequence is shown only when its first pressed key is allowed.")
            defaultValue: "Ctrl,Super,Alt"
            enabled: filterSetting.value === "custom"
        }
        ToggleSettingPlus {
            id: historySetting
            settingKey: "showEventHistory"; label: I18n.tr("Keep Keystroke History"); defaultValue: false
        }
        SelectionSettingPlus {
            settingKey: "flexDirection"; label: I18n.tr("History Direction")
            options: [{ label: I18n.tr("Row"), value: "row" }, { label: I18n.tr("Column"), value: "column" }]
            defaultValue: "column"; enabled: historySetting.value
        }
        SliderSettingPlus {
            settingKey: "maxHistory"; label: I18n.tr("Maximum History Groups")
            minimum: 2; maximum: 12; defaultValue: 5; enabled: historySetting.value
        }
        KeyvizValueSetting {
            settingKey: "toggleShortcut"; kind: "keys"
            label: I18n.tr("Toggle Shortcut")
            description: I18n.tr("Comma-separated keys, for example Shift,F10. Leave empty to disable the shortcut.")
            defaultValue: "Shift,F10"
        }
    }
    SettingsCard {
        SectionTitle { text: I18n.tr("Keyviz Display & Margins"); icon: "display_settings" }
        SelectionSettingPlus {
            settingKey: "monitorName"; label: I18n.tr("Display")
            options: root.monitorOptions; defaultValue: ""
        }
        CheckBox {
            text: I18n.tr("Link horizontal and vertical margins")
            checked: root.marginsLinked
            onToggled: { root.marginsLinked = checked; if (checked) marginYSetting.value = marginXSetting.value; }
        }
        SliderSettingPlus {
            id: marginXSetting
            onValueChanged: if (isInitialized && root.marginsLinked) marginYSetting.value = value
            settingKey: "marginX"; label: I18n.tr("Horizontal Margin")
            minimum: 0; maximum: 200; defaultValue: 100; unit: "px"
        }
        SliderSettingPlus {
            id: marginYSetting
            enabled: !root.marginsLinked
            settingKey: "marginY"; label: I18n.tr("Vertical Margin")
            minimum: 0; maximum: 200; defaultValue: 100; unit: "px"
        }
    }
    SettingsCard {
        SectionTitle { text: I18n.tr("Keyviz Colors & Border"); icon: "palette" }
        ToggleSettingPlus { settingKey: "useGradient"; label: I18n.tr("Gradient (Laptop / PBT)"); defaultValue: true }
        KeyvizValueSetting { settingKey: "capColor"; kind: "color"; label: I18n.tr("Primary Color"); defaultValue: "#ffffff" }
        KeyvizValueSetting { settingKey: "secondaryColor"; kind: "color"; label: I18n.tr("Secondary Color"); defaultValue: "#1a1a1a" }
        KeyvizValueSetting { settingKey: "labelColor"; kind: "color"; label: I18n.tr("Label Color"); defaultValue: "#000000" }
        ToggleSettingPlus {
            id: modifierSetting
            settingKey: "modifierHighlight"; label: I18n.tr("Highlight Modifiers"); defaultValue: false
        }
        KeyvizValueSetting { settingKey: "modifierColor"; kind: "color"; label: I18n.tr("Modifier Primary Color"); defaultValue: "#3a86ff"; enabled: modifierSetting.value }
        KeyvizValueSetting { settingKey: "modifierSecondaryColor"; kind: "color"; label: I18n.tr("Modifier Secondary Color"); defaultValue: "#000000"; enabled: modifierSetting.value }
        KeyvizValueSetting { settingKey: "modifierTextColor"; kind: "color"; label: I18n.tr("Modifier Label Color"); defaultValue: "#000000"; enabled: modifierSetting.value }
        ToggleSettingPlus {
            id: borderSetting
            settingKey: "borderEnabled"; label: I18n.tr("Enable Border"); defaultValue: true
        }
        KeyvizValueSetting {
            settingKey: "borderWidth"; label: I18n.tr("Border Width")
            description: I18n.tr("Pixels, at least 0.5; fractional values are supported.")
            minimum: 0.5; maximum: 20; defaultValue: 2; enabled: borderSetting.value
        }
        KeyvizValueSetting { settingKey: "borderColor"; kind: "color"; label: I18n.tr("Border Color"); defaultValue: "#1a1a1a"; enabled: borderSetting.value }
        KeyvizValueSetting { settingKey: "modifierBorderColor"; kind: "color"; label: I18n.tr("Modifier Border Color"); defaultValue: "#000000"; enabled: borderSetting.value && modifierSetting.value }
        KeyvizValueSetting {
            settingKey: "borderRadius"; label: I18n.tr("Corner Radius")
            description: I18n.tr("Keyviz ratio from 0 (square) to 1 (round).")
            minimum: 0; maximum: 1; defaultValue: 0.5
        }
    }
}
