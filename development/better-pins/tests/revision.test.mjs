import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseInitialPin} from '../src/state.mjs';
import {folderCreationZone,insertionTarget,zoneMenuLabel} from '../src/controls.mjs';
import {readFileSync} from 'node:fs';
test('both areas have independent root and folder creation defaults, without overwriting choices',()=>{
 assert.equal(chooseInitialPin({origin:'new',zone:'upper'}),false);
 assert.equal(chooseInitialPin({origin:'new',zone:'lower',pinLowerRoots:true}),true);
 assert.equal(chooseInitialPin({origin:'new',zone:'lower',folder:true,pinLowerRoots:true}),false);
 assert.equal(chooseInitialPin({origin:'new',zone:'lower',folder:true,pinLowerFolders:true}),true);
 assert.equal(chooseInitialPin({known:false,origin:'new',zone:'lower',pinLowerRoots:true}),false);
});
const tab=zone=>({closest:s=>s.includes(zone==='lower'?'normal':'pinned')?{}:null});
test('folder creation captures originating tab area before native pinning; mixed selection uses trigger',()=>{
 const upper=tab('upper'),lower=tab('lower');
 assert.equal(folderCreationZone([lower],null),'lower');
 assert.equal(folderCreationZone([upper,lower],lower),'lower');
 assert.equal(folderCreationZone([upper,lower],{}),'upper');
});
test('insertion marker and drop share one target, excluding the dragged tree',()=>{
 const a={getBoundingClientRect:()=>({top:20,height:100})};
 const b={getBoundingClientRect:()=>({top:140,height:30})};
 assert.equal(insertionTarget([a,b],a,145),b);
 assert.equal(insertionTarget([a,b],a,180),null);
 assert.equal(zoneMenuLabel('upper'),'Switch to Lower Zone');
 assert.equal(zoneMenuLabel('lower'),'Switch to Upper Zone');
});
test('settings expose independent zone options with conditional upper-button placement',()=>{
 const p=JSON.parse(readFileSync(new URL('../preferences.json',import.meta.url)));
 const get=k=>p.find(v=>v.property==='better-pins.'+k);
 for(const zone of ['upper','lower']) {assert.equal(get('pin-new-'+zone+'-tabs').defaultValue,false);assert.equal(get('new-'+zone+'-position').type,'dropdown');}
 assert.equal(get('upper-button-position').conditions[0].if.property,'better-pins.show-upper-new-tab');
 assert.equal(get('menu-icons').defaultValue,true);
});
