import QtQuick
import qs.Common
import qs.Widgets

// Settings whose value is a literal rather than a choice: keep Keyviz's
// fractional numbers exactly as written, which is why this uses a plain field
// instead of a slider or a role dropdown. Colours do not come through here --
// they are swatches (see ColorSwatch).
//
// The row chrome (label, info tooltip, reset affordance, hover) comes from
// Row, so these rows look like the vendored `*SettingPlus` ones.
Row {
    id: root

    // `label`, `description`, `isDirty`, `showReset` and the control slots are
    // inherited from Row (QML does not allow redeclaring them).
    required property string settingKey
    property string kind: "number"
    property var defaultValue: 0
    property real minimum: 0
    property real maximum: Number.MAX_VALUE
    property bool integerOnly: false
    property var value: defaultValue
    property bool initialized: false
    property bool recording: false
    property string error: ""

    focus: recording
    isDirty: value !== defaultValue
    onResetRequested: resetToDefault()

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
        if (input.length > 4096 || /[\x00-\x1f\x7f]/.test(input)) return null;
        return input.split(",").map(key => key.trim()).filter((key, index, keys) => key && keys.indexOf(key) === index).join(",");
    }
    function commit() {
        const next = normalized(field.text);
        if (next === null) {
            error = kind === "number" ? I18n.tr("Enter a valid number in the allowed range.")
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

    DankTextField {
        id: field
        width: parent.width
        onEditingFinished: root.commit()
        onActiveFocusChanged: if (!activeFocus && root.initialized) root.commit()
    }

    StyledText {
        width: parent.width
        visible: root.error !== ""
        text: root.error
        color: Theme.error
        font.pixelSize: Theme.fontSizeSmall
        wrapMode: Text.WordWrap
    }

    DankButton {
        visible: root.settingKey === "toggleShortcut"
        text: root.recording ? I18n.tr("Press shortcut · Esc cancels") : I18n.tr("Record Shortcut")
        onClicked: { root.recording = !root.recording; if (root.recording) root.forceActiveFocus(); }
    }
}
