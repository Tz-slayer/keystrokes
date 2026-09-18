// Keyboard event grouping ported from Keyviz src/stores/key_event.ts.
// Input labels are the canonical names emitted by keyMapper.js. Snapshots are
// immutable, so QML bindings can observe changes without sharing mutable keys.
//
// `heldKeys` is what is physically down, `group.keys[].count` is what the user
// sees. They normally move together, with ONE deliberate exception: a modifier
// pressed with nothing else down (`pending`). Such a press is the start of
// either a repeat (`Ctrl`, `Ctrl` -> two) or a chord (`Ctrl`, `C` -> one each),
// and those want opposite answers -- so the press is provisional. It is shown
// (a lone keycap has to say *something*), and the next event decides what it
// was:
//
//   * another key arrives and it was one of the previous row's members
//     -> the shortcut was retyped: undo the provisional row, count it,
//   * another key arrives otherwise -> take it back down to one: this is the
//     first key of a chord, not a repeat,
//   * nothing arrives -> the row just fades, and the provisional count stands.
//
// Crucially the *release* does not settle it. A modifier released with nothing
// else down looks identical whether it was a tap or the opening of a chord the
// user is still typing, so the question has to outlive the release; only a
// later press can answer it.
//
// `pendingRepeat` is the separate, older question of a row's *material*: a
// repress with nothing held may be the same shortcut retyped (keep the row's
// members and count them) or a different one sharing a key (drop them). A key
// the row already holds confirms the repeat, any other key refutes it.
function initialState() {
    return { heldKeys: [], groups: [], nextUid: 1, pendingRepeat: false, pending: null };
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
    const priorHeld = state.heldKeys;
    const heldKeys = state.heldKeys.concat([named]);
    // What was down when this press arrived, before the new key joins. The
    // group's own key list cannot answer this: it still lists the members of an
    // expired chord, so "is this chord live" read off it is a tautology.
    const was = function(key) { return priorHeld.some(function(raw) { return keyId(raw) === keyId(key.label); }); };
    // The row this press may belong to, and whether that keystroke is still in
    // flight. A row whose members are all up is a finished record: the keycaps
    // are still on screen but the keystroke is over, which is exactly the
    // distinction between "the same shortcut pressed again" and "a new one that
    // happens to share a key".
    const row = state.groups[state.groups.length - 1];
    const chordLive = !!row && row.keys.some(function(key) { return was(key); });

    // What is already in the last group is part of the same physical gesture:
    // the gate runs before the group is updated, so when the modifier arrives
    // second the helper key is already sitting there.
    const previousLabels = row ? row.keys.map(function(key) { return keyId(key.label); }) : [];
    if (!isAllowedSequence(heldKeys, previousLabels, config.eventFilter, config.allowedKeys))
        return {
            heldKeys: heldKeys,
            groups: state.groups,
            nextUid: state.nextUid,
            // A discarded key is not an answer, so an open question stays open.
            pendingRepeat: state.pendingRepeat,
            pending: state.pending
        };

    const existing = !!row && row.keys.some(function(key) { return keyId(key.label) === named; });
    // An open question from a previous press, if any. `resumed` is the case
    // where the key arriving is the deferred one itself -- the same physical
    // gesture continuing, so nothing has to be decided -- and `resolves` is any
    // other key, which is exactly the evidence the deferral was waiting for.
    const carried = state.pending;
    const resumed = carried && keyId(carried.key) === named ? carried : null;
    const resolves = carried && !resumed ? carried : null;
    // A modifier pressed with nothing else down, while no question is already
    // open, is the ambiguous press this whole mechanism exists for. Anywhere
    // else there is nothing to defer: a chord in flight has already been
    // decided, and a tap inside a chord (Ctrl+C, C up, C down) must not wait
    // for a key that will never come.
    const defers = isModifier(named) && priorHeld.length === 0 && !resumed;
    let keys;
    let newRow = false;
    // Rows before the one being written. A press that lands on the last row
    // rewrites it; only a press that starts a keystroke pushes another. The
    // deferred branches set this to the rows they interrupted, so a resolution
    // can put those back instead of leaving the provisional row behind.
    let history = state.groups.slice(0, -1);
    let nextUid = state.nextUid;
    let pending = null;
    // Whether this press left a repeat question open for the branch below: true
    // only for a deferred press onto a finished multi-key row.
    let refutable = false;
    if (resumed) {
        // The deferred key itself, pressed again with nothing else down: a tap
        // sequence continuing (`Ctrl`, `Ctrl`, `Ctrl`). Nothing about the
        // previous press needs re-deciding, so it simply stops being
        // provisional -- the count it shows becomes the count it has, and this
        // press adds one on top. No other key can be part of this gesture,
        // because there is none down.
        const settled = resumed.settled + 1;
        keys = [{ label: named, count: settled + 1, lastPressedAt: now, animateIn: true }];
        pending = {
            key: named,
            settled: settled,
            reserved: resumed.reserved,
            refutable: resumed.refutable,
            oldGroups: resumed.oldGroups,
            oldNextUid: resumed.oldNextUid
        };
    } else if (resolves) {
        // The deferred press turns out to be the first key of this chord after
        // all -- the answer the deferral was waiting for. Which chord is decided
        // by whether the key arriving was a member of the row the deferred press
        // interrupted.
        const retyped = resolves.reserved.some(function(entry) {
            return keyId(entry.label) === keyId(named);
        });
        if (retyped) {
            // Retyped: the provisional row was wrong, so it is undone and the
            // row it interrupted comes back -- counted, because both presses of
            // this shortcut did happen. `Ctrl+C` retyped means Ctrl was pressed
            // twice and so was C.
            //
            // `reserved` is the whole interrupted row, the deferred key's own
            // earlier press included. The deferred press is counted by its
            // provisional number (`settled + 1`), which the deferral already
            // worked out; the key arriving bumps its own entry.
            keys = resolves.reserved.map(function(entry) {
                if (keyId(entry.label) === keyId(named))
                    return { label: entry.label, count: entry.count + 1, lastPressedAt: now, animateIn: true };
                if (keyId(entry.label) === keyId(resolves.key))
                    return { label: entry.label, count: resolves.settled + 1, lastPressedAt: now, animateIn: false };
                return { label: entry.label, count: entry.count, lastPressedAt: entry.lastPressedAt, animateIn: false };
            });
            history = resolves.oldGroups;
            nextUid = resolves.oldNextUid;
        } else {
            // A chord, not a repeat: the deferred press was this keystroke's
            // modifier all along, so its provisional count comes back down to
            // one -- the repeat the overlay guessed at never happened.
            //
            // The row it interrupted is not thrown away, though. Ctrl pressed
            // while C has just been released is still `Ctrl+C+V` in the making,
            // and upstream keeps released members for exactly that reason: the
            // user let go of C to reach V, not to start over. So the row comes
            // back with the deferred key at one and the arriving key appended --
            // but only while it is still live, i.e. while some member of it is
            // down. A row whose members are all up is a finished record, and a
            // new keystroke sharing its modifier starts clean (`Ctrl+C` then
            // `Ctrl+V` reads `Ctrl+V`).
            const live = resolves.reserved.some(function(entry) {
                return heldKeys.some(function(raw) { return keyId(raw) === keyId(entry.label); });
            }) && !resolves.refutable;
            const kept = live
                ? resolves.reserved.filter(function(entry) {
                    return keyId(entry.label) !== keyId(resolves.key)
                        && keyId(entry.label) !== keyId(named);
                }).map(carryKey)
                : [];
            // Replacement mode shows one row, so the deferred key's keycap is
            // being rebuilt along with the row and enters afresh; history mode
            // keeps the row it was on and only moves the keycap forward, so its
            // entrance animation must not fire a second time.
            const modifier = config.showEventHistory
                ? { label: resolves.key, count: 1, lastPressedAt: now, animateIn: false }
                : newKey(resolves.key, now);
            keys = [modifier].concat(kept).concat([newKey(named, now)]);
            history = resolves.oldGroups;
            nextUid = resolves.oldNextUid;
        }
    } else if (defers) {
        // The ambiguous press. Its provisional count is `settled + 1`, where
        // `settled` is what this key already shows on the row it is arriving
        // onto -- zero if the row never held it. Both shapes are the same
        // arithmetic: tapping `Ctrl` twice takes the row's `Ctrl×1` to `×2`, and
        // so does opening a chord over a finished `Ctrl×1+C×1` before the C
        // arrives. Nothing is final yet, so the row it interrupts is kept WHOLE
        // -- deferred key included, at the count it had -- ready to be restored
        // if the next key says "retyped" rather than "chord".
        const settled = existing ? row.keys.filter(function(key) {
            return keyId(key.label) === named;
        })[0].count : 0;
        // A row that is nothing but this key, with nothing else down, is being
        // *continued*: `Ctrl` tapped twice is one keystroke's worth of history,
        // and upstream keeps it on one row with a growing count. Pushing a
        // second row here would tear the keycap down and rebuild it -- the
        // flicker the in-place increment exists to avoid -- and would leave
        // history mode showing `Ctrl | Ctrl` where `Ctrl` is the truth.
        //
        // Anything else (a fresh key, or a chord being reopened) is a new row,
        // with the row it interrupts held in reserve.
        const alone = existing && row.keys.length === 1;
        // A deferred press onto a finished multi-key row leaves the repeat
        // question open: if a *different* key turns up next, the members that
        // are no longer down were leftovers, not a gesture in progress, and the
        // row should start clean. A deferred press is exactly the "repress onto
        // a finished combo" `pendingRepeat` was written for.
        refutable = !alone && !chordLive && !!row && row.keys.length > 1;
        keys = [{ label: named, count: settled + 1, lastPressedAt: now, animateIn: true }];
        pending = {
            key: named,
            settled: settled,
            reserved: row ? row.keys.map(function(key) {
                return { label: key.label, count: key.count, lastPressedAt: key.lastPressedAt, animateIn: key.animateIn };
            }) : [],
            refutable: refutable,
            oldGroups: state.groups,
            oldNextUid: state.nextUid
        };
        newRow = !alone;
        // A new row is pushed on top of what is there; a continued row replaces
        // the last one, which is the default `history`.
        if (newRow) history = state.groups;
    } else if (existing && chordLive && row.keys.every(function(key) { return was(key); })) {
        // Every key of the row is down and this press repeats one of them: the
        // same keystroke, pressed again. The row keeps its identity and only
        // that keycap grows.
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
        // The every-key-down guard is what makes the identity check meaningful:
        // a row that still lists a key which is up is not the keystroke being
        // pressed, it merely shares a key with it. `Ctrl+C` then `Ctrl+V` must
        // rebuild, not bump the Ctrl of a keystroke that has already finished.
        keys = row.keys.map(function(key) {
            return keyId(key.label) === named
                ? { label: key.label, count: key.count + 1, lastPressedAt: now, animateIn: key.animateIn !== false }
                : key;
        });
    } else if (existing && chordLive) {
        // A live chord and a press on one of its keys. Siblings that are no
        // longer held are pruned: while the chord is still under a finger, a
        // member that has gone up really has been let go of, so `Ctrl+C` then
        // `Ctrl+V` collapses to `Ctrl+V` instead of piling up. The prune is what
        // makes the row trustworthy while the gesture is in progress.
        keys = row.keys.map(function(key) {
            if (keyId(key.label) === named)
                return { label: key.label, count: key.count + 1, lastPressedAt: now, animateIn: key.animateIn !== false };
            return was(key) ? carryKey(key) : null;
        }).filter(function(key) { return key !== null; });
    } else if (existing) {
        // A repress that is not a live repeat: the row is a record of a
        // keystroke that has finished, and this press starts a new one that
        // happens to share a key with it. Its count carries over -- the user did
        // press it that many times -- and the members that are no longer down
        // are held in reserve rather than dropped, because the same repress on a
        // multi-key row means either "this shortcut again" (the siblings stay
        // and count) or "a different shortcut starting the same way" (they go).
        // At this instant nothing on the machine can tell which, so `refutable`
        // leaves the question open for the next key to answer.
        keys = row.keys.map(function(key) {
            return keyId(key.label) === named
                ? { label: key.label, count: key.count + 1, lastPressedAt: now, animateIn: key.animateIn !== false }
                : { label: key.label, count: key.count, lastPressedAt: key.lastPressedAt, animateIn: false };
        });
        refutable = !chordLive && row.keys.length > 1;
    } else {
        // A key the row does not already hold. Its members that are no longer
        // down normally linger -- upstream had it that way, and dropping C the
        // instant it is released would erase `Ctrl+C+V` the moment V arrives,
        // exactly when the user is reaching for it.
        //
        // Two things end that reprieve. A row that is not live (nothing of it is
        // down any more) is a finished record rather than a gesture in progress,
        // so `Ctrl+C` let go of completely and then `Ctrl+V` reads as `Ctrl+V`.
        // And a key arriving after a deferred press was left open refutes the
        // repeat that press might have been starting, so the row starts clean.
        const live = row && row.keys.some(function(key) { return was(key); });
        const survivors = !row ? [] : row.keys.filter(function(key) {
            return was(key) || (live && !state.pendingRepeat);
        });
        // In history mode a member that is no longer down belongs to the
        // keystroke that has just finished, so it keeps its own row and the new
        // press opens the next one: `Ctrl+1` then `Ctrl+2` is two rows, not one
        // row growing a third keycap. In replacement mode the overlay shows a
        // single row and the member lingers in place.
        newRow = config.showEventHistory && survivors.some(function(key) { return !was(key); });
        keys = (newRow ? survivors.filter(was) : survivors).map(carryKey).concat(
            heldKeys.filter(function(key) {
                return !survivors.some(function(entry) { return keyId(entry.label) === keyId(key); });
            }).map(function(key) { return newKey(key, now); }));
        if (newRow) history = state.groups;
    }
    const group = { uid: !config.showEventHistory ? 0 : (newRow || !row ? nextUid : row.uid), keys: keys };
    // Rows before the one being written are kept untouched: only the row the
    // press lands on changes, and only a new keystroke pushes another row.
    // `history` is what the deferred press interrupted, so a "retyped" answer
    // can splice back into it instead of appending after the provisional row.
    const groups = config.showEventHistory ? history.concat([group]) : [group];
    const limit = Math.max(1, config.maxHistory || 5);
    return {
        heldKeys: heldKeys,
        groups: config.showEventHistory ? groups.slice(-limit) : groups,
        nextUid: nextUid + (newRow ? 1 : 0),
        pendingRepeat: refutable,
        pending: pending
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
        pendingRepeat: state.pendingRepeat,
        // A key vanishing from the overlay is not an answer either. The
        // deferred press has its own release to survive; this is the drag case,
        // where the row is being rewritten around a different gesture.
        pending: state.pending
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
        pendingRepeat: state.pendingRepeat,
        // Releasing the deferred key does NOT answer the question. A modifier
        // released with nothing else down looks the same whether it was a tap or
        // the opening of a chord the user is still reaching for, and settling it
        // here is what made `Ctrl` tapped three times then `Ctrl+C` read as a
        // repeat instead of a fresh chord. Only a later press can tell the two
        // apart; if none comes, the row fades and the provisional count stands.
        pending: state.pending
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
        pendingRepeat: state.pendingRepeat,
        // Same for the deferred modifier: a press that is still under a finger
        // can still gain a helper key, whatever else has expired meanwhile. Once
        // the row it belongs to has faded there is nothing left to answer, but
        // the row can only fade after the key itself was released.
        pending: state.pending
    };
}
