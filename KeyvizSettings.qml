import QtQuick
import QtQuick.Controls
import Quickshell
import qs.Common
import qs.Modules.Plugins
import qs.Services
import qs.Widgets
import "./dms-common"
import "keyvizStyle.js" as KeyvizStyle

    PluginSettings {
        id: root

        pluginId: "keyviz"

        // Daemon instance (for custom style list)
        readonly property var daemon: PluginService.pluginInstances["keyviz"]

        readonly property var styleOptions: {
            var opts = [
                { label: I18n.tr("Minimal"), value: "minimal" },
                { label: I18n.tr("Laptop"), value: "laptop" },
                { label: I18n.tr("Low Profile"), value: "lowprofile" },
                { label: I18n.tr("PBT"), value: "pbt" }
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

    function currentStyle() {
        const data = {};
        Object.keys(KeyvizStyle.DEFAULTS).forEach(key => { data[key] = root.loadValue(key, KeyvizStyle.DEFAULTS[key]); });
        data.keyvizMouseStyle = root.loadValue("keyvizMouseStyle", null);
        return KeyvizStyle.exportStyle(data);
    }

    function applyValues(values) {
        Object.keys(values).forEach(key => root.saveValue(key, values[key]));
        root.refreshControls(root);
    }

    SettingsCard {
        SectionTitle { text: I18n.tr("Keyviz Color Presets"); icon: "palette" }
        ComboBox { id: paletteChoice; width: parent.width; model: KeyvizStyle.COLOR_SCHEMES.map(scheme => scheme.name) }
        Row {
            spacing: Theme.spacingS
            DankButton { text: I18n.tr("Apply Palette"); onClicked: root.applyValues(KeyvizStyle.palette(paletteChoice.currentIndex)) }
            DankButton { text: I18n.tr("Randomize Style"); onClicked: root.applyValues(KeyvizStyle.randomStyle(root.daemon ? root.daemon.pluginData : {})) }
        }
    }

    KeyvizParitySettings {}

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

        Separator {}

        KeyvizValueSetting {
            id: fadeTimeoutSetting
            settingKey: "fadeTimeout"
            label: I18n.tr("Fade Timeout")
            description: I18n.tr("How long released keycaps remain visible (milliseconds)")
            minimum: 0
            maximum: 60000
            defaultValue: 5000
        }

        Separator {}

        KeyvizValueSetting {
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

        Separator {}

        SelectionSettingPlus {
            id: keycapStyleSetting
            settingKey: "keycapStyle"
            label: I18n.tr("Keycap Style")
            description: I18n.tr("Keycap skin, ported 1:1 from keyviz (Minimal / Laptop / Low Profile / PBT). Add custom styles: drop a JSON file into ~/.config/DankMaterialShell/keyviz_styles/ and reopen this page")
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
            minimum: 50
            maximum: 1000
            defaultValue: 250
            unit: "ms"
            leftLabel: "50ms"
            rightLabel: "1000ms"
        }
        Separator {}

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

        Separator {}

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

        Separator {}

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

        Separator {}

        ToggleSettingPlus {
            id: showIconSetting
            settingKey: "showIcon"
            label: I18n.tr("Show Icons")
            description: I18n.tr("Draw keyviz's vector icons on the keys that have one")
            defaultValue: true
        }

        Separator {}

        ToggleSettingPlus {
            id: showSymbolSetting
            settingKey: "showSymbol"
            label: I18n.tr("Show Symbols")
            description: I18n.tr("Draw the secondary symbol (e.g. the shifted character) when a key has one")
            defaultValue: true
        }

        Separator {}

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
            description: I18n.tr("keyviz draws a rounded panel behind every group and keeps the overlay window itself transparent")
            defaultValue: true
        }

        Separator {}

        KeyvizValueSetting {
            id: groupBackgroundColorSetting
            kind: "color"
            settingKey: "groupBackgroundCustom"
            label: I18n.tr("Group Panel Color")
            description: I18n.tr("CSS color: #RRGGBB or #RRGGBBAA; alpha is the final pair.")
            defaultValue: "#ffffff99"
        }
    }

    SettingsCard {
        id: visibilitySection
        SectionTitle {
            text: I18n.tr("Visibility Options")
            icon: "visibility"
        }
        Separator {}

        ToggleSettingPlus {
            id: showMouseEventsSetting
            settingKey: "showMouseEvents"
            label: I18n.tr("Show Mouse Events")
            description: I18n.tr("Show mouse clicks, drags and wheel scrolling as keycaps")
            defaultValue: false
        }

        Separator {}

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
                I18n.tr("Key combinations are rendered as visual keycaps, and standard typing as individual keycaps."),
                I18n.tr("Ensure your user belongs to the <b>input</b> group to read keyboard events without root.")
            ]
        }
    }

    SettingsCard {
        SectionTitle { text: I18n.tr("Keyviz Style Import / Export"); icon: "import_export" }
        StyledText {
            width: parent.width
            wrapMode: Text.WordWrap
            text: I18n.tr("Paste Keyviz style JSON and apply it, or export the current style below. Mouse settings are not applied.")
        }
        ScrollView {
            width: parent.width; height: 200
            TextArea { id: styleJson; wrapMode: TextEdit.Wrap; selectByMouse: true; placeholderText: "{ ... }" }
        }
        Row {
            spacing: Theme.spacingS
            DankButton {
                text: I18n.tr("Export JSON")
                onClicked: { styleJson.text = JSON.stringify(root.currentStyle(), null, 2); styleStatus.text = I18n.tr("Select and copy the JSON above."); }
            }
            DankButton {
                text: I18n.tr("Apply JSON")
                onClicked: {
                    try {
                        const values = KeyvizStyle.importStyle(JSON.parse(styleJson.text));
                        Object.keys(values).forEach(key => root.saveValue(key, values[key]));
                        root.refreshControls(root);
                        styleStatus.text = I18n.tr("Style applied.");
                    } catch (error) { styleStatus.text = error.message; }
                }
            }
        }
        StyledText { id: styleStatus; width: parent.width; wrapMode: Text.WordWrap }
    }

    PluginAbout {
        repoUrl: "https://github.com/loccun/dms-screenkey"
    }
}
