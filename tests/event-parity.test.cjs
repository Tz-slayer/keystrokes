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

// keyviz decides the gate from `pressedKeys[0]` alone: the modifier has to LEAD.
// `Ctrl` then `C` is a shortcut, `C` then `Ctrl` is not -- a sequence that began
// with a plain key is not a shortcut with a modifier bolted on afterwards.
test('a modifier filter only accepts a sequence that starts with a modifier', () => {
  // A lone modifier always shows, whatever the filter.
  for (const label of ['Ctrl', 'Shift', 'Alt', 'Super', 'Fn']) {
    assert.deepEqual(labels(down(api.initialState(), label, 0, {eventFilter:'modifiers'})), [[label]]);
  }
  // The modifier leads: shown, with each key carrying its own count.
  assert.deepEqual(labels(api.press(down(api.initialState(), 'Ctrl', 0, {eventFilter:'modifiers'}),
                                    'C', 1, {eventFilter:'modifiers'})), [['Ctrl', 'C']]);
  // A plain key that arrived first keeps the sequence out, however long the
  // modifier then stays down: `labels[0]` is still that plain key.
  assert.deepEqual(labels(down(down(api.initialState(), 'C', 0, {eventFilter:'modifiers'}),
                               'Ctrl', 1, {eventFilter:'modifiers'})), [],
    'C then Ctrl is not a shortcut');
  // Two keys with no modifier in sight are still not a hotkey.
  assert.deepEqual(labels(down(down(api.initialState(), 'A', 0, {eventFilter:'modifiers'}),
                               'B', 1, {eventFilter:'modifiers'})), []);
  // A lone non-modifier is not one either.
  assert.deepEqual(labels(down(api.initialState(), 'Caps Lock', 0, {eventFilter:'modifiers'})), []);
});

test('a refused key keeps the gate closed while it stays down', () => {
  // The price of leading-key semantics, pinned so it cannot drift: a refused key
  // is still in `heldKeys`, so it IS the sequence's first key until it comes up,
  // and everything pressed under it is refused too. Rolling onto the modifier a
  // moment late therefore shows nothing rather than a misordered chord -- and the
  // modifier shows alone as soon as the plain key is out of the way.
  const hotkeys = {eventFilter: 'modifiers'};
  let state = down(api.initialState(), 'C', 0, hotkeys);
  state = down(state, 'Ctrl', 1, hotkeys);
  assert.deepEqual(labels(state), [], 'the refused C leads, so Ctrl is refused with it');
  assert.deepEqual(plain(state.heldKeys), ['C', 'Ctrl'], 'both are held, neither is drawn');

  state = api.release(state, 'C', 2);
  state = api.release(state, 'Ctrl', 3);
  state = down(state, 'Ctrl', 4, hotkeys);
  assert.deepEqual(labels(state), [['Ctrl']], 'with C out of the way the modifier stands alone');
});

test('a plain key released before the modifier was never part of a chord', () => {
  // The other half of leading-key semantics: once the plain key is up it is out
  // of `heldKeys` entirely, so the modifier that follows starts a gesture of its
  // own. `Ctrl` released then `R` is not `Ctrl+R`, and neither is `C` then
  // release then `Ctrl`.
  const hotkeys = {eventFilter: 'modifiers'};
  let state = down(api.initialState(), 'C', 0, hotkeys);
  assert.deepEqual(labels(state), [], 'a lone C is not a hotkey');
  state = api.release(state, 'C', 1);
  state = down(state, 'Ctrl', 2, hotkeys);
  assert.deepEqual(labels(state), [['Ctrl']], 'the finished press must not resurface');
  assert.deepEqual(plain(state.groups[0].keys.map(key => key.count)), [1]);
});

test('a lone key after a finished chord is not captured by it', () => {
  // `Ctrl+C`, both released, then C on its own. The finished row is still on
  // screen (it lingers until `fadeTimeout`), but the new press is judged on its
  // own: its leading key is not a modifier, so the row gains nothing. Only
  // `lastPressedAt` moves, which is what upstream's `onKeyRelease` does with any
  // released key -- the members and the counts are what must not change.
  const hotkeys = {eventFilter: 'modifiers'};
  const content = state => plain(state.groups.map(group => group.keys.map(key => key.label + '×' + key.count)));
  let state = down(api.initialState(), 'Ctrl', 0, hotkeys);
  state = down(state, 'C', 1, hotkeys);
  state = api.release(state, 'C', 2);
  state = api.release(state, 'Ctrl', 3);
  const finished = content(state);
  assert.deepEqual(finished, [['Ctrl×1', 'C×1']]);

  state = down(state, 'C', 4, hotkeys);
  assert.deepEqual(plain(state.heldKeys), ['C'], 'it is held, so the gate has something to judge');
  state = api.release(state, 'C', 5);
  state = down(state, 'C', 6, hotkeys);
  assert.deepEqual(content(state), finished, 'the finished row gains no member and no count');

  // With the modifier held the same press IS part of the chord: Ctrl+C, C.
  let held = down(api.initialState(), 'Ctrl', 0, hotkeys);
  held = down(held, 'C', 1, hotkeys);
  held = api.release(held, 'C', 2);
  held = down(held, 'C', 3, hotkeys);
  assert.deepEqual(content(held), [['Ctrl×1', 'C×2']]);
});

test('a refused press leaves nothing for the overlay to draw', () => {
  // The gate decides what is SHOWN, so a refused press must not reach the
  // renderer either. `heldKeys` keeps it -- that is what keeps the rest of the
  // sequence out -- while `shownKeys` does not, so the overlay draws no keycap
  // for it and, just as importantly, does not play the press animation on the
  // keycap it happens to match in an older row.
  const hotkeys = {eventFilter: 'modifiers'};
  let state = down(api.initialState(), 'Ctrl', 0, hotkeys);
  state = down(state, 'C', 1, hotkeys);
  state = api.release(state, 'C', 2);
  state = api.release(state, 'Ctrl', 3);
  assert.deepEqual(plain(state.shownKeys), [], 'the finished chord is not held');

  state = down(state, 'C', 4, hotkeys);
  assert.deepEqual(plain(state.heldKeys), ['C'], 'physically down, so the gate can judge it');
  assert.deepEqual(plain(state.shownKeys), [], 'but nothing on screen may react to it');

  // An accepted chord, by contrast, is "held" for drawing while it is down.
  let held = down(api.initialState(), 'Ctrl', 0, hotkeys);
  held = down(held, 'C', 1, hotkeys);
  assert.deepEqual(plain(held.shownKeys), ['Ctrl', 'C']);
  held = api.release(held, 'C', 2);
  assert.deepEqual(plain(held.shownKeys), ['Ctrl'], 'a release takes that key off screen');
});

test('history mode: a late modifier leaves the previous row alone', () => {
  // `Ctrl+A`, let go, then `C` before `Ctrl`: not a shortcut, so the finished
  // `Ctrl+A` row keeps its members. It used to gain one -- the refused C made the
  // Ctrl press look like a repress onto that row, which keeps its members, and
  // the overlay drew a single `Ctrl+A+C`.
  const history = {eventFilter: 'modifiers', showEventHistory: true, maxHistory: 5};
  let state = down(api.initialState(), 'Ctrl', 0, history);
  state = down(state, 'A', 1, history);
  state = api.release(state, 'A', 2);
  state = api.release(state, 'Ctrl', 3);
  assert.deepEqual(labels(state), [['Ctrl', 'A']]);

  state = down(state, 'C', 4, history);
  state = down(state, 'Ctrl', 5, history);
  assert.deepEqual(labels(state), [['Ctrl', 'A']], 'nothing is added and nothing is redrawn');
  assert.deepEqual(plain(state.groups[0].keys.map(key => key.count)), [1, 1]);

  // With the modifier leading, the same chord is a second, separate row.
  state = api.release(state, 'C', 6);
  state = api.release(state, 'Ctrl', 7);
  state = down(state, 'Ctrl', 8, history);
  state = down(state, 'C', 9, history);
  assert.deepEqual(labels(state), [['Ctrl', 'A'], ['Ctrl', 'C']]);
  assert.deepEqual(plain(state.groups[1].keys.map(key => key.count)), [2, 1]);
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

test('history mode: a tapped key does not overwrite the row before it', () => {
  // Typing A then B then C is three keystrokes, so history shows three rows.
  // Upstream pushes a new group whenever the arriving key is the only one down
  // (`pressedKeys.length === 1` in key_event.ts onKeyPress); without that clause
  // the second key overwrote the first and the whole mode showed one row.
  const h = {showEventHistory:true, maxHistory:5};
  let state = tap(api.initialState(), 'A', 0, h);
  state = tap(state, 'B', 10, h);
  state = tap(state, 'C', 20, h);
  assert.deepEqual(labels(state), [['A'], ['B'], ['C']]);
});

test('history mode: maxHistory keeps only the newest rows', () => {
  const h = {showEventHistory:true, maxHistory:2};
  let state = api.initialState();
  ['A', 'B', 'C', 'D'].forEach((key, index) => { state = tap(state, key, index * 10, h); });
  assert.deepEqual(labels(state), [['C'], ['D']]);
});

test('history mode: every row on screen keeps a distinct uid', () => {
  // Overlay.qml keys its rows by uid (ListModelSync.reconcile + OverlayLayout
  // .byId), so two rows sharing one uid collapse into a single row on screen and
  // the layout gives them the same position. Distinctness is load-bearing.
  const h = {showEventHistory:true, maxHistory:5};
  let state = tap(api.initialState(), 'A', 0, h);
  state = tap(state, 'B', 10, h);
  state = tap(state, 'C', 20, h);
  const uids = state.groups.map(group => group.uid);
  assert.deepEqual(plain(uids), [1, 2, 3]);
});

test('history mode: a chord does not alias the uid of the row it takes over', () => {
  // A deferred modifier shows a provisional row; the key that resolves it lands
  // in that same slot and reuses its uid so the delegate is not rebuilt. The
  // counter, though, must stay PAST that uid -- rolling it back handed the next
  // row a uid that was still on screen, and the two then collapsed into one.
  const h = {showEventHistory:true, maxHistory:5};
  let state = down(api.initialState(), 'Ctrl', 0, h);        // provisional
  const provisional = state.groups[0].uid;
  state = down(state, 'C', 1, h);                            // resolves onto it
  assert.equal(state.groups[0].uid, provisional, 'the chord takes the row over');
  state = api.release(state, 'C', 2);
  state = down(state, 'V', 3, h);                            // the next keystroke
  assert.equal(state.groups.length, 2);
  assert.notEqual(state.groups[1].uid, state.groups[0].uid,
    'a new row must not reuse a uid that is still on screen');
});

test('history mode: no sequence of keys can put two rows on one uid', () => {
  // Deterministic sweep over mixed modifier/letter sequences. The overlay keys
  // its rows by uid, so a collision anywhere collapses two rows into one; this
  // pins the invariant across every shape the state machine can reach, rather
  // than the handful the hand-written cases cover.
  const history = {...config, showEventHistory: true, maxHistory: 5};
  const keys = ['Ctrl', 'Shift', 'A', 'B', 'C', 'V'];
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let run = 0; run < 200; run++) {
    let state = api.initialState(), now = 0, held = [];
    for (let step = 0; step < 24; step++) {
      const key = keys[Math.floor(rnd() * keys.length)];
      if (held.includes(key)) { state = api.release(state, key, now += 5); held = held.filter(k => k !== key); }
      else { state = api.press(state, key, now += 5, history); held.push(key); }
      const uids = state.groups.map(group => group.uid);
      assert.equal(new Set(uids).size, uids.length,
        'two rows share a uid after: ' + state.groups.map(g => g.uid + ':' + g.keys.map(k => k.label).join('+')).join(' | '));
    }
  }
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

// The gate. It judges the FIRST key of the sequence -- the key the gesture
// started with -- which is upstream's `pressedKeys[0]` rule.
test('the filter gate judges the first key of the sequence', () => {
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

  // The modifier has to lead -- `A` then `Ctrl` is not `Ctrl+A`.
  assert.equal(show('modifiers', ['Ctrl', 'A']), true);
  assert.equal(show('modifiers', ['A', 'Ctrl']), false, 'the modifier must be first');
  assert.equal(show('modifiers', ['Shift', 'A']), true, 'Shift is a modifier');
  assert.equal(show('modifiers', ['A', 'Shift']), false);
  assert.equal(show('modifiers', ['Ctrl', 'Shift', 'A']), true, 'only the first key is judged');

  // No modifier at all: still not a hotkey.
  assert.equal(show('modifiers', ['A', 'B']), false);

  // "custom" swaps the modifier set for allowedKeys and applies the same rule.
  assert.equal(show('custom', ['Space'], ['Space']), true);
  assert.equal(show('custom', ['A'], ['Space']), false);
  assert.equal(show('custom', ['Space', 'B'], ['Space']), true);
  assert.equal(show('custom', ['B', 'Space'], ['Space']), false, 'the allowed key must be first');
  assert.equal(show('custom', ['B', 'C'], ['Space']), false);
  assert.equal(show('custom', ['Ctrl'], []), false);
});

test('the gate tolerates an empty or absent filter', () => {
  assert.equal(api.shouldShow(undefined, ['A']), true);
  assert.equal(api.shouldShow('', ['A']), true);
  assert.equal(api.shouldShow('modifiers', []), true);
});

// The gate judges the FIRST key of the sequence, so a key it refused keeps the
// sequence out for as long as it stays down: the late modifier neither rescues
// it nor is drawn beside it.
test('a held plain key keeps a late modifier off the screen', () => {
  const cfg = { eventFilter: 'modifiers', allowedKeys: [], showEventHistory: false, maxHistory: 5, fadeTimeout: 5000 };

  // C alone is rejected by the filter, so nothing is on screen yet.
  let state = api.press(api.initialState(), 'C', 0, cfg);
  assert.deepEqual(labels(state), [], 'a lone C is not a hotkey');
  assert.deepEqual(plain(state.heldKeys), ['C'], 'but it is remembered as held');

  // Ctrl lands, and the sequence still starts with C: refused along with it.
  state = api.press(state, 'Ctrl', 1, cfg);
  assert.deepEqual(labels(state), [], 'C leads, so this is not a shortcut');

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

test('a plain key is not rescued by a modifier that arrives on top of it', () => {
  // The mirror image: R first, then Ctrl while R is still down. The sequence
  // began with a plain key, so it is not a shortcut -- a modifier arriving
  // second does not turn it into one.
  const cfg = {...config, eventFilter: 'modifiers'};
  let state = api.press(api.initialState(), 'R', 0, cfg);
  state = api.press(state, 'Ctrl', 1, cfg);
  assert.deepEqual(labels(state), []);
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
