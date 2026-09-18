const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The runtime layers must stay usable without DankMaterialShell: that is what
// makes the overlay portable and what keeps the plugin's business logic
// testable in Node/Qt without the shell. Only the entry points at the root and
// the settings pages may touch DMS.
const root = path.resolve(__dirname, '..');
const DMS_ONLY = /\b(?:qs\.[A-Z]|Theme\.|I18n\.|PluginService|PluginComponent|pluginService|pluginData|CompositorService|BarWidgetService|AudioService|PopoutService|StyledText|StyledRect|Dank[A-Z]\w*)/;

function sources(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter(name => /\.(qml|js)$/.test(name))
    .map(name => ({ file: path.join(dir, name), text: fs.readFileSync(path.join(full, name), 'utf8') }));
}

// Comments are allowed to name DMS types when they explain where a boundary is;
// only executable lines matter here.
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

test('core/ and ui/ never reference DMS', () => {
  for (const { file, text } of [...sources('core'), ...sources('ui')]) {
    const match = DMS_ONLY.exec(stripComments(text));
    assert.equal(match, null, `${file} must not use ${match && match[0]} — inject it from the entry point instead`);
  }
});

test('the DMS entry points keep the shell imports', () => {
  const daemon = fs.readFileSync(path.join(root, 'Daemon.qml'), 'utf8');
  // The compositor lookup belongs here: the overlay asks for an output name so
  // that ui/ stays shell-agnostic.
  assert.match(daemon, /focusedOutputName:/, 'the daemon must feed the overlay its output name');
  assert.match(daemon, /import qs\.Modules\.Plugins/);
});

test('the runtime keeps no dependency on the settings pages', () => {
  for (const { file, text } of [...sources('core'), ...sources('ui')]) {
    // The settings-side QML files and the DMS-only row widgets. Names are spelled
    // with their .qml suffix where a bare name would be ambiguous: `Settings.qml`
    // must not be confused with `core/keyStyle.js`'s KeyStyle qualifier, which is
    // runtime code the overlay is allowed to import.
    assert.doesNotMatch(
      text,
      /\b(?:Settings\.qml|ParitySettings|Widget\.qml|ColorDropdown\w*|SettingsCard)\b/,
      `${file} must not reach into the DMS-facing UI`);
  }
});
