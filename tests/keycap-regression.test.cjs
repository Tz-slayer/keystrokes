const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {loadCore, qtRgbaStub} = require('./helpers/load.cjs');

// Run the production inline component in Qt Quick, without requiring a live
// Wayland compositor or the DMS shell. StyledText supplies only font defaults.
test('keycap geometry and alignment match Keyviz', () => {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'ui', 'KeyvizOverlay.qml'), 'utf8');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'screenkey-qt-'));
  try {
    // Mirror the runtime layout (ui/ + core/ + fonts/) instead of flattening:
    // the components resolve each other through those relative imports.
    fs.cpSync(path.join(root, 'ui'), path.join(temp, 'ui'), {recursive: true});
    fs.cpSync(path.join(root, 'core'), path.join(temp, 'core'), {recursive: true});
    fs.cpSync(path.join(root, "fonts"), path.join(temp, "fonts"), {recursive: true});
    // StyledText is a DMS widget; the harness supplies font defaults only, and
    // every directory that uses it needs its own copy.
    const shim = 'import QtQuick\nText { font.family: "sans-serif"; font.weight: Font.Normal }\n';
    for (const dir of [temp, path.join(temp, 'ui')]) fs.writeFileSync(path.join(dir, 'StyledText.qml'), shim);
    fs.writeFileSync(path.join(temp, 'tst_keycap.qml'), `
import QtQuick
import QtTest
import "ui"
import "./core/groupFrame.js" as GroupFrame

Item {
    id: overlayWindow
    width: 800; height: 300
    property var config: ({modifierHighlight: false, showEventHistory: false})
    property bool groupBackground: false
    property color groupBackgroundColor: "#99ffffff"
    function isKeyHeld(label) { return false; }
    property real capFontSize: 32
    property real unifiedHeight: 38.4
    property var styleParams: ({type: "pbt", baseColor: "#ffffff", secondaryColor: "#1a1a1a", textColor: "#000000", borderColor: "#1a1a1a", cornerRadius: 0.5, borderWidth: 2, gradient: false})
    property string textVariant: "text-short"
    property string textCaps: "capitalize"
    property string textAlignment: "center"
    property string iconAlignment: "flex-end"
    property bool showIcon: true
    property bool showSymbol: true
    property bool showPressCount: true
    property string animType: "none"
    property int animDuration: 250
    property int animEasing: Easing.OutQuint
    property color resolvedBgColor: "white"

    Keycap { id: cap; settings: overlayWindow; label: "Ctrl" }
    Component { id: capFactory; Keycap {} }
    KeyvizGroup { id: group; y: 120; settings: overlayWindow; visible: false }
    TestCase {
        name: "KeyvizGeometry"
        when: windowShown
        function init() {
            overlayWindow.styleParams = {type: "pbt", baseColor: "#ffffff", secondaryColor: "#1a1a1a", textColor: "#000000", borderColor: "#1a1a1a", cornerRadius: 0.5, borderWidth: 2, gradient: false};
            overlayWindow.textVariant = "text-short";
            overlayWindow.showIcon = true;
            cap.label = "Ctrl";
            cap.pressed = false;
            overlayWindow.config = {modifierHighlight: false, showEventHistory: false};
            overlayWindow.textAlignment = "center";
            overlayWindow.capFontSize = 32;
        }
        function test_verticalPadding() {
            compare(cap.padBlock, 12.8, "face has 0.4em vertical padding");
        }
        function test_modifierAlignment() {
            compare(cap.iconH, "right", "flex-end aligns modifier content right");
            overlayWindow.iconAlignment = "flex-start";
            compare(cap.iconH, "left");
            overlayWindow.iconAlignment = "flex-end";
        }
        function test_pbtLongLabelFits() {
            overlayWindow.showIcon = false;
            overlayWindow.textVariant = "text";
            cap.label = "Backspace";
            verify(cap.width - cap.faceInset * 2 - cap.padInline * 2 >= cap.contentW - 0.01,
                   "PBT shell includes both face margins and padding at native font size");
        }
        function test_paintedSurface() {
            overlayWindow.styleParams = Object.assign({}, overlayWindow.styleParams, {gradient: true});
            wait(100);
            const rendered = grabImage(cap);
            compare(rendered.width, Math.ceil(cap.width));
            verify(rendered.red(Math.floor(cap.width/2), Math.floor(cap.height-3)) < 100,
                   "PBT shell is painted below the face");
            ${process.env.KEYCAP_CAPTURE ? 'rendered.save(' + JSON.stringify(process.env.KEYCAP_CAPTURE) + ');' : ''}
        }
        function test_minimalHeight() {
            overlayWindow.styleParams = Object.assign({}, overlayWindow.styleParams, {type: "minimal"});
            compare(cap.height, 32 * 1.2);
        }
        function test_modifierPaletteAndPress() {
            overlayWindow.config = {modifierHighlight:true, modifierColor:"#12345680", modifierSecondaryColor:"#000000", modifierTextColor:"#ffffff", modifierBorderColor:"#ff0000", showEventHistory:false};
            verify(Math.abs(cap.faceColor.a - 128/255) < 0.01);
            compare(cap.labelColor, Qt.color("#ffffff"));
            cap.pressed = true;
            compare(cap.pressDepth, 32 * 0.15);
            cap.label = "A";
            compare(cap.faceColor, Qt.color("#ffffff"), "ordinary keys do not inherit modifier colors");
        }
        function test_carriedHeldKeyStartsPressedWithoutReplay() {
            const carried = capFactory.createObject(overlayWindow, {
                settings: overlayWindow,
                label: "Ctrl",
                pressed: true,
                animateInitialPress: false
            });
            verify(carried !== null);
            const face = findChild(carried, "keyviz-cap-face");
            verify(face !== null);
            compare(face.y, carried.pressDepth,
                    "a held modifier copied into the next shortcut must not sink again");
            carried.destroy();
        }
        function test_groupReconciliationAndPadding() {
            group.visible = true;
            overlayWindow.animDuration = 0;
            group.keys = [{label:"Ctrl",count:1},{label:"A",count:1}];
            wait(30);
            const wide = group.width;
            group.keys = [{label:"Ctrl",count:2}];
            wait(30);
            verify(group.width < wide, "removed keys leave the layout");
            const bare = group.width;
            overlayWindow.groupBackground = true;
            wait(30);
            verify(Math.abs(group.width-bare-32*0.8)<0.01);
            overlayWindow.groupBackground = false;
            group.visible = false;
            overlayWindow.animDuration = 250;
        }
        function test_groupBackgroundEnclosesPressCount() {
            overlayWindow.animType = "none";
            overlayWindow.animDuration = 0;
            overlayWindow.showPressCount = true;
            overlayWindow.groupBackground = true;
            group.visible = true;
            group.keys = [{label:"Ctrl",count:7}];
            wait(30);
            const badge = findChild(group, "keyviz-press-count");
            verify(badge !== null, "the press-count badge is part of the group");
            for (const skin of ["laptop","lowprofile","pbt"]) {
                for (const r of [0, 0.5, 1, 2]) {
                    overlayWindow.styleParams = Object.assign({}, overlayWindow.styleParams, {type:skin, cornerRadius:r});
                    wait(20);
                    const at = badge.mapToItem(group, 0, 0);
                    const box = {x:at.x, y:at.y, width:badge.width, height:badge.height};
                    verify(GroupFrame.encloses(group.width, group.height, group.corner, box),
                           "badge outside the panel: " + skin + " r=" + r + " at " + at.x + "," + at.y
                           + " size " + group.width + "x" + group.height);
                    verify(GroupFrame.encloses(group.width, group.height, group.corner, group.contentRect),
                           "content outside the panel: " + skin + " r=" + r);
                    verify(badge.visible, "the badge is on screen for " + skin);
                }
            }
            group.keys = [];
            group.visible = false;
            overlayWindow.groupBackground = false;
            overlayWindow.styleParams = {type: "pbt", baseColor: "#ffffff", secondaryColor: "#1a1a1a", textColor: "#000000", borderColor: "#1a1a1a", cornerRadius: 0.5, borderWidth: 2, gradient: false};
            overlayWindow.animDuration = 250;
        }
        function test_styleMatrix() {
            const alignments = ["top-left","top-center","top-right","center-left","center","center-right","bottom-left","bottom-center","bottom-right"];
            for (const skin of ["minimal","laptop","lowprofile","pbt"]) {
                overlayWindow.styleParams = Object.assign({}, overlayWindow.styleParams, {type:skin});
                for (const variant of ["icon","text","text-short"]) {
                    overlayWindow.textVariant = variant;
                    for (const alignment of alignments) {
                        overlayWindow.textAlignment = alignment;
                        for (const label of ["Ctrl","A","1","Kp1","Backspace","↑"]) {
                            cap.label = label;
                            verify(cap.width > 0 && isFinite(cap.width), skin+variant+alignment+label);
                            verify(cap.height > 0);
                        }
                    }
                }
            }
        }
        function test_skinHeights() {
            const skins = {laptop: 2.25, lowprofile: 2.5, pbt: 2.75};
            for (const skin in skins) {
                overlayWindow.styleParams = Object.assign({}, overlayWindow.styleParams, {type: skin});
                compare(cap.height, 32 * skins[skin], skin);
            }
        }
    }
}
`);
    const runner = process.env.QML_TEST_RUNNER || (fs.existsSync('/usr/lib/qt6/bin/qmltestrunner') ? '/usr/lib/qt6/bin/qmltestrunner' : 'qmltestrunner');
    const result = spawnSync(runner, ['-input', temp], {
      encoding: 'utf8', timeout: 30000,
      env: { ...process.env, QT_QPA_PLATFORM: 'offscreen', QSG_RHI_BACKEND: 'software' },
    });
    assert.doesNotMatch(result.stdout + result.stderr, /(?:ReferenceError|TypeError|Unable to assign|QWARN)/,
                        "rendering must not produce QML warnings");
    assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

// Neutral colors have a known OKLab result; alpha must survive conversion.
test('Keyviz perceptual lightness preserves alpha and handles black', () => {
  const context = loadCore(['keycapColors.js'], qtRgbaStub);
  const gray = context.shiftLightness({r: 1, g: 1, b: 1, a: 0.5}, -0.1);
  assert.ok(Math.abs(gray.r - 0.869817) < 0.00001);
  assert.ok(Math.abs(gray.r - gray.g) < 0.00001);
  assert.equal(gray.a, 0.5);
  const liftedBlack = context.shiftLightness({r: 0, g: 0, b: 0, a: 1}, 0.2);
  assert.ok(liftedBlack.r > 0.08, 'unlike HSV scaling, lightening black is visible');
});

// keyviz's own group panel colour is #ffffff99: alpha LAST, which Qt would read
// as #AARRGGBB and turn opaque. Both directions have to convert explicitly.
test('CSS hex and components round-trip, alpha last', () => {
  const context = loadCore(['keycapColors.js'], qtRgbaStub);
  const panel = context.cssToRgba('#ffffff99');
  assert.equal(panel.r, 1);
  assert.equal(panel.a, 0x99 / 255);
  assert.equal(context.toCss(panel.r, panel.g, panel.b, panel.a), '#ffffff99');
  // Opaque values stay on the six-digit form keyviz writes.
  const opaque = context.cssToRgba('#1a1a1a');
  assert.equal(opaque.a, 1);
  assert.equal(context.toCss(opaque.r, opaque.g, opaque.b, opaque.a), '#1a1a1a');
  // Shorthand #rgba expands; anything else is not a hex colour.
  // (Compared field by field: the object comes from a vm realm, so
  // deepEqual sees a different prototype.)
  const shorthand = context.cssToRgba('#f00f');
  assert.equal(shorthand.r, 1);
  assert.equal(shorthand.g, 0);
  assert.equal(shorthand.b, 0);
  assert.equal(shorthand.a, 1);
  assert.equal(context.cssToRgba('rebeccapurple'), null);
  assert.equal(context.cssToRgba(undefined), null);
  // cssColor keeps the CSS reading (Qt.color would swap the alpha pair).
  assert.equal(context.cssColor('#ffffff99').a, 0x99 / 255);
  assert.equal(context.cssColor(42), 42, 'non-strings pass through untouched');
});
