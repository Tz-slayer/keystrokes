const { test } = require('node:test');
const assert = require('node:assert/strict');
const {loadCore} = require('./helpers/load.cjs');
const api = loadCore(['events.js']);
const config = { eventFilter: 'none', allowedKeys: ['Ctrl', 'Super', 'Alt'], showEventHistory: false, maxHistory: 5, fadeTimeout: 5000 };
const plain = value => JSON.parse(JSON.stringify(value));
const labels = state => plain(state.groups.map(group => group.keys.map(key => key.label)));
function down(state, key, now = 0, overrides = {}) { return api.press(state, key, now, { ...config, ...overrides }); }
function tap(state, key, now = 0, overrides = {}) {
  return api.release(down(state, key, now, overrides), key, now + 1);
}
function freeze(value) { Object.values(value).forEach(item => { if (item && typeof item === 'object') freeze(item); }); return Object.freeze(value); }

// keyviz decides the gate from `pressedKeys[0]` alone. Here it asks whether the
// sequence CONTAINS a modifier instead, because when two keys land in the same
// millisecond the kernel picks which one is "first" and the identical gesture
// would otherwise be shown or discarded on that coin flip.
test('a modifier filter shows a sequence once any of its keys is a modifier', () => {
  // A lone modifier always shows, whatever the filter.
  for (const label of ['Ctrl', 'Shift', 'Alt', 'Super', 'Fn']) {
    assert.deepEqual(labels(down(api.initialState(), label, 0, {eventFilter:'modifiers'})), [[label]]);
  }
  // Ctrl+C and C+Ctrl are the same gesture and must both show, with each key
  // carrying its own count. The order they arrive in is a race, not a decision.
  assert.deepEqual(labels(api.press(down(api.initialState(), 'Ctrl', 0, {eventFilter:'modifiers'}),
                                    'C', 1, {eventFilter:'modifiers'})), [['Ctrl', 'C']]);
  assert.deepEqual(labels(down(down(api.initialState(), 'C', 0, {eventFilter:'modifiers'}),
                               'Ctrl', 1, {eventFilter:'modifiers'})), [['C', 'Ctrl']],
    'the modifier arriving second is still a hotkey');
  // Two keys with no modifier in sight are still not a hotkey.
  assert.deepEqual(labels(down(down(api.initialState(), 'A', 0, {eventFilter:'modifiers'}),
                               'B', 1, {eventFilter:'modifiers'})), []);
  // A lone non-modifier is not one either.
  assert.deepEqual(labels(down(api.initialState(), 'Caps Lock', 0, {eventFilter:'modifiers'})), []);
});

test('repeat counts require release and do not mutate prior snapshots', () => {
  const initial = freeze(api.initialState());
  const first = freeze(down(initial, 'A'));
  assert.equal(down(first, 'A', 20), first);
  const released = freeze(api.release(first, 'A', 50));
  const repeated = down(released, 'A', 100);
  assert.equal(repeated.groups[0].keys[0].count, 2);
  assert.equal(first.groups[0].keys[0].count, 1);
  assert.equal(released.groups[0].keys[0].lastPressedAt, 50);
  assert.equal(repeated.groups[0].uid, first.groups[0].uid);
});

test('replacement mode retains combos until repeated keys prune released members', () => {
  let state = down(api.initialState(), 'Ctrl');
  state = down(state, 'C', 1);
  state = api.release(state, 'C', 2);
  state = down(state, 'V', 3);
  assert.deepEqual(labels(state), [['Ctrl','C','V']]);
  state = api.release(state, 'V', 4);
  state = down(state, 'V', 5);
  assert.deepEqual(labels(state), [['Ctrl','V']]);
  assert.equal(state.groups[0].keys[1].count, 2);
  state = api.release(api.release(state, 'Ctrl', 6), 'V', 6);
  state = down(state, 'A', 7);
  assert.deepEqual(labels(state), [['A']]);
});

test('history mode increments a repeated combo in place instead of rebuilding it', () => {
  const history = {showEventHistory:true, maxHistory:2};
  let state = down(api.initialState(), 'Ctrl', 0, history);
  state = down(state, 'C', 1, history);
  state = api.release(state, 'C', 2);
  const uid = state.groups[0].uid;
  state = down(state, 'C', 3, history);

  // The group keeps its identity and its count grows: rebuilding it would tear
  // the delegate down and make the press-count badge flicker.
  assert.deepEqual(labels(state), [['Ctrl', 'C']]);
  assert.equal(state.groups.length, 1);
  assert.equal(state.groups[0].uid, uid, 'a repeat must not mint a new group');
  assert.equal(state.groups[0].keys[1].count, 2);

  state = api.release(state, 'C', 4);
  state = down(state, 'V', 5, history);
  assert.deepEqual(labels(state), [['Ctrl', 'C'], ['Ctrl', 'V']],
    'a genuinely different combo still opens a new group');
});

test('a held modifier carried into the next shortcut does not animate again', () => {
  const history = {showEventHistory:true, maxHistory:5};
  let state = down(api.initialState(), 'Ctrl', 0, history);
  state = down(state, '1', 1, history);
  state = api.release(state, '1', 2);
  state = down(state, '2', 3, history);

  assert.deepEqual(labels(state), [['Ctrl', '1'], ['Ctrl', '2']]);
  assert.deepEqual(plain(state.groups[1].keys.map(key => key.animateIn)), [false, true]);

  state = api.release(state, 'Ctrl', 4);
  assert.deepEqual(plain(state.groups[1].keys.map(key => key.animateIn)), [false, true],
    'releasing the carried modifier must not re-arm its entrance animation');
});

test('history standalone repeated key increments count in its group', () => {
  let state = down(api.initialState(), 'A', 0, {showEventHistory:true});
  state = api.release(state, 'A', 1);
  state = down(state, 'A', 2, {showEventHistory:true});
  assert.equal(state.groups.length, 1);
  assert.equal(state.groups[0].keys[0].count, 2);
});

// ── count while several keys are held together ────────────────────────────────
//
// Repressing a key already present in the last group increments it in place:
// the group keeps its uid and every other key keeps its count. Upstream keyviz
// used to push a fresh group here, which restarted the counts at 1 and gave the
// group a new uid -- the overlay then tore the group down and rebuilt it, which
// showed up as a flickering press-count badge. These tests pin the fixed
// behaviour so the counting code cannot regress silently.

test('history mode: a second key held alongside does not reset the first', () => {
  const history = {showEventHistory:true, maxHistory:5};
  let state = down(api.initialState(), 'A', 0, history);
  state = down(state, 'B', 1, history);
  assert.deepEqual(labels(state), [['A', 'B']]);
  assert.deepEqual(plain(state.groups[0].keys.map(key => key.count)), [1, 1],
    'a freshly added neighbour leaves the existing count alone');
});

test('history mode: a key already held cannot increment', () => {
  const history = {showEventHistory:true, maxHistory:5};
  let state = down(api.initialState(), 'A', 0, history);
  state = down(state, 'B', 1, history);
  state = down(state, 'A', 2, history);   // A is already held; release is required first

  assert.deepEqual(labels(state), [['A', 'B']], 'A is still held, so nothing changes');
  assert.deepEqual(plain(state.groups[0].keys.map(key => key.count)), [1, 1],
    'a held key cannot increment: the autorepeat guard returns the state unchanged');
});

test('history mode: releasing then repressing inside a multi-key group increments in place', () => {
  const history = {showEventHistory:true, maxHistory:5};
  let state = down(api.initialState(), 'A', 0, history);
  state = down(state, 'B', 1, history);
  const uid = state.groups[0].uid;
  state = api.release(state, 'A', 2);
  state = down(state, 'A', 3, history);

  assert.deepEqual(labels(state), [['A', 'B']], 'the group is not duplicated');
  assert.equal(state.groups.length, 1);
  assert.equal(state.groups[0].uid, uid, 'the group keeps its identity, so nothing is rebuilt');
  assert.deepEqual(plain(state.groups[0].keys.map(key => key.count)), [2, 1],
    'only the repressed key grows');
});

test('history mode: repeats keep counting while a sibling stays held', () => {
  const history = {showEventHistory:true, maxHistory:5};
  let state = down(api.initialState(), 'A', 0, history);
  state = down(state, 'B', 1, history);
  const uid = state.groups[0].uid;

  // Hammer A while B stays down: identity and B both have to survive.
  for (const t of [2, 3, 4]) {
    state = api.release(state, 'A', t - 0.5);
    state = down(state, 'A', t, history);
  }
  assert.equal(state.groups.length, 1);
  assert.equal(state.groups[0].uid, uid);
  assert.deepEqual(plain(state.groups[0].keys.map(key => key.count)), [4, 1],
    'the badge counts every repeat without the group churning');
});

test('history mode: alternating two held keys counts each independently', () => {
  const history = {showEventHistory:true, maxHistory:5};
  let state = down(api.initialState(), 'A', 0, history);
  state = down(state, 'B', 0.5, history);
  const uid = state.groups[0].uid;

  state = api.release(state, 'A', 1); state = down(state, 'A', 1.5, history);
  state = api.release(state, 'B', 2); state = down(state, 'B', 2.5, history);

  assert.equal(state.groups.length, 1);
  assert.equal(state.groups[0].uid, uid);
  assert.deepEqual(plain(state.groups[0].keys.map(key => key.count)), [2, 2]);
});

test('history mode: a stale sibling is pruned once a foreign key proves it stale', () => {
  // Repressing a member of an expired row is ambiguous, and the row cannot know
  // at that instant whether the user is retyping it (A,B again -- keep B and
  // count it) or has moved to a shortcut that merely starts the same way (A,C).
  // The decision waits for the next key; a key the row does not hold is what
  // proves the leftover member was stale.
  const history = {showEventHistory:true, maxHistory:5};
  let state = down(api.initialState(), 'A', 0, history);
  state = down(state, 'B', 1, history);
  state = api.release(state, 'B', 2);           // B leaves the picture again

  state = api.release(state, 'A', 3);
  state = down(state, 'A', 4, history);
  assert.deepEqual(labels(state), [['A', 'B']],
    'the leftover sibling is still on the row while the repeat is undecided');
  assert.equal(state.groups[0].keys[0].count, 2);

  state = down(state, 'C', 5, history);
  assert.deepEqual(labels(state), [['A', 'C']],
    'C proves A,B is finished, so the reserved B is dropped');
  assert.equal(state.groups.length, 1, 'the refuted row is rewritten, not duplicated');
  // A is still under a finger and keeps the count it had reached; C is new.
  assert.deepEqual(plain(state.groups[0].keys.map(key => key.count)), [2, 1]);

  // A sibling, by contrast, confirms the repeat, so B stays and counts.
  state = api.release(state, 'C', 6);
  state = api.release(state, 'A', 6);
  state = down(state, 'A', 7, history);
  state = down(state, 'B', 8, history);
  assert.deepEqual(labels(state), [['A', 'B']],
    'retyping A,B keeps the row whole instead of dropping B');
  assert.deepEqual(plain(state.groups[0].keys.map(key => key.count)), [3, 1],
    'and every member of the retyped chord counts, not just the first');
});

test('replace mode: a single key repeat still increments with another key held', () => {
  let state = down(api.initialState(), 'Ctrl');
  state = down(state, 'V', 1);
  state = api.release(state, 'V', 2);
  state = down(state, 'V', 3);
  assert.equal(state.groups[0].keys[1].count, 2,
    'replace mode keeps the increment path when the repeat is the only new key');
});

// A combo is counted per key, not per shortcut: retyping Ctrl+C increments Ctrl
// AND C. Counting only the modifier was the visible bug -- the overlay showed
// Ctrl×3 beside C×1 for three identical presses, so the helper key looked stuck.
test('retyping a combo counts every key of it, modifier and helper alike', () => {
  function chord(state, now) {
    let next = down(state, 'Ctrl', now);
    next = down(next, 'C', now + 1);
    next = api.release(next, 'C', now + 2);
    return api.release(next, 'Ctrl', now + 3);
  }
  let state = chord(api.initialState(), 0);
  assert.equal(state.groups[0].keys[0].count, 1);
  assert.equal(state.groups[0].keys[1].count, 1);

  state = chord(state, 10);
  state = chord(state, 20);
  assert.deepEqual(labels(state), [['Ctrl', 'C']], 'a retyped combo is still one row');
  assert.deepEqual(plain(state.groups[0].keys.map(key => key.count)), [3, 3],
    'Ctrl and C both counted the three presses, not just the modifier');

  // The modifier keeps counting too when it is the key held down rather than
  // repressed, which is the same rule seen from the other side.
  let held = down(api.initialState(), 'Ctrl', 0);
  held = down(held, 'C', 1);
  held = api.release(held, 'C', 2);
  held = down(held, 'C', 3);
  assert.deepEqual(plain(held.groups[0].keys.map(key => key.count)), [1, 2]);
});

// The identity a keycap is matched by must be the *displayed* label, because
// callers spell one key two ways: the keyboard path presses a raw evdev code
// ("KEY_LEFTCTRL") while the mouse, wheel and IPC paths press the rendered
// label ("Ctrl"). Comparing the two literally turned one physical key into two
// keycaps, because the repeat missed the keycap it was meant to bump.
test('a code and a label naming the same key are one keycap, not two', () => {
  const map = {KEY_LEFTCTRL: 'Ctrl', KEY_C: 'C'};
  const mixed = { ...config, showEventHistory: true, displayLabel: key => map[key] || key };

  // The same physical key, spelled both ways. It is *held*, so the second press
  // is hardware autorepeat and must not add anything. Before the identity fix
  // the two spellings looked like two different keys: the row showed both, and
  // the guard could not tell a repeat from a fresh press.
  const state = down(down(api.initialState(), 'KEY_LEFTCTRL', 0, mixed), 'Ctrl', 1, mixed);
  assert.deepEqual(plain(state.groups[0].keys.map(key => map[key.label] || key.label)), ['Ctrl'],
    'the same key must not appear twice');
  assert.equal(state.groups[0].keys.length, 1, 'the autorepeat guard sees one key, not two');
  assert.equal(state.groups[0].keys[0].count, 1, 'a held key cannot increment');

  // Release, then press it again spelled the other way: now it is a real
  // repeat, and it has to land on the keycap it names rather than beside it.
  const repeated = down(api.release(state, 'Ctrl', 2), 'KEY_LEFTCTRL', 3, mixed);
  assert.deepEqual(plain(repeated.groups[0].keys.map(key => map[key.label] || key.label)), ['Ctrl']);
  assert.equal(repeated.groups[0].keys.length, 1, 'the repeat must not append a duplicate keycap');
  assert.equal(repeated.groups[0].keys[0].count, 2, 'and its count reflects the repeat');
});

test('a repeat is recognised whether the caller passes a code or a label', () => {
  // The daemon hands the keyboard path the raw evdev code and the mouse, wheel
  // and IPC paths inline keycap labels, so the two spellings really do meet in
  // one group. Whatever the caller passes, the repeated key must find the
  // keycap it repeats instead of appending a duplicate beside it.
  const map = {KEY_LEFTCTRL: 'Ctrl'};
  const spelled = {...config, showEventHistory: true, displayLabel: key => map[key] || key};
  const overlay = state => plain(state.groups[0].keys.map(key => map[key.label] || key.label));
  const counts = state => plain(state.groups[0].keys.map(key => key.count));

  // Press by code, release, press again by label: one keycap, count 2.
  const byCode = api.press(api.initialState(), 'KEY_LEFTCTRL', 0, spelled);
  const mixed = down(api.release(byCode, 'Ctrl', 1), 'Ctrl', 2, spelled);
  assert.deepEqual(overlay(mixed), ['Ctrl'], 'the two spellings are one keycap');
  assert.equal(mixed.groups[0].keys.length, 1, 'the repeat must not append a duplicate keycap');
  assert.deepEqual(counts(mixed), [2], 'the repeat lands on the keycap it names');

  // The other direction: press by label, release, press again by code.
  const byLabel = api.press(api.initialState(), 'Ctrl', 0, spelled);
  const reversed = down(api.release(byLabel, 'Ctrl', 1), 'KEY_LEFTCTRL', 2, spelled);
  assert.deepEqual(overlay(reversed), ['Ctrl']);
  assert.deepEqual(counts(reversed), [2]);
});

test('a repeat is recognised when a held sibling was pressed by code', () => {
  const map = {KEY_LEFTCTRL: 'Ctrl'};
  const mixed = { ...config, showEventHistory: true, displayLabel: key => map[key] || key };
  let state = down(api.initialState(), 'KEY_LEFTCTRL', 0, mixed);
  state = down(state, 'C', 1, mixed);
  state = api.release(state, 'C', 2);
  const uid = state.groups[0].uid;
  state = down(state, 'C', 3, mixed);

  // The sibling filter has to match across the two spellings too, otherwise the
  // held modifier is pruned away on every repeat.
  assert.deepEqual(plain(state.groups[0].keys.map(key => map[key.label] || key.label)), ['Ctrl', 'C']);
  assert.equal(state.groups[0].uid, uid);
  assert.deepEqual(plain(state.groups[0].keys.map(key => key.count)), [1, 2]);
});

test('a wheel repeat under a code-spelled held modifier keeps the modifier', () => {
  const map = {KEY_LEFTCTRL: 'Ctrl'};
  const mixed = { ...config, showEventHistory: true, displayLabel: key => map[key] || key };
  let state = down(api.initialState(), 'KEY_LEFTCTRL', 0, mixed);
  state = down(state, 'ScrollDown', 1, mixed);
  state = api.release(state, 'ScrollDown', 2);
  const uid = state.groups[0].uid;
  state = down(state, 'ScrollDown', 3, mixed);

  assert.deepEqual(plain(state.groups[0].keys.map(key => map[key.label] || key.label)),
    ['Ctrl', 'ScrollDown'], 'the held modifier survives the repeat');
  assert.equal(state.groups[0].uid, uid, 'no group churn');
  assert.deepEqual(plain(state.groups[0].keys.map(key => key.count)), [1, 2]);
});

test('expiry starts at release, keeps held keys and prunes individual keys', () => {
  let state = down(api.initialState(), 'Ctrl');
  state = down(state, 'C', 1);
  state = api.release(state, 'Ctrl', 10000);
  state = api.tick(freeze(state), 14999, config);
  assert.deepEqual(labels(state), [['Ctrl','C']]);
  state = api.tick(state, 15000, config);
  assert.deepEqual(labels(state), [['C']]);
  state = api.release(state, 'C', 15001);
  assert.deepEqual(labels(api.tick(state, 20001, config)), []);
});

test('unknown releases and unchanged ticks preserve state identity', () => {
  const state = down(api.initialState(), 'A');
  assert.equal(api.release(state, 'B', 2), state);
  assert.equal(api.tick(state, 99999, config), state);
});

// The gate. It asks whether the sequence CONTAINS a modifier rather than
// whether the first key is one, because "first" is a race between two keys
// pressed together -- the same gesture must not depend on which one the kernel
// happened to report first.
test('the filter gate accepts a sequence containing any modifier', () => {
  const show = (filter, held, allowed) => api.shouldShow(filter, held, allowed);

  // "none" shows everything.
  assert.equal(show('none', ['A']), true);
  assert.equal(show('none', ['Ctrl', 'A']), true);

  // A lone modifier passes because it IS a modifier.
  for (const mod of ['Ctrl', 'Shift', 'Alt', 'Super', 'Fn'])
    assert.equal(show('modifiers', [mod]), true, `${mod} alone must be shown`);

  // A lone ordinary key does not.
  for (const key of ['A', '1', 'Enter', 'F5'])
    assert.equal(show('modifiers', [key]), false, `${key} alone must be hidden`);

  // Order no longer decides: both spellings of the same chord are hotkeys.
  assert.equal(show('modifiers', ['Ctrl', 'A']), true);
  assert.equal(show('modifiers', ['A', 'Ctrl']), true, 'the modifier need not be first');
  assert.equal(show('modifiers', ['Shift', 'A']), true, 'Shift is a modifier');
  assert.equal(show('modifiers', ['A', 'Shift']), true);
  assert.equal(show('modifiers', ['Ctrl', 'Shift', 'A']), true);

  // No modifier anywhere in the sequence: still not a hotkey.
  assert.equal(show('modifiers', ['A', 'B']), false);

  // "custom" swaps the modifier set for allowedKeys, same containment rule.
  assert.equal(show('custom', ['Space'], ['Space']), true);
  assert.equal(show('custom', ['A'], ['Space']), false);
  assert.equal(show('custom', ['Space', 'B'], ['Space']), true);
  assert.equal(show('custom', ['B', 'Space'], ['Space']), true, 'allowed key need not be first');
  assert.equal(show('custom', ['B', 'C'], ['Space']), false);
  assert.equal(show('custom', ['Ctrl'], []), false);
});

test('the gate tolerates an empty or absent filter', () => {
  assert.equal(api.shouldShow(undefined, ['A']), true);
  assert.equal(api.shouldShow('', ['A']), true);
  assert.equal(api.shouldShow('modifiers', []), true);
});

// The gate has to look at the keys already held, not just the new one: it runs
// on press, so when Ctrl arrives second the key that beat it is already in
// `heldKeys` and must not veto the chord -- and it must not be left stranded
// there either, or it would never reach the screen.
test('a helper key already held does not veto a late modifier', () => {
  const cfg = { eventFilter: 'modifiers', allowedKeys: [], showEventHistory: false, maxHistory: 5, fadeTimeout: 5000 };

  // C alone is rejected by the filter, so nothing is on screen yet.
  let state = api.press(api.initialState(), 'C', 0, cfg);
  assert.deepEqual(labels(state), [], 'a lone C is not a hotkey');
  assert.deepEqual(plain(state.heldKeys), ['C'], 'but it is remembered as held');

  // Ctrl lands: the whole chord is now a hotkey, and C comes back with it.
  state = api.press(state, 'Ctrl', 1, cfg);
  assert.deepEqual(labels(state), [['C', 'Ctrl']], 'the late modifier opens the chord');
  assert.equal(state.groups.length, 1, 'the chord is one row, not two');

  // And the normal order still lands in a single group.
  let other = api.press(api.initialState(), 'Ctrl', 0, cfg);
  const uid = other.groups[0].uid;
  other = api.press(other, 'C', 1, cfg);
  assert.deepEqual(labels(other), [['Ctrl', 'C']]);
  assert.equal(other.groups[0].uid, uid, 'no second row for the same chord');
});

// The gate resolves a key's identity through displayLabel, so press() compares
// identities too. keyviz renders both Ctrl keys as "Ctrl", so the two physical
// keys share one keycap: the second press is a repeat on screen, and the
// autorepeat guard treats it as the same key rather than a second one.
test('physical left and right modifiers render as one keycap but track independently', () => {
  const cfg = {...config,eventFilter:'modifiers',displayLabel:key=>key.startsWith('KEY_')&&key.endsWith('CTRL')?'Ctrl':key};
  let state=api.press(api.initialState(),'KEY_LEFTCTRL',0,cfg);
  state=api.press(state,'KEY_RIGHTCTRL',1,cfg);
  assert.deepEqual(labels(state),[['Ctrl']],'both Ctrl keys render as the same keycap');
  assert.equal(state.groups[0].keys.length,1,'one keycap, not two');
  assert.equal(state.groups[0].keys[0].count,1,'the second is autorepeat while the first is held');
  state=api.release(state,'KEY_LEFTCTRL',2);
  assert.deepEqual(plain(state.heldKeys),['Ctrl'],'the keycap stays held -- the right Ctrl is still down');
});

// keyviz routes mouse buttons, the wheel and `Drag` through onKeyPress
// (key_event.ts onMouseButtonPress / onMouseMove / onMouseWheel). Keeping them
// out of the state machine minted a new history uid per event, which tore the
// overlay row down and rebuilt it: Meta+wheel (a workspace switch) flickered,
// and the row occasionally jumped while the old copy was still fading out.
test('a wheel tick joins the group a held modifier started', () => {
  const cfg = {...config,eventFilter:'modifiers'};
  let state = api.press(api.initialState(), 'Super', 0, cfg);
  const uid = state.groups[0].uid;
  state = api.press(state, 'ScrollDown', 1, cfg);

  assert.deepEqual(labels(state), [['Super', 'ScrollDown']]);
  assert.equal(state.groups.length, 1, 'the wheel must not open a second row');
  assert.equal(state.groups[0].uid, uid, 'a new uid destroys and rebuilds every keycap');
  assert.deepEqual(plain(state.groups[0].keys.map(key => key.animateIn)), [true, true]);

  // The linger release must not move the key to another group either.
  state = api.release(state, 'ScrollDown', 400);
  assert.equal(state.groups[0].uid, uid);
  assert.deepEqual(labels(state), [['Super', 'ScrollDown']]);
});

test('a mouse button joins the modifier group, and a drag replaces it', () => {
  const cfg = {...config,eventFilter:'modifiers'};
  let state = api.press(api.initialState(), 'Ctrl', 0, cfg);
  const uid = state.groups[0].uid;
  state = api.press(state, 'LMB Click', 1, cfg);
  assert.deepEqual(labels(state), [['Ctrl', 'LMB Click']]);
  assert.equal(state.groups[0].uid, uid, 'Ctrl+click must stay in the Ctrl group');

  // keyviz drops the button from pressedKeys and the last group before pressing
  // Drag, so the button keycap is replaced rather than left on screen.
  state = api.dropKey(state, 'LMB Click');
  assert.deepEqual(labels(state), [['Ctrl']]);
  assert.deepEqual(plain(state.heldKeys), ['Ctrl']);
  state = api.press(state, 'Drag', 2, cfg);
  assert.deepEqual(labels(state), [['Ctrl', 'Drag']]);
  assert.equal(state.groups[0].uid, uid);

  assert.equal(api.dropKey(state, 'Unrelated'), state, 'an absent key must preserve state identity');
});

test('dropping the only key leaves no empty group behind', () => {
  let state = api.press(api.initialState(), 'LMB Click', 0, {...config, eventFilter: 'none'});
  state = api.dropKey(state, 'LMB Click');
  assert.deepEqual(labels(state), []);
  assert.deepEqual(plain(state.heldKeys), []);
  // The next key starts a fresh group instead of resurrecting the dropped one.
  state = api.press(state, 'A', 1, {...config, eventFilter: 'none'});
  assert.deepEqual(labels(state), [['A']]);
});

test('releasing a key that was never held leaves the groups untouched', () => {
  let state = api.press(api.initialState(), 'A', 0, {...config, eventFilter: 'none'});
  const next = api.release(state, 'Drag', 1);
  assert.equal(next, state);
  assert.deepEqual(labels(next), [['A']]);
});

// ── the deferred modifier ─────────────────────────────────────────────────────
//
// A modifier pressed with nothing else down is reported by the kernel as one
// event, but it is the start of either a repeat (`Ctrl` tapped again) or a
// chord (`Ctrl+C`), and those disagree about the row's MEMBERS, not about the
// count: a count is how many times that key went down, and it never goes
// backwards. Ctrl tapped four times and then pressed once more as `Ctrl+C` is
// five presses, so the row reads `Ctrl×5 + C×1`.
//
// The press is therefore provisional -- shown, held open, and decided by
// whatever comes next. These tests pin that mechanism, which nothing else can
// supply: remove it and the retype below collapses to a single key, or the
// modifier's count silently resets when a chord forms.
test('a lone modifier tapped repeatedly counts up on one row', () => {
  let state = tap(api.initialState(), 'Ctrl', 0);
  state = tap(state, 'Ctrl', 2);
  state = tap(state, 'Ctrl', 4);
  assert.deepEqual(labels(state), [['Ctrl']]);
  assert.equal(state.groups[0].keys[0].count, 3);
  assert.equal(state.groups.length, 1);
});

test('a chord keeps the count the modifier earned on its own', () => {
  // The requested behaviour: tap Ctrl four times, then press Ctrl+C. Ctrl went
  // down five times in all, so the row is Ctrl×5+C×1. It must NOT read
  // Ctrl×1+C×1 -- dropping the modifier back to one because a chord formed is
  // indistinguishable, from the overlay, from the count resetting itself.
  let state = tap(tap(tap(tap(api.initialState(), 'Ctrl', 0), 'Ctrl', 2), 'Ctrl', 4), 'Ctrl', 6);
  assert.equal(state.groups[0].keys[0].count, 4, 'four taps, four presses so far');
  state = api.press(state, 'Ctrl', 8, config);
  state = api.press(state, 'C', 9, config);
  assert.deepEqual(labels(state), [['Ctrl', 'C']]);
  assert.deepEqual(plain(state.groups[0].keys.map(key => key.count)), [5, 1],
    'the fifth Ctrl press happened and C was pressed once');
  assert.equal(state.groups[0].uid, 0, 'replacement mode shows one row either way');
});

test('a chord retyped counts every key of it', () => {
  const chord = state => {
    let next = api.press(state, 'Ctrl', 0, config);
    next = api.press(next, 'C', 0, config);
    next = api.release(next, 'C', 0);
    return api.release(next, 'Ctrl', 0);
  };
  let state = chord(api.initialState());
  assert.deepEqual(plain(state.groups[0].keys.map(key => key.count)), [1, 1]);
  state = chord(state);
  assert.deepEqual(plain(state.groups[0].keys.map(key => key.count)), [2, 2],
    'Ctrl+C twice means both keys were pressed twice');
});

test('a different shortcut keeps the modifier count but drops its partner', () => {
  let state = api.press(api.initialState(), 'Ctrl', 0, config);
  state = api.press(state, 'C', 1, config);
  state = api.release(state, 'C', 2);
  state = api.release(state, 'Ctrl', 3);

  // Ctrl+V, not a second Ctrl+C: the keystroke is a different one so C does
  // not return, but Ctrl really was pressed a second time, so its count is 2.
  state = api.press(state, 'Ctrl', 4, config);
  state = api.press(state, 'V', 5, config);
  assert.deepEqual(labels(state), [['Ctrl', 'V']]);
  assert.deepEqual(plain(state.groups[0].keys.map(key => key.count)), [2, 1]);
});

test('a released member lingers while a live chord is still in progress', () => {
  // Ctrl+C+V: the user lets go of C to reach V. C stays on the row, because
  // dropping it the instant it is released would erase the gesture in progress.
  let state = api.press(api.initialState(), 'Ctrl', 0, config);
  state = api.press(state, 'C', 1, config);
  state = api.release(state, 'C', 2);
  state = api.press(state, 'V', 3, config);
  assert.deepEqual(labels(state), [['Ctrl', 'C', 'V']]);

  // Repressing V inside the live chord prunes the member that has gone up.
  state = api.release(state, 'V', 4);
  state = api.press(state, 'V', 5, config);
  assert.deepEqual(labels(state), [['Ctrl', 'V']]);
  assert.equal(state.groups[0].keys[1].count, 2);
});

test('the deferred press is shown while it is undecided', () => {
  // The overlay cannot wait: a keycap has to appear the moment the key goes
  // down. Ctrl is therefore drawn at its provisional count straight away, and
  // only another key can say whether that was right.
  const state = api.press(api.initialState(), 'Ctrl', 0, config);
  assert.deepEqual(labels(state), [['Ctrl']]);
  assert.equal(state.groups[0].keys[0].count, 1);

  const repeated = api.press(api.release(state, 'Ctrl', 1), 'Ctrl', 2, config);
  assert.equal(repeated.groups[0].keys[0].count, 2);
});

test('releasing a deferred key does not settle it', () => {
  // Tapping Ctrl releases it, and so does typing Ctrl+C. The release carries no
  // information, so the question has to outlive it -- otherwise the third tap
  // of Ctrl,Ctrl,Ctrl,C would be treated as a tap rather than the opening of
  // the chord, and the row would lose the members C belongs with.
  let state = api.press(api.initialState(), 'Ctrl', 0, config);
  state = api.release(state, 'Ctrl', 1);
  state = api.press(state, 'Ctrl', 2, config);
  state = api.release(state, 'Ctrl', 3);
  state = api.press(state, 'Ctrl', 4, config);
  assert.equal(state.groups[0].keys[0].count, 3, 'three taps, three presses');

  state = api.press(state, 'C', 5, config);
  assert.deepEqual(plain(state.groups[0].keys.map(key => key.count)), [3, 1],
    'the third Ctrl press still counts, and C was pressed once');
});

test('a modifier filter still admits a deferred modifier', () => {
  const cfg = {...config, eventFilter: 'modifiers'};
  let state = api.press(api.initialState(), 'Ctrl', 0, cfg);
  state = api.press(state, 'ScrollDown', 1, cfg);
  assert.deepEqual(labels(state), [['Ctrl', 'ScrollDown']]);
  assert.equal(state.groups.length, 1, 'the wheel must not open a second row');
});

// ── a gesture ends when its keys come up ──────────────────────────────────────
//
// Upstream asks the filter about `pressedKeys`, which holds only the keys that
// are physically down (key_event.ts ignoreEvent: `MODIFIERS.has(pressedKeys[0])`).
// A Ctrl that has been let go of is not in it, so it cannot make the next key
// look like a hotkey: `Ctrl`, release, `R` is two separate presses and upstream
// shows the Ctrl and drops the R. Two things here used to disagree with that --
// the gate counted members the row still listed even after their release, and
// the deferral claimed the next key regardless of whether its modifier was
// still held. Together they put a lone `R` on screen, labelled Ctrl+R.
test('a released modifier does not qualify the key that follows it', () => {
  const cfg = {...config, eventFilter: 'modifiers'};
  let state = api.press(api.initialState(), 'Ctrl', 0, cfg);
  state = api.release(state, 'Ctrl', 1);
  state = api.press(state, 'R', 2, cfg);

  // R was pressed on its own, so it is not a hotkey and must not appear. The
  // Ctrl is still on screen -- it lingers until its own fade runs out.
  assert.deepEqual(labels(state), [['Ctrl']],
    'R must not be shown, and must not be merged into a Ctrl+R either');
  assert.equal(state.groups[0].keys[0].count, 1, 'the Ctrl was pressed once');
});

test('a held modifier still qualifies the key pressed with it', () => {
  // The real hotkey, for contrast: Ctrl is still down when R arrives.
  const cfg = {...config, eventFilter: 'modifiers'};
  let state = api.press(api.initialState(), 'Ctrl', 0, cfg);
  state = api.press(state, 'R', 1, cfg);
  assert.deepEqual(labels(state), [['Ctrl', 'R']]);
  assert.deepEqual(plain(state.groups[0].keys.map(key => key.count)), [1, 1]);
});

test('a released helper key does not veto the chord it starts', () => {
  // The mirror image, and the reason the gate looks at the whole sequence
  // rather than the first key: R first and Ctrl while R is still down is the
  // same gesture as Ctrl+R, and the order they land in is a race.
  const cfg = {...config, eventFilter: 'modifiers'};
  let state = api.press(api.initialState(), 'R', 0, cfg);
  state = api.press(state, 'Ctrl', 1, cfg);
  assert.deepEqual(labels(state), [['R', 'Ctrl']]);
});

// ── a count lives exactly as long as its keycap ───────────────────────────────
//
// Two lifetimes used to drift apart. The display ends when the key ages out of
// `fadeTimeout`; a modifier's count, though, rode on the deferred press, which
// neither release nor expiry ever cleared -- so Ctrl tapped three times, left
// to fade, and pressed again ten minutes later read Ctrl×4. A plain key had no
// such deferral and reset with the row, so the two disagreed.
//
// The rule now: gone from the screen means the gesture is over, and the count
// goes with it. While the keycap is still drawn it stands, which is what lets a
// run of taps keep counting.
test('a count lapses with the keycap that carries it', () => {
  const cfg = {...config, fadeTimeout: 5000};
  const tap3 = key => {
    let state = tap(tap(tap(api.initialState(), key, 0, cfg), key, 2, cfg), key, 4, cfg);
    assert.equal(state.groups[0].keys[0].count, 3);
    return state;
  };

  for (const key of ['Ctrl', 'A']) {
    let state = tap3(key);
    // Age past the fade: the keycap leaves the screen...
    state = api.tick(state, 10 + 6000, cfg);
    assert.equal(state.groups.length, 0, `${key} should have faded`);
    // ...and the count leaves with it.
    state = api.press(state, key, 10 + 6100, cfg);
    assert.deepEqual(plain(state.groups[0].keys.map(key => key.count)), [1],
      `${key} starts over once its keycap is gone`);
  }
});

test('a count keeps going while the keycap is still on screen', () => {
  // The other half: no expiry happened, so the gesture is still in progress.
  const cfg = {...config, fadeTimeout: 5000};
  let state = tap(tap(tap(api.initialState(), 'Ctrl', 0, cfg), 'Ctrl', 2, cfg), 'Ctrl', 4, cfg);
  state = api.tick(state, 10, cfg);
  assert.equal(state.groups.length, 1, 'well inside the fade window');
  state = api.press(state, 'Ctrl', 20, cfg);
  assert.deepEqual(plain(state.groups[0].keys.map(key => key.count)), [4]);
});

// ── end to end: the raw input line through to the row ─────────────────────────
//
// Every test above feeds the state machine labels directly and runs on
// `eventFilter: 'none'`, but the daemon does neither. It parses a libinput line,
// maps the evdev code to a display label, and runs the default `modifiers`
// filter -- so a regression could sit entirely in that chain and the suite
// above would stay green.
//
// The two contexts below are load-bearing. `events.js` and `keyMapper.js` both
// define a top-level `isModifier`, with different meanings: events' one takes a
// display label ("Ctrl"), keyMapper's takes an evdev code ("KEY_LEFTCTRL").
// Loading both into ONE vm context lets the second overwrite the first, and
// `isModifier("Ctrl")` silently becomes false -- which disables the deferred
// press entirely. That is a property of the test helper, not of QML: Daemon.qml
// imports the two as separate namespaces (`as Events`, `as KeyMapper`), and a
// namespace import does not leak into its sibling. Verified against quickshell:
// two `.js` files each exporting `isModifier` keep their own. So the contexts
// are kept apart here too, and the split is asserted below to keep a future
// helper change from quietly re-merging them.
{
  // The state machine, alone -- exactly how QML scopes `Events`.
  const machine = loadCore(['events.js']);
  // Everything the daemon uses to turn a line into a label.
  const parsing = loadCore(['inputParse.js', 'keyMapper.js']);

  test('the test helper keeps events.js\' isModifier out of keyMapper\'s way', () => {
    // A merged context would report false for "Ctrl" and the deferred press
    // would never fire -- the exact shape of a bug that already cost one
    // debugging round. Pin the separation rather than the mechanism.
    assert.equal(machine.isModifier('Ctrl'), true,
      'events.js judges display labels');
    assert.equal(parsing.isModifier('KEY_LEFTCTRL'), true,
      'keyMapper.js judges evdev codes');
    assert.equal(parsing.isModifier('Ctrl'), false,
      'the two must not be the same function');
  });

  // Daemon.displayKeyLabel, verbatim. The modifier names are hand-written there
  // because keyMapper only knows the raw evdev spellings (KEY_LEFTCTRL ->
  // "LEFTCTRL"), and the state machine has to see "Ctrl".
  const displayKeyLabel = keyName => {
    if (keyName === 'KEY_LEFTCTRL' || keyName === 'KEY_RIGHTCTRL') return 'Ctrl';
    if (keyName === 'KEY_LEFTSHIFT' || keyName === 'KEY_RIGHTSHIFT') return 'Shift';
    if (keyName === 'KEY_LEFTALT' || keyName === 'KEY_RIGHTALT') return 'Alt';
    if (keyName === 'KEY_LEFTMETA' || keyName === 'KEY_RIGHTMETA') return 'Super';
    return parsing.getDisplayKey(keyName);
  };
  // libinput >= 1.19 prints the KEYBOARD_KEY marker before the code.
  const inputLine = (code, direction) =>
    ` event3   KEYBOARD_KEY            +0.001s\t${code} (0) ${direction}`;
  // The daemon's own config: the default filter, and the real label mapper.
  const daemonConfig = {
    showEventHistory: false, maxHistory: 5, fadeTimeout: 5000,
    eventFilter: 'modifiers', allowedKeys: ['Ctrl', 'Super', 'Alt'],
    displayLabel: displayKeyLabel,
  };

  // Feed raw lines exactly as Daemon's SplitParser does, and return the row.
  function type(lines) {
    let state = machine.initialState();
    let now = 0;
    for (const line of lines) {
      now += 100;
      const parsed = parsing.event(line);
      assert.ok(parsed && parsed.kind === 'key', 'fixture line must parse: ' + line);
      const label = displayKeyLabel(parsed.name);
      state = parsed.pressed
        ? machine.press(state, label, now, daemonConfig)
        : machine.release(state, label, now);
    }
    return state;
  }

  const CTRL_DOWN = inputLine('KEY_LEFTCTRL', 'pressed');
  const CTRL_UP = inputLine('KEY_LEFTCTRL', 'released');
  const C_DOWN = inputLine('KEY_C', 'pressed');

  test('the modifier keeps its count through the daemon\'s real input path', () => {
    // The exact requested gesture: tap Ctrl three times, then press Ctrl+C.
    // Ctrl went down four times in all, so the overlay must read Ctrl×4+C×1 --
    // not Ctrl×1+C×1, which is what a chord that resets the modifier gives.
    const state = type([
      CTRL_DOWN, CTRL_UP, CTRL_DOWN, CTRL_UP, CTRL_DOWN, CTRL_UP,
      CTRL_DOWN, C_DOWN,
    ]);
    const keys = plain(state.groups[state.groups.length - 1].keys);
    assert.deepEqual(keys.map(key => key.label), ['Ctrl', 'C']);
    assert.deepEqual(keys.map(key => key.count), [4, 1],
      'four Ctrl presses happened and C was pressed once');
    assert.deepEqual(plain(state.heldKeys), ['Ctrl', 'C']);
  });

  test('a lone modifier still counts up through the daemon\'s real input path', () => {
    // The complement: the deferral must not swallow the repeat. Three taps with
    // nothing else down is Ctrl×3 on one row, and the modifier filter admits it.
    const state = type([CTRL_DOWN, CTRL_UP, CTRL_DOWN, CTRL_UP, CTRL_DOWN, CTRL_UP]);
    assert.equal(state.groups.length, 1);
    assert.deepEqual(plain(state.groups[0].keys.map(key => key.label)), ['Ctrl']);
    assert.equal(state.groups[0].keys[0].count, 3);
  });
}
