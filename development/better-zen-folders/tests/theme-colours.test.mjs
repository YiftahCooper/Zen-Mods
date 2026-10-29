import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const modulePath=process.env.BZF_PLAYWRIGHT_MODULE;
const skip=modulePath?false:'set BZF_PLAYWRIGHT_MODULE for isolated theme regressions';
const css=await readFile(new URL('../chrome.css',import.meta.url),'utf8');

test('owned external-icon paint follows live foreground colours without recolouring chosen SVG artwork',{skip},async()=>{
 const browser=await createRequire(import.meta.url)(modulePath).chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  await page.setContent(`<div id="surface">
   <div class="better-zen-folders-new-tab-button"><img class="toolbarbutton-icon"></div>
   <span class="better-zen-folders-space-icon"><img></span>
   <button class="better-zen-folders-preview-folder" style="color:inherit"><span class="menu-iconic-left"><img></span></button>
   <div class="better-zen-folders-drop-row"><span class="menu-iconic-left"><img></span></div>
   <div data-better-zen-folders-command-icon-mode="compatibility"></div>
   <svg id="chosen"><path fill="#ff5a20" stroke="#101010" d="M0 0h10v10H0z"/></svg>
  </div>`);
  await page.addStyleTag({content:css});
  const result=await page.evaluate(()=>{
   const surface=document.querySelector('#surface'),targets=[...surface.querySelectorAll('img,[data-better-zen-folders-command-icon-mode]')];
   return ['rgb(238, 238, 238)','rgb(32, 32, 32)','rgb(238, 238, 238)'].map(color=>{
    surface.style.color=color;
    return {color,paint:targets.map(e=>({fill:getComputedStyle(e).fill,stroke:getComputedStyle(e).stroke})),chosen:{fill:getComputedStyle(document.querySelector('#chosen path')).fill,stroke:getComputedStyle(document.querySelector('#chosen path')).stroke}};
   });
  });
  for(const state of result){
   assert.ok(state.paint.every(p=>p.fill===state.color&&p.stroke===state.color),JSON.stringify(state));
   assert.deepEqual(state.chosen,{fill:'rgb(255, 90, 32)',stroke:'rgb(16, 16, 16)'});
  }
 }finally{await browser.close();}
});

test('floating drag chooser uses its panel foreground rather than the sidebar foreground',{skip},async()=>{
 const browser=await createRequire(import.meta.url)(modulePath).chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  await page.setContent('<div class="zen-workspace-pinned-tabs-section" style="color:white"><div class="better-zen-folders-drop-footer" data-bzf-drop-floating><div class="better-zen-folders-drop-row">Destination</div></div></div>');
  await page.addStyleTag({content:css});
  const result=await page.evaluate(()=>{
   const panel=document.querySelector('.better-zen-folders-drop-footer');
   return [{fg:'rgb(32, 32, 32)',bg:'rgb(249, 249, 251)'},{fg:'rgb(238, 238, 238)',bg:'rgb(41, 41, 46)'}].map(({fg,bg})=>{
    panel.style.setProperty('--arrowpanel-color',fg);panel.style.setProperty('--arrowpanel-background',bg);
    return {fg,bg,actual:getComputedStyle(panel.firstElementChild).color,background:getComputedStyle(panel).backgroundColor};
   });
  });
  for(const state of result){assert.equal(state.actual,state.fg);assert.equal(state.background,state.bg);}
 }finally{await browser.close();}
});
