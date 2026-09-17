const { test } = require('node:test');
const assert = require('node:assert/strict');
const {loadCore} = require('./helpers/load.cjs');

const api = loadCore(['inputParse.js']);

// Lines as the two sources actually print them. The libinput samples come from
// `libinput debug-events --show-keycodes` on this machine; the evtest ones from
// the single-device fallback the daemon falls back to.
const L = {
  libinputCtrlDown: ' event3   KEYBOARD_KEY            +2.285s	KEY_LEFTCTRL (29) pressed',
  libinputCtrlUp: ' event3   KEYBOARD_KEY            +2.485s	KEY_LEFTCTRL (29) released',
  evtestKeyDown: 'Event: time 1712345678.123456, type 1 (EV_KEY), code 30 (KEY_A), value 1',
  evtestKeyUp: 'Event: time 1712345678.123456, type 1 (EV_KEY), code 30 (KEY_A), value 0',
  evtestAutoRepeat: 'Event: time 1712345678.123456, type 1 (EV_KEY), code 30 (KEY_A), value 2',
  libinputButtonDown: ' event7   POINTER_BUTTON          +1.234s	BTN_LEFT (272) pressed, seat 0',
  libinputButtonUp: ' event7   POINTER_BUTTON          +1.334s	BTN_LEFT (272) released, seat 0',
  libinputRightButton: ' event7   POINTER_BUTTON          +1.5s	BTN_RIGHT (273) pressed, seat 0',
  libinputMiddleButton: ' event7   POINTER_BUTTON          +1.6s	BTN_MIDDLE (274) pressed, seat 0',
  libinputWheelDown: ' event7   POINTER_SCROLL_WHEEL    +2.0s	vert 15.00/120.0* horiz 0.00/0.0 (wheel)',
  libinputWheelUp: ' event7   POINTER_SCROLL_WHEEL    +2.0s	vert -15.00/-120.0* horiz 0.00/0.0 (wheel)',
  libinputFingerScroll: ' event7   POINTER_SCROLL_FINGER   +2.0s	vert 3.50/0.0* horiz 0.00/0.0',
  libinputMotion: ' event3   POINTER_MOTION          +2.285s	 1.28/ -1.28 ( +1.00/ -1.00)',
  libinputAbsoluteMotion: ' event3   POINTER_MOTION_ABSOLUTE +2.285s	 100.00/ 200.00',
  libinputDeviceAdded: ' event3   DEVICE_ADDED                  Logitech Mouse            seat0 default group1',
  evtestRelX: 'Event: time 1712345678.1, type 2 (EV_REL), code 0 (REL_X), value 12',
  evtestWheelUp: 'Event: time 1712345678.1, type 2 (EV_REL), code 8 (REL_WHEEL), value 1',
  evtestWheelDown: 'Event: time 1712345678.1, type 2 (EV_REL), code 8 (REL_WHEEL), value -1',
};

test('physical key presses and releases are reported with their code', () => {
  assert.deepEqual({ ...api.event(L.libinputCtrlDown) }, { kind: 'key', name: 'KEY_LEFTCTRL', pressed: true });
  assert.deepEqual({ ...api.event(L.libinputCtrlUp) }, { kind: 'key', name: 'KEY_LEFTCTRL', pressed: false });
  assert.deepEqual({ ...api.event(L.evtestKeyDown) }, { kind: 'key', name: 'KEY_A', pressed: true });
  assert.deepEqual({ ...api.event(L.evtestKeyUp) }, { kind: 'key', name: 'KEY_A', pressed: false });
});

test('hardware autorepeat is not a press', () => {
  // keyviz discards value 2 before grouping; a repeated "press" would otherwise
  // bump the press count on every repeat.
  assert.equal(api.event(L.evtestAutoRepeat), null);
});

test('mouse buttons map to the labels keyviz renders', () => {
  assert.equal(api.event(L.libinputButtonDown).button, 'LMB Click');
  assert.equal(api.event(L.libinputButtonDown).pressed, true);
  assert.equal(api.event(L.libinputButtonUp).pressed, false);
  assert.equal(api.event(L.libinputRightButton).button, 'RMB Click');
  assert.equal(api.event(L.libinputMiddleButton).button, 'MMB Click');
});

test('wheel direction follows the axis sign used on Wayland', () => {
  assert.deepEqual({ ...api.event(L.libinputWheelDown) }, { kind: 'scroll', direction: 1 });
  assert.deepEqual({ ...api.event(L.libinputWheelUp) }, { kind: 'scroll', direction: -1 });
});

test('touchpad scrolling falls back to the pixel delta', () => {
  // No v120 component: the first value carries the direction.
  assert.deepEqual({ ...api.event(L.libinputFingerScroll) }, { kind: 'scroll', direction: 1 });
  assert.equal(api.scrollDirection('vert 0.00/0.0* horiz 0.00/0.0'), 0, 'a zero delta is not a notch');
});

test('pointer motion reports the accelerated pair, not the raw one', () => {
  assert.deepEqual({ ...api.event(L.libinputMotion) }, { kind: 'motion', dx: 1.28, dy: -1.28 });
});

test('absolute motion and device bookkeeping are ignored', () => {
  assert.equal(api.event(L.libinputAbsoluteMotion), null);
  assert.equal(api.event(L.libinputDeviceAdded), null);
  assert.equal(api.event(''), null);
  assert.equal(api.event('libinput: client bug'), null);
});

test('the evtest fallback reports one relative axis per line', () => {
  assert.deepEqual({ ...api.event(L.evtestRelX) }, { kind: 'axis', axis: 'REL_X', value: 12 });
  assert.deepEqual({ ...api.event(L.evtestWheelUp) }, { kind: 'axis', axis: 'REL_WHEEL', value: 1 });
});

test('REL_WHEEL +1 is physically up, which is keyviz -1', () => {
  assert.equal(api.wheelDirection('REL_WHEEL', 1), -1);
  assert.equal(api.wheelDirection('REL_WHEEL', -1), 1);
  assert.equal(api.wheelDirection('REL_HWHEEL', 1), -1);
  assert.equal(api.wheelDirection('REL_WHEEL', 0), 0, 'zero is not a notch');
  assert.equal(api.wheelDirection('REL_X', 5), 0, 'motion is not a wheel');
});
