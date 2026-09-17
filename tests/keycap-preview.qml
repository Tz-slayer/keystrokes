import QtQuick
import QtTest
import ".."
import "../ui"

Rectangle {
    id: preview
    width: 960; height: 580
    color: "#dce1e8"
    Column {
        x: 32; y: 24; spacing: 28
        Text { text: "Keyviz · QML rendering"; font.pixelSize: 24; color: "#20242c" }
        Repeater {
            model: ["minimal", "laptop", "lowprofile", "pbt"]
            delegate: Row {
                id: options
                required property string modelData
                spacing: 24
                property var config: ({modifierHighlight:true, modifierColor:"#3a86ff", modifierSecondaryColor:"#183d83", modifierTextColor:"#ffffff", modifierBorderColor:"#183d83",showEventHistory:false})
                property real capFontSize: 32
                property string animType: "none"
                property int animDuration: 0
                property int animEasing: Easing.OutQuint
                property string textVariant: "text-short"
                property string textCaps: "capitalize"
                property string textAlignment: "center"
                property string iconAlignment: "flex-end"
                property bool showIcon: true
                property bool showSymbol: true
                property bool showPressCount: true
                property bool groupBackground: true
                property color groupBackgroundColor: "#99ffffff"
                property var styleParams: ({type:modelData,baseColor:"#ffffff",secondaryColor:"#1a1a1a",textColor:"#000000",borderColor:"#1a1a1a",cornerRadius:0.5,borderWidth:2,gradient:true})
                function isKeyHeld(label) { return label === "Shift"; }
                Text { width: 120; anchors.verticalCenter: parent.verticalCenter; text: options.modelData; font.pixelSize: 19; color:"#20242c" }
                KeyvizGroup {
                    settings: options
                    latest: true
                    keys: [{label:"Ctrl",count:1},{label:"Shift",count:1},{label:"A",count:1},{label:"1",count:1},{label:"↑",count:1},{label:"Backspace",count:3}]
                }
            }
        }
    }
    TestCase {
        name: "VisualPreview"
        when: windowShown
        function test_capture() {
            wait(350);
            const frame = grabImage(preview);
            verify(frame.red(210,220) < 150, "laptop modifier must be painted on software and hardware renderers");
            frame.save("/tmp/keyviz-parity-preview.png");
        }
    }
}
