// Geometry of the panel keyviz draws behind every group (key-overlay.tsx
// groupStyle), and the one rule it has to obey: the panel is a *background*,
// never a clip. Nothing here clips anything -- instead every decoration that
// paints outside its own layout box declares how far it reaches, and the panel
// is grown until it covers all of them. The renderer asks this file for those
// numbers, so the drawing and the box cannot drift apart.

// press-count.tsx: a 0.75em badge on the last keycap, translated a quarter of
// its own size out of the top-right corner. It is the one decoration that sits
// outside the row by design, and the reason the panel cannot just be the row
// box plus padding.
const BADGE_DIAMETER_EM = 0.75;
const BADGE_OUTSET_EM = BADGE_DIAMETER_EM / 4;

// KeycapSurface paints into a canvas that reaches past the layout box, to give
// the spread ring and the laptop skin's drop shadow room.
const CANVAS_PAD = 1;
const LAPTOP_SHADOW_EM = 0.1;
const SHADOW_MARGIN_FACTOR = 3;

// The rounded corner is the other thing that can swallow content: it eats a
// quarter disc out of the panel. A point inset by `m` from both edges of that
// corner survives iff m >= r - r/sqrt(2).
const CORNER_INSET = 1 - Math.SQRT1_2;

function badgeDiameter(fs) {
    return fs * BADGE_DIAMETER_EM;
}

function badgeOutset(fs) {
    return fs * BADGE_OUTSET_EM;
}

// How far the painted keycap reaches past its own box (canvas spread + shadow).
function paintSpread(fs, type, borderWidth) {
    const shadow = type === "laptop" ? fs * LAPTOP_SHADOW_EM * SHADOW_MARGIN_FACTOR : 0;
    return Math.max(0, borderWidth || 0) + shadow + CANVAS_PAD;
}

// How far a group's content reaches past the row box, per side. `pressCount`
// is the setting, not the current count: reserving only while a badge is on
// screen would resize the group the moment one appears, and every other group
// with it.
function overflow(fs, options) {
    const opts = options || {};
    const spread = paintSpread(fs, opts.type, opts.borderWidth);
    const badge = (opts.pressCount && opts.type !== "minimal") ? badgeOutset(fs) : 0;
    return {
        top: Math.max(spread, badge),
        right: Math.max(spread, badge),
        bottom: spread,
        left: spread
    };
}

// Smallest gap between the panel edge and the content box that keeps the
// content out of the corner's bite.
function cornerInset(radius) {
    return Math.max(0, radius) * CORNER_INSET;
}

function margin(padding, radius) {
    return Math.max(Math.max(0, padding), cornerInset(radius));
}

// The panel box, and where the row of keycaps sits inside it.
function frame(rowWidth, rowHeight, over, marginX, marginY) {
    return {
        width: rowWidth + over.left + over.right + marginX * 2,
        height: rowHeight + over.top + over.bottom + marginY * 2,
        x: marginX + over.left,
        y: marginY + over.top
    };
}

// Is `rect` ({x, y, width, height}, in panel coordinates) inside the rounded
// panel shape? Only the four corners of the shape differ from the rectangle,
// so checking the rect's own corners is enough.
function encloses(panelWidth, panelHeight, radius, rect) {
    const r = Math.min(Math.max(0, radius), Math.min(panelWidth, panelHeight) / 2);
    const corners = [
        [rect.x, rect.y],
        [rect.x + rect.width, rect.y],
        [rect.x, rect.y + rect.height],
        [rect.x + rect.width, rect.y + rect.height]
    ];
    return corners.every(corner => {
        const dx = Math.max(r - corner[0], 0, corner[0] - (panelWidth - r));
        const dy = Math.max(r - corner[1], 0, corner[1] - (panelHeight - r));
        return Math.hypot(dx, dy) <= r + 1e-9;
    });
}
