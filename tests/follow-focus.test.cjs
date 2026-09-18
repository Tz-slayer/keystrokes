const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Regression: switching the Display dropdown away from "Follow focused output"
// and back left the mode permanently off.
//
// The settings widget pushes a choice back as `labelToValue[label] || label`
// (dms/widgets/SelectionSettingPlus.qml). "Follow focused output" used to carry
// the option value "", which is falsy, so re-selecting it persisted its own
// *label*. core/overlayLayout.js then saw a monitorName that was neither an
// automatic sentinel nor an output name, so the overlay pinned itself to the
// first output and stopped following focus.
//
// The two halves of this bug live in different layers -- a QML map lookup in
// the settings widget, a predicate in the overlay -- so they are asserted
// separately: the pure rule in overlay-layout.test.cjs, and the state machine
// below, which drives the real onResolvedScreenNameChanged / commitScreen /
// screenSettle code copied from ui/Overlay.qml.
//
// `followsFocus` and `resolvedScreenName` are *bound* in the harness exactly as
// the overlay binds them, so replacing the hard-coded predicate in the overlay
// with OverlayLayout.followsFocus() is what makes these assertions meaningful.
test('returning to Follow focused output re-adopts the focused output', () => {
  const root = path.resolve(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'screenkey-focus-'));
  try {
    fs.cpSync(path.join(root, 'core'), path.join(temp, 'core'), { recursive: true });
    fs.writeFileSync(path.join(temp, 'tst_follow_focus.qml'), `
import QtQuick
import QtTest
import "./core/overlayLayout.js" as OverlayLayout

Item {
    id: overlayWindow
    width: 100; height: 100

    // ── host inputs, as the daemon supplies them ──
    property var availableScreenNames: ["DP-1", "DP-2", "DP-3"]
    property string focusedOutputName: "DP-2"
    property string monitorName: ""

    // ── the overlay's own bindings, verbatim ──
    readonly property bool followsFocus: OverlayLayout.followsFocus(monitorName)
    readonly property string resolvedScreenName: OverlayLayout.focusedTarget(
        followsFocus, monitorName, focusedOutputName, availableScreenNames)
    property string targetScreenName: ""
    property int commits: 0

    function commitScreen() {
        if (!overlayWindow.resolvedScreenName) return;
        if (overlayWindow.resolvedScreenName === overlayWindow.targetScreenName) return;
        overlayWindow.targetScreenName = overlayWindow.resolvedScreenName;
        overlayWindow.commits++;
    }

    Timer { id: screenSettle; interval: 250; repeat: false; onTriggered: overlayWindow.commitScreen() }

    onResolvedScreenNameChanged: {
        if (!overlayWindow.resolvedScreenName || overlayWindow.resolvedScreenName === overlayWindow.targetScreenName) {
            screenSettle.stop();
            return;
        }
        if (!overlayWindow.targetScreenName || !overlayWindow.followsFocus) {
            screenSettle.stop();
            overlayWindow.commitScreen();
            return;
        }
        screenSettle.restart();
    }

    onFollowsFocusChanged: {
        if (!overlayWindow.followsFocus) {
            screenSettle.stop();
            overlayWindow.commitScreen();
        }
    }

    TestCase {
        name: "FollowFocus"
        when: windowShown

        function init() {
            overlayWindow.monitorName = OverlayLayout.followFocusValue();
            overlayWindow.focusedOutputName = "DP-2";
            overlayWindow.commitScreen();
        }

        function test_roundTripPinAndReturn() {
            wait(300);
            compare(overlayWindow.targetScreenName, "DP-2", "automatic mode starts on the focused output");

            // The user picks a concrete display in the dropdown.
            overlayWindow.monitorName = "DP-1";
            wait(300);
            compare(overlayWindow.targetScreenName, "DP-1", "a pin lands immediately");

            // ...and then picks "Follow focused output" again.
            overlayWindow.monitorName = OverlayLayout.followFocusValue();
            wait(300);
            compare(overlayWindow.targetScreenName, "DP-2",
                    "returning to Follow focused output must re-adopt the focused output");

            // Following keeps working after the round trip.
            overlayWindow.focusedOutputName = "DP-3";
            wait(400);
            compare(overlayWindow.targetScreenName, "DP-3", "focus is still tracked afterwards");
        }

        function test_legacyEmptyStringIsStillAutomatic() {
            // Settings written before the sentinel existed hold "".
            overlayWindow.monitorName = "DP-1";
            wait(300);
            overlayWindow.monitorName = "";
            wait(300);
            compare(overlayWindow.targetScreenName, "DP-2", "the legacy spelling still follows focus");
            compare(overlayWindow.followsFocus, true);
        }

        function test_pinnedOutputIgnoresFocus() {
            overlayWindow.monitorName = OverlayLayout.primaryValue();
            wait(300);
            compare(overlayWindow.targetScreenName, "DP-1", "@primary pins to the first output");
            overlayWindow.focusedOutputName = "DP-3";
            wait(400);
            compare(overlayWindow.targetScreenName, "DP-1", "a pinned output never follows focus");
        }

        function test_unknownFocusHoldsTheCurrentOutput() {
            overlayWindow.monitorName = OverlayLayout.followFocusValue();
            wait(300);
            compare(overlayWindow.targetScreenName, "DP-2");
            // A workspace switch can drop the focused output for a moment.
            overlayWindow.focusedOutputName = "";
            wait(500);
            compare(overlayWindow.targetScreenName, "DP-2", "an unknown focus must not move the overlay");
            overlayWindow.focusedOutputName = "DP-3";
            wait(400);
            compare(overlayWindow.targetScreenName, "DP-3", "and it resumes once the focus is named again");
        }

        function test_settleWindowSuppressesTransientFlips() {
            overlayWindow.monitorName = OverlayLayout.followFocusValue();
            wait(300);
            const before = overlayWindow.commits;
            // Two flips inside the settle interval must collapse to one commit.
            overlayWindow.focusedOutputName = "DP-1";
            wait(60);
            overlayWindow.focusedOutputName = "DP-3";
            wait(400);
            compare(overlayWindow.targetScreenName, "DP-3");
            compare(overlayWindow.commits, before + 1, "a transient flip must not be committed");
        }
    }
}
`);
    const runner = process.env.QML_TEST_RUNNER
      || (fs.existsSync('/usr/lib/qt6/bin/qmltestrunner') ? '/usr/lib/qt6/bin/qmltestrunner' : 'qmltestrunner');
    const result = spawnSync(runner, ['-input', temp], {
      encoding: 'utf8', timeout: 30000,
      env: { ...process.env, QT_QPA_PLATFORM: 'offscreen', QSG_RHI_BACKEND: 'software' },
    });
    assert.doesNotMatch(result.stdout + result.stderr, /(?:ReferenceError|TypeError|Unable to assign|QWARN)/,
                        'the screen state machine must not produce QML warnings');
    assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Totals: \d+ passed, 0 failed/, 'every follow-focus case must pass');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
