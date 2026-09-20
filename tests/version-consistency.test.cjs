const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(ROOT, name), 'utf8');
const plugin = JSON.parse(read('plugin.json'));
const pkg = JSON.parse(read('package.json'));
const changelog = read('CHANGELOG.md');

// A release is three files that have to agree: the manifest DMS reads, the npm
// metadata, and the changelog entry a user reads. Nothing else compares them,
// so a bump that touches only one of the three stays invisible until someone
// installs the plugin and sees a number the release notes never mentioned.
test('the manifest, npm metadata and changelog agree on the version', () => {
    assert.equal(pkg.version, plugin.version);
    assert.ok(
        changelog.includes('## [' + plugin.version + ']'),
        'CHANGELOG.md has no "## [' + plugin.version + ']" section',
    );
});

// The registry rejects an id that is not a lowercase-led alphanumeric token
// (CONTRIBUTING.md: "Must start with a lowercase letter", "Can only contain
// letters and digits") and requires it to match this manifest exactly. Catching
// it here beats catching it in a submission review.
test('the plugin id is a registry-legal token', () => {
    assert.match(plugin.id, /^[a-z][a-zA-Z0-9]*$/);
});

// The registry entry is not required to carry a DMS version floor, so this
// manifest is the only place an installer can refuse on. A plugin that reads
// input through DMS APIs older shells do not have needs it to be present.
test('the manifest declares the DMS version it needs', () => {
    assert.match(plugin.requires_dms, /^>=\d+\.\d+\.\d+$/);
});
