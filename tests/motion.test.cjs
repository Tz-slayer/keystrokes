const { test } = require('node:test');
const assert = require('node:assert/strict');
const {loadCore} = require('./helpers/load.cjs');

const api = loadCore(['motion.js']);

test('entering and leaving use different splines', () => {
  assert.deepEqual(Array.from(api.enterCurve()), [0.23, 1, 0.32, 1, 1, 1]);
  assert.deepEqual(Array.from(api.exitCurve()), [0.76, 0, 0.68, 0, 1, 1]);
  assert.deepEqual(Array.from(api.pressCurve()), [0.86, 0, 0.07, 1, 1, 1]);
  assert.deepEqual(Array.from(api.curve(false)), Array.from(api.enterCurve()));
  assert.deepEqual(Array.from(api.curve(true)), Array.from(api.exitCurve()));
});

test('each animation type hides a unit in exactly one way', () => {
  for (const type of ['fade', 'zoom', 'float', 'slide']) {
    assert.equal(api.opacity(type, true), 0, type + ' hides the unit');
    assert.equal(api.opacity(type, false), 1);
    assert.equal(api.scale(type, true), type === 'zoom' ? 0 : 1, type + ' scales only when zooming');
    assert.equal(api.offset(type, 'x', 32, true), type === 'slide' ? 32 : 0);
    assert.equal(api.offset(type, 'y', 32, true), type === 'float' ? 32 : 0);
  }
});

test('animationType none draws the unit in place', () => {
  assert.equal(api.opacity('none', true), 1, 'no entrance animation means no invisible state');
  assert.equal(api.scale('none', true), 1);
  assert.equal(api.offset('none', 'x', 32, true), 0);
  assert.equal(api.offset('none', 'y', 32, true), 0);
});

test('a visible unit is never displaced', () => {
  for (const type of ['fade', 'zoom', 'float', 'slide', 'none']) {
    assert.equal(api.offset(type, 'x', 32, false), 0);
    assert.equal(api.offset(type, 'y', 32, false), 0);
  }
});

test('keyviz reflows layout with a third of the animation duration', () => {
  assert.equal(api.reflowDuration(300), 100);
  assert.equal(api.reflowDuration(0), 0);
});
