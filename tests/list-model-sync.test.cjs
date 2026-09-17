const { test } = require('node:test');
const assert = require('node:assert/strict');
const {loadCore} = require('./helpers/load.cjs');

const api = loadCore(['listModelSync.js']);

// A ListModel stand-in that records what happened to it, so the reconciliation
// rules can be asserted without Qt.
function stubModel(rows = []) {
  const items = rows.map(row => Object.assign({}, row));
  const log = [];
  const keyOf = row => row.keyId !== undefined ? row.keyId : row.uid;
  return {
    log,
    get count() { return items.length; },
    get: i => items[i],
    append(value) { log.push(['append', keyOf(value)]); items.push(Object.assign({}, value)); },
    set(i, value) {
      const unchanged = JSON.stringify(items[i]) === JSON.stringify(value);
      log.push(['set', keyOf(items[i]), unchanged ? 'identical' : 'changed']);
      items[i] = Object.assign({}, value);
    },
    remove(i) { log.push(['remove', keyOf(items[i])]); items.splice(i, 1); },
    setProperty(i, name, value) { log.push(['mark', keyOf(items[i]), name, value]); items[i][name] = value; },
    keys: () => items.map(keyOf),
    rows: () => items,
  };
}

// Mirrors KeyvizGroup: `last` is derived from the position inside the snapshot,
// so the option builder closes over the snapshot it is applied to.
const capOptions = keys => ({
  keyField: 'keyId',
  keyOf: key => key.keyId || key.label,
  valueOf: (key, index) => ({
    keyId: key.keyId || key.label, label: key.label, count: key.count,
    animateIn: key.animateIn !== false, dying: false, last: index === keys.length - 1,
  }),
});
const caps = (...labels) => labels.map(label => ({ label, keyId: label, count: 1 }));

test('a row that is still present is updated in place, never re-created', () => {
  const model = stubModel([
    { keyId: 'Ctrl', label: 'Ctrl', count: 1, animateIn: true, dying: false, last: false },
    { keyId: '1', label: '1', count: 1, animateIn: true, dying: false, last: true },
  ]);
  // Same snapshot plus one new key: the two existing caps must survive.
  const next = caps('Ctrl', '1', '2');
  api.reconcile(model, next, capOptions(next));

  assert.deepEqual(model.log, [['set', 'Ctrl', 'identical'], ['set', '1', 'changed'], ['append', '2']]);
  assert.deepEqual(model.keys(), ['Ctrl', '1', '2']);
  assert.equal(model.log.some(entry => entry[0] === 'remove'), false, 'nothing is torn down');
});

test('a cap that left the group is flagged dying, not removed', () => {
  const model = stubModel([
    { keyId: 'Ctrl', label: 'Ctrl', count: 1, animateIn: true, dying: false, last: false },
    { keyId: '1', label: '1', count: 1, animateIn: true, dying: false, last: true },
  ]);
  const next = caps('Ctrl');
  api.reconcile(model, next, capOptions(next));

  assert.deepEqual(model.log[0], ['mark', '1', 'dying', true]);
  assert.deepEqual(model.keys(), ['Ctrl', '1'], 'the exit animation needs the row to stay');
  assert.equal(model.rows()[1].label, '1', 'the stale row keeps its own data for the exit variant');
  assert.equal(model.rows()[0].last, true, 'Ctrl is the last cap now that "1" is leaving');
});

test('with animation disabled stale rows go immediately', () => {
  const model = stubModel([{ keyId: '1', label: '1', count: 1, dying: false, last: true }]);
  const next = caps('Ctrl');
  api.reconcile(model, next, Object.assign({}, capOptions(next), { animate: false }));
  assert.deepEqual(model.log, [['remove', '1'], ['append', 'Ctrl']]);
});

test('a row already dying is not marked twice', () => {
  const model = stubModel([{ keyId: '1', label: '1', count: 1, dying: true, last: true }]);
  const next = caps('Ctrl');
  api.reconcile(model, next, capOptions(next));
  assert.equal(model.log.filter(entry => entry[0] === 'mark').length, 0);
});

test('a resurrection within the exit window clears the dying flag', () => {
  // The row is still there (fading out) when the same key is pressed again.
  const model = stubModel([{ keyId: 'A', label: 'A', count: 1, animateIn: true, dying: true, last: true }]);
  const next = caps('A');
  api.reconcile(model, next, capOptions(next));
  assert.deepEqual(model.log, [['set', 'A', 'changed']]);
  assert.equal(model.rows()[0].dying, false);
});

test('removeByKey drops only a dying row of that key', () => {
  const model = stubModel([
    { keyId: 'A', dying: false },
    { keyId: 'B', dying: true },
    { keyId: 'C', dying: true },
  ]);
  api.removeByKey(model, 'keyId', 'B');
  assert.deepEqual(model.keys(), ['A', 'C']);
  // A live row with the same key is left alone.
  api.removeByKey(model, 'keyId', 'A');
  assert.deepEqual(model.keys(), ['A', 'C']);
  // An unknown key is a no-op.
  api.removeByKey(model, 'keyId', 'gone');
  assert.deepEqual(model.keys(), ['A', 'C']);
});
