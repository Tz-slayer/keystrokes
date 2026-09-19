import QtQuick
import Quickshell
import qs.Common
import qs.Modules.Plugins
import qs.Services
import qs.Widgets
import "dms/widgets"
import "settings"
import "core/keyStyle.js" as KeyStyle

    PluginSettings {
        id: root

        pluginId: "keystrokes"

        // Daemon instance (for the device list and the random-style seed).
        // Read defensively: this binding is evaluated while the settings page is
        // being built, and if the daemon has not registered yet -- or failed to
        // load -- the bare index threw and took the whole page down, which the
        // shell shows as the settings button doing nothing at all. A missing
        // daemon degrades the page (no device list) instead of preventing it.
        readonly property var daemon: PluginService.pluginInstances
            ? PluginService.pluginInstances["keystrokes"]
            : null

        // The four keyviz skins. Unknown ids (a retired custom style among them)
        // fall back to PBT in the daemon's styleParams.
        readonly property var styleOptions: [
            { label: I18n.tr("Minimal"), value: "minimal" },
            { label: I18n.tr("Laptop"), value: "laptop" },
            { label: I18n.tr("Low Profile"), value: "lowprofile" },
            { label: I18n.tr("PBT"), value: "pbt" }
        ]


    // Device discovery lives in the daemon; only the "auto" entry is UI text.
    readonly property var deviceChoices: [{ label: I18n.tr("All Keyboards (Auto)"), value: "all" }]
        .concat(root.daemon ? root.daemon.deviceOptions : [])

    property bool refreshingControls: false

    function refreshControls(item) {
        const outer = !root.refreshingControls;
        root.refreshingControls = true;
        if (item.settingKey !== undefined && item.value !== undefined) {
            item.value = root.loadValue(item.settingKey, item.defaultValue);
            if (typeof item.load === "function") item.load();
        }
        if (item.children) for (let i = 0; i < item.children.length; i++) refreshControls(item.children[i]);
        if (outer) root.refreshingControls = false;
    }

    // DankDropdown only speaks labels, so the palette name maps back to the
    // index KeyStyle.palette() takes.
    function paletteIndex(name) {
        for (let i = 0; i < KeyStyle.COLOR_SCHEMES.length; i++)
            if (KeyStyle.COLOR_SCHEMES[i].name === name) return i;
        return 0;
    }

    function applyValues(values) {
        Object.keys(values).forEach(key => root.saveValue(key, values[key]));
        root.refreshControls(root);
    }

    SettingsCard {
        SectionTitle { text: I18n.tr("Color Presets"); icon: "palette" }
        Row {
            label: I18n.tr("Color Preset")
            description: I18n.tr("keyviz's 14 upstream palettes. Applying one overwrites the primary, secondary, label and border colours.")
            DankDropdown {
                id: paletteChoice
                width: parent.width
                options: KeyStyle.COLOR_SCHEMES.map(scheme => scheme.name)
                currentValue: KeyStyle.COLOR_SCHEMES[0].name
            }
            Row {
                spacing: Theme.spacingS
                DankButton {
                    text: I18n.tr("Apply Palette")
                    onClicked: root.applyValues(KeyStyle.palette(root.paletteIndex(paletteChoice.currentValue)))
                }
                DankButton { text: I18n.tr("Randomize Style"); onClicked: root.applyValues(KeyStyle.randomStyle(root.daemon ? root.daemon.pluginData : {})) }
            }
        }
    }

    ParitySettings {}

    SettingsCard {
        id: generalSection
        SectionTitle {
            text: I18n.tr("General Settings")
            icon: "tune"
        }

        ToggleSettingPlus {
            id: enabledSetting
            settingKey: "enabled"
            label: I18n.tr("Enable Visualizer")
            defaultValue: true
        }

        ValueSetting {
            id: fadeTimeoutSetting
            settingKey: "fadeTimeout"
            label: I18n.tr("Fade Timeout")
            description: I18n.tr("How long released keycaps remain visible (milliseconds)")
            minimum: 0
            maximum: 60000
            defaultValue: 5000
        }

        ValueSetting {
            id: fontSizeSetting
            settingKey: "fontSize"
            label: I18n.tr("Font Size")
            minimum: 8
            maximum: 200
            defaultValue: 32
        }
    }

    SettingsCard {
        id: layoutSection
        SectionTitle {
            text: I18n.tr("Layout & Animations")
            icon: "display_settings"
        }

        SelectionSettingPlus {
            id: positionSetting
            settingKey: "position"
            label: I18n.tr("Display Position")
            options: [
                { label: I18n.tr("Top Left"), value: "top_left" },
                { label: I18n.tr("Top Center"), value: "top_center" },
                { label: I18n.tr("Top Right"), value: "top_right" },
                { label: I18n.tr("Center Left"), value: "center_left" },
                { label: I18n.tr("Center"), value: "center" },
                { label: I18n.tr("Center Right"), value: "center_right" },
                { label: I18n.tr("Bottom Left"), value: "bottom_left" },
                { label: I18n.tr("Bottom Center"), value: "bottom_center" },
                { label: I18n.tr("Bottom Right"), value: "bottom_right" }
            ]
            defaultValue: "bottom_center"
        }

        SelectionSettingPlus {
            id: keycapStyleSetting
            settingKey: "keycapStyle"
            label: I18n.tr("Keycap Style")
            description: I18n.tr("Keycap skin, ported 1:1 from keyviz (Minimal / Laptop / Low Profile / PBT)")
            options: root.styleOptions
            defaultValue: "lowprofile"
            onValueChanged: {
                if (isInitialized && !root.refreshingControls && value === "minimal") {
                    root.saveValue("textVariant", "icon");
                    root.saveValue("modifierHighlight", false);
                    root.saveValue("showIcon", true);
                    Qt.callLater(() => root.refreshControls(root));
                }
            }
        }

        SelectionSettingPlus {
            id: animationTypeSetting
            settingKey: "animationType"
            label: I18n.tr("Animation Style")
            description: I18n.tr("keyviz-style preset applied when keycaps enter and leave the overlay")
            options: [
                { label: I18n.tr("Fade"), value: "fade" },
                { label: I18n.tr("Zoom"), value: "zoom" },
                { label: I18n.tr("Float"), value: "float" },
                { label: I18n.tr("Slide"), value: "slide" },
                { label: I18n.tr("None"), value: "none" }
            ]
            defaultValue: "fade"
        }

        SliderSettingPlus {
            id: animationDurationSetting
            settingKey: "animationDuration"
            label: I18n.tr("Animation Duration")
            description: I18n.tr("Duration of the keycap enter/exit animations")
            minimum: 50
            maximum: 1000
            defaultValue: 250
            unit: "ms"
            leftLabel: "50ms"
            rightLabel: "1000ms"
        }
    }

    SettingsCard {
        id: contentSection
        SectionTitle {
            text: I18n.tr("Keycap Content")
            icon: "text_fields"
        }

        SelectionSettingPlus {
            id: textVariantSetting
            settingKey: "textVariant"
            label: I18n.tr("Label Style")
            description: I18n.tr("Icon only, the full key name, or keyviz's short label (key_style.ts text.variant)")
            options: [
                { label: I18n.tr("Icon"), value: "icon" },
                { label: I18n.tr("Full Text"), value: "text" },
                { label: I18n.tr("Short Text"), value: "text-short" }
            ]
            defaultValue: "text-short"
            onValueChanged: if (isInitialized && !root.refreshingControls && value === "icon") { root.saveValue("showIcon", true); Qt.callLater(() => root.refreshControls(root)); }
        }

        SelectionSettingPlus {
            id: textCapsSetting
            settingKey: "textCaps"
            label: I18n.tr("Text Case")
            options: [
                { label: I18n.tr("Capitalize"), value: "capitalize" },
                { label: I18n.tr("Uppercase"), value: "uppercase" },
                { label: I18n.tr("Lowercase"), value: "lowercase" }
            ]
            defaultValue: "capitalize"
        }

        SelectionSettingPlus {
            id: textAlignmentSetting
            settingKey: "textAlignment"
            label: I18n.tr("Label Alignment")
            description: I18n.tr("Where the label sits inside the keycap (key_style.ts text.alignment)")
            options: [
                { label: I18n.tr("Top Left"), value: "top-left" },
                { label: I18n.tr("Top Center"), value: "top-center" },
                { label: I18n.tr("Top Right"), value: "top-right" },
                { label: I18n.tr("Center Left"), value: "center-left" },
                { label: I18n.tr("Center"), value: "center" },
                { label: I18n.tr("Center Right"), value: "center-right" },
                { label: I18n.tr("Bottom Left"), value: "bottom-left" },
                { label: I18n.tr("Bottom Center"), value: "bottom-center" },
                { label: I18n.tr("Bottom Right"), value: "bottom-right" }
            ]
            defaultValue: "center"
        }

        ToggleSettingPlus {
            id: showIconSetting
            settingKey: "showIcon"
            label: I18n.tr("Show Icons")
            description: I18n.tr("Draw keyviz's vector icons on the keys that have one")
            defaultValue: true
        }

        ToggleSettingPlus {
            id: showSymbolSetting
            settingKey: "showSymbol"
            label: I18n.tr("Show Symbols")
            description: I18n.tr("Draw the secondary symbol (e.g. the shifted character) when a key has one")
            defaultValue: true
        }

        SelectionSettingPlus {
            id: iconAlignmentSetting
            settingKey: "iconAlignment"
            label: I18n.tr("Modifier Icon Alignment")
            description: I18n.tr("Horizontal edge used by modifier icons and labels (key_style.ts layout.iconAlignment)")
            options: [
                { label: I18n.tr("Left"), value: "flex-start" },
                { label: I18n.tr("Center"), value: "center" },
                { label: I18n.tr("Right"), value: "flex-end" }
            ]
            defaultValue: "flex-end"
        }
    }

    SettingsCard {
        id: groupBackgroundSection
        SectionTitle {
            text: I18n.tr("Group Background")
            icon: "layers"
        }

        ToggleSettingPlus {
            id: groupBackgroundSetting
            settingKey: "groupBackground"
            label: I18n.tr("Show Group Panel")
            description: I18n.tr("Draw a rounded panel behind every group, keeping the overlay window itself transparent")
            defaultValue: true
        }

        ColorRow {
            label: I18n.tr("Group Panel Color")
            description: I18n.tr("Colour of the rounded panel behind every group. Default is #ffffff99 (white at 60%); the picker's opacity slider sets the alpha.")
            ColorSwatch { settingKey: "groupBackgroundCustom"; description: I18n.tr("Group panel"); defaultValue: "#ffffff99" }
        }
    }

    SettingsCard {
        id: visibilitySection
        SectionTitle {
            text: I18n.tr("Visibility Options")
            icon: "visibility"
        }
        ToggleSettingPlus {
            id: showMouseEventsSetting
            settingKey: "showMouseEvents"
            label: I18n.tr("Show Mouse Events")
            description: I18n.tr("Show mouse clicks, drags and wheel scrolling as keycaps")
            defaultValue: false
        }

        SliderSettingPlus {
            id: dragThresholdSetting
            settingKey: "dragThreshold"
            label: I18n.tr("Drag Threshold")
            description: I18n.tr("Distance the pointer travels while a button is held before it becomes a drag")
            minimum: 10
            maximum: 200
            defaultValue: 50
            unit: "px"
            leftLabel: "10"
            rightLabel: "200"
        }

        ToggleSettingPlus {
            id: showPressCountSetting
            settingKey: "showPressCount"
            label: I18n.tr("Show Press Count")
            description: I18n.tr("Show a badge on the last keycap with the number of times it was pressed in a row")
            defaultValue: true
        }
    }

    SettingsCard {
        id: deviceSection
        SectionTitle {
            text: I18n.tr("Input Device")
            icon: "keyboard"
        }

        SelectionSettingPlus {
            id: selectedDevicePathSetting
            settingKey: "selectedDevicePath"
            label: I18n.tr("Keyboard Device")
            options: root.deviceChoices
            defaultValue: "all"
        }
    }

    SettingsCard {
        id: ipcSection
        SectionTitle {
            id: ipcTitle
            text: I18n.tr("IPC Commands")
            icon: "terminal"
            collapsible: true
            settingKey: "ipcCommandsExpanded"
        }

        Column {
            width: parent.width
            spacing: Theme.spacingS
            visible: ipcTitle.isExpanded

            Repeater {
                model: [
                    { text: "dms ipc keystrokes toggle", label: I18n.tr("Toggle visualizer") },
                    { text: "dms ipc keystrokes enable", label: I18n.tr("Enable visualizer") },
                    { text: "dms ipc keystrokes disable", label: I18n.tr("Disable visualizer") },
                    { text: "dms ipc keystrokes test", label: I18n.tr("Preview a sample keystroke") }
                ]

                delegate: CopyBox {
                    label: modelData.label
                    text: modelData.text
                }
            }
        }
    }

    SettingsCard {
        SectionTitle {
            id: usageTitle
            text: I18n.tr("Usage Guide")
            icon: "menu_book"
            collapsible: true
            settingKey: "usageGuideExpanded"
        }

        UsageGuide {
            expanded: usageTitle.isExpanded
            items: [
                I18n.tr("Displays keystrokes on an always-on-top floating screen overlay."),
                I18n.tr("Key combinations are rendered as visual keycaps, and standard typing as individual keycaps."),
                I18n.tr("Ensure your user belongs to the <b>input</b> group to read keyboard events without root.")
            ]
        }
    }

    PluginAbout {
        repoUrl: "https://github.com/hthienloc/dms-keystrokes"
    }
}
