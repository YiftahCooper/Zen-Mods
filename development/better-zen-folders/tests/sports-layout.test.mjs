import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const skip=process.env.BZF_PLAYWRIGHT_MODULE?false:'Set BZF_PLAYWRIGHT_MODULE for isolated Chromium layout characterization; never launches Zen';
// The routine suite reads current production CSS only, never profiles or artifacts.
const productionCss=await readFile(new URL('../chrome.css',import.meta.url),'utf8');

// Historical 0.3.0 workaround, retained only as diagnostic evidence. The user
// deferred fixing the external scrolling mods; 0.3.1 must not ship this override.
// These characterization checks do NOT prove current production fixes Sports.
const historicalSafeguardCss=`
@media (-moz-pref("zen.tabs.vertical")) {
  #tabbrowser-arrowscrollbox > zen-workspace[active="true"] >
  arrowscrollbox.workspace-arrowscrollbox[overflowing] >
  .zen-workspace-normal-tabs-section { flex: 1 0 auto !important; }
}
`;

/* Minimal native excerpts: Zen 1.22.2b / Gecko 156, build 20260915091052,
 * SourceStamp e74571eead515d37edd0914739f744bcb5258c51.
 * browser/omni.ja!chrome/browser/content/browser/zen-styles/zen-workspaces.css
 *   404-408,425-440: bounded workspace/host and 120px overflowing end padding.
 * browser/omni.ja!chrome/browser/content/browser/zen-styles/zen-tabs/vertical-tabs.css
 *   82-84,476-485: outer container sizing.
 * browser/omni.ja!modules/zen/ZenSpace.mjs 53-88: pinned/normal sibling structure.
 * omni.ja!chrome/toolkit/content/global/xul.css 18-22,125-127,568-571,648-650:
 *   XUL flex, border-box, vertical orientation and scrollbox overflow defaults.
 * omni.ja!chrome/toolkit/skin/classic/global/arrowscrollbox.css 11-32:
 *   scrollbox minimum sizes and slot display:flex;flex:1 0 0.
 * Native excerpts: MPL-2.0, https://mozilla.org/MPL/2.0/.
 * Adaptations: XUL defaults -> HTML; arrowscrollbox -> x-arrowscrollbox to allow
 * an HTML shadow root. 40px rows and viewport heights are synthetic inputs.
 * Native JS/APZ/painting is not executed. Full historical evidence remains in
 * artifacts/sports-investigation; this suite neither reads nor writes it.
 */
const nativeCss=`
zen-workspace {flex-direction:column;position:absolute;height:100%;overflow:hidden;width:100%}
zen-workspace > arrowscrollbox {max-height:100%;overflow:hidden;position:relative}
zen-workspace > arrowscrollbox[overflowing]::part(scrollbox) {overflow-y:auto;padding-block-end:120px;overscroll-behavior:auto}
#tabbrowser-arrowscrollbox {height:100%}
#zen-tabs-wrapper {min-height:fit-content;overflow-y:auto;height:100%}
`;

// SuperPins 1.7.2, sine-mods/ad97bb70-0066-4e42-9b5f-173a5e42c6fc/chrome.css
// 792-807: uc.pins.stay-at-top=true branch inside zen.tabs.vertical=true.
// Test options explicitly select the preference branch; declarations are retained.
const superpinsCss=`
zen-workspace > arrowscrollbox.workspace-arrowscrollbox {overflow-y:hidden !important;flex-basis:100%}
#tabbrowser-arrowscrollbox .zen-workspace-pinned-tabs-section {flex:0 1 0}
#tabbrowser-arrowscrollbox .zen-workspace-normal-tabs-section {flex:1 1 0;overflow-y:auto !important;margin-bottom:5px}
`;

// Even Better New Tab Button 1.0.3:
// sine-mods/7f126d94-71d0-4c21-9de6-64f933edf185/userChrome.css 112-144,196-225.
// Layout subset of btrnewtab.sticky=true AND zen.view.show-newtab-button-top=true.
// Cosmetics/animations omitted; height/margin tokens use 36px/2px fixture inputs.
const stickyCss=`
#zen-tabs-wrapper {display:flex !important;flex-direction:column !important;min-height:0 !important;overflow:hidden !important}
#tabbrowser-arrowscrollbox {flex:1 1 auto !important;min-height:0 !important;overflow:hidden !important}
#tabs-newtab-button {display:none !important}
#vertical-tabs-newtab-button.toolbarbutton-1 {display:flex !important;flex:0 0 auto !important;min-height:36px !important;margin-block:2px !important}
#tabbrowser-arrowscrollbox > zen-workspace[active="true"] > arrowscrollbox.workspace-arrowscrollbox {overflow-y:hidden !important;flex-basis:100% !important}
#tabbrowser-arrowscrollbox > zen-workspace[active="true"] .zen-workspace-pinned-tabs-section {flex:0 1 0 !important}
#tabbrowser-arrowscrollbox > zen-workspace[active="true"] .zen-workspace-normal-tabs-section {
  anchor-name:--btrnewtab-active-normal;flex:1 1 0 !important;min-height:0 !important;overflow-y:auto !important;
  margin-block-start:calc(var(--btrnewtab-button-height) + 2 * var(--btrnewtab-button-block-margin)) !important;
}
#vertical-tabs-newtab-button.toolbarbutton-1 {
  position:absolute !important;position-anchor:--btrnewtab-active-normal;top:auto !important;bottom:anchor(top) !important;
  inset-inline-start:anchor(start) !important;inset-inline-end:anchor(end) !important;order:0 !important;
}
`;

function adapt(css,vertical=true) {
  return css.replace(/\(-moz-pref\("zen\.tabs\.vertical"\)\)/g,vertical?'(min-width: 0px)':'(max-width: 0px)')
    .replace(/(?<![\w-])arrowscrollbox(?=\s|[.>:{\[]|$)/g,'x-arrowscrollbox');
}
async function launch() {
  const {chromium}=createRequire(import.meta.url)(process.env.BZF_PLAYWRIGHT_MODULE);
  return chromium.launch({headless:true});
}
async function makePage(browser,{pins=false,sticky=false,children=35,height=700,remedy='',productionFirst=false,overflow=true,active=true,vertical=true}={}) {
  const page=await browser.newPage({viewport:{width:720,height:height+30}});
  await page.route('**/*',route=>route.abort());
  await page.setContent(`<html zen-sidebar-expanded="true"><head><style>
    html {--btrnewtab-button-height:36px;--btrnewtab-button-block-margin:2px}
    body {margin:0}
    vbox,hbox,zen-workspace,x-arrowscrollbox,toolbarbutton,zen-folder,.tab-group-container {display:flex;box-sizing:border-box}
    vbox,zen-workspace,x-arrowscrollbox,zen-folder,.tab-group-container {flex-direction:column}
    [flex="1"] {flex:1}
    #tabbrowser-tabs {height:${height}px;width:280px;display:flex;flex-direction:column;position:relative}
    #zen-tabs-wrapper,#tabbrowser-arrowscrollbox {display:flex;flex-direction:column;position:relative}
    .zen-current-workspace-indicator {height:40px;min-height:40px;max-height:40px;flex:none}
    .tab-group-label-container,.tabbrowser-tab {height:40px;min-height:40px;flex-shrink:0;box-sizing:border-box;display:flex}
    zen-folder[collapsed] > .tab-group-container {display:none}
    #tabs-newtab-button,#vertical-tabs-newtab-button {height:36px;min-height:36px;flex-shrink:0}
    #vertical-tabs-newtab-button {display:none}
  </style></head><body><div id="tabbrowser-tabs"><vbox id="zen-tabs-wrapper">
    <div id="tabbrowser-arrowscrollbox" flex="1"><zen-workspace active="${active}">
      <vbox class="zen-current-workspace-indicator">Home</vbox>
      <x-arrowscrollbox orient="vertical" class="workspace-arrowscrollbox" ${overflow?'overflowing':''}>
        <vbox class="zen-workspace-pinned-tabs-section"><zen-folder id="sports">
          <div class="tab-group-label-container">Sports</div><div class="tab-group-container">
          ${Array.from({length:children},(_,i)=>`<div class="tabbrowser-tab">Sports child ${i+1}</div>`).join('')}</div>
        </zen-folder><zen-folder collapsed><div class="tab-group-label-container">Zen</div></zen-folder></vbox>
        <vbox class="zen-workspace-normal-tabs-section"><hbox id="tabbrowser-arrowscrollbox-periphery">
          <toolbarbutton id="tabs-newtab-button" class="toolbarbutton-1">+</toolbarbutton></hbox>
          ${Array.from({length:40},(_,i)=>`<div class="tabbrowser-tab" id="normal-${i+1}">Ordinary tab ${i+1}</div>`).join('')}
        </vbox>
      </x-arrowscrollbox><vbox class="zen-workspace-empty-space" flex="1"></vbox>
    </zen-workspace></div><toolbarbutton id="vertical-tabs-newtab-button" class="toolbarbutton-1">+</toolbarbutton>
  </vbox></div></body></html>`);
  await page.evaluate(()=>{
    // Installed arrowscrollbox.js 18,29-34: flex=1 scrollbox, inherited vertical
    // orientation, HTML slot. Native minimum/slot declarations attributed above.
    document.querySelector('x-arrowscrollbox').attachShadow({mode:'open'}).innerHTML=`<style>
      .scrollbox {display:flex;box-sizing:border-box;flex:1;flex-direction:column;overflow:hidden;min-width:0;min-height:0}
      :host([orient="vertical"][overflowing]) > .scrollbox {overflow-y:auto;overscroll-behavior-y:none}
      slot {display:flex;flex:1 0 0;flex-direction:inherit}
      </style><div part="scrollbox" class="scrollbox"><slot part="items-wrapper"></slot></div>`;
  });
  await page.addStyleTag({content:adapt(nativeCss)});
  if(remedy&&productionFirst) await page.addStyleTag({content:adapt(remedy,vertical)});
  if(pins||sticky) await page.addStyleTag({content:adapt((pins?superpinsCss:'')+(sticky?stickyCss:''))});
  if(remedy&&!productionFirst) await page.addStyleTag({content:adapt(remedy,vertical)});
  return page;
}
async function measure(page,{collapsed=false,end=false}={}) {
  return page.evaluate(({collapsed,end})=>{
    const scroll=document.querySelector('x-arrowscrollbox').shadowRoot.querySelector('.scrollbox');
    const normal=document.querySelector('.zen-workspace-normal-tabs-section');
    document.querySelector('#sports').toggleAttribute('collapsed',collapsed);
    scroll.scrollTop=end?1e7:0;normal.scrollTop=end?1e7:0;
    const visible=e=>{
      const r=e.getBoundingClientRect(),nr=normal.getBoundingClientRect(),sr=scroll.getBoundingClientRect();
      const top=Math.max(r.top,nr.top,sr.top,0),bottom=Math.min(r.bottom,nr.bottom,sr.bottom,innerHeight);
      return bottom-top>1 && document.elementFromPoint(r.left+30,(top+bottom)/2)?.id===e.id;
    };
    return {normal:{clientHeight:normal.clientHeight,scrollHeight:normal.scrollHeight},
      firstVisible:visible(document.getElementById('normal-1')),lastVisible:visible(document.getElementById('normal-40'))};
  },{collapsed,end});
}

test('attributed mod excerpts reproduce the lost ordinary-tab viewport and collapse restores it', {skip}, async()=>{
  const browser=await launch();
  try {
    for(const [pins,sticky] of [[false,false],[true,false],[false,true],[true,true]]) {
      const page=await makePage(browser,{pins,sticky});
      try {
        const expanded=await measure(page,{end:true});
        const collapsed=await measure(page,{collapsed:true});
        if(pins||sticky) {
          assert.equal(expanded.normal.clientHeight,0,`pins=${pins},sticky=${sticky}: defect reproduced`);
          assert.equal(expanded.lastVisible,false);
          assert.ok(expanded.normal.scrollHeight>=1600,'40 ordinary 40px tabs retain content despite the lost viewport');
          assert.ok(collapsed.normal.clientHeight>0);
          assert.equal(collapsed.firstVisible,true);
        } else {
          assert.ok(expanded.normal.clientHeight>=1600);
          assert.equal(expanded.lastVisible,true);
        }
      } finally {await page.close()}
    }
  } finally {await browser.close()}
});

// Preserve the diagnostic workaround's reachability evidence separately from
// current production ownership. It is not loaded by the candidate.
test('historical safeguard explains ordinary-tab access across external modes, sizes, and stylesheet order', {skip}, async()=>{
  const browser=await launch();
  const remedy=historicalSafeguardCss;
  try {
    for(const [pins,sticky] of [[true,false],[false,true],[true,true]]) {
      for(const [children,height] of [[35,700],[60,500],[100,900]]) for(const productionFirst of [false,true]) {
        const page=await makePage(browser,{pins,sticky,children,height,remedy,productionFirst});
        try {
          const end=await measure(page,{end:true});
          assert.ok(end.normal.clientHeight>=1600,`ordinary tabs retain content height: pins=${pins},sticky=${sticky},children=${children},height=${height}; got ${end.normal.clientHeight}`);
          assert.equal(end.lastVisible,true,'last ordinary tab is hit-testable after native outer scroll');
          const firstVisible=await page.evaluate(()=>{
            const normal=document.querySelector('.zen-workspace-normal-tabs-section');
            normal.scrollTop=0;
            const scroll=document.querySelector('x-arrowscrollbox').shadowRoot.querySelector('.scrollbox');
            const first=normal.querySelector('.tabbrowser-tab');
            scroll.scrollTop+=first.getBoundingClientRect().top-scroll.getBoundingClientRect().top-10;
            const r=first.getBoundingClientRect();
            return document.elementFromPoint(r.left+30,r.top+20)?.id==='normal-1';
          });
          assert.equal(firstVisible,true,'first ordinary tab is hit-testable');
        } finally {await page.close()}
      }
    }
  } finally {
    await browser.close();
  }
});

test('historical safeguard exposes its persistent shared-scroll tradeoff under adapted overflow observation', {skip}, async()=>{
  const browser=await launch();
  const remedy=historicalSafeguardCss;
  const page=await makePage(browser,{pins:true,sticky:true,remedy});
  try {
    await measure(page,{collapsed:true});
    await page.evaluate(()=>{
      const host=document.querySelector('x-arrowscrollbox'),slot=host.shadowRoot.querySelector('slot'),scroll=host.shadowRoot.querySelector('.scrollbox');
      host.removeAttribute('overflowing');
      window.overflowTransitions=[];
      // Adapt native-arrowscrollbox.js 99-126; no native UI or APZ calls.
      const observer=new ResizeObserver(()=>{
        const overflowing=slot.getBoundingClientRect().height-scroll.clientHeight>0.02;
        if(overflowing===host.hasAttribute('overflowing'))return;
        requestAnimationFrame(()=>{host.toggleAttribute('overflowing',overflowing);window.overflowTransitions.push(overflowing)});
      });
      observer.observe(slot);observer.observe(scroll);window.sportsObserver=observer;
    });
    const settle=async()=>page.evaluate(async()=>{for(let i=0;i<8;i++)await new Promise(requestAnimationFrame);return {overflow:document.querySelector('x-arrowscrollbox').hasAttribute('overflowing'),transitions:[...window.overflowTransitions]}});
    const small=await settle();
    assert.equal(small.overflow,false,'collapsed folder starts with ordinary section as its own scroller');
    await measure(page);
    const expanded=await settle();
    assert.equal(expanded.overflow,true);
    assert.equal((await measure(page,{end:true})).lastVisible,true);
    await measure(page,{collapsed:true});
    const collapsed=await settle();
    assert.equal(collapsed.overflow,true,'fallback stays engaged while many ordinary tabs need outer scrolling');
    await page.evaluate(()=>document.querySelectorAll('.zen-workspace-normal-tabs-section .tabbrowser-tab').forEach((e,i)=>{if(i>1)e.remove()}));
    const few=await settle();
    assert.equal(few.overflow,false,'fallback releases when combined content fits');
    assert.ok(few.transitions.length<=4,'no persistent overflow/underflow feedback loop');
  } finally {await browser.close()}
});

test('production CSS preserves baseline scroll layout outside overflow, active-workspace, and vertical-mode scope', {skip}, async()=>{
  const browser=await launch();
  try {
    for(const boundary of [{overflow:false},{active:false},{vertical:false}]) {
      const baseline=await makePage(browser,{pins:true,...boundary});
      const production=await makePage(browser,{pins:true,remedy:productionCss,...boundary});
      try {
        assert.deepEqual(await measure(production,{end:true}),await measure(baseline,{end:true}),JSON.stringify(boundary));
      }finally{await baseline.close();await production.close()}
    }
  }finally{await browser.close()}
});

// Catches accidentally reintroducing the shared-scroll override into BZF:
// compare geometry and hit testing with/without the real production stylesheet.
// The external zero-height defect is deliberately not repaired in this mod.
test('production CSS leaves native and external ordinary-tab scrolling unchanged during folder overflow', {skip}, async()=>{
  const browser=await launch();
  try {
    for(const [pins,sticky] of [[false,false],[true,false],[false,true],[true,true]]) {
      for(const [children,height] of [[35,700],[60,500],[100,900]]) for(const productionFirst of [false,true]) {
        const options={pins,sticky,children,height,productionFirst};
        const baseline=await makePage(browser,options);
        const production=await makePage(browser,{...options,remedy:productionCss});
        try {
          const expected=await measure(baseline,{end:true});
          if(pins||sticky) {
            assert.equal(expected.normal.clientHeight,0,'external defect remains a separate investigation');
          } else {
            assert.ok(expected.normal.clientHeight>=1600,'native-size control retains ordinary tabs');
            assert.equal(expected.lastVisible,true);
          }
          assert.deepEqual(await measure(production,{end:true}),expected,JSON.stringify(options));
          assert.deepEqual(await measure(production,{collapsed:true}),await measure(baseline,{collapsed:true}),'collapsing the folder preserves the original scrolling layout');
        } finally {await baseline.close();await production.close()}
      }
    }
  } finally {await browser.close()}
});
