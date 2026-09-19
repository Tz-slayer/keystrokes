import QtQuick
import QtTest
import ".."
import "../ui"

// The function row is read as a row: twelve keycaps in sequence, so they share
// one width. keyviz sizes each cap to its own label, which at 32px gave F1
// 88.0px against F10's 103.3px -- and even F1 vs F4 differed by 2.8px, because
// Inter's digits are proportional. This bench drives the real delegate and
// fails if the twelve ever disagree again.
TestCase {
    name: "KeycapFunctionRow"

    // Mirrors what the daemon hands the overlay (see count-badge.qml).
    property var settings: QtObject {
        property var config: QtObject {
            property bool showEventHistory: true
            property bool modifierHighlight: false
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
        property var styleParams: ({type: "pbt", baseColor: "#ffffff", secondaryColor: "#1a1a1a", textColor: "#000000", borderColor: "#1a1a1a", cornerRadius: 0.5, borderWidth: 2, gradient: true})
        function isKeyHeld(label) { return true }
    }

    Item { id: bench; width: 4000; height: 400; visible: true }

    Group {
        id: group
        parent: bench
        settings: bench.parent.settings
        latest: true
        visible: true
    }

    function collect(out, item) {
        if (item.pressCount !== undefined && item.objectName !== "keyviz-press-count")
            out.push({label: item.label, width: item.width, labelSize: item.labelSize});
        for (const child of item.children) collect(out, child);
    }

    function widths(labels) {
        // Empty the row first and outwait animDuration (120ms): a keycap that
        // is still animating out is still in the tree, and counting one would
        // make the numbers depend on which test ran before this one.
        group.keys = [];
        wait(240);
        group.keys = labels.map(l => ({label: l, count: 1}));
        wait(240);
        const out = [];
        collect(out, group);
        return out;
    }

    function test_theTwelveFunctionKeysShareOneWidth() {
        const labels = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"];
        const caps = widths(labels);
        compare(caps.length, 12, "all twelve keycaps rendered");
        const shared = caps[0].width;
        for (const cap of caps)
            compare(cap.width, shared, cap.label + " must take the row's width");

        // The row is as wide as its widest member, never narrower: the widest
        // label ("F10") has to fit, or it would overflow the cap instead.
        verify(shared > 90, "the row is sized by the widest label, not the narrowest");

        // Its label is drawn smaller than a bare label: a function key has no
        // icon, so at full size its cap became the widest thing on screen.
        for (const cap of caps)
            verify(cap.labelSize < settings.capFontSize, cap.label + " is drawn at the full font size");
    }

    function test_theRuleIsScopedToTheFunctionRow() {
        const shared = widths(["F1"])[0].width;
        const others = widths(["Tab", "Esc", "A", "Ins"]);
        for (const cap of others)
            verify(cap.width < shared, cap.label + " is not forced to the function width");
    }
}
