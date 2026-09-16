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
// Both of upstream's branches test `pressedKeys[0]` -- for a single key,
// `event.name` *is* `pressedKeys[0]` -- so the whole rule collapses to one
// predicate over the FIRST PHYSICALLY PRESSED key. That is what makes a lone
// modifier appear ("modifiers" mode keeps any key that is itself a modifier)
// and what makes press order matter: Ctrl-then-A is shown, A-then-Ctrl is not,
// because A is not a modifier even though Ctrl is held by the time it lands.
//
// `heldLabels` must already contain the key being tested, in press order.
function shouldShow(filter, heldLabels, allowedKeys) {
    if (!filter || filter === "none") return true;
    if (!heldLabels || heldLabels.length === 0) return true;
    const first = heldLabels[0];
    const set = filter === "modifiers" ? MODIFIER_LABELS : (allowedKeys || []);
    return set.indexOf(first) !== -1;
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
    // The upstream native listener discards hardware autorepeat before grouping.
    if (state.heldKeys.indexOf(label) !== -1) return state;
    const heldKeys = state.heldKeys.concat([label]);
    const first = config.displayLabel ? config.displayLabel(heldKeys[0]) : heldKeys[0];
    const ignored = config.eventFilter === "modifiers" ? !isModifier(first)
        : config.eventFilter === "custom" ? (config.allowedKeys || []).indexOf(first) === -1 && (config.allowedKeys || []).indexOf(heldKeys[0]) === -1 : false;
    if (ignored) return { heldKeys: heldKeys, groups: state.groups, nextUid: state.nextUid };

    const last = state.groups[state.groups.length - 1];
    const existing = last && last.keys.some(function(key) { return key.label === label; });
    const held = function(key) { return heldKeys.indexOf(key.label) !== -1; };
    let keys;
    let append = false;
    let replaceAll = false;
    if (existing) {
        append = config.showEventHistory && last.keys.length > 1;
        keys = append ? last.keys.filter(held).map(function(key) {
            // A held modifier is context carried into the next shortcut. Only
            // the key that generated this press should replay its entrance.
            return newKey(key.label, now, key.label === label);
        })
            : last.keys.filter(function(key) { return key.label === label || held(key); }).map(function(key) {
                return key.label === label ? {
                    label: key.label,
                    count: key.count + 1,
                    lastPressedAt: now,
                    animateIn: key.animateIn !== false
                } : key;
            });
    } else if (heldKeys.length === 1 || !last) {
        keys = [newKey(label, now)];
        append = true;
        replaceAll = !config.showEventHistory;
    } else {
        append = config.showEventHistory && last.keys.some(function(key) { return !held(key); });
        keys = (append ? last.keys.filter(held).map(carryKey) : last.keys).concat([newKey(label, now)]);
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
