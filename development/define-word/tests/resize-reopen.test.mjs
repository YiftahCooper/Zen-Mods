import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createPopupResizer} from '../src/resize.mjs';

test('hidden Gecko content does not accumulate retained outer bounds on repeated openings',()=>{
  const dom=new JSDOM('<div id="panel"><div id="shell"></div><button></button></div>'),w=dom.window;
  const panel=w.document.querySelector('#panel'),shell=w.document.querySelector('#shell'),handle=w.document.querySelector('button');
  let open=false,retained={width:642,height:402},forced=null;
  Object.defineProperties(w,{innerWidth:{value:1400},innerHeight:{value:1000}});
  // Gecko panel.js hides its content slot between openings. The native widget
  // retains the previous outer dimensions while child layout measures zero.
  shell.getBoundingClientRect=()=>({left:40,top:40,width:open?parseFloat(shell.style.width)||480:0,height:open?parseFloat(shell.style.height)||300:0});
  panel.getBoundingClientRect=()=>open?forced||{width:parseFloat(shell.style.width)+2,height:parseFloat(shell.style.height)+2}:retained;
  panel.sizeTo=(width,height)=>{forced={width,height};};
  const r=createPopupResizer(w,{panel,shell,handle,isOpen:()=>open,readSize:()=>({width:640,height:400})});
  try{for(let i=0;i<20;i++){
    r.prepare();open=true;panel.dispatchEvent(new w.Event('popupshown'));
    const outer=panel.getBoundingClientRect();
    assert.deepEqual(outer,{width:642,height:402},`opening ${i+1} must fit content, without accumulating chrome`);
    retained=outer;open=false;
  }}finally{r.destroy();dom.window.close();}
});
