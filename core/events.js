// Keyboard event grouping ported from Keyviz src/stores/key_event.ts.
// Input labels are the canonical names emitted by keyMapper.js. Snapshots are
// immutable, so QML bindings can observe changes without sharing mutable keys.
// `pendingRepeat` carries the one undecidable case across a single event: a key
// was repressed with nothing held, so the row may be the start of the same
// shortcut retyped (keep its members and count them) or of a different one that
// merely shares the modifier (drop them). The next press settles it -- a key the
// row already holds confirms the repeat, any other key refutes it.
function initialState() {
    return { heldKeys: [], groups: [], nextUid: 1, pendingRepeat: false };
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
    // What was down when this press arrived, before the new key joins. The
    // group's own key list cannot answer this: it still lists the members of an
    // expired chord, so "is this chord live" read off it is a tautology.
    const priorHeld = state.heldKeys;
    const heldKeys = state.heldKeys.concat([named]);

    // What is already in the last group is part of the same physical gesture:
    // the gate runs before the group is updated, so when the modifier arrives
    // second the helper key is already sitting there.
    const last = state.groups[state.groups.length - 1];
    const previousLabels = last ? last.keys.map(function(key) { return keyId(key.label); }) : [];
    if (!isAllowedSequence(heldKeys, previousLabels, config.eventFilter, config.allowedKeys))
        return {
            heldKeys: heldKeys,
            groups: state.groups,
            nextUid: state.nextUid,
            // A discarded key is not an answer, so an open question stays open.
            pendingRepeat: state.pendingRepeat
        };

    const existing = last && last.keys.some(function(key) { return keyId(key.label) === named; });
    const held = function(key) { return heldKeys.some(function(raw) { return keyId(raw) === keyId(key.label); }); };
    // A chord is live when at least one of its members was already down before
    // this press. That is what makes the prune trustworthy: while Ctrl is
    // physically held, C vanishing from `heldKeys` really does mean the user let
    // go of C, so Ctrl+C then Ctrl+V collapses to Ctrl+V instead of piling up.
    //
    // It deliberately does NOT answer "is this the same shortcut as last time".
    // Both questions are asked of the same key list and want opposite answers --
    // Ctrl+C released, then Ctrl repressed is either "Ctrl+C again" (keep C and
    // count it) or "Ctrl+V" (drop C) -- and at this instant nothing on the
    // machine can tell which. Hence `pendingRepeat` below: the decision waits
    // for the next key, which is the first moment the two differ.
    const chordLive = last ? last.keys.some(function(key) {
        return priorHeld.some(function(raw) { return keyId(raw) === keyId(key.label); });
    }) : false;
    // The row this press belongs to left a repeat undecided last time, and the
    // key now arriving is one of its own members: that is the confirmation.
    // Retrying Ctrl+C keeps C after all, so both keycaps count up. Nothing is
    // pruned, because every member of the chord is under a finger again.
    const confirmsRepeat = existing && state.pendingRepeat && !chordLive;
    // Decide the deferred question for the rows that came before this one: a
    // `pendingRepeat` that this press did not confirm was a leftover member, so
    // the row is now known to be a finished record and keeps its counts as-is.
    let keys;
    let append = false;
    let replaceAll = false;
    if (confirmsRepeat) {
        keys = last.keys.map(function(key) {
            return keyId(key.label) === named
                ? { label: key.label, count: key.count + 1, lastPressedAt: now, animateIn: key.animateIn !== false }
                : key;
        });
    } else if (existing) {
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
        // `gKey.in(pressedKeys)` filter did, and what makes Ctrl+C+V collapse
        // into Ctrl+V rather than accumulating every key ever pressed. The prune
        // is confined to a live chord: once every key has been lifted the row is
        // a record of what was typed, and pruning there tore it down to the one
        // key being repressed, so a retyped chord never counted its helper key.
        keys = last.keys.map(function(key) {
            if (keyId(key.label) !== named) return (chordLive && !held(key)) ? null : key;
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
        // A key the row does not already hold. Normally a member that is no
        // longer down lingers, as upstream had it: dropping C the instant it is
        // released would erase Ctrl+C+V the moment V arrives.
        //
        // The exception is the leftover a pending repeat was keeping alive. If
        // the row's previous press left the repeat undecided, this unrelated key
        // is the answer -- it is not the chord being retyped, so the member that
        // was being held in reserve goes. Without this, Ctrl+C then Ctrl+V keeps
        // the C and reads as one long Ctrl+C+V.
        const refuted = state.pendingRepeat
            ? last.keys.filter(function(key) { return held(key); })
            : last.keys;
        append = config.showEventHistory && refuted.some(function(key) { return !held(key); });
        keys = (append ? refuted.filter(held).map(carryKey) : refuted).concat([newKey(named, now)]);
    }
    const group = { uid: !config.showEventHistory ? 0 : (append ? state.nextUid : last.uid), keys: keys };
    const groups = replaceAll ? [group] : append ? state.groups.concat([group])
        : state.groups.slice(0, -1).concat([group]);
    const limit = Math.max(1, config.maxHistory || 5);
    return {
        heldKeys: heldKeys,
        groups: config.showEventHistory ? groups.slice(-limit) : groups,
        nextUid: state.nextUid + (append ? 1 : 0),
        // Only a repress onto a multi-key row that arrived with nothing held is
        // left open -- and only when it was not itself the answer to an open
        // question. Anything else, including the refutation a foreign key just
        // delivered, is already decided.
        pendingRepeat: !confirmsRepeat && existing && !chordLive && last.keys.length > 1
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
        nextUid: state.nextUid,
        pendingRepeat: state.pendingRepeat
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
        nextUid: state.nextUid,
        pendingRepeat: state.pendingRepeat
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
    return {
        heldKeys: state.heldKeys,
        groups: groups,
        nextUid: state.nextUid,
        // Expiry is not a new press, so it cannot answer the pending question.
        // The row it belonged to may have lost the very key that was going to
        // answer it, in which case the question simply lapses with the row.
        pendingRepeat: state.pendingRepeat
    };
}
