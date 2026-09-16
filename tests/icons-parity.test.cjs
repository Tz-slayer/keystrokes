const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({});
for (const name of ['KeyIcons.js', 'keyMapper.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), context, {filename:path.resolve(__dirname,'..',name)});
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

test('reported Fn keys enter the modifier branch', () => {
  assert.equal(context.getDisplayKey('KEY_FN'),'Fn');
  assert.equal(context.display('Fn').category,'modifier');
});
