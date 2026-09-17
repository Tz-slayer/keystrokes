// The core modules are QML-style globals (`function foo() {}` at file scope), so
// Node tests load them into a vm context exactly the way QML does. One helper
// keeps that boilerplate -- and the stubs a module needs -- in a single place.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');

function corePath(name) {
  return path.join(ROOT, 'core', name);
}

// loadCore(['keyvizEvents.js']) -> context with those globals
// loadCore(['keycapColors.js'], {Qt: {...}}) -> plus extra stubs
function loadCore(names, stubs = {}) {
  const context = vm.createContext(Object.assign({console}, stubs));
  for (const name of names) {
    const file = corePath(name);
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  return context;
}

// Qt's rgba() is all keycapColors.js needs from the runtime.
const qtRgbaStub = { Qt: { rgba: (r, g, b, a) => ({ r, g, b, a }) } };

module.exports = { ROOT, corePath, loadCore, qtRgbaStub };
