// Keyboard event grouping ported from Keyviz src/stores/key_event.ts.
// Input labels are the canonical names emitted by keyMapper.js. Snapshots are
// immutable, so QML bindings can observe changes without sharing mutable keys.
function initialState() {
    return { heldKeys: [], groups: [], nextUid: 1 };
}

// keyviz key_event.ts MODIFIERS, expressed over the display labels this plugin
// uses (keyMapper.js maps KEY_LEFTCTRL -> "Ctrl", KEY_LEFTMETA -> "Super", ...).
const MODIFIER_LABELS = ["Ctrl", "Shift", "Alt", "Super", "Fn", "Function"];

function isModifier(label) {
    return MODIFIER_LABELS.indexOf(label) !== -1;
}

// keyviz key_event.ts `ignoreEvent` (key_event.ts:217-230), inverted.
//
// Upstream decides this from `pressedKeys[0]` ALONE -- the first key of the
// sequence. That is fine when a human rolls Ctrl and then C a comfortable
// moment apart, and it is why "A then Ctrl" is not treated as a hotkey. It
// falls apart the moment both keys land in the same millisecond: which one the
// kernel reports first is then a race, so the identical gesture is shown or
// discarded depending on the winner. From the outside that looks like "two keys
// pressed together, only one is recognised", or like a timing threshold that is
// too strict -- there is no threshold involved at all.
//
// So the gate here asks whether the SEQUENCE contains a modifier, not whether
// the first key is one. `Ctrl+C` and `C+Ctrl` then both show, and every key of
// the pair keeps its own press count, which is what the overlay should do while
// two keys are held together.
//
// `previousLabels` is what the group already holds, because the gate runs on
// press: when a modifier arrives second, the key that beat it is already in the
// group, and a helper key like C must not veto the chord it belongs to.
function isAllowedSequence(labels, previousLabels, filter, allowedKeys) {
    if (!filter || filter === "none") return true;
    if (!labels || labels.length === 0) return true;
    const set = filter === "modifiers" ? MODIFIER_LABELS : (allowedKeys || []);
    return labels.concat(previousLabels || []).some(function(label) {
        return set.indexOf(label) !== -1;
    });
}

function shouldShow(filter, heldLabels, allowedKeys) {
    return isAllowedSequence(heldLabels, null, filter, allowedKeys);
}

function newKey(label, now, animateIn) {
    return { label: label, count: 1, lastPressedAt: now, animateIn: animateIn !== false };
}

function carryKey(key) {
    return {
        label: key.label,
        count: key.count,
        lastPressedAt: key.lastPressedAt,
        animateIn: false
    };
}

function press(state, label, now, config) {
    // A key is identified by the label it *displays*, never by the caller's
    // spelling of it. Nearly every caller already presses labels -- the mouse
    // and wheel paths, and the `dms ipc keystrokes test` preview -- but the
    // keyboard path presses raw evdev codes ("KEY_LEFTCTRL"). `displayLabel` is
    // the daemon's mapper for exactly that, so routing every comparison through
    // it keeps the two spellings from splitting one key into two keycaps.
    //
    // They used to split: a repeat searched for "KEY_LEFTCTRL" among keycaps
    // labelled "Ctrl", found nothing, and appended a *second* keycap beside the
    // one it meant to bump. On screen that was Ctrl×1 next to C×2 -- a count
    // that reset, plus a duplicate keycap -- which is the flicker and the "no
    // badge at all" both.
    const keyId = function(raw) { return config.displayLabel ? config.displayLabel(raw) : raw; };
    const named = keyId(label);
    // The upstream native listener discards hardware autorepeat before grouping.
    // `heldKeys` holds display labels, so the guard has to compare identities
    // too -- otherwise "KEY_LEFTCTRL" looks like a fresh key next to "Ctrl".
    if (state.heldKeys.indexOf(named) !== -1) return state;
    const heldKeys = state.heldKeys.concat([named]);

    // What is already in the last group is part of the same physical gesture:
    // the gate runs before the group is updated, so when the modifier arrives
    // second the helper key is already sitting there.
    const last = state.groups[state.groups.length - 1];
    const previousLabels = last ? last.keys.map(function(key) { return keyId(key.label); }) : [];
    if (!isAllowedSequence(heldKeys, previousLabels, config.eventFilter, config.allowedKeys))
        return { heldKeys: heldKeys, groups: state.groups, nextUid: state.nextUid };

    const existing = last && last.keys.some(function(key) { return keyId(key.label) === named; });
    const held = function(key) { return heldKeys.some(function(raw) { return keyId(raw) === keyId(key.label); }); };
    let keys;
    let append = false;
    let replaceAll = false;
    if (existing) {
        // Repressing a key that already sits in the last group is a repeat of
        // *that group*, so it increments that keycap in place. The group is
        // never rebuilt and no new group is pushed.
        //
        // Upstream keyviz instead pushes a brand-new group whenever the last
        // group holds more than one key (`new KeyEvent(...)` in key_event.ts:
        // 156-163), which restarts every count at 1 and gives the group a new
        // uid. Two things went wrong with that here:
        //   * the count never reached the user while a combo was held, and
        //   * the new uid made the overlay tear the group down and rebuild it,
        //     so the press-count badge flickered on every repeat.
        // Incrementing in place fixes both: identity and count survive.
        //
        // A sibling that is no longer held is pruned, which is what upstream's
        // `gKey.in(pressedKeys)` filter did. That pruning is what makes replace
        // mode collapse Ctrl+C+V into Ctrl+V rather than accumulating every key
        // ever pressed; without it the group grows monotonically.
        keys = last.keys.map(function(key) {
            if (keyId(key.label) !== named) return held(key) ? key : null;
            return {
                label: key.label,
                count: key.count + 1,
                lastPressedAt: now,
                animateIn: key.animateIn !== false
            };
        }).filter(function(key) { return key !== null; });
    } else if (heldKeys.length === 1 || !last) {
        // The gate may have discarded an earlier key of this same chord -- press
        // C, then Ctrl: C was rejected while it stood alone, but once the
        // modifier arrives the whole chord is allowed. `heldKeys` still
        // remembers C, so the row is seeded from every held key rather than
        // from the new one alone; otherwise C would sit in `heldKeys` yet never
        // reach the screen, which is exactly "two keys pressed, one shown".
        const seed = !last ? heldKeys : [named];
        keys = seed.map(function(key) { return newKey(key, now); });
        append = true;
        replaceAll = !config.showEventHistory;
    } else {
        append = config.showEventHistory && last.keys.some(function(key) { return !held(key); });
        keys = (append ? last.keys.filter(held).map(carryKey) : last.keys).concat([newKey(named, now)]);
    }
    const group = { uid: !config.showEventHistory ? 0 : (append ? state.nextUid : last.uid), keys: keys };
    const groups = replaceAll ? [group] : append ? state.groups.concat([group])
        : state.groups.slice(0, -1).concat([group]);
    const limit = Math.max(1, config.maxHistory || 5);
    return {
        heldKeys: heldKeys,
        groups: config.showEventHistory ? groups.slice(-limit) : groups,
        nextUid: state.nextUid + (append ? 1 : 0)
    };
}

// keyviz key_event.ts onMouseMove: once a held button starts a drag, the button
// keycap is replaced by `Drag` rather than left to linger, so the key leaves
// both `pressedKeys` and the last group. `release()` deliberately does neither
// (a released key is kept until it expires), hence a separate action.
function dropKey(state, label) {
    const lastIndex = state.groups.length - 1;
    const carried = state.groups.some(function(group, index) {
        return index === lastIndex && group.keys.some(function(key) { return key.label === label; });
    });
    if (state.heldKeys.indexOf(label) === -1 && !carried) return state;
    return {
        heldKeys: state.heldKeys.filter(function(key) { return key !== label; }),
        groups: state.groups.map(function(group, index) {
            const keys = index === lastIndex
                ? group.keys.filter(function(key) { return key.label !== label; }) : group.keys;
            return keys.length === group.keys.length ? group : { uid: group.uid, keys: keys };
        }).filter(function(group) { return group.keys.length > 0; }),
        nextUid: state.nextUid
    };
}

function release(state, label, now) {
    if (state.heldKeys.indexOf(label) === -1) return state;
    const lastIndex = state.groups.length - 1;
    return {
        heldKeys: state.heldKeys.filter(function(key) { return key !== label; }),
        groups: state.groups.map(function(group, index) {
            if (index !== lastIndex || !group.keys.some(function(key) { return key.label === label; })) return group;
            // Unlike upstream's truthy index check, index zero must refresh too.
            return { uid: group.uid, keys: group.keys.map(function(key) {
                return key.label === label ? {
                    label: key.label,
                    count: key.count,
                    lastPressedAt: now,
                    animateIn: key.animateIn !== false
                } : key;
            }) };
        }),
        nextUid: state.nextUid
    };
}

function tick(state, now, config) {
    const groups = state.groups.map(function(group) {
        const keys = group.keys.filter(function(key) {
            return state.heldKeys.indexOf(key.label) !== -1 || now - key.lastPressedAt < config.fadeTimeout;
        });
        return keys.length === group.keys.length ? group : { uid: group.uid, keys: keys };
    }).filter(function(group) { return group.keys.length > 0; });
    if (groups.length === state.groups.length && groups.every(function(group, index) { return group === state.groups[index]; })) return state;
    return { heldKeys: state.heldKeys, groups: groups, nextUid: state.nextUid };
}
