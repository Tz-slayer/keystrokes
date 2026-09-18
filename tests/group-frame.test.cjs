const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers/load.cjs');
const frame = loadCore(['groupFrame.js']);

// The invariant: the group's panel is a background, so every decoration has to
// sit inside the rounded shape. Exercised over the whole settings surface,
// because the corner radius, the border width and the font size all move the
// numbers that decide whether the press-count badge survives the corner.
const SKINS = ['minimal', 'laptop', 'lowprofile', 'pbt'];
const SIZES = [8, 24, 32, 64, 200];
const RADII = [0, 0.25, 0.5, 1, 2];
const BORDERS = [0, 2, 20];

function matrix() {
    const cases = [];
    for (const type of SKINS)
        for (const fs of SIZES)
            for (const radius of RADII)
                for (const borderWidth of BORDERS)
                    for (const pressCount of [false, true])
                        cases.push({type, fs, radius, borderWidth, pressCount});
    return cases;
}

// Where the badge lands in panel coordinates, for a single-key group.
function badgeRect(c) {
    const over = frame.overflow(c.fs, c);
    const corner = c.radius * c.fs * 1.75;
    const marginX = frame.margin(c.fs * 0.4, corner);
    const marginY = frame.margin(c.fs * (c.type === 'minimal' ? 0.25 : 0.4), corner);
    // The row box: one keycap of an arbitrary width, height = body height.
    const rowW = c.fs * 3;
    const rowH = c.fs * 2.75;
    const d = frame.badgeDiameter(c.fs);
    const outset = frame.badgeOutset(c.fs);
    const rowX = marginX + over.left;
    const rowY = marginY + over.top;
    return {
        panel: {width: rowW + over.left + over.right + marginX * 2,
                height: rowH + over.top + over.bottom + marginY * 2},
        corner,
        content: {x: marginX, y: marginY,
                  width: rowW + over.left + over.right,
                  height: rowH + over.top + over.bottom},
        badge: {x: rowX + rowW - d + outset, y: rowY - outset, width: d, height: d}
    };
}

// minimal draws no badge and the setting can be off, so those rows only have
// the content box to satisfy.
const hasBadge = c => c.pressCount && c.type !== 'minimal';

test('the panel encloses the content box and the press-count badge, everywhere', () => {
    for (const c of matrix()) {
        const g = badgeRect(c);
        const where = JSON.stringify(c);
        assert.ok(frame.encloses(g.panel.width, g.panel.height, g.corner, g.content), `content: ${where}`);
        if (hasBadge(c))
            assert.ok(frame.encloses(g.panel.width, g.panel.height, g.corner, g.badge), `badge: ${where}`);
    }
});

test('the badge only sticks out on the sides the panel reserved for', () => {
    for (const c of matrix().filter(hasBadge)) {
        const g = badgeRect(c);
        const where = JSON.stringify(c);
        assert.ok(g.badge.x >= 0 && g.badge.y >= 0, `badge origin: ${where}`);
        assert.ok(g.badge.x + g.badge.width <= g.panel.width, `badge right: ${where}`);
        assert.ok(g.badge.y + g.badge.height <= g.panel.height, `badge bottom: ${where}`);
    }
});

test('padding is widened when the corner radius would bite into the content', () => {
    assert.equal(frame.margin(12.8, 28), 12.8);                  // 0.4em already clears a 28px corner
    assert.ok(frame.margin(12.8, 112) > 12.8);                   // radius 2 needs more room
    assert.ok(frame.encloses(2 * frame.margin(0, 112) + 10, 2 * frame.margin(0, 112) + 10, 112,
        {x: frame.margin(0, 112), y: frame.margin(0, 112), width: 10, height: 10}));
    // No panel, no corner: the padding must not be invented.
    assert.equal(frame.cornerInset(0), 0);
});

test('overflow reserves the badge and the canvas spread, per skin', () => {
    const withBadge = frame.overflow(32, {type: 'pbt', borderWidth: 2, pressCount: true});
    assert.equal(withBadge.top, frame.badgeOutset(32));          // badge reaches further up than the paint
    assert.equal(withBadge.right, frame.badgeOutset(32));
    assert.equal(withBadge.bottom, frame.paintSpread(32, 'pbt', 2));
    const laptop = frame.overflow(32, {type: 'laptop', borderWidth: 0, pressCount: false});
    assert.ok(laptop.bottom > withBadge.bottom);                 // the drop shadow spreads further
    // minimal draws no badge, so there is nothing to reserve above the row.
    const minimal = frame.overflow(32, {type: 'minimal', borderWidth: 2, pressCount: true});
    assert.equal(minimal.top, frame.paintSpread(32, 'minimal', 2));
});

test('the row sits inside the frame it was given', () => {
    const over = {top: 4, right: 6, bottom: 3, left: 5};
    const f = frame.frame(100, 50, over, 10, 8);
    assert.equal(f.width, 100 + 5 + 6 + 20);
    assert.equal(f.height, 50 + 4 + 3 + 16);
    assert.equal(f.x, 15);
    assert.equal(f.y, 12);
});
