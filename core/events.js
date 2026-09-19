// Keyboard event grouping ported from Keyviz src/stores/key_event.ts.
// Input labels are the canonical names emitted by keyMapper.js. Snapshots are
// immutable, so QML bindings can observe changes without sharing mutable keys.
//
// `heldKeys` is what is physically down, `group.keys[].count` is what the user
// sees. They normally move together, with ONE deliberate exception: a modifier
// pressed with nothing else down (`pending`).
//
// A count is how many times that key was pressed, and it NEVER goes backwards:
// Ctrl tapped four times and then pressed once more as `Ctrl+C` is five presses
// of Ctrl, so the row reads `Ctrl×5 + C×1`. Dropping the modifier back to one
// because a chord formed reads as the count resetting, which is the thing this
// overlay exists to show. Both readings of a lone modifier -- "the fourth tap"
// and "the first key of `Ctrl+C`" -- therefore want the SAME number.
//
// What they disagree about is the row's other members, so that is what the
// deferral decides. The press is shown (a lone keycap has to say *something*)
// and the next event settles it:
//
//   * another key arrives and it was one of the previous row's members
//     -> the shortcut was retyped: undo the provisional row, count every key,
//   * another key arrives otherwise -> a different chord: the modifier keeps
//     its count, the members that are no longer held are dropped,
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
//
// A refused press needs no separate bookkeeping to be *redeemed*: the gate
// judges the FIRST key of the sequence, so a key it refuses stays the first key
// for as long as it is held and everything pressed after it is refused too.
//
// It does need to be told apart from a drawn one, though. `heldKeys` is physical
// (upstream's `pressedKeys`: a refused key stays there, which is what keeps the
// whole sequence out), while `shownKeys` is what the overlay may draw -- a key
// whose press the gate refused is down but must leave no trace, or the keycap it
// matches in an older row plays a press animation for a keystroke the filter
// just said it would not show.
function initialState() {
    return { heldKeys: [], groups: [], nextUid: 1, pendingRepeat: false, pending: null, shownKeys: [] };
}

// keyviz key_event.ts MODIFIERS, expressed over the display labels this plugin
// uses (keyMapper.js maps KEY_LEFTCTRL -> "Ctrl", KEY_LEFTMETA -> "Super", ...).
const MODIFIER_LABELS = ["Ctrl", "Shift", "Alt", "Super", "Fn", "Function"];

function isModifier(label) {
    return MODIFIER_LABELS.indexOf(label) !== -1;
}

// keyviz key_event.ts `ignoreEvent` (key_event.ts:217-230). The FIRST key of the
// sequence decides: a shortcut is `Ctrl` and then something, never the reverse.
// `Ctrl+C` shows, `C+Ctrl` does not -- the modifier has to lead.
//
// `labels` is every key currently down, oldest first, so `labels[0]` is the key
// the gesture started with. A refused key stays in `heldKeys`, which makes it
// that first key for as long as it is held: everything pressed after it is
// refused too -- the same shape upstream gets from `pressedKeys[0]`.
//
// The price is deliberate and worth stating: when two keys land in the same
// millisecond, which one the kernel reports first is a race, so a chord typed as
// one motion is shown or dropped on that coin flip. Upstream behaves the same
// way. This plugin used to accept a modifier ANYWHERE in the sequence to dodge
// that race, which also accepted `C` then `Ctrl` -- a sequence that is not a
// shortcut.
function isAllowedSequence(labels, filter, allowedKeys) {
    if (!filter || filter === "none") return true;
    if (!labels || labels.length === 0) return true;
    const set = filter === "modifiers" ? MODIFIER_LABELS : (allowedKeys || []);
    return set.indexOf(labels[0]) !== -1;
}

function shouldShow(filter, heldLabels, allowedKeys) {
    return isAllowedSequence(heldLabels, filter, allowedKeys);
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

    // The gate looks at the whole of `heldKeys` and judges only its first entry,
    // so a refused key stays in charge for as long as it is down. Members the
    // row still lists but that have been released are NOT in `heldKeys` at all,
    // which is what keeps `Ctrl`, release, `R` from qualifying as `Ctrl+R`.
    if (!isAllowedSequence(heldKeys, config.eventFilter, config.allowedKeys))
        return {
            heldKeys: heldKeys,
            groups: state.groups,
            nextUid: state.nextUid,
            // A discarded key is not an answer, so an open question stays open.
            pendingRepeat: state.pendingRepeat,
            pending: state.pending,
            // Held, but deliberately not shown: the overlay must not react to it.
            shownKeys: state.shownKeys
        };

    const existing = !!row && row.keys.some(function(key) { return keyId(key.label) === named; });
    // An open question from a previous press, if any. `resumed` is the case
    // where the key arriving is the deferred one itself -- the same physical
    // gesture continuing, so nothing has to be decided -- and `resolves` is any
    // other key, which is exactly the evidence the deferral was waiting for.
    const carried = state.pending;
    const resumed = carried && keyId(carried.key) === named ? carried : null;
    // A deferred modifier only opens a chord while it is still down. Let go
    // before the partner arrives, it was a tap, and the partner starts its own
    // gesture: `Ctrl`, release, `R` is two separate presses, not Ctrl+R. The
    // deferral therefore survives the release but stops claiming the next key
    // the moment that key can see the modifier is no longer held.
    const carriedLive = !!carried && heldKeys.some(function(raw) {
        return keyId(raw) === keyId(carried.key);
    });
    const resolves = carried && !resumed && carriedLive ? carried : null;
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
            oldGroups: resumed.oldGroups
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
            // `nextUid` deliberately does NOT roll back with the provisional row.
            // This row takes the provisional uid over -- it lands in the same
            // slot, so the delegate is reused rather than rebuilt -- but the
            // counter has to stay past that uid: a rolled-back counter hands the
            // very next row a uid that is still on screen, and Overlay.qml keys
            // its rows by uid, so two rows sharing one uid collapse into one.
        } else {
            // A different chord, not a retype: the deferred press was this
            // keystroke's modifier all along. Its count stays at `settled + 1`
            // -- what the provisional row already showed -- because that really
            // is how many times the key went down. It once dropped to one here,
            // on the theory that a chord starts a fresh count; from the outside
            // that is indistinguishable from the count resetting itself.
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
            const modifier = {
                label: resolves.key,
                count: resolves.settled + 1,
                lastPressedAt: now,
                // Replacement mode rebuilds the whole row, so the keycap enters
                // afresh; history mode keeps it on screen and must not replay.
                animateIn: !config.showEventHistory
            };
            keys = [modifier].concat(kept).concat([newKey(named, now)]);
            history = resolves.oldGroups;
            // As in the retyped path: the provisional uid is taken over, so the
            // counter stays past it instead of rolling back onto it.
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
            oldGroups: state.groups
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
        // In history mode a press that is a NEW keystroke rather than a
        // continuation of the last one opens the next row. Two things make it
        // new, and upstream pushes on the same pair (key_event.ts onKeyPress:
        // `pressedKeys.length === 1 || last < 0` in the single-key case, and
        // `groups[last].keys.some(gKey => !gKey.in(pressedKeys))` in the combo
        // case):
        //   * the arriving key is the only one down. Nothing of the previous row
        //     is held, so it cannot be that keystroke continuing -- it is a
        //     finished record and `A` released then `B` must be two rows. This
        //     clause was missing, which is why typing single keys in history
        //     mode kept overwriting one row instead of accumulating.
        //   * the last row has a member that is no longer down (`Ctrl+1` let go,
        //     now `Ctrl+2`): the survivor belongs to the keystroke that has just
        //     finished and keeps its own row rather than lingering in place.
        // Replacement mode ignores both: the overlay shows a single row and the
        // member lingers in place.
        newRow = config.showEventHistory && (
            heldKeys.length === 1 ||
            survivors.some(function(key) { return !was(key); })
        );
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
        pending: pending,
        // The press passed the gate, so this hold is on screen. Every other held
        // key was added when its own press passed -- a key that was refused keeps
        // the whole sequence refused while it is down, so nothing can join
        // `shownKeys` behind its back.
        shownKeys: state.shownKeys.concat([named])
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
        pending: state.pending,
        shownKeys: state.shownKeys.filter(function(key) { return key !== label; })
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
        pending: state.pending,
        // Whatever this hold was -- drawn or refused -- it is over now, so the
        // overlay has nothing left to show for it either way.
        shownKeys: state.shownKeys.filter(function(key) { return key !== label; })
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
        // Expiry is not a new press, so it cannot answer the pending question,
        // but it does END it: a gesture the overlay has stopped drawing is
        // over, and its count goes with it. See `pending` below.
        pendingRepeat: groups.length > 0 ? state.pendingRepeat : false,
        // A count lives exactly as long as its keycap. The deferred press is
        // what carries a modifier's count forward, so left alone it would
        // outlive the row indefinitely -- Ctrl tapped three times, left to
        // fade, and pressed again read Ctrl×4 however long the pause was. The
        // question lapses the moment its key is no longer on screen; while the
        // key is still shown (still held, or still inside its fade window) it
        // stands, which is what keeps a run of taps counting.
        pending: state.pending && groups.some(function(group) {
            return group.keys.some(function(key) { return key.label === state.pending.key; });
        }) ? state.pending : null,
        // Only keys that are still down can be on screen; expiry cannot add one.
        shownKeys: state.shownKeys.filter(function(key) {
            return state.heldKeys.indexOf(key) !== -1;
        })
    };
}
