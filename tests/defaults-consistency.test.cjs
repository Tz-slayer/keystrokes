const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const style = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','keyvizStyle.js'),'utf8'),style,{filename:path.resolve(__dirname,'../keyvizStyle.js')});
const plain = value => JSON.parse(JSON.stringify(value));

test('Keyviz defaults and native JSON roundtrip preserve every nonmouse field', () => {
    const defaults = style.settings({});
    assert.equal(defaults.keycapStyle,'lowprofile');
    assert.equal(defaults.fontSize,32);
    assert.equal(defaults.fadeTimeout,5000);
    const json = style.exportStyle(defaults);
    assert.equal(json.appearance.animationDuration,0.25);
    assert.equal(json.appearance.alignment,'bottom-center');
    const imported = style.importStyle(json);
    for (const [key,value] of Object.entries(imported)) if (key !== "keyvizMouseStyle") assert.equal(value,defaults[key],key);
});
test('imports reject incomplete or invalid styles before returning settings', () => {
    for (const value of [null,[],{}, {text:{size:32}}]) assert.throws(()=>style.importStyle(value));
    for (const [section,key,value] of [['text','size',-3],['color','color','bad'],['layout','showIcon','true'],['appearance','style','bad'],['text','caps','none'],['border','radius',NaN]]) {
        const json=plain(style.exportStyle({})); json[section][key]=value;
        assert.throws(()=>style.importStyle(json),`${section}.${key}`);
    }
});
test('saved legacy settings migrate while explicit new settings take precedence', () => {
    const s=style.settings({marginSize:24,showNormalKeys:true,historyLimit:3});
    assert.equal(s.marginX,24);assert.equal(s.eventFilter,'none');assert.equal(s.maxHistory,3);assert.equal(s.showEventHistory,true);
    assert.equal(style.settings({marginSize:24,marginX:100}).marginX,100);
    assert.equal(style.exportStyle({keycapStyle:'mechanical'}).appearance.style,'pbt');
    assert.equal(style.exportStyle({keycapStyle:'elevated'}).appearance.style,'lowprofile');
    assert.equal(style.settings({fontSize:NaN,capColor:'invalid'}).fontSize,32);
});
test('custom style values, alpha colors and fractional border widths roundtrip', () => {
    const source={fontSize:48,borderWidth:1.5,modifierHighlight:true,modifierColor:'#12345678',position:'center_right',animationDuration:1200,monitorName:'DP-1'};
    const imported=style.importStyle(style.exportStyle(source));
    for(const [key,value] of Object.entries(source)) assert.equal(imported[key],value,key);
    assert.equal(style.exportStyle({}).mouse.size,150);
    assert.deepEqual(plain(style.exportStyle({keyvizMouseStyle:{size:99}}).mouse),{size:99});
});
test('palette/randomization applies upstream normal and modifier color branches', () => {
    assert.equal(style.palette(0).capColor,'#f8f8f8');assert.throws(()=>style.palette(999));
    const values=style.randomStyle({modifierHighlight:true},()=>0.5);
    assert.ok(values.modifierColor);assert.equal(values.borderRadius,0.5);
    assert.ok(style.randomStyle({},()=>0.2).groupBackgroundCustom);
    assert.equal(style.randomStyle({groupBackground:false},()=>0.2).groupBackgroundCustom,undefined);
});
