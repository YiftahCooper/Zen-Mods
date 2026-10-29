import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import * as bzf from '../scripts/better-zen-folders.uc.mjs';

// XUL cannot run in Node. Fake only that boundary; exercise the real manager's
// event filtering, direct-header choice, native positioning arguments and lifetime.
function fixture({right=false}={}) {
  const calls=[],errors=[];
  const panel=new EventTarget();
  panel.id='zen-folder-tabs-popup';panel.state='showing';
  panel.moveToAnchor=(...args)=>calls.push(args);
  panel.openPopup=()=>{};
  const folder={isZenFolder:true,collapsed:true,isConnected:true,
    getBoundingClientRect(){throw new Error('whole-folder geometry is not a header');}};
  const header={parentElement:folder,isConnected:true,
    matches:selector=>selector==='.tab-group-label-container',
    closest:()=>null,getBoundingClientRect:()=>({width:260,height:40,top:128,bottom:168})};
  folder.querySelector=selector=>selector===':scope > .tab-group-label-container'?header:null;
  panel.anchorNode=header;
  const host={document:{getElementById:id=>id===panel.id?panel:null},
    gBrowser:{tabContainer:{contains:node=>node===header}},
    gZenVerticalTabsManager:{_prefsRightSide:right},
    getComputedStyle:()=>({visibility:'visible',display:'flex'}),
    console:{error:(...args)=>errors.push(args)}};
  const native={openPopup:panel.openPopup,moveToAnchor:panel.moveToAnchor};
  const manager=typeof bzf.FolderPreviewAnchorManager==='function'
    ? new bzf.FolderPreviewAnchorManager(host) : null;
  const show=()=>panel.dispatchEvent(new Event('popupshowing',{cancelable:true}));
  return {host,panel,folder,header,calls,errors,native,manager,show};
}
function start(f,signal) {
  assert.ok(f.manager,'native preview needs a lifecycle-managed header correction');
  f.manager.start(signal);
}

// Break caught: leaving native -144 Y in place, or anchoring to the whole folder.
test('preview removes count-based displacement using the existing direct header and native API',()=>{
  const f=fixture();start(f);
  let nativeListenerRan=false;
  f.panel.addEventListener('popupshowing',()=>{nativeListenerRan=true;});
  assert.equal(f.show(),true,'native popupshowing must remain uncancelled');
  assert.deepEqual(f.calls,[[f.header,'topright topleft',10,0,false]]);
  assert.equal(nativeListenerRan,true);
  assert.equal(f.panel.openPopup,f.native.openPopup);
  assert.equal(f.panel.moveToAnchor,f.native.moveToAnchor);
  assert.equal(f.folder.collapsed,true);
  f.manager.destroy();
});

test('preview resolves sidebar side and current header on each opening',()=>{
  const f=fixture();start(f);f.show();
  f.host.gZenVerticalTabsManager._prefsRightSide=true;f.show();
  assert.deepEqual(f.calls[1],[f.header,'topleft topright',-10,0,false]);
  f.panel.anchorNode=null;f.show();
  assert.equal(f.calls.length,2,'a new opening must not reuse an old header');
  f.manager.destroy();
});

for(const invalid of ['expanded','disconnected','not-direct','not-folder','hidden-projection','zero-height','hidden-style','other-window']) {
  test(`preview leaves native behavior alone for ${invalid} anchors`,()=>{
    const f=fixture();
    if(invalid==='expanded')f.folder.collapsed=false;
    if(invalid==='disconnected')f.header.isConnected=false;
    if(invalid==='not-direct')f.folder.querySelector=()=>({});
    if(invalid==='not-folder')f.folder.isZenFolder=false;
    if(invalid==='hidden-projection')f.header.closest=()=>({});
    if(invalid==='zero-height')f.header.getBoundingClientRect=()=>({width:260,height:0});
    if(invalid==='hidden-style')f.host.getComputedStyle=()=>({visibility:'hidden',display:'flex'});
    if(invalid==='other-window')f.host.gBrowser.tabContainer.contains=()=>false;
    start(f);assert.equal(f.show(),true);assert.deepEqual(f.calls,[]);f.manager.destroy();
  });
}

test('preview ignores events originating in a different nested popup',()=>{
  const f=fixture();start(f);
  f.manager.onPopupShowing({target:{id:'colour-popup'}});
  assert.deepEqual(f.calls,[]);f.manager.destroy();
});

test('preview handles missing native API without substituting or patching it',()=>{
  const f=fixture();delete f.panel.moveToAnchor;
  start(f);f.show();assert.deepEqual(f.calls,[]);
  assert.equal(f.panel.moveToAnchor,undefined);f.manager.destroy();
});

test('preview start, abort, destroy and restart do not duplicate or leak listeners',()=>{
  const f=fixture(),first=new AbortController(),second=new AbortController();
  start(f,first.signal);f.manager.start(first.signal);f.show();
  assert.equal(f.calls.length,1);
  f.manager.destroy();f.show();assert.equal(f.calls.length,1);
  f.manager.start(second.signal);first.abort();f.show();assert.equal(f.calls.length,2);
  second.abort();f.show();assert.equal(f.calls.length,2);
  f.manager.destroy();f.manager.start(first.signal);f.show();assert.equal(f.calls.length,2);
});

test('native positioning failure is reported without cancelling search or replacing native methods',()=>{
  const f=fixture();
  f.panel.moveToAnchor=()=>{throw new Error('native placement unavailable');};
  const nativeMove=f.panel.moveToAnchor;
  start(f);assert.equal(f.show(),true);
  assert.equal(f.errors.length,1);assert.match(String(f.errors[0][1]),/native placement unavailable/);
  assert.equal(f.panel.moveToAnchor,nativeMove);f.manager.destroy();
});

// Break caught: the event hook corrects too late or changes native search state.
// Versioned native methods are replayed; only XUL popup placement is adapted.
test('Zen 1.22.2b native preview replay corrects placement before showing while retaining search, selection and cleanup',
  {skip:process.env.BZF_PLAYWRIGHT_MODULE?false:'set BZF_PLAYWRIGHT_MODULE for isolated native-method replay'},async()=>{
    const [source,native]=await Promise.all([
      readFile(new URL('../scripts/better-zen-folders.uc.mjs',import.meta.url),'utf8'),
      readFile(new URL('./fixtures/zen-1.22.2b-folder-preview.mjs',import.meta.url),'utf8'),
    ]);
    const {chromium}=createRequire(import.meta.url)(process.env.BZF_PLAYWRIGHT_MODULE);
    const browser=await chromium.launch({headless:true});
    try {
      const page=await browser.newPage();const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',route=>route.abort());
      await page.setContent(`<style>zen-folder{display:block}.tab-group-label-container{display:block;height:40px;width:260px}#folder{height:400px}</style>
        <div id="tabs"><zen-folder id="folder"><div class="tab-group-label-container"><label>Test</label></div></zen-folder></div>
        <div id="zen-folder-tabs-popup"><input id="zen-folder-tabs-list-search"><div id="zen-folder-tabs-list"></div><div id="zen-folder-tabs-search-no-results" hidden></div></div>`);
      const result=await page.evaluate(async({source,nativeFixture})=>{
        const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
        const api=await import(url);URL.revokeObjectURL(url);
        const folder=document.getElementById('folder'),header=folder.firstElementChild;
        const panel=document.getElementById('zen-folder-tabs-popup');
        folder.isZenFolder=true;folder.collapsed=true;folder.name='Test';folder.activeTabs=[];
        const tabs=Array.from({length:7},(_,i)=>({id:'tab-'+i,label:i===2?'Needle':'Tab '+i,
          group:folder,linkedBrowser:{currentURI:{spec:'about:blank'}},hasAttribute:()=>false}));
        folder.tabs=tabs;
        window.gBrowser={tabContainer:document.getElementById('tabs'),getIcon:()=> 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'};
        window.gURLBar={focused:false};window.gZenVerticalTabsManager={_prefsRightSide:false};
        window.formatRelativeTime=()=>'';document.l10n={setArgs:()=>{}};
        const calls=[];
        panel.moveToAnchor=(anchor,position,x,y,attributesOverride)=>{
          calls.push({direct:anchor===header,position,x,y,attributesOverride});panel.fixtureY=y;
        };
        panel.openPopup=(anchor,options)=>{
          panel.anchorNode=anchor;panel.state='showing';panel.fixtureY=options.y;
          panel.dispatchEvent(new Event('popupshowing',{bubbles:true,cancelable:true}));
          panel.state='open';panel.dispatchEvent(new Event('popupshown'));
        };
        const originalOpen=panel.openPopup,originalMove=panel.moveToAnchor;
        (0,eval)(nativeFixture);
        const nativePreview=new NativeFolderPreviewFixture(panel);
        const manager=api.FolderPreviewAnchorManager?new api.FolderPreviewAnchorManager(window):null;
        manager?.start();
        nativePreview.openTabsPopup({target:header,stopPropagation(){}});
        const initialY=panel.fixtureY;
        const search=document.getElementById('zen-folder-tabs-list-search');
        const focused=document.activeElement===search;
        search.value='needle';search.dispatchEvent(new Event('input'));
        const shown=[...document.getElementById('zen-folder-tabs-list').children].filter(item=>!item.hidden);
        shown[0].click();
        panel.dispatchEvent(new Event('popuphidden'));
        manager?.destroy();
        const cleaned={search:search.value,open:header.hasAttribute('open')};
        nativePreview.openTabsPopup({target:header,stopPropagation(){}});
        return {initialY,calls,focused,found:shown.length,selected:gBrowser.selectedTab.id,cleaned,
          afterDestroyY:panel.fixtureY,methodsIntact:panel.openPopup===originalOpen&&panel.moveToAnchor===originalMove};
      },{source,nativeFixture:native});
      assert.equal(result.initialY,0,'native -144 offset must be corrected during popupshowing');
      assert.deepEqual(result.calls,[{direct:true,position:'topright topleft',x:10,y:0,attributesOverride:false}]);
      assert.equal(result.focused,true);assert.equal(result.found,1);assert.equal(result.selected,'tab-2');
      assert.deepEqual(result.cleaned,{search:'',open:false});assert.equal(result.afterDestroyY,-144);
      assert.equal(result.methodsIntact,true);assert.deepEqual(errors,[]);
    } finally {await browser.close();}
  });
