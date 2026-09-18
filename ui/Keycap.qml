import QtQuick
import "../core/KeyIcons.js" as KeyIcons
import "../core/groupFrame.js" as GroupFrame
import "../core/keycapColors.js" as KeycapColors
import "../core/keyvizMotion.js" as KeyvizMotion

Item {
    id: keycap
    required property var settings

    component PressAnimation: NumberAnimation {
        duration: 100
        easing.type: Easing.BezierSpline
        easing.bezierCurve: KeyvizMotion.pressCurve()
    }

    FontLoader { id: keycapFont; source: "../fonts/InterVariable.ttf" }

    property string label: ""
    // true while this key is still physically held down (keyviz isPressed)
    property bool pressed: false
    // A modifier carried into a newly-created history group is already down.
    // Snap that new visual instance to its pressed pose, then enable normal
    // transitions so its eventual physical release still animates.
    property bool animateInitialPress: true
    property bool pressAnimationReady: animateInitialPress
    // Consecutive repeat count; 0 (or 1) hides the keyviz press-count badge.
    property int pressCount: 0

    Component.onCompleted: {
        if (!animateInitialPress)
            Qt.callLater(() => pressAnimationReady = true);
    }

    readonly property real fs: keycap.settings.capFontSize
    readonly property var sp: keycap.settings.styleParams
    readonly property string skin: keycap.sp.type ?? "pbt"
    readonly property bool isMinimal: skin === "minimal"
    readonly property bool isLaptop: skin === "laptop"
    readonly property bool isLowProfile: skin === "lowprofile"
    readonly property bool isPbt: skin === "pbt"

    // keyviz resolves these from key_style.ts; the daemon hands us the
    // resolved values, with keyviz's own defaults as the fallback.
    readonly property real radiusF: Math.max(0, keycap.sp.cornerRadius ?? 0.5)
    readonly property real capRadius: keycap.radiusF * keycap.fs * 1.25
    readonly property real padInline: keycap.fs
        * (keycap.radiusF < 0.75 ? 0.5 : (0.5 + keycap.radiusF - 0.75))
    readonly property real padBlock: keycap.fs * 0.4
    readonly property real contentBorder: keycap.isLowProfile ? keycap.borderW : 0
    readonly property real bottomEdge: keycap.isPbt ? keycap.fs * 0.06 : 0
    readonly property real borderW: keycap.sp.borderWidth ?? 0
    readonly property bool highlight: keycap.isModifier && (keycap.settings.config.modifierHighlight ?? false)
    readonly property color faceColor: highlight ? KeycapColors.cssColor(keycap.settings.config.modifierColor) : keycap.sp.baseColor ?? "#ffffff"
    readonly property color wallColor: highlight ? KeycapColors.cssColor(keycap.settings.config.modifierSecondaryColor) : keycap.sp.secondaryColor ?? "#1a1a1a"
    readonly property color labelColor: highlight ? KeycapColors.cssColor(keycap.settings.config.modifierTextColor) : keycap.sp.textColor ?? "#000000"
    readonly property color ringColor: highlight ? KeycapColors.cssColor(keycap.settings.config.modifierBorderColor) : keycap.sp.borderColor ?? "#1a1a1a"
    readonly property bool useGradient: keycap.sp.gradient ?? false

    // Preserve OKLab chroma while shifting lightness, as keyviz's
    // relative oklch() colors do (HSV scaling changes both hue and contrast).
    function darken(c, f) { return KeycapColors.shiftLightness(c, -f); }
    function lighten(c, f) { return KeycapColors.shiftLightness(c, f); }

    // How far the cap face travels down while the key is held.
    // laptop never moves -- its press feedback is the inset highlight.
    readonly property real pressDepth: !pressed
        ? 0
        : (keycap.isPbt ? keycap.fs * 0.15 : (keycap.isLowProfile ? keycap.fs * 0.25 : 0))

    // The host may inject the sink's mute state (see KeyvizDaemon); when it
    // does not, `undefined` keeps the mute keycap on upstream's static
    // crossed-speaker icon instead of guessing "unmuted".
    readonly property var kd: KeyIcons.display(label, settings.systemMuted)
    readonly property bool hasIcon: kd.icon !== undefined
    readonly property bool isModifier: kd.category === "modifier"
    readonly property bool isNumpad: label.indexOf("Kp") === 0

    // ── content layout, following base.tsx ──
    // keyviz picks the variant by (layout.showIcon && display.icon) first,
    // then (layout.showSymbol && display.symbol), then plain text.
    readonly property bool useIcon: keycap.settings.showIcon && keycap.hasIcon
    readonly property bool iconOnly: keycap.useIcon
        && (keycap.settings.textVariant === "icon" || kd.category === "arrow")
    readonly property bool iconLayout: keycap.useIcon && !keycap.iconOnly
    readonly property bool symbolLayout: !keycap.useIcon && keycap.settings.showSymbol
        && kd.symbol !== undefined
    // base.tsx: `variant === "text-short" ? shortLabel ?? label : label`
    readonly property string displayLabel: keycap.settings.textVariant === "text-short"
        ? (kd.shortLabel !== undefined ? kd.shortLabel : kd.label)
        : kd.label
    // keyviz text.caps -> QML font.capitalization
    readonly property int capsMode: keycap.settings.textCaps === "uppercase" ? Font.AllUppercase
        : (keycap.settings.textCaps === "lowercase" ? Font.AllLowercase : Font.Capitalize)

    // keyviz text.alignment / layout.iconAlignment. The strings are
    // "top-left".."bottom-right" plus bare "center"; split them into a
    // horizontal and a vertical edge.
    function hAlignOf(a) {
        if (a === undefined || a === "center") return "center";
        if (a === "flex-start" || a.indexOf("left") !== -1) return "left";
        if (a === "flex-end" || a.indexOf("right") !== -1) return "right";
        return "center";
    }
    function vAlignOf(a) {
        if (a === undefined || a === "center") return "center";
        if (a.indexOf("top") === 0) return "top";
        if (a.indexOf("bottom") === 0) return "bottom";
        return "center";
    }
    readonly property string textH: keycap.hAlignOf(keycap.settings.textAlignment)
    readonly property string textV: keycap.vAlignOf(keycap.settings.textAlignment)
    // base.tsx: modifiers follow layout.iconAlignment, everything else the
    // horizontal half of text.alignment.
    readonly property string iconH: keycap.isModifier
        ? keycap.hAlignOf(keycap.settings.iconAlignment) : keycap.textH

    // ── geometry, straight from keyviz ──
    // Box height: 2.25em (laptop) / 2.5em (lowprofile) / 2.75em (pbt).
    // minimal has no body, so it borrows the shared row height.
    readonly property real bodyH: keycap.isMinimal
        ? keycap.fs * 1.2
        : (keycap.isLaptop ? keycap.fs * 2.25
                           : (keycap.isLowProfile ? keycap.fs * 2.5 : keycap.fs * 2.75))
    // Face height: 2.25em for laptop / lowprofile, 2.2em for pbt (inset in
    // its shell). minimal draws no face at all.
    readonly property real faceH: keycap.isMinimal
        ? keycap.bodyH
        : (keycap.isPbt ? keycap.fs * 2.2 : keycap.fs * 2.25)
    // pbt insets its face by 0.3em on each side (pbt.tsx:41 `marginInline`).
    readonly property real faceInset: keycap.isPbt ? keycap.fs * 0.3 : 0
    // keyviz `minWidth` per skin (lowprofile.tsx:25 / pbt.tsx:25). Modifiers
    // get a wider box (2.5em / 3em against 2.25em / 2.75em).
    readonly property real minW: keycap.isMinimal
        ? 0
        : (keycap.isPbt ? keycap.fs * (keycap.isModifier ? 3 : 2.75)
                        : keycap.fs * (keycap.isModifier ? 2.5 : 2.25))

    // `minWidth` is a MINIMUM in keyviz, not the final width: the label divs
    // are `w-full`, which still contributes their max-content width to the
    // flex item, so a cap grows when its label needs more room. That is why
    // keyviz's "control" / "command" / "shift" caps come out visibly longer
    // than a bare letter. Measured on keyviz's own screenshot: a "control"
    // cap is ~3.2em wide against a 2.5em minWidth.
    readonly property real contentW: {
        if (keycap.iconOnly) return keycap.fs * 0.8;
        if (keycap.iconLayout) return Math.max(keycap.fs * 0.5, measureSmall.implicitWidth);
        if (keycap.symbolLayout) return Math.max(measureSymbol.implicitWidth,
                                                 measureSub.implicitWidth);
        if (keycap.isNumpad) return Math.max(measureHalf.implicitWidth,
                                             measureSymbolHalf.implicitWidth);
        return measurePlain.implicitWidth;
    }
    readonly property real capW: keycap.isMinimal
        ? 0
        : Math.max(keycap.minW, keycap.faceInset * 2
            + Math.max(keycap.isPbt ? keycap.fs * 2 : 0,
                keycap.contentW + keycap.padInline * 2 + keycap.contentBorder * 2))

    width: keycap.isMinimal ? minimalContent.implicitWidth : keycap.capW
    height: keycap.bodyH

    // Hidden measurers for the content width: keyviz measures with the same
    // font as the drawn labels. They sit outside any Row/Column, so they never
    // take part in layout.
    component Measurer: Text {
        visible: false
        wrapMode: Text.NoWrap
        font.family: keycapFont.name
        font.weight: Font.Normal
        font.capitalization: keycap.capsMode
        font.pixelSize: keycap.fs
        text: keycap.displayLabel
    }
    Measurer { id: measureSmall; font.pixelSize: keycap.fs * 0.5 }
    Measurer { id: measurePlain }
    Measurer { id: measureSymbol; font.pixelSize: keycap.fs * 0.56; text: keycap.kd.symbol || "" }
    Measurer { id: measureSub; font.pixelSize: keycap.fs * 0.56; font.weight: Font.DemiBold }
    Measurer { id: measureHalf; font.pixelSize: keycap.fs * 0.5 }
    Measurer { id: measureSymbolHalf; font.pixelSize: keycap.fs * 0.5; text: keycap.kd.symbol || "" }

    // minimal has no cap body to sink, so keyviz scales the whole keycap
    scale: (keycap.isMinimal && pressed) ? 0.95 : 1
    Behavior on scale {
        enabled: keycap.pressAnimationReady
        PressAnimation {}
    }

    // ── lowprofile base wall: the socket the cap face sinks into ──
    // keyviz: `position: absolute; height: 2.25em; width: 100%; bottom: 0`
    // inside a 2.5em box, so 0.25em of wall stays visible under the face.
    Rectangle {
        id: lpWall
        visible: keycap.isLowProfile
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: keycap.faceH
        radius: keycap.capRadius
        color: keycap.wallColor
        border.width: keycap.borderW
        border.color: keycap.ringColor
    }

    // PBT shell and its outside spread ring. Canvas supports the CSS
    // diagonal gradient, which Rectangle.Gradient cannot express.
    KeycapSurface {
        visible: keycap.isPbt
        anchors.fill: parent
        radius: keycap.capRadius
        baseColor: keycap.wallColor
        endColor: keycap.darken(keycap.wallColor, 0.2)
        gradientEnabled: keycap.useGradient
        diagonal: true
        ringWidth: keycap.borderW
        ringColor: keycap.ringColor
    }

    // ── the cap face: moves on press for lowprofile / pbt, static for laptop ──
    Item {
        id: capFace
        objectName: "keyviz-cap-face"
        visible: !keycap.isMinimal
        x: keycap.faceInset
        y: keycap.pressDepth
        width: parent.width - keycap.faceInset * 2
        height: keycap.faceH
        Behavior on y {
            enabled: keycap.pressAnimationReady
            PressAnimation {}
        }

        KeycapSurface {
            anchors.fill: parent
            radius: keycap.capRadius
            baseColor: keycap.isPbt ? keycap.darken(keycap.faceColor, 0.1)
                : (keycap.isLaptop ? keycap.lighten(keycap.faceColor, 0.1) : keycap.faceColor)
            endColor: keycap.faceColor
            gradientEnabled: keycap.useGradient && !keycap.isLowProfile
            horizontal: keycap.isPbt
            solidColor: keycap.faceColor
            ringWidth: keycap.isLowProfile || (keycap.isPbt && keycap.useGradient) ? 0 : keycap.borderW
            ringColor: keycap.ringColor
            innerBorderWidth: keycap.contentBorder
            bottomBorderWidth: keycap.bottomEdge
            bottomBorderColor: keycap.faceColor
            dropShadow: keycap.isLaptop
            shadowSize: keycap.fs * 0.1
            insetHighlight: keycap.isLaptop
            highlightColor: keycap.pressed ? keycap.darken(keycap.faceColor, 0.2)
                : keycap.lighten(keycap.faceColor, 0.2)
            highlightDepth: keycap.fs * (keycap.pressed ? 0.2 : 0.1)
        }

        // keyviz puts the padding on the face and the content div inside is
        // `w-full h-full`, so the icon/label layout below is measured against
        // this inset box rather than the face itself.
        Item {
            id: contentBox
            anchors.fill: parent
            anchors.leftMargin: keycap.padInline + keycap.contentBorder
            anchors.rightMargin: keycap.padInline + keycap.contentBorder
            anchors.topMargin: keycap.padBlock + keycap.contentBorder
            anchors.bottomMargin: keycap.padBlock + keycap.contentBorder + keycap.bottomEdge

            // ── icon variant: arrows (or textVariant "icon") show the icon alone ──
            KeyIcon {
                visible: keycap.iconOnly
                name: keycap.kd.icon || ""
                color: keycap.labelColor
                size: keycap.fs * 0.8
                x: keycap.textH === "left" ? 0
                   : (keycap.textH === "right" ? parent.width - width : (parent.width - width) / 2)
                y: keycap.textV === "top" ? 0
                   : (keycap.textV === "bottom" ? parent.height - height : (parent.height - height) / 2)
            }

            // ── icon variant: icon pinned to the top, label to the bottom ──
            // base.tsx lays this out with `justify-between` in a column, so
            // only the horizontal edge varies -- and modifiers take that edge
            // from layout.iconAlignment instead of text.alignment.
            KeyIcon {
                visible: keycap.iconLayout
                name: keycap.kd.icon || ""
                color: keycap.labelColor
                size: keycap.fs * 0.5
                y: 0
                x: keycap.iconH === "left" ? 0
                   : (keycap.iconH === "right" ? parent.width - width : (parent.width - width) / 2)
            }

            // ── icon variant: label at the bottom ──
            Text {
                font.family: keycapFont.name
                font.weight: Font.Normal
                id: capLabel
                height: keycap.fs * 0.5 * 1.2
                verticalAlignment: Text.AlignVCenter
                visible: keycap.iconLayout
                x: 0
                y: parent.height - height
                width: parent.width
                fontSizeMode: Text.HorizontalFit
                minimumPixelSize: Math.round(keycap.fs * 0.26)
                elide: Text.ElideRight
                horizontalAlignment: keycap.iconH === "left" ? Text.AlignLeft
                    : (keycap.iconH === "right" ? Text.AlignRight : Text.AlignHCenter)
                wrapMode: Text.NoWrap
                font.pixelSize: keycap.fs * 0.5
                font.capitalization: keycap.capsMode
                color: keycap.labelColor
                text: keycap.displayLabel
            }

            // ── symbol variant: secondary symbol stacked over the label ──
            // base.tsx swaps the flex axes here: alignItems carries the
            // horizontal edge, justifyContent the vertical one.
            Column {
                id: symbolStack
                visible: keycap.symbolLayout
                x: 0
                y: keycap.textV === "top" ? 0
                   : (keycap.textV === "bottom" ? parent.height - height
                                                : (parent.height - height) / 2)
                width: parent.width
                spacing: 0

                Text {
                font.family: keycapFont.name
                font.weight: Font.Normal
                    id: capSymbol
                    height: keycap.fs * 0.56 * 1.4
                    verticalAlignment: Text.AlignVCenter
                    width: parent.width
                    fontSizeMode: Text.HorizontalFit
                    minimumPixelSize: Math.round(keycap.fs * 0.26)
                    elide: Text.ElideRight
                    horizontalAlignment: keycap.textH === "left" ? Text.AlignLeft
                        : (keycap.textH === "right" ? Text.AlignRight : Text.AlignHCenter)
                    wrapMode: Text.NoWrap
                font.pixelSize: keycap.fs * 0.56
                    font.capitalization: keycap.capsMode
                    color: keycap.labelColor
                    text: keycap.kd.symbol || ""
                }
                Text {
                font.family: keycapFont.name
                    id: capSub
                    height: keycap.fs * 0.56 * 1.4
                    verticalAlignment: Text.AlignVCenter
                    width: parent.width
                    fontSizeMode: Text.HorizontalFit
                    minimumPixelSize: Math.round(keycap.fs * 0.26)
                    elide: Text.ElideRight
                    horizontalAlignment: keycap.textH === "left" ? Text.AlignLeft
                        : (keycap.textH === "right" ? Text.AlignRight : Text.AlignHCenter)
                    wrapMode: Text.NoWrap
                font.pixelSize: keycap.fs * 0.56
                    font.weight: Font.DemiBold
                    font.capitalization: keycap.capsMode
                    color: keycap.labelColor
                    text: keycap.displayLabel
                }
            }

            // ── numpad variant: label on top, symbol below, both half size ──
            // base.tsx reaches this only when the key has neither an icon nor
            // a (shown) symbol, which in practice means numpad keys with
            // symbols hidden.
            Column {
                id: numpadStack
                visible: !keycap.useIcon && !keycap.symbolLayout && keycap.isNumpad
                x: 0
                y: keycap.textH === "left" ? 0
                   : (keycap.textH === "right" ? parent.height - height
                                                : (parent.height - height) / 2)
                width: parent.width

                Text {
                font.family: keycapFont.name
                font.weight: Font.Normal
                    height: keycap.fs * 0.5 * 1.2
                    verticalAlignment: Text.AlignVCenter
                    width: parent.width
                    fontSizeMode: Text.HorizontalFit
                    minimumPixelSize: Math.round(keycap.fs * 0.26)
                    elide: Text.ElideRight
                    horizontalAlignment: keycap.textV === "top" ? Text.AlignLeft
                        : (keycap.textV === "bottom" ? Text.AlignRight : Text.AlignHCenter)
                    wrapMode: Text.NoWrap
                font.pixelSize: keycap.fs * 0.5
                    font.capitalization: keycap.capsMode
                    color: keycap.labelColor
                    text: keycap.displayLabel
                }
                Text {
                font.family: keycapFont.name
                font.weight: Font.Normal
                    visible: keycap.kd.symbol !== undefined
                    height: keycap.fs * 0.5 * 1.2
                    verticalAlignment: Text.AlignVCenter
                    width: parent.width
                    fontSizeMode: Text.HorizontalFit
                    minimumPixelSize: Math.round(keycap.fs * 0.26)
                    elide: Text.ElideRight
                    horizontalAlignment: keycap.textV === "top" ? Text.AlignLeft
                        : (keycap.textV === "bottom" ? Text.AlignRight : Text.AlignHCenter)
                    wrapMode: Text.NoWrap
                font.pixelSize: keycap.fs * 0.5
                    color: keycap.labelColor
                    text: keycap.kd.symbol || ""
                }
            }

            // ── text variant: plain label, placed by text.alignment ──
            Text {
                font.family: keycapFont.name
                font.weight: Font.Normal
                id: capPlain
                height: keycap.fs * 1.2
                verticalAlignment: Text.AlignVCenter
                visible: !keycap.useIcon && !keycap.symbolLayout && !keycap.isNumpad
                x: 0
                y: keycap.textV === "top" ? 0
                   : (keycap.textV === "bottom" ? parent.height - height
                                                : (parent.height - height) / 2)
                // The cap expands to the natural label width.
                width: parent.width
                fontSizeMode: Text.HorizontalFit
                minimumPixelSize: Math.round(keycap.fs * 0.3)
                elide: Text.ElideRight
                horizontalAlignment: keycap.textH === "left" ? Text.AlignLeft
                    : (keycap.textH === "right" ? Text.AlignRight : Text.AlignHCenter)
                wrapMode: Text.NoWrap
                font.pixelSize: keycap.fs
                font.capitalization: keycap.capsMode
                color: keycap.labelColor
                text: keycap.displayLabel
            }
        }
    }

    // ── minimal content (minimal.tsx has its own layout, not base.tsx) ──
    // No body, and for modifiers the icon sits INLINE with the label at full
    // font size, separated by 0.1em, instead of being stacked. The keycap's
    // width is this row's natural width -- keyviz gives minimal no minWidth.
    Item {
        id: minimalContent
        visible: keycap.isMinimal
        anchors.centerIn: parent
        implicitWidth: minimalRow.implicitWidth
        implicitHeight: minimalRow.implicitHeight
        width: implicitWidth
        height: implicitHeight

        Row {
            id: minimalRow
            spacing: keycap.fs * 0.1

            // minimal.tsx only ever draws an icon for modifiers, and it sits
            // INLINE with the label at full font size rather than stacked.
            readonly property bool showMinimalIcon: keycap.isModifier
                && keycap.settings.showIcon && keycap.hasIcon
            readonly property bool minimalIconOnly: minimalRow.showMinimalIcon
                && (keycap.settings.textVariant === "icon" || keycap.kd.category === "arrow")

            KeyIcon {
                visible: minimalRow.showMinimalIcon
                name: keycap.kd.icon || ""
                color: keycap.labelColor
                size: keycap.fs
                anchors.verticalCenter: parent.verticalCenter
            }

            Text {
                font.family: keycapFont.name
                font.weight: Font.Normal
                // an arrow key renders as the icon alone, never as text
                visible: !minimalRow.minimalIconOnly
                anchors.verticalCenter: parent.verticalCenter
                wrapMode: Text.NoWrap
                font.pixelSize: keycap.fs
                font.capitalization: keycap.capsMode
                color: keycap.labelColor
                // minimal.tsx: `variant === "text" ? label : shortLabel ?? label`
                text: minimalRow.showMinimalIcon && keycap.settings.textVariant === "text"
                    ? keycap.kd.label : (keycap.kd.shortLabel ?? keycap.kd.label)
            }
        }
    }

    // ── keyviz press-count badge (press-count.tsx) ──
    // An inverted badge pinned to the top-right corner of the keycap and
    // translated a quarter of its own size outwards. keyviz shows it only
    // on the last key of the newest group, and only once that key has been
    // pressed more than once in a row.
    // The size and the outset come from groupFrame.js, which is also what
    // reserves room for them in the group's background panel: a badge drawn
    // further out than the panel reserved for would be left outside it.
    Rectangle {
        id: pressBadge
        objectName: "keyviz-press-count"

        readonly property real d: GroupFrame.badgeDiameter(keycap.fs)
        readonly property real outset: GroupFrame.badgeOutset(keycap.fs)
        readonly property bool active: !keycap.isMinimal && keycap.pressCount > 1 && keycap.settings.showPressCount

        width: d
        height: d
        radius: d * Math.min(0.5, keycap.radiusF)
        // Inverted: painted with the key's text colour, number in the cap colour.
        color: keycap.sp.textColor
        z: 10                             // keyviz: "z-10"
        visible: active
        scale: active ? 1 : 0.01
        anchors.top: parent.top
        anchors.right: parent.right
        anchors.topMargin: -outset
        anchors.rightMargin: -outset

        Behavior on scale {
            enabled: keycap.settings.animType !== "none"
            NumberAnimation {
                duration: keycap.settings.animDuration / 2
                easing.type: keycap.settings.animEasing
            }
        }

        Text {
                font.family: keycapFont.name
            anchors.centerIn: parent
            wrapMode: Text.NoWrap
                font.pixelSize: keycap.fs * 0.4
            font.weight: Font.Bold
            // minimal has no cap body, so fall back to the card background.
            color: keycap.sp.baseColor
            text: String(keycap.pressCount)
        }
    }
}
