const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const api = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../keyvizEvents.js'), 'utf8'), api, {filename:path.resolve(__dirname,'../keyvizEvents.js')});
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

test('history mode splits partial/repeated combos and limits groups', () => {
  const history = {showEventHistory:true, maxHistory:2};
  let state = down(api.initialState(), 'Ctrl', 0, history);
  state = down(state, 'C', 1, history);
  state = api.release(state, 'C', 2);
  state = down(state, 'C', 3, history);
  assert.deepEqual(labels(state), [['Ctrl','C'], ['Ctrl','C']]);
  assert.equal(state.groups[1].keys[1].count, 1);
  state = api.release(state, 'C', 4);
  state = down(state, 'V', 5, history);
  assert.deepEqual(labels(state), [['Ctrl','C'], ['Ctrl','V']]);
  assert.equal(state.groups[1].uid, 3);
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

test('physical left and right modifiers retain independent pressed/released state', () => {
  const cfg = {...config,eventFilter:'modifiers',displayLabel:key=>key.startsWith('KEY_')&&key.endsWith('CTRL')?'Ctrl':key};
  let state=api.press(api.initialState(),'KEY_LEFTCTRL',0,cfg);
  state=api.press(state,'KEY_RIGHTCTRL',1,cfg);
  assert.equal(state.groups[0].keys.length,2);
  state=api.release(state,'KEY_LEFTCTRL',2);
  assert.deepEqual(plain(state.heldKeys),['KEY_RIGHTCTRL']);
});
