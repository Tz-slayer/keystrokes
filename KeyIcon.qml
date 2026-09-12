import QtQuick
import QtQuick.Shapes
import "KeyIcons.js" as KeyIcons

// Renders a Lucide-style stroke icon (24x24 viewBox, stroke width 2,
// round caps/joins, no fill) as vector paths via QtQuick.Shapes.
// Icon path data comes from KeyIcons.js (ported from keyviz).
// Uses fixed path slots: no icon in the library has more than 5 subpaths.
Item {
    id: root

    property string name: ""
    property color color: "#000000"
    property real size: 24

    readonly property var paths: KeyIcons.iconPaths(name)

    width: size
    height: size

    onPathsChanged: rebuild()
    onColorChanged: rebuild()
    Component.onCompleted: rebuild()

    function rebuild() {
        const slots = [p0, p1, p2, p3, p4];
        const svgs = [svg0, svg1, svg2, svg3, svg4];
        for (let i = 0; i < slots.length; i++) {
            slots[i].strokeColor = root.color;
            svgs[i].path = root.paths[i] || "";
        }
    }

    Shape {
        id: shape
        width: 24
        height: 24
        scale: root.size / 24
        transformOrigin: Item.TopLeft
        antialiasing: true
        // High-quality renderer: smooth curved strokes, matching the clean
        // antialiased SVG look of keyviz; the default geometry renderer
        // makes round caps/joins look faceted
        preferredRendererType: Shape.CurveRenderer
        fillMode: Shape.PreserveAspectFit

        ShapePath {
            id: p0
            strokeWidth: 2
            fillColor: "transparent"
            capStyle: ShapePath.RoundCap
            joinStyle: ShapePath.RoundJoin
            PathSvg { id: svg0 }
        }
        ShapePath {
            id: p1
            strokeWidth: 2
            fillColor: "transparent"
            capStyle: ShapePath.RoundCap
            joinStyle: ShapePath.RoundJoin
            PathSvg { id: svg1 }
        }
        ShapePath {
            id: p2
            strokeWidth: 2
            fillColor: "transparent"
            capStyle: ShapePath.RoundCap
            joinStyle: ShapePath.RoundJoin
            PathSvg { id: svg2 }
        }
        ShapePath {
            id: p3
            strokeWidth: 2
            fillColor: "transparent"
            capStyle: ShapePath.RoundCap
            joinStyle: ShapePath.RoundJoin
            PathSvg { id: svg3 }
        }
        ShapePath {
            id: p4
            strokeWidth: 2
            fillColor: "transparent"
            capStyle: ShapePath.RoundCap
            joinStyle: ShapePath.RoundJoin
            PathSvg { id: svg4 }
        }
    }
}
