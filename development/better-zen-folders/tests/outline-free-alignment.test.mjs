import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdir, mkdtemp} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const modulePath=process.env.BZF_PLAYWRIGHT_MODULE;
const skip=modulePath ? false : 'set BZF_PLAYWRIGHT_MODULE for isolated SVG layout';
const css=await readFile(new URL('../chrome.css',import.meta.url),'utf8');
const native=await readFile(new URL('../artifacts/native-20260915/zen-folders.css',import.meta.url),'utf8');
const folderSource=await readFile(new URL('../artifacts/native-20260915/ZenFolder.mjs',import.meta.url),'utf8');
const svg=folderSource.slice(folderSource.indexOf('<svg width="28"'),folderSource.indexOf('</svg>')+6);
assert.match(svg,/<image href="" height="11" width="11"/);
// Inspected Zen Icons rules. No write or runtime connection to its profile.
const icons=`
:root[zen-sidebar-expanded] :is(zen-folder,tab-group) > .tab-group-label-container > .tab-group-folder-icon > svg {transform:translate(-1px,0)!important}
:is(zen-folder,tab-group)[zen-icons-enlarge-inner-icon]:not([zen-icons-custom-unavailable]) > .tab-group-label-container > .tab-group-folder-icon svg .icon {opacity:1!important;transform-box:fill-box;transform-origin:center;transform:scale(1.36)!important}
zen-folder[zen-icons-enlarge-inner-icon] svg :is(.front,.back,.dots){opacity:0!important}
`;

for(const direction of ['ltr','rtl']) for(const state of ['open','closed'])
test(`outline-free glyph centres in its native slot (${direction}, ${state}) without moving row contents`,{skip},async()=>{
  const {chromium}=createRequire(import.meta.url)(modulePath);
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:640,height:460}});
    await page.setContent(`<style>
      :root{--tab-min-height:36px;--tab-margin-block:2px;--tab-group-label-padding:8px;--toolbar-color:#151515;--zen-primary-color:#00b4d8;--zen-colors-primary:#eee;color-scheme:light}
      body{margin:20px;font:14px sans-serif}zen-folder{width:300px}.tab-group-label-container{display:flex;position:relative}
      svg{display:block}.tab-group-label{display:block;box-sizing:border-box} tab{display:block;height:40px}
      ${native}${icons}
    </style><zen-folder id="bare" zen-icons-enlarge-inner-icon><div class="tab-group-label-container"><div class="tab-group-folder-icon">${svg}</div><label class="tab-group-label">Outline-free Folder</label></div></zen-folder>
    <zen-folder id="outline"><div class="tab-group-label-container"><div class="tab-group-folder-icon">${svg}</div><label class="tab-group-label">Outlined Folder</label></div></zen-folder>`);
    await page.evaluate(({direction,state})=>{
      document.documentElement.setAttribute('zen-sidebar-expanded','true');document.documentElement.dir=direction;
      for(const svg of document.querySelectorAll('svg')) svg.setAttribute('state',state);
      const icon='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 5H19V19H5Z" fill="none" stroke="black" stroke-width="2"/></svg>');
      for(const image of document.querySelectorAll('svg image')) image.setAttribute('href',icon);
    },{direction,state});
    const measure=()=>page.evaluate(()=>[...document.querySelectorAll('zen-folder')].map(f=>{
      const image=f.querySelector('image').getBoundingClientRect(),slot=f.querySelector('.tab-group-folder-icon').getBoundingClientRect();
      const row=f.querySelector('.tab-group-label-container').getBoundingClientRect(),title=f.querySelector('label').getBoundingClientRect();
      return {dx:image.x+image.width/2-(slot.x+slot.width/2),dy:image.y+image.height/2-(slot.y+slot.height/2),imageWidth:image.width,slot:[slot.x,slot.y,slot.width,slot.height],row:[row.x,row.y,row.width,row.height],title:[title.x,title.y,title.width,title.height],transform:getComputedStyle(f.querySelector('svg')).transform};
    }));
    // Native SVG transitions last 300ms, but a wall-clock sleep is not proof
    // that the compositor has reached its final frame on a busy test machine.
    const settle=()=>page.evaluate(async()=>{
      await new Promise(requestAnimationFrame);
      await Promise.all(document.getAnimations().map(animation=>animation.finished));
      await new Promise(requestAnimationFrame);
    });
    await settle();
    const before=await measure();await page.addStyleTag({content:css});
    await settle();
    const after=await measure();
    assert.ok(Math.abs(after[0].dx)<0.05&&Math.abs(after[0].dy)<0.05,JSON.stringify({before,after}));
    assert.deepEqual(after.map(x=>x.row),before.map(x=>x.row));
    assert.deepEqual(after.map(x=>x.title),before.map(x=>x.title));
    assert.deepEqual(after.map(x=>x.slot),before.map(x=>x.slot),'icon slots and hitbox geometry do not move');
    assert.equal(after[1].transform,before[1].transform,'native outline state transform stays intact');
    assert.ok(Math.abs(after[1].imageWidth/before[1].imageWidth-(state==='open'?1:6/7))<0.01,'closed artwork is modestly reduced; already-shorter open artwork retains native size');
    assert.ok(Math.abs(after[0].imageWidth-before[0].imageWidth)<0.0001,'outline-free glyph keeps its established size within float geometry precision');
    const evidenceRoot=new URL('../artifacts/render-checks/',import.meta.url);
    await mkdir(evidenceRoot,{recursive:true});
    const evidence=await mkdtemp(fileURLToPath(new URL('outline-free-',evidenceRoot)));
    await page.screenshot({path:`${evidence}/${direction}-${state}.png`});
  }finally{await browser.close();}
});
