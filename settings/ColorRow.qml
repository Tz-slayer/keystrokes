import QtQuick
import qs.Common
import qs.Widgets

// A row of related colour swatches under the shared Row chrome: colours
// carry their own value, so "cap / base / label" reads as one setting instead
// of three stacked rows. Put the swatches in a Flow (or Row) and this row adds
// the label, the description tooltip and a reset that resets all of them.
//
// The default content slot is left alone on purpose: pointing it into a nested
// container would make that container a child of itself.
SettingRow {
    id: root

    readonly property var swatches: {
        const list = [];
        (function walk(item) {
            const kids = (item && item.children) || [];
            for (let i = 0; i < kids.length; i++) {
                const child = kids[i];
                if (child && child.isSwatch) list.push(child);
                else walk(child);
            }
        })(root);
        return list;
    }

    isDirty: root.swatches.some(swatch => swatch.isDirty)
    onResetRequested: root.swatches.forEach(swatch => swatch.resetToDefault())
}
