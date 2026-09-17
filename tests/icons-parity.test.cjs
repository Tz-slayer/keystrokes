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
