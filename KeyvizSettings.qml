import QtQuick
import QtQuick.Controls
import Quickshell
import qs.Common
import qs.Modules.Plugins
import qs.Services
import qs.Widgets
import "./dms-common"

    PluginSettings {
        id: root

        pluginId: "keyviz"

        // Daemon instance (for custom style list)
        readonly property var daemon: PluginService.pluginInstances["keyviz"]

        readonly property var styleOptions: {
            var opts = [
                { label: I18n.tr("Minimal"), value: "minimal" },
                { label: I18n.tr("Elevated"), value: "elevated" },
                { label: I18n.tr("Mechanical"), value: "mechanical" }
            ];
            const cs = daemon ? daemon.customStyles : {};
            for (const id in cs)
                opts.push({ label: (cs[id].name || id) + I18n.tr(" (custom)"), value: id });
            return opts;
        }


    // Keyboard devices scanned dynamically
    property var deviceOptions: [{ label: "All Keyboards (Auto)", value: "all" }]

    Component.onCompleted: {
        scanDevices();
        if (root.daemon)
            root.daemon.scanStyles();
    }

    function scanDevices() {
        const script = `
import os, json, re

include_pattern = "kanata"
exclude_pattern = [
    "power button", "video bus", "speaker", "headphone",
    "lid switch", "touchpad", "extra buttons", "uinput",
    "server", "hitune", "inphic", "instant", "webcam", "video"
]

devs = []
if os.path.exists('/proc/bus/input/devices'):
    with open('/proc/bus/input/devices') as f:
        content = f.read()
        
    sections = content.strip().split('\\n\\n')
    for section in sections:
        name = ""
        handlers = ""
        for line in section.split('\\n'):
            if line.startswith('N: Name='):
                name = re.search(r'Name="([^"]+)"', line).group(1)
            elif line.startswith('H: Handlers='):
                handlers = line.split('=')[1]
        
        if name and handlers:
            lower_name = name.lower()
            is_included = include_pattern in lower_name
            is_excluded = any(x in lower_name for x in exclude_pattern)
            
            # Check for kbd handler and filter out non-keyboards
            if 'kbd' in handlers and (is_included or ('mouse' not in handlers and not is_excluded)):
                # Find event path
                event_match = re.search(r'event(\\d+)', handlers)
                if event_match:
                    event_path = "/dev/input/event" + event_match.group(1)
                    devs.append((name + " (" + event_path.split('/')[-1] + ")", event_path))

print(json.dumps(devs))
`;
        Proc.runCommand("keyviz.scanDevices", ["python3", "-c", script], (stdout, exitCode) => {
            if (exitCode !== 0) return;
            try {
                const data = JSON.parse(stdout.trim());
                var options = [{ label: "All Keyboards (Auto)", value: "all" }];
                for (var i = 0; i < data.length; i++) {
                    options.push({ label: data[i][0], value: data[i][1] });
                }
                root.deviceOptions = options;
            } catch(e) {
                console.warn("[Keyviz] Failed to parse device scanner output:", e);
            }
        });
    }

    SettingsCard {
        id: generalSection
        SectionTitle {
            text: I18n.tr("General Settings")
            icon: "tune"
            showReset: enabledSetting.isDirty || fadeTimeoutSetting.isDirty || fontSizeSetting.isDirty
            onResetClicked: {
                enabledSetting.resetToDefault();
                fadeTimeoutSetting.resetToDefault();
                fontSizeSetting.resetToDefault();
            }
        }

        ToggleSettingPlus {
            id: enabledSetting
            settingKey: "enabled"
            label: I18n.tr("Enable Visualizer")
            defaultValue: true
        }

        Separator {}

        SliderSettingPlus {
            id: fadeTimeoutSetting
            settingKey: "fadeTimeout"
            label: I18n.tr("Fade Timeout")
            description: I18n.tr("Inactivity duration before overlay disappears")
            minimum: 500
            maximum: 5000
            defaultValue: 1500
            unit: "ms"
            leftLabel: "500ms"
            rightLabel: "5000ms"
        }

        Separator {}

        SliderSettingPlus {
            id: fontSizeSetting
            settingKey: "fontSize"
            label: I18n.tr("Font Size")
            minimum: 16
            maximum: 64
            defaultValue: 24
            unit: "px"
            leftLabel: "16px"
            rightLabel: "64px"
        }
    }

    SettingsCard {
        id: layoutSection
        SectionTitle {
            text: I18n.tr("Layout & Animations")
            icon: "display_settings"
            showReset: positionSetting.isDirty || animationTypeSetting.isDirty || animationDurationSetting.isDirty || keycapStyleSetting.isDirty || roundedKeycapsSetting.isDirty || overlayOpacitySetting.isDirty || marginSizeSetting.isDirty || charLimitSetting.isDirty || textColorSetting.isDirty || keycapTextColorSetting.isDirty || historyLimitSetting.isDirty || bgColorSetting.isDirty || customSeparatorSetting.isDirty
            onResetClicked: {
                positionSetting.resetToDefault();
                animationTypeSetting.resetToDefault();
                animationDurationSetting.resetToDefault();
                keycapStyleSetting.resetToDefault();
                roundedKeycapsSetting.resetToDefault();
                overlayOpacitySetting.resetToDefault();
                marginSizeSetting.resetToDefault();
                charLimitSetting.resetToDefault();
                textColorSetting.resetToDefault();
                keycapTextColorSetting.resetToDefault();
                historyLimitSetting.resetToDefault();
                bgColorSetting.resetToDefault();
                customSeparatorSetting.resetToDefault();
            }
        }

        SelectionSettingPlus {
            id: positionSetting
            settingKey: "position"
            label: I18n.tr("Display Position")
            options: [
                { label: I18n.tr("Top Left"), value: "top_left" },
                { label: I18n.tr("Top Center"), value: "top_center" },
                { label: I18n.tr("Top Right"), value: "top_right" },
                { label: I18n.tr("Bottom Left"), value: "bottom_left" },
                { label: I18n.tr("Bottom Center"), value: "bottom_center" },
                { label: I18n.tr("Bottom Right"), value: "bottom_right" }
            ]
            defaultValue: "bottom_center"
        }

        Separator {}

        SelectionSettingPlus {
            id: keycapStyleSetting
            settingKey: "keycapStyle"
            label: I18n.tr("Keycap Style")
            description: I18n.tr("Keycap skin (keyviz Minimal / Elevated / Mechanical). Add custom styles: drop a JSON file into ~/.config/DankMaterialShell/keyviz_styles/ and reopen this page")
            options: root.styleOptions
            defaultValue: "mechanical"
        }

        Separator {}

        SelectionSettingPlus {
            id: animationTypeSetting
            settingKey: "animationType"
            label: I18n.tr("Animation Style")
            description: I18n.tr("Keyviz-style preset applied when keycaps enter and leave the overlay")
            options: [
                { label: I18n.tr("Fade"), value: "fade" },
                { label: I18n.tr("Zoom"), value: "zoom" },
                { label: I18n.tr("Float"), value: "float" },
                { label: I18n.tr("Slide"), value: "slide" },
                { label: I18n.tr("None"), value: "none" }
            ]
            defaultValue: "fade"
        }

        Separator {}

        SliderSettingPlus {
            id: animationDurationSetting
            settingKey: "animationDuration"
            label: I18n.tr("Animation Duration")
            description: I18n.tr("Duration of the keycap enter/exit animations")
            minimum: 100
            maximum: 1000
            defaultValue: 250
            unit: "ms"
            leftLabel: "100ms"
            rightLabel: "1000ms"
        }

        Separator {}

        ToggleSettingPlus {
            id: roundedKeycapsSetting
            settingKey: "roundedKeycaps"
            label: I18n.tr("Rounded Keycap Corners")
            defaultValue: true
        }

        Separator {}

        SliderSettingPlus {
            id: overlayOpacitySetting
            settingKey: "overlayOpacity"
            label: I18n.tr("Overlay Opacity")
            minimum: 10
            maximum: 100
            defaultValue: 90
            unit: "%"
            leftLabel: "10%"
            rightLabel: "100%"
        }

        Separator {}

        SliderSettingPlus {
            id: marginSizeSetting
            settingKey: "marginSize"
            label: I18n.tr("Screen Margin")
            description: I18n.tr("Adjust the distance of the overlay from screen edges")
            minimum: 0
            maximum: 100
            defaultValue: 24
            unit: "px"
            leftLabel: "0px"
            rightLabel: "100px"
        }

        Separator {}

        SliderSettingPlus {
            id: charLimitSetting
            settingKey: "charLimit"
            label: I18n.tr("Normal Typing Limit")
            description: I18n.tr("Maximum characters buffer shown for normal text")
            minimum: 5
            maximum: 50
            defaultValue: 20
            unit: "chars"
            leftLabel: "5"
            rightLabel: "50"
        }

        Separator {}

        SliderSettingPlus {
            id: historyLimitSetting
            settingKey: "historyLimit"
            label: I18n.tr("Keystroke History Limit")
            description: I18n.tr("Number of lines to display for keystroke history")
            minimum: 1
            maximum: 5
            defaultValue: 1
            unit: "lines"
            leftLabel: "1"
            rightLabel: "5"
        }

        Separator {}

        ColorDropdownSettingPlus {
            id: textColorSetting
            settingKey: "textColor"
            label: I18n.tr("Normal Text Color")
            defaultValueMode: "default"
        }

        Separator {}

        ColorDropdownSettingPlus {
            id: keycapTextColorSetting
            settingKey: "keycapTextColor"
            label: I18n.tr("Keycap & Mouse Color")
            defaultValueMode: "default"
        }

        Separator {}

        ColorDropdownSettingPlus {
            id: bgColorSetting
            settingKey: "bgColor"
            label: I18n.tr("Overlay Background Color")
            defaultValueMode: "default"
        }

        Separator {}

        StringSettingPlus {
            id: customSeparatorSetting
            settingKey: "customSeparator"
            label: I18n.tr("Custom Separator")
            description: I18n.tr("Optional character drawn between shortcut keys. keyviz has none, so this is empty by default.")
            defaultValue: ""
            placeholder: I18n.tr("none")
        }
    }

    SettingsCard {
        id: visibilitySection
        SectionTitle {
            text: I18n.tr("Visibility Options")
            icon: "visibility"
            showReset: showShortcutsSetting.isDirty || macSymbolsSetting.isDirty || showModifierStatusSetting.isDirty || showOnlyModifiersSetting.isDirty || ignoreFilterKeysSetting.isDirty || showNormalKeysSetting.isDirty || showMouseClicksSetting.isDirty || showPressCountSetting.isDirty
            onResetClicked: {
                showShortcutsSetting.resetToDefault();
                macSymbolsSetting.resetToDefault();
                showModifierStatusSetting.resetToDefault();
                showOnlyModifiersSetting.resetToDefault();
                ignoreFilterKeysSetting.resetToDefault();
                showNormalKeysSetting.resetToDefault();
                showMouseClicksSetting.resetToDefault();
                showPressCountSetting.resetToDefault();
            }
        }

        ToggleSettingPlus {
            id: showShortcutsSetting
            settingKey: "showShortcuts"
            label: I18n.tr("Show Key Combinations")
            description: I18n.tr("Toggle to display modifier shortcuts (e.g., Ctrl + Alt + T)")
            defaultValue: true
        }

        Separator {}

        ToggleSettingPlus {
            id: macSymbolsSetting
            settingKey: "macSymbols"
            label: I18n.tr("Use macOS Symbols")
            description: I18n.tr("Toggle to display modifiers and control keys as macOS symbols (e.g. ⌘, ⌥, ⇧, ⌃, ⏎)")
            defaultValue: false
        }

        Separator {}

        ToggleSettingPlus {
            id: showModifierStatusSetting
            settingKey: "showModifierStatus"
            label: I18n.tr("Show Held Modifiers")
            description: I18n.tr("Show a real-time status bar of active modifier keys currently being held down")
            defaultValue: false
        }

        Separator {}

        ToggleSettingPlus {
            id: showOnlyModifiersSetting
            settingKey: "showOnlyModifiers"
            label: I18n.tr("Show Standalone Modifiers")
            description: I18n.tr("Toggle to display modifiers like Ctrl or Shift when pressed alone")
            defaultValue: false
        }

        Separator {}

        ToggleSettingPlus {
            id: ignoreFilterKeysSetting
            settingKey: "ignoreFilterKeys"
            label: I18n.tr("Ignore Lock Keys")
            description: I18n.tr("Ignore system lock keys (CapsLock, NumLock, ScrollLock) to avoid noise")
            defaultValue: true
        }

        Separator {}

        ToggleSettingPlus {
            id: showNormalKeysSetting
            settingKey: "showNormalKeys"
            label: I18n.tr("Show Normal Keystrokes")
            description: I18n.tr("Toggle to display normal letters instead of just modifier shortcuts")
            defaultValue: false
        }

        Separator {}

        ToggleSettingPlus {
            id: showMouseClicksSetting
            settingKey: "showMouseClicks"
            label: I18n.tr("Show Mouse Clicks")
            defaultValue: false
        }

        Separator {}

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
            showReset: selectedDevicePathSetting.isDirty
            onResetClicked: {
                selectedDevicePathSetting.resetToDefault();
            }
        }

        SelectionSettingPlus {
            id: selectedDevicePathSetting
            settingKey: "selectedDevicePath"
            label: I18n.tr("Keyboard Device")
            options: root.deviceOptions
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
                    { text: "dms ipc keyviz toggle", label: I18n.tr("Toggle visualizer") },
                    { text: "dms ipc keyviz enable", label: I18n.tr("Enable visualizer") },
                    { text: "dms ipc keyviz disable", label: I18n.tr("Disable visualizer") },
                    { text: "dms ipc keyviz test", label: I18n.tr("Preview a sample keystroke") },
                    { text: "dms ipc keyviz styles", label: I18n.tr("List loaded custom styles") },
                    { text: "dms ipc keyviz rescan", label: I18n.tr("Rescan the custom style folder") }
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
                I18n.tr("Key combinations are rendered as visual keycaps, and standard typing as stream text."),
                I18n.tr("Ensure your user belongs to the <b>input</b> group to read keyboard events without root.")
            ]
        }
    }

    PluginAbout {
        repoUrl: "https://github.com/loccun/dms-screenkey"
    }
}
