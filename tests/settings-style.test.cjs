const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const pages = ['KeyvizSettings.qml', path.join('settings', 'KeyvizParitySettings.qml')];

// Every option in the plugin's settings UI is one of the DMS-styled rows, not a
// stock Qt Quick control: a raw ComboBox/CheckBox next to a themed row is the
// mismatch this list exists to prevent. Controls that a row may contain are
// listed too, so the pages stay declarative.
const ALLOWED = new Set([
  'Column', 'Row', 'Flow', 'Item', 'Timer', 'Connections',
  'StyledText', 'DankButton', 'DankDropdown', 'DankToggle', 'DankIcon', 'DankTextField',
  'SettingsCard', 'SectionTitle', 'UsageGuide', 'PluginAbout', 'CopyBox',
  'ToggleSettingPlus', 'SelectionSettingPlus', 'SliderSettingPlus',
  'KeyvizRow', 'KeyvizValueSetting', 'KeyvizTextArea', 'KeyvizParitySettings',
  'KeyvizColorRow', 'KeyvizColorSwatch',
  'PluginSettings',
  // container/plumbing types a page may need around the rows
  'Repeater', 'MouseArea', 'HoverHandler', 'DankTooltipV2',
]);

function declaredComponents(source) {
  return [...source.matchAll(/^(\s*)([A-Z][A-Za-z0-9_]*)\s*\{/gm)].map(match => match[2]);
}

test('the settings pages are built from the unified row components', () => {
  for (const page of pages) {
    const relative = path.relative(ROOT, path.join(ROOT, page));
    const found = declaredComponents(fs.readFileSync(path.join(ROOT, page), 'utf8'));
    assert.ok(found.length > 0, `${relative} should declare components`);
    for (const name of new Set(found)) {
      assert.ok(ALLOWED.has(name),
        `${relative} uses ${name}; the settings UI must be built from the DMS-styled rows`);
    }
  }
});

test('no stock Qt Quick control and no divider survives in the settings UI', () => {
  const stock = /\b(ComboBox|CheckBox|Switch|RadioButton|TextField|ScrollView|SpinBox|Slider|Separator|Rectangle)\b/;
  for (const page of pages) {
    const relative = path.relative(ROOT, path.join(ROOT, page));
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, page), 'utf8'), stock,
      `${relative} must not fall back to a stock control or a divider`);
  }
});

test('every settings row carries a label', () => {
  for (const page of pages) {
    const source = fs.readFileSync(path.join(ROOT, page), 'utf8');
    // Row instances are declared over one or more lines; pair each opening with
    // the block that follows it.
    for (const match of source.matchAll(/\b(KeyvizValueSetting|KeyvizRow|KeyvizColorRow|SelectionSettingPlus|ToggleSettingPlus|SliderSettingPlus)\s*\{([\s\S]*?)\n(\s*)\}/g)) {
      const [, name, body] = match;
      if (name === 'KeyvizValueSetting' || name === 'KeyvizRow' || name === 'KeyvizColorRow') {
        assert.match(body, /\blabel:/, `a ${name} in ${page} has no label`);
      }
    }
  }
});
