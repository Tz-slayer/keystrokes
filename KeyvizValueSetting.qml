import QtQuick
import qs.Common
import qs.Widgets

// Direct-value settings: retain fractional numbers and CSS alpha-last colors.
Item {
    id: root
    required property string settingKey
    required property string label
    property string description: ""
    property string kind: "number"
    property var defaultValue: 0
    property real minimum: 0
    property real maximum: Number.MAX_VALUE
    property bool integerOnly: false
    property var value: defaultValue
    property bool initialized: false
    property bool recording: false
    focus: recording
    Keys.onPressed: event => {
        if (!recording || event.isAutoRepeat) return;
        event.accepted = true;
        if (event.key === Qt.Key_Escape) { recording = false; return; }
        if (event.key === Qt.Key_Backspace || event.key === Qt.Key_Delete) { field.text = ""; commit(); recording = false; return; }
        if ([Qt.Key_Control, Qt.Key_Shift, Qt.Key_Alt, Qt.Key_Meta].includes(event.key)) return;
        const mods = [];
        if (event.modifiers & Qt.ControlModifier) mods.push("Ctrl");
        if (event.modifiers & Qt.ShiftModifier) mods.push("Shift");
        if (event.modifiers & Qt.AltModifier) mods.push("Alt");
        if (event.modifiers & Qt.MetaModifier) mods.push("Super");
        const named = {};
        named[Qt.Key_Return] = "Enter"; named[Qt.Key_Enter] = "KpReturn";
        named[Qt.Key_Space] = "Space"; named[Qt.Key_Tab] = "Tab";
        named[Qt.Key_Left] = "←"; named[Qt.Key_Right] = "→"; named[Qt.Key_Up] = "↑"; named[Qt.Key_Down] = "↓";
        named[Qt.Key_Home] = "Home"; named[Qt.Key_End] = "End";
        named[Qt.Key_PageUp] = "PgUp"; named[Qt.Key_PageDown] = "PgDown";
        let label = named[event.key];
        if (!label && event.key >= Qt.Key_F1 && event.key <= Qt.Key_F35) label = "F" + (event.key - Qt.Key_F1 + 1);
        if (!label && event.key >= 32 && event.key <= 126) label = String.fromCharCode(event.key);
        if (!label) return;
        mods.push(label === "," ? "Comma" : label);
        field.text = mods.join(","); commit(); recording = false;
    }
    property string error: ""
    readonly property bool isDirty: value !== defaultValue
    width: parent.width
    implicitHeight: content.implicitHeight
    opacity: enabled ? 1 : 0.5

    function settings() {
        let item = parent;
        while (item) {
            if (item.saveValue !== undefined && item.loadValue !== undefined) return item;
            item = item.parent;
        }
        return null;
    }
    function normalized(text) {
        const input = String(text).trim();
        if (kind === "number") {
            if (input === "") return null;
            const number = Number(input);
            if (!isFinite(number) || number < minimum || number > maximum
                    || (integerOnly && Math.floor(number) !== number)) return null;
            return number;
        }
        if (kind === "color") {
            return /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(input) ? input.toLowerCase() : null;
        }
        if (input.length > 4096 || /[\x00-\x1f\x7f]/.test(input)) return null;
        return input.split(",").map(key => key.trim()).filter((key, index, keys) => key && keys.indexOf(key) === index).join(",");
    }
    function commit() {
        const next = normalized(field.text);
        if (next === null) {
            error = kind === "color" ? I18n.tr("Use #RRGGBB or #RRGGBBAA (alpha last).")
                : kind === "number" ? I18n.tr("Enter a valid number in the allowed range.")
                : I18n.tr("Use comma-separated key names without control characters.");
            return;
        }
        error = "";
        const owner = settings();
        if (owner && initialized && next !== value) owner.saveValue(settingKey, next);
        value = next;
        field.text = String(next);
    }
    function resetToDefault() {
        field.text = String(defaultValue);
        commit();
    }
    function load() {
        const owner = settings();
        if (!owner) return;
        const loaded = normalized(owner.loadValue(settingKey, defaultValue));
        value = loaded === null ? defaultValue : loaded;
        field.text = String(value);
        initialized = true;
    }
    Component.onCompleted: Qt.callLater(load)

    Column {
        id: content
        width: parent.width
        spacing: Theme.spacingXS
        Row {
            width: parent.width
            spacing: Theme.spacingS
            StyledText {
                text: root.label
                width: parent.width - reset.width - parent.spacing
                font.pixelSize: Theme.fontSizeLarge
                font.weight: Font.Medium
                color: Theme.surfaceText
                wrapMode: Text.WordWrap
            }
            DankButton {
                id: reset
                text: ""
                iconName: "restart_alt"
                width: 32
                buttonHeight: 32
                enabled: root.isDirty
                onClicked: root.resetToDefault()
            }
        }
        StyledText {
            width: parent.width
            visible: text !== ""
            text: root.description
            color: Theme.surfaceVariantText
            font.pixelSize: Theme.fontSizeSmall
            wrapMode: Text.WordWrap
        }
        DankTextField {
            id: field
            width: parent.width
            onEditingFinished: root.commit()
            onActiveFocusChanged: if (!activeFocus && root.initialized) root.commit()
        }
        DankButton {
            visible: root.settingKey === "toggleShortcut"
            text: root.recording ? I18n.tr("Press shortcut · Esc cancels") : I18n.tr("Record Shortcut")
            onClicked: { root.recording = !root.recording; if (root.recording) root.forceActiveFocus(); }
        }
        StyledText {
            width: parent.width
            visible: root.error !== ""
            text: root.error
            color: Theme.error
            font.pixelSize: Theme.fontSizeSmall
            wrapMode: Text.WordWrap
        }
    }
}
