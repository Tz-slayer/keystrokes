const { test } = require('node:test');
const assert = require('node:assert/strict');
const {loadCore} = require('./helpers/load.cjs');

const api = loadCore(['overlayLayout.js']);

const plain = value => JSON.parse(JSON.stringify(value));

test('automatic output tracks the screen of the focused workspace', () => {
  const names = ['DP-1', 'DP-2', 'DP-3'];
  // The value fed in is an OUTPUT name (NiriService.currentOutput), so switching
  // workspaces inside one output yields the same screen and never moves the
  // overlay; only focus landing on another output does.
  assert.equal(api.screenName('', 'DP-3', names), 'DP-3');
  assert.equal(api.screenName('', 'DP-1', names), 'DP-1');
  assert.equal(api.screenName(api.followFocusValue(), 'DP-2', names), 'DP-2', 'sentinel behaves like the default');
  assert.equal(api.screenName('', '', names), 'DP-1', 'unknown focus falls back to the first output');
  assert.equal(api.screenName('', 'gone', names), 'DP-1');
  assert.equal(api.screenName('', 'DP-3', []), '');
});

test('explicit output pins, and @primary opts out of motion entirely', () => {
  const names = ['DP-1', 'DP-2', 'DP-3'];
  assert.equal(api.screenName('DP-2', 'DP-3', names), 'DP-2', 'explicit output wins over focus');
  // A configured output that is gone (renamed or unplugged) still follows focus,
  // so the overlay does not silently disappear on a screen nobody is using.
  assert.equal(api.screenName('missing', 'DP-3', names), 'DP-3');
  // keyviz pins appearance.monitor to monitors[0]; @primary is that behaviour.
  assert.equal(api.screenName(api.primaryValue(), 'DP-3', names), 'DP-1');
  assert.equal(api.screenName(api.primaryValue(), 'DP-1', names), 'DP-1');
  assert.equal(api.screenName(api.primaryValue(), '', names), 'DP-1');
  assert.equal(api.screenName(api.primaryValue(), 'DP-3', []), '');
});

test('an unnameable focus is reported as unknown instead of the first output', () => {
  const names = ['DP-1', 'DP-2', 'DP-3'];
  // CompositorService.getFocusedScreen() answers screens[0] whenever the
  // compositor cannot name the focused output, which is indistinguishable from
  // a real move to DP-1. A workspace switch can drop it for a moment; the
  // overlay must hold its output instead of following that as a move.
  assert.equal(api.focusedTarget(true, '', 'DP-2', names), 'DP-2');
  assert.equal(api.focusedTarget(true, api.followFocusValue(), 'DP-2', names), 'DP-2');
  assert.equal(api.focusedTarget(true, '', '', names), '', 'unknown focus: hold');
  assert.equal(api.focusedTarget(true, '', 'gone', names), '', 'stale output: hold');
  assert.equal(api.focusedTarget(true, '', 'DP-2', []), '');
});

test('a pinned output ignores the focus entirely', () => {
  const names = ['DP-1', 'DP-2', 'DP-3'];
  assert.equal(api.focusedTarget(false, 'DP-2', 'DP-3', names), 'DP-2');
  assert.equal(api.focusedTarget(false, 'DP-2', '', names), 'DP-2', 'a pin never goes unknown');
  assert.equal(api.focusedTarget(false, api.primaryValue(), 'DP-3', names), 'DP-1');
});

test('bottom history removal leaves the remaining group at the same absolute y', () => {
  const viewport = [2560, 1440];
  const two = api.targets(false, 'bottom_center', 100, 100, ...viewport,
    [{width: 300, height: 80}, {width: 420, height: 80}], 16);
  const one = api.targets(false, 'bottom_center', 100, 100, ...viewport,
    [{width: 420, height: 80}], 16);
  assert.equal(two[1].y, one[0].y);
  assert.equal(two[1].x, one[0].x);
});

test('a stable id keeps its cached position while repeater indices change', () => {
  const positions = api.targets(false, 'bottom_center', 100, 100, 2560, 1440,
    [{width: 300, height: 80}, {width: 420, height: 80}], 16);
  const targetsByUid = plain(api.byId(['expired', 'remaining'], positions));

  // Removing the first model row changes `remaining` from index 1 to index 0,
  // but its identity-keyed cached target cannot alias the expired row.
  assert.deepEqual(targetsByUid.remaining, plain(positions[1]));
  assert.notDeepEqual(targetsByUid.remaining, plain(positions[0]));
});

test('all alignments remain inside the configured margins', () => {
  const items = [{width: 300, height: 80}, {width: 420, height: 100}];
  for (const horizontal of [false, true]) {
    for (const alignment of ['top_left', 'top_center', 'top_right', 'center_left', 'center', 'center_right', 'bottom_left', 'bottom_center', 'bottom_right']) {
      const result = plain(api.targets(horizontal, alignment, 24, 32, 1920, 1080, items, 16));
      for (const item of result) {
        assert.ok(item.x >= 24 - 0.01, `${alignment} x`);
        assert.ok(item.y >= 32 - 0.01, `${alignment} y`);
        assert.ok(item.x + item.width <= 1920 - 24 + 0.01, `${alignment} right`);
        assert.ok(item.y + item.height <= 1080 - 32 + 0.01, `${alignment} bottom`);
      }
    }
  }
});
