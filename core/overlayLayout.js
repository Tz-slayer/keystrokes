// Pure layout helpers shared by the overlay and its regression tests.
// Positions are absolute within one output, so removing a history item cannot
// produce a second, compensating movement from a resized parent container.
// Sentinel `monitorName` values. Both mean "follow the screen that holds the
// focused workspace". "" is the historical spelling and stays supported so
// existing installs keep working, but the settings dropdown now writes
// `followFocusValue()` -- see the note on `followsFocus` for why.
function followFocusValue() {
    return "@focused";
}

// Sentinel meaning "the first output" -- no motion, ever.
function primaryValue() {
    return "@primary";
}

// Why "" must not be what the settings dropdown writes: SelectionSettingPlus
// pushes a choice back through `labelToValue[label]`, and that lookup used to be
// spelled with `||` (dms/widgets/SelectionSettingPlus.qml). An empty-string value
// is falsy, so re-selecting the option silently persisted its *label* -- "Follow
// focused output" -- instead of the sentinel. The overlay then read a monitorName
// that was neither automatic nor an output name, so it pinned itself to the
// first output and stopped following focus; toggling the setting again could not
// recover it because the same falsy value was dropped on the way back. A truthy
// sentinel survives the round trip, and the widget now resolves the label with
// an exact lookup rather than `||`, so no option value can leak its label again.
//
// `followsFocus` is the one place that decides what "follow the focused output"
// means. Both the overlay and the settings page ask it, so the two cannot drift
// apart -- a duplicated rule is exactly what let "Display" store a value the
// overlay did not recognise as automatic.
//
// The legacy "" spelling is accepted so a settings file written before this
// sentinel existed still reads as automatic.
function followsFocus(configured) {
    return configured === undefined || configured === null
        || configured === "" || configured === followFocusValue();
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
    // Both automatic spellings resolve identically; anything that is not the
    // primary sentinel and not an output we own falls through to focus.
    if (configured && configured !== followFocusValue() && names.indexOf(configured) !== -1)
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

// The output the overlay should commit to, or "" when the focus is *unknown*.
// "" is a signal, not a fallback: the caller must keep the output it already
// has. CompositorService.getFocusedScreen() cannot express that -- it answers
// screens[0] whenever the compositor fails to name the focused output, which
// is indistinguishable from a real move to the first output. A workspace
// switch can drop the focused output for a moment, and that used to yank the
// window (and rebuild every keycap) onto another monitor.
// `configured` decides on its own whether this is automatic: the first
// argument is only the caller's own reading of it, kept so the signature stays
// backwards compatible. Deriving it here means a caller that computed the flag
// from a different rule (or from a stale value) cannot silently pin the overlay
// to the wrong output -- which is what the retired falsy sentinel did.
function focusedTarget(callerSaysFollows, configured, focusedName, available) {
    if (!followsFocus(configured))
        return screenName(configured, "", available);
    const names = available || [];
    if (focusedName && names.indexOf(focusedName) !== -1)
        return focusedName;
    return "";
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
