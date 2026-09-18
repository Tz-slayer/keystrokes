const { test } = require('node:test');
const assert = require('node:assert/strict');
const {loadCore} = require('./helpers/load.cjs');
const api = loadCore(['events.js']);
const config = { eventFilter: 'none', allowedKeys: ['Ctrl', 'Super', 'Alt'], showEventHistory: false, maxHistory: 5, fadeTimeout: 5000 };
const plain = value => JSON.parse(JSON.stringify(value));
const labels = state => plain(state.groups.map(group => group.keys.map(key => key.label)));
function down(state, key, now = 0, overrides = {}) { return api.press(state, key, now, { ...config, ...overrides }); }
function freeze(value) { Object.values(value).forEach(item => { if (item && typeof item === 'object') freeze(item); }); return Object.freeze(value); }

test('modifier and custom filters use the first physical key, including Shift/Fn', () => {
  for (const label of ['Ctrl', 'Shift', 'Alt', 'Super', 'Fn']) {
    assert.deepEqual(labels(down(api.initialState(), label, 0, {eventFilter:'modifiers'})), [[label]]);
  }
  let state = down(api.initialState(), 'A', 0, {eventFilter:'modifiers'});
  state = down(state, 'Ctrl', 1, {eventFilter:'modifiers'});
  assert.deepEqual(labels(state), []);
  assert.deepEqual(plain(state.heldKeys), ['A', 'Ctrl']);
  state = down(api.initialState(), 'Space', 0, {eventFilter:'custom', allowedKeys:['Space']});
  state = down(state, 'B', 1, {eventFilter:'custom', allowedKeys:['Space']});
  assert.deepEqual(labels(state), [['Space', 'B']]);
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

test('history mode: a released sibling is pruned away on the next repress', () => {
  const history = {showEventHistory:true, maxHistory:5};
  let state = down(api.initialState(), 'A', 0, history);
  state = down(state, 'B', 1, history);
  state = api.release(state, 'B', 2);           // B leaves the picture again

  state = api.release(state, 'A', 3);
  state = down(state, 'A', 4, history);
  assert.deepEqual(labels(state), [['A']], 'the released sibling is pruned, as upstream did');
  assert.equal(state.groups[0].keys[0].count, 2);
  assert.equal(state.groups.length, 1, 'no group churn on the repeat');

  state = api.release(state, 'A', 5);
  state = down(state, 'A', 6, history);
  assert.equal(state.groups[0].keys[0].count, 3, 'repeats keep counting');
});

test('replace mode: a single key repeat still increments with another key held', () => {
  let state = down(api.initialState(), 'Ctrl');
  state = down(state, 'V', 1);
  state = api.release(state, 'V', 2);
  state = down(state, 'V', 3);
  assert.equal(state.groups[0].keys[1].count, 2,
    'replace mode keeps the increment path when the repeat is the only new key');
});

// The identity a keycap is matched by must be the *displayed* label, because
// `heldKeys` and the daemon's `physicalKeys` carry raw evdev codes on the
// keyboard path while the mouse/wheel/IPC paths carry labels. Comparing the two
// literally turned the same physical key into two keycaps: the repeat missed the
// keycap it was meant to bump and appended a duplicate beside it.
test('a code and a label naming the same key are one keycap, not two', () => {
  const map = {KEY_LEFTCTRL: 'Ctrl', KEY_C: 'C'};
  const mixed = { ...config, showEventHistory: true, displayLabel: key => map[key] || key };

  let state = down(api.initialState(), 'KEY_LEFTCTRL', 0, mixed);
  state = down(state, 'Ctrl', 1, mixed);

  assert.deepEqual(plain(state.groups[0].keys.map(key => map[key.label] || key.label)), ['Ctrl'],
    'the same key must not appear twice');
  assert.equal(state.groups[0].keys.length, 1, 'the second press repeats the first keycap');
  assert.equal(state.groups[0].keys[0].count, 2, 'and its count reflects the repeat');
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

  // Raw code first, then the rendered label: one keycap, count 2.
  const mixed = down(down(api.initialState(), 'KEY_LEFTCTRL', 0, spelled), 'Ctrl', 1, spelled);
  assert.deepEqual(overlay(mixed), ['Ctrl'], 'the two spellings are one keycap');
  assert.equal(mixed.groups[0].keys.length, 1, 'the repeat must not append a duplicate keycap');
  assert.deepEqual(counts(mixed), [2], 'the repeat lands on the keycap it names');

  // Label first, then the raw code: same result, so neither direction is special.
  const reversed = down(down(api.initialState(), 'Ctrl', 0, spelled), 'KEY_LEFTCTRL', 1, spelled);
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

// keyviz key_event.ts `ignoreEvent`. Both of its branches test pressedKeys[0],
// so the rule is one predicate over the FIRST physically pressed key. These
// cases mirror upstream's behaviour, including the ones that surprise people:
// a lone modifier is shown, Shift counts, and press order decides.
test('the filter gate is decided by the first physically pressed key', () => {
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

  // Combinations are gated by the first pressed key, so order matters.
  assert.equal(show('modifiers', ['Ctrl', 'A']), true);
  assert.equal(show('modifiers', ['Shift', 'A']), true, 'Shift is a modifier');
  assert.equal(show('modifiers', ['Ctrl', 'Shift', 'A']), true);
  assert.equal(show('modifiers', ['A', 'Ctrl']), false, 'A was pressed first');
  assert.equal(show('modifiers', ['A', 'Shift']), false);

  // A modifier that arrives late still belongs to the group once the gate is open.
  assert.equal(show('modifiers', ['Ctrl', 'A', 'Shift']), true);

  // "custom" swaps the modifier set for allowedKeys.
  assert.equal(show('custom', ['Space'], ['Space']), true);
  assert.equal(show('custom', ['A'], ['Space']), false);
  assert.equal(show('custom', ['Space', 'B'], ['Space']), true);
  assert.equal(show('custom', ['B', 'Space'], ['Space']), false);
  assert.equal(show('custom', ['Ctrl'], []), false);
});

test('the gate tolerates an empty or absent filter', () => {
  assert.equal(api.shouldShow(undefined, ['A']), true);
  assert.equal(api.shouldShow('', ['A']), true);
  assert.equal(api.shouldShow('modifiers', []), true);
});

// The gate resolves a key's identity through displayLabel, so press() compares
// identities too. keyviz renders both Ctrl keys as "Ctrl", so a left/right
// press pair is one keycap with count 2 -- not two keycaps. Physical tracking
// stays per-code: releasing the left one leaves the right one held.
test('physical left and right modifiers render as one keycap but track independently', () => {
  const cfg = {...config,eventFilter:'modifiers',displayLabel:key=>key.startsWith('KEY_')&&key.endsWith('CTRL')?'Ctrl':key};
  let state=api.press(api.initialState(),'KEY_LEFTCTRL',0,cfg);
  state=api.press(state,'KEY_RIGHTCTRL',1,cfg);
  assert.deepEqual(labels(state),[['Ctrl']],'both Ctrl keys render as the same keycap');
  assert.equal(state.groups[0].keys[0].count,2,'the second physical press is a repeat on screen');
  state=api.release(state,'KEY_LEFTCTRL',2);
  assert.deepEqual(plain(state.heldKeys),['KEY_RIGHTCTRL']);
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
