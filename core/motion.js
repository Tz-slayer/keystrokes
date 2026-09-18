// Keyviz's animation vocabulary, shared by every layer that animates something.
// The curves are keyviz's own (store-style bezier splines), and the variant
// rules below are the single description of what "fade", "zoom", "float" and
// "slide" mean -- previously each of them was re-derived at every call site.
const ENTER = [0.23, 1, 0.32, 1, 1, 1];
const EXIT = [0.76, 0, 0.68, 0, 1, 1];
const PRESS = [0.86, 0, 0.07, 1, 1, 1];

function enterCurve() {
    return ENTER;
}

function exitCurve() {
    return EXIT;
}

function pressCurve() {
    return PRESS;
}

// Entrance and exit use different splines even for the same property: entering
// decelerates into place, leaving accelerates away.
function curve(hidden) {
    return hidden ? EXIT : ENTER;
}

function isNone(animType) {
    return animType === "none";
}

// Opacity of a unit that should be hidden. "none" places no entrance animation
// at all, so a hidden unit is still drawn (keyviz's animationType "none").
function opacity(animType, hidden) {
    if (isNone(animType)) return 1;
    return hidden ? 0 : 1;
}

function scale(animType, hidden) {
    return animType === "zoom" && hidden ? 0 : 1;
}

// Distance a hidden unit travels along an axis. keyviz offsets float/slide by
// the font size; the caller passes that as `distance`.
function offset(animType, axis, distance, hidden) {
    if (!hidden) return 0;
    if (axis === "x" && animType === "slide") return distance;
    if (axis === "y" && animType === "float") return distance;
    return 0;
}

// History rows and displaced keycaps reflow with a third of the duration
// (keyviz's layout animation).
function reflowDuration(duration) {
    return duration / 3;
}
