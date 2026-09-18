import QtQuick
import QtTest
import ".."
import "../ui"

// Reproduces the reported bug scene against the real delegate: two keys pressed
// close together, then a repeat on the first one. Two things went wrong before:
//   * the group was rebuilt on every repeat (new uid), so the delegate was
//     recreated and the press-count badge flickered, and
//   * the badge only ever read the *last* keycap's count, so a repeat on any
//     earlier key of a combo was counted but never drawn.
TestCase {
    name: "CountBadge"

    // Mirrors what the daemon hands the overlay: the flat render settings plus
    // the `config` sub-object the delegates read behaviour flags from.
    property var settings: QtObject {
        // Keycap resolves the modifier palette off `config`; leaving these out
        // makes it assign `undefined` to a QColor and paint with an invalid
        // gradient stop, which the harness treats as a failure.
        property var config: QtObject {
            property bool showEventHistory: true
            property bool modifierHighlight: true
            property string modifierColor: "#12345680"
            property string modifierSecondaryColor: "#000000"
            property string modifierTextColor: "#ffffff"
            property string modifierBorderColor: "#ff0000"
        }
        property bool showEventHistory: true
        property real capFontSize: 32
        property string animType: "fade"
        property int animDuration: 120
        property int animEasing: Easing.OutQuint
        property string textVariant: "text-short"
        property string textCaps: "capitalize"
        property string textAlignment: "center"
        property string iconAlignment: "flex-end"
        property bool showIcon: true
        property bool showSymbol: true
        property bool showPressCount: true
        property bool groupBackground: true
        property color groupBackgroundColor: "#99ffffff"
        property var styleParams: ({type: "lowprofile", baseColor: "#ffffff", secondaryColor: "#1a1a1a", textColor: "#000000", borderColor: "#1a1a1a", cornerRadius: 0.5, borderWidth: 2, gradient: true})
        function isKeyHeld(label) { return true }
    }

    // A bare Item is invisible unless something shows it; the overlay does that
    // through its own delegate, so the bench has to be explicit about it.
    Item {
        id: bench
        width: 400
        height: 200
        visible: true
    }

    Group {
        id: group
        parent: bench
        settings: bench.parent.settings
        latest: true
        visible: true
    }

    // Every keycap owns a badge Rectangle. A TestCase root is never *shown*,
    // and `visible` does not propagate upwards, so every descendant reports
    // visible=false here. The honest signal is the code's own indicator: the
    // badge is scaled to 1 when active and to 0.01 when not (Keycap.qml).
    function badgeScales() {
        const out = [];
        collectScales(group, out, 1);
        return out;
    }
    function collectScales(item, out, inherited) {
        const o = inherited * item.opacity;
        if (item.objectName === "keyviz-press-count") out.push({ scale: item.scale, opacity: o });
        for (const child of item.children) collectScales(child, out, o);
    }
    function visibleBadges() {
        return badgeScales().filter(function (b) {
            return b.scale > 0.99 && b.opacity > 0.99;
        }).length;
    }

    function pressCounts() {
        const out = [];
        counts(group, out);
        return out.join(",");
    }
    function counts(item, out) {
        if (item.pressCount !== undefined && item.objectName !== "keyviz-press-count")
            out.push(item.label + "=" + item.pressCount);
        for (const child of item.children) counts(child, out);
    }

    // The badge must survive a repeat: the group keeps its identity, so the
    // delegate is updated in place instead of being recreated.
    function test_badgeSurvivesRepeatOnAnyKey() {
        group.keys = [{label: "Ctrl", count: 1}, {label: "C", count: 1}];
        wait(60);
        compare(visibleBadges(), 0, "count 1 shows no badge on either keycap");

        // Ctrl then C, C: the repeat lands on the NON-last keycap. Before the
        // fix the badge read `last ? count : 0`, so this drew nothing at all.
        group.keys = [{label: "Ctrl", count: 1}, {label: "C", count: 2}];
        wait(60);
        compare(pressCounts(), "Ctrl=1,C=2");
        compare(visibleBadges(), 1, "a repeat on the last keycap shows exactly one badge");

        // Ctrl, Ctrl while C is also held: now the EARLIER keycap repeats.
        group.keys = [{label: "Ctrl", count: 3}, {label: "C", count: 2}];
        wait(60);
        compare(pressCounts(), "Ctrl=3,C=2");
        compare(visibleBadges(), 2, "both repeated keycaps show their own badge");

        // Growing further must not multiply badges or drop them.
        group.keys = [{label: "Ctrl", count: 9}, {label: "C", count: 4}];
        wait(60);
        compare(visibleBadges(), 2, "further repeats keep one badge per keycap");
    }

    // A single repeated key keeps working exactly as before.
    function test_loneRepeatedKeyShowsABadge() {
        group.keys = [{label: "A", count: 1}];
        wait(60);
        compare(visibleBadges(), 0, "count 1 shows nothing");
        group.keys = [{label: "A", count: 2}];
        wait(60);
        compare(visibleBadges(), 1, "count 2 shows one badge");
    }

    // The setting still wins.
    function test_theSettingDisablesEveryBadge() {
        const saved = settings.showPressCount;
        settings.showPressCount = false;
        group.keys = [{label: "A", count: 5}, {label: "B", count: 3}];
        wait(60);
        compare(visibleBadges(), 0, "turning press count off hides every badge");
        settings.showPressCount = saved;
    }
}
