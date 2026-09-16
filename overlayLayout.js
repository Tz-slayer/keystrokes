// Pure layout helpers shared by the overlay and its regression tests.
// Positions are absolute within one output, so removing a history item cannot
// produce a second, compensating movement from a resized parent container.
// Sentinel `monitorName` values. Both mean "follow the screen that holds the
// focused workspace"; "" is the default so existing settings keep working.
function followFocusValue() {
    return "@focused";
}

// Sentinel meaning "the first output" -- no motion, ever.
function primaryValue() {
    return "@primary";
}

// The automatic value tracks the SCREEN of the focused workspace, not the
// workspace: CompositorService resolves `focused` from NiriService.currentOutput,
// which is an OUTPUT name. Switching workspaces inside one output therefore does
// not move the overlay; only focus landing on another output does. (keyviz pins
// appearance.monitor to monitors[0] instead -- appearance.tsx:28-29 -- which is
// what `primaryValue()` offers for anyone who wants zero motion.)
function screenName(configured, focused, available) {
    const names = available || [];
    if (configured === primaryValue())
        return names.length > 0 ? names[0] : "";
    if (configured && names.indexOf(configured) !== -1)
        return configured;
    return focused && names.indexOf(focused) !== -1
        ? focused : (names.length > 0 ? names[0] : "");
}

function axisOrigin(alignment, startWord, endWord, margin, viewport, content) {
    if (alignment.indexOf(startWord) !== -1)
        return margin;
    if (alignment.indexOf(endWord) !== -1)
        return viewport - content - margin;
    return (viewport - content) / 2;
}

function crossOffset(alignment, startWord, endWord, available, size) {
    if (alignment.indexOf(startWord) !== -1)
        return 0;
    if (alignment.indexOf(endWord) !== -1)
        return available - size;
    return (available - size) / 2;
}

function targets(horizontal, alignment, marginX, marginY, viewportWidth, viewportHeight, items, gap) {
    const list = items || [];
    let contentWidth = 0;
    let contentHeight = 0;
    for (let i = 0; i < list.length; i++) {
        if (horizontal) {
            contentWidth += list[i].width + (i > 0 ? gap : 0);
            contentHeight = Math.max(contentHeight, list[i].height);
        } else {
            contentWidth = Math.max(contentWidth, list[i].width);
            contentHeight += list[i].height + (i > 0 ? gap : 0);
        }
    }

    const baseX = axisOrigin(alignment, "left", "right", marginX, viewportWidth, contentWidth);
    const baseY = axisOrigin(alignment, "top", "bottom", marginY, viewportHeight, contentHeight);
    const result = [];
    let cursor = 0;
    for (let j = 0; j < list.length; j++) {
        const item = list[j];
        const x = horizontal
            ? baseX + cursor
            : baseX + crossOffset(alignment, "left", "right", contentWidth, item.width);
        const y = horizontal
            ? baseY + crossOffset(alignment, "top", "bottom", contentHeight, item.height)
            : baseY + cursor;
        result.push({x: x, y: y, width: item.width, height: item.height});
        cursor += (horizontal ? item.width : item.height) + gap;
    }
    return result;
}

function byId(ids, positions) {
    const result = {};
    const keys = ids || [];
    const values = positions || [];
    for (let i = 0; i < keys.length && i < values.length; i++)
        result[String(keys[i])] = values[i];
    return result;
}
