const {test} = require('node:test');
const assert = require('node:assert/strict');
const {loadCore} = require('./helpers/load.cjs');
const context = loadCore(['KeyIcons.js', 'keyMapper.js']);
test('keyboard labels preserve upstream symbols and physical numpad identity', () => {
  for (const [ev, label, symbol] of [['KEY_1','1','!'],['KEY_SLASH','?','/'],['KEY_KP1','1','end'],['KEY_KPDOT','.','del']]) {
    const data = context.display(context.getDisplayKey(ev));
    assert.equal(data.label, label); assert.equal(data.symbol, symbol);
  }
  assert.equal(context.getDisplayKey('KEY_KPENTER'), 'KpReturn');
  assert.equal(context.display('KpReturn').icon, undefined);
});
test('special keys use upstream labels and icons', () => {
  for (const [ev,label,icon] of [['KEY_SYSRQ','print screen','image'],['KEY_PAUSE','pause break','pause'],['KEY_SCROLLLOCK','scroll lock','mouse'],['KEY_NUMLOCK','num lock','lock']]) {
    const data = context.display(context.getDisplayKey(ev));
    assert.equal(data.label,label); assert.equal(data.icon,icon);
  }
  assert.equal(context.display('Shift').shortLabel, undefined);
  assert.equal(context.display('MUTE').shortLabel, undefined);
  assert.equal(context.display('Super').icon, 'sparkle');
  assert.equal(context.display('F12').category, 'function');
  assert.equal(context.display('1').category, 'digit');
});
test('mute and sun vector paths are complete', () => {
  assert.equal(context.iconPaths('volume-x').length,3);
  assert.equal(context.iconPaths('sun').length,9);
});

test('the mute keycap follows the sink state when the host supplies one', () => {
  // No state: upstream's static crossed speaker (1:1 parity).
  assert.equal(context.display('MUTE').icon, 'volume-x');
  assert.equal(context.display('MUTE', undefined).icon, 'volume-x');
  // Muted / unmuted: the icon describes the state the press leaves behind.
  assert.equal(context.display('MUTE', true).icon, 'volume-x');
  assert.equal(context.display('MUTE', false).icon, 'volume-2');
  assert.equal(context.display('VOLUMEMUTE', false).icon, 'volume-2');
  // The label names the key, not the resulting state.
  assert.equal(context.display('MUTE', false).label, 'mute');
  // Non-mute keys ignore the state entirely.
  assert.equal(context.display('VOLUMEUP', false).icon, 'volume-2');
  assert.equal(context.display('A', false).category, 'letter');
});

test('reported Fn keys enter the modifier branch', () => {
  assert.equal(context.getDisplayKey('KEY_FN'),'Fn');
  assert.equal(context.display('Fn').category,'modifier');
});

test('the Menu key draws a keycap icon instead of one bare word', () => {
  // Deliberate deviation from upstream, which leaves Apps as label + glyph only
  // (no icon, no category), so it rendered as plain oversized text next to Esc /
  // Tab / Ins -- the same kind of key, all of them icon + short label.
  const data = context.display(context.getDisplayKey('KEY_COMPOSE'));
  assert.equal(data.label, 'menu');
  assert.equal(data.shortLabel, 'menu');
  assert.equal(data.icon, 'menu');
  assert.equal(data.category, 'special');
  assert.equal(context.display(context.getDisplayKey('KEY_MENU')).icon, 'menu');
  const paths = context.iconPaths('menu');
  assert.equal(paths.length, 3, 'lucide menu is the three bars upstream uses as its glyph');
});

test('every icon a keycap asks for actually resolves to path data', () => {
  // An icon name with no path renders an empty keycap -- it compiles, lints and
  // passes every other test. Read the table out of the vm context (a `const` in
  // QML-style core is not a host property) and resolve each reference.
  const vm = require('node:vm');
  const labels = vm.runInContext('Object.keys(DISPLAY)', context);
  assert.ok(labels.length > 50, 'the table should not silently shrink');
  for (const label of labels) {
    for (const kind of [false, true]) {                    // mute keys swap icon by state
      const icon = context.display(label, kind).icon;
      if (icon === undefined) continue;
      assert.ok(context.iconPaths(icon).length > 0,
        `${label} asks for icon "${icon}", which has no path data`);
    }
  }
});
