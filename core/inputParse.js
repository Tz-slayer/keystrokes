// Line parsing for the two input sources this plugin can run:
//
//   * `libinput debug-events --show-keycodes` (the default, any device)
//   * `evtest` (fallback for a single device)
//
// Pure functions, no settings and no state: the daemon decides what to do with
// each event (and whether mouse events are enabled at all). Keeping the regexes
// here is what makes the tricky parts -- wheel direction, the accelerated
// motion pair, the button labels -- testable without a compositor.
//
// `event(line)` returns one of:
//   {kind: "key",    name, pressed}
//   {kind: "button", button, pressed}
//   {kind: "scroll", direction}        +1 down, -1 up
//   {kind: "motion", dx, dy}           libinput's accelerated deltas
//   {kind: "axis",   axis, value}      evtest REL_* (fallback only)
// or null when the line is not an input event.

function event(line) {
    if (line.indexOf("EV_KEY") !== -1) {
        const name = keyName(line);
        if (!name) return null;
        if (line.indexOf("value 1") !== -1) return {kind: "key", name: name, pressed: true};
        if (line.indexOf("value 0") !== -1) return {kind: "key", name: name, pressed: false};
        return null;
    }
    if (line.indexOf("KEYBOARD_KEY") !== -1) {
        const name = keyName(line);
        if (!name) return null;
        if (line.indexOf("pressed") !== -1) return {kind: "key", name: name, pressed: true};
        if (line.indexOf("released") !== -1) return {kind: "key", name: name, pressed: false};
        return null;
    }
    if (line.indexOf("POINTER_BUTTON") !== -1) {
        if (line.indexOf("pressed") !== -1) return {kind: "button", button: mouseButtonLabel(line), pressed: true};
        if (line.indexOf("released") !== -1) return {kind: "button", button: mouseButtonLabel(line), pressed: false};
        return null;
    }
    // Covers POINTER_SCROLL_WHEEL / _FINGER / _CONTINUOUS.
    if (line.indexOf("POINTER_SCROLL_") !== -1) {
        const direction = scrollDirection(line);
        return direction === 0 ? null : {kind: "scroll", direction: direction};
    }
    if (line.indexOf("POINTER_MOTION") !== -1 && line.indexOf("POINTER_MOTION_ABSOLUTE") === -1) {
        const delta = motionDeltas(line);
        return delta === null ? null : {kind: "motion", dx: delta[0], dy: delta[1]};
    }
    if (line.indexOf("EV_REL") !== -1) {
        const axis = relativeAxis(line);
        return axis === null ? null : {kind: "axis", axis: axis.axis, value: axis.value};
    }
    return null;
}

function keyName(line) {
    const match = line.match(/(KEY_[A-Z0-9_]+)/);
    return match ? match[1] : null;
}

// evdev has no notion of "left button"; the label is what keyviz renders.
function mouseButtonLabel(line) {
    if (line.indexOf("BTN_LEFT") !== -1 || line.indexOf("(272)") !== -1) return "LMB Click";
    if (line.indexOf("BTN_RIGHT") !== -1 || line.indexOf("(273)") !== -1) return "RMB Click";
    if (line.indexOf("BTN_MIDDLE") !== -1 || line.indexOf("(274)") !== -1) return "MMB Click";
    return "Mouse Click";
}

// libinput reports the wheel on the Wayland axis convention where positive is
// "down": "vert 15.00/120.0* horiz 0.00/0.0 (wheel)". The angle (second value)
// is the notch count * 120; the first value is the unaccelerated remainder.
// Touchpad scrolling (POINTER_SCROLL_FINGER / _CONTINUOUS) reports a plain pixel
// delta with no v120 component, so that one is the fallback.
function scrollDirection(line) {
    const match = line.match(/vert\s+(-?[\d.]+)\/(-?[\d.]+)/);
    if (!match) return 0;
    let value = parseFloat(match[2]);
    if (!(value > 0) && !(value < 0)) value = parseFloat(match[1]);
    if (!(value > 0) && !(value < 0)) return 0;
    return value > 0 ? 1 : -1;
}

// libinput prints "  1.28/ -1.28 ( +1.00/ -1.00)": the first pair already
// carries libinput's acceleration, so it is the pair that tracks what the
// cursor did on screen (the parenthesised raw deltas do not).
function motionDeltas(line) {
    const match = line.match(/([+-]?[\d.]+)\/\s*([+-]?[\d.]+)/);
    if (!match) return null;
    return [parseFloat(match[1]), parseFloat(match[2])];
}

// evtest fallback: one axis per line, e.g.
// "Event: time ..., type 2 (EV_REL), code 0 (REL_X), value 12".
function relativeAxis(line) {
    const code = line.match(/code\s+(\d+)\s+\((REL_[A-Z_]+)\)/);
    const value = line.match(/value\s+(-?\d+)/);
    if (!code || !value) return null;
    return {axis: code[2], value: parseInt(value[1], 10)};
}

// REL_WHEEL +1 is physically up (X11 button 4), which is -1 in keyviz's
// convention. REL_HWHEEL is treated as the same axis.
function wheelDirection(axis, value) {
    if (axis !== "REL_WHEEL" && axis !== "REL_HWHEEL") return 0;
    if (value === 0) return 0;
    return value > 0 ? -1 : 1;
}
