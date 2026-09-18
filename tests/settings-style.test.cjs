const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const pages = ['Settings.qml', path.join('settings', 'ParitySettings.qml')];

// Every option in the plugin's settings UI is one of the DMS-styled rows, not a
// stock Qt Quick control: a raw ComboBox/CheckBox next to a themed row is the
// mismatch this list exists to prevent. Controls that a row may contain are
// listed too, so the pages stay declarative.
const ALLOWED = new Set([
  'Column', 'Row', 'Flow', 'Item', 'Timer', 'Connections',
  'StyledText', 'DankButton', 'DankDropdown', 'DankToggle', 'DankIcon', 'DankTextField',
  'SettingsCard', 'SectionTitle', 'UsageGuide', 'PluginAbout', 'CopyBox',
  'ToggleSettingPlus', 'SelectionSettingPlus', 'SliderSettingPlus',
  'Row', 'ValueSetting', 'ParitySettings',
  'ColorRow', 'ColorSwatch',
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
  // settings/Row.qml is used as a plain `Row {`, which Qt Quick's own layout
  // container also spells. They are told apart by the first property: a settings
  // row always opens with `label:`, a layout container with spacing/anchors or
  // nested children. So this checks the ones that already look like settings
  // rows (they must stay labelled) plus every other row type unconditionally.
  const ROW_TYPES = 'ValueSetting|ColorRow|SelectionSettingPlus|ToggleSettingPlus|SliderSettingPlus';

  for (const page of pages) {
    const source = fs.readFileSync(path.join(ROOT, page), 'utf8');

    for (const [, name, body] of source.matchAll(
      new RegExp(`^\\s*(${ROW_TYPES})\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, 'gm'))) {
      assert.match(body, /\blabel:/, `a ${name} in ${page} has no label`);
    }

    // Plain `Row {` must be either a labelled settings row or a layout
    // container; a bare row with neither a label nor any child is a mistake.
    for (const [, body] of source.matchAll(/^\s*Row\s*\{([\s\S]*?)\n\s*\}/gm)) {
      const isSettingsRow = /^\s*label\s*:/.test(body);
      const isLayout = /^\s*(spacing|[a-z]+\.[a-z]+)\s*:/.test(body) || /[A-Z]\w*\s*\{/.test(body);
      assert.ok(isSettingsRow || isLayout,
        `a Row in ${page} is neither a labelled settings row nor a layout container`);
    }
  }
});
