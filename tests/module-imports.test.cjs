const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// A QML file that calls into a `.js` module must import it as a qualifier:
//
//   import "core/inputParse.js" as InputParse   ->   InputParse.event(line)
//
// Nothing else warns about a missing one. qmllint stays quiet because it cannot
// resolve `qs.*` (so it bails out of unqualified-name analysis), the Node tests
// exercise the module directly rather than through QML, and the failure only
// shows up at runtime as `ReferenceError: InputParse is not defined` inside the
// signal handler that used it. For the daemon that meant every input line threw
// and the overlay stayed empty — the plugin looked dead while it was running.
//
// The aliases are derived from the module files themselves (events.js ->
// Events), not from the import lines, so deleting an import cannot hide
// the usage it was supposed to satisfy.
const root = path.resolve(__dirname, '..');

function walk(dir = '', out = []) {
  const full = path.join(root, dir);
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(rel, out);
    } else {
      out.push(rel);
    }
  }
  return out;
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const all = walk();
const sources = all.filter(f => f.endsWith('.qml'))
  .map(file => [file, stripComments(fs.readFileSync(path.join(root, file), 'utf8'))]);

// events.js -> Events, inputParse.js -> InputParse
const aliasOf = name => path.basename(name, '.js').replace(/^./, c => c.toUpperCase());
const aliases = new Set(all.filter(f => f.endsWith('.js') && !f.startsWith('tests/')).map(aliasOf));
// A file may also import a module under a name of its own choosing.
for (const [, text] of sources) {
  for (const match of text.matchAll(/^\s*import\s+"[^"]+\.js"\s+as\s+(\w+)/gm)) aliases.add(match[1]);
}

test('the repo ships some core modules to import', () => {
  assert.ok(aliases.size >= 5, `expected several .js modules, found ${[...aliases]}`);
});

test('a used module qualifier is imported by the file that uses it', () => {
  for (const [file, text] of sources) {
    const imported = new Set([...text.matchAll(/^\s*import\s+"[^"]+\.js"\s+as\s+(\w+)/gm)].map(m => m[1]));
    // An object id shadows a module name of the same spelling, which is legal QML.
    const ids = new Set([...text.matchAll(/\bid:\s*(\w+)/g)].map(m => m[1]));
    for (const match of text.matchAll(/\b(\w+)\s*\./g)) {
      const qualifier = match[1];
      if (!aliases.has(qualifier) || imported.has(qualifier) || ids.has(qualifier)) continue;
      assert.fail(`${file} uses ${qualifier}.… but never imports it `
        + `(add: import "<path>.js" as ${qualifier})`);
    }
  }
});

test('every imported module path resolves', () => {
  for (const [file, text] of sources) {
    for (const match of text.matchAll(/^\s*import\s+"([^"]+\.js)"/gm)) {
      const target = path.resolve(path.dirname(path.join(root, file)), match[1]);
      assert.ok(fs.existsSync(target), `${file} imports ${match[1]}, which does not exist`);
    }
  }
});

// A QML file's name IS a type name: everything in the same directory -- and in
// any directory imported with `import "<dir>"` -- sees it as that type, and the
// implicit import outranks module imports. Naming a file `Row.qml` therefore
// shadows QtQuick's Row everywhere near it, and the first layout usage that
// assigns `spacing:` fails the whole page at compile time. That is exactly how
// the settings page went empty: the rename to Row.qml left every `Row {` in
// settings/ instantiating the row chrome, and DMS rendered nothing.
//
// No plugin QML file may share a name with a type that QtQuick ships.
test('no QML file name shadows a QtQuick built-in type', () => {
  const builtins = new Set([
    // QtQuick core
    'Item', 'Rectangle', 'Text', 'Image', 'BorderImage', 'AnimatedImage',
    'Row', 'Column', 'Flow', 'Grid', 'Flickable', 'Flipable', 'Loader',
    'FocusScope', 'MouseArea', 'PinchArea', 'WheelHandler', 'HoverHandler',
    'DragHandler', 'TapHandler', 'PointHandler', 'Repeater', 'Timer',
    'Connections', 'Canvas', 'Gradient', 'GradientStop', 'SystemPalette',
    'FontLoader', 'Font', 'TextMetrics', 'Screen', 'Color', 'VectorImage',
    'TextEdit', 'TextInput', 'TextArea', 'TextField', 'PathView', 'PathText',
    'MultiPointTouchArea', 'ShaderEffect', 'ShaderEffectSource', 'SpringAnimation',
    'NumberAnimation', 'ColorAnimation', 'SequentialAnimation', 'ParallelAnimation',
    'PropertyAnimation', 'Behavior', 'Scale', 'Rotation', 'Translate', 'Transform',
    // QtQuick.Layouts / Controls / Window / Dialogs / Templates
    'ColumnLayout', 'RowLayout', 'GridLayout', 'StackLayout',
    'Button', 'CheckBox', 'ComboBox', ' Dial', 'Frame', 'GroupBox', 'Label',
    'ProgressBar', 'RadioButton', 'ScrollBar', 'ScrollIndicator', 'Slider',
    'SpinBox', 'StackView', 'SwipeView', 'Switch', 'TabBar', 'TabButton',
    'TextArea', 'TextField', 'ToolBar', 'ToolButton', 'Tumbler', 'Menu',
    'MenuItem', 'Dialog', 'DialogButtonBox', 'Popup', 'ToolTip', 'SplitView',
    'ApplicationWindow', 'Window', 'Page', 'Pane', 'Control', 'Separator',
  ]);

  for (const file of all.filter(f => f.endsWith('.qml'))) {
    const name = path.basename(file, '.qml');
    assert.ok(!builtins.has(name.trim()),
      `${file}: the type name "${name}" shadows a QtQuick built-in. Same-directory `
      + `and directory-imported files would resolve the name to this file instead, `
      + `breaking their layout usages at compile time. Rename it.`);
  }
});
