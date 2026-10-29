import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../scripts/better-zen-folders.uc.mjs';

// This boundary fixture models Zen 1.23.2b's pinned/ordinary insertion gate.
// Actual native insertion, trusted middle-click and Glance are qualified separately.
function fixture(t) {
  const host = {console:{error(...args){throw new Error(args.join(' '));}}};
  const root = [], lastRelated = new Map();let serial=0;
  const folder = id => ({id,isZenFolder:true,isLiveFolder:false,isConnected:true,ownerGlobal:host,allItems:[],
    hasAttribute(){return false;}});
  const tab = (group=null) => {
    const attrs=new Map(),item={id:++serial,localName:'tab',ownerGlobal:host,isConnected:true,closing:false,
      pinned:!!group,group,linkedBrowser:{browsingContext:{}},hasAttribute:n=>attrs.has(n),
      setAttribute:(n,v)=>attrs.set(n,v),removeAttribute:n=>attrs.delete(n),closest:()=>item.group};
    (group?.allItems??root).push(item);return item;
  };
  const move=(item,group,after=null)=>{
    const old=item.group?.allItems??root,index=old.indexOf(item);if(index>=0)old.splice(index,1);
    item.group=group;const items=group?.allItems??root;
    items.splice(after?items.indexOf(after)+1:items.length,0,item);
  };
  const browser=host.gBrowser={selectedTab:null,getTabForBrowser:b=>all().find(t=>t.linkedBrowser===b),
    addTab(url,options={}) {
      const rawOpener=(options.openerBrowser&&this.getTabForBrowser(options.openerBrowser))
        || ((options.relatedToCurrent??!!options.referrerInfo?.originalReferrer)&&this.selectedTab);
      const opener=host.gZenGlanceManager.getTabOrGlanceParent(rawOpener);
      const group=options.tabGroup??opener?.group;
      const result=tab();result.url=url;result.pinned=options.pinned===true;
      result.nativeCreationOptions=options;
      result.linkedBrowser.crossGroupOpener=options.openerBrowser?.browsingContext??null;
      if(group&&result.pinned)move(result,group,lastRelated.get(opener)??opener);
      host.gZenWorkspaces.fixTabInsertLocation(result);
      if(host.failNext){host.failNext=false;throw new Error('native creation failed');}
      if(opener)lastRelated.set(opener,result);
      if(!options.inBackground)this.selectedTab=result;
      host.onTabOpen?.(result);
      return result;
    },
    pinTab(item){host.gZenGlanceManager.getTabOrGlanceParent(item).pinned=true;},
    moveTabAfter(item,target){move(item,item.pinned===target.pinned?target.group:null,target);},
  };
  const folders=[folder('Parent'),folder('Child'),folder('Other')];
  const all=()=>[...root,...folders.flatMap(f=>f.allItems)];
  host.gZenWorkspaces={fixTabInsertLocation(item){if(item.pinned)move(item,null);}};
  let glance=null,origin=null;
  host.gZenGlanceManager={
    openGlance(data,existing=null,owner=null){origin=owner??browser.selectedTab;
      glance=existing??browser.addTab(data.url,{ownerTab:origin,inBackground:true});
      glance.setAttribute('zen-glance-tab','true');browser.selectedTab=glance;return Promise.resolve(glance);},
    fullyOpenGlance(){browser.moveTabAfter(glance,origin);glance.removeAttribute('zen-glance-tab');browser.selectedTab=glance;return Promise.resolve();},
    getTabOrGlanceParent:item=>item===glance&&item.hasAttribute('zen-glance-tab')?origin:item,
  };
  const native={add:browser.addTab,move:browser.moveTabAfter,open:host.gZenGlanceManager.openGlance,expand:host.gZenGlanceManager.fullyOpenGlance};
  const manager=new api.RelatedFolderTabsManager(host);
  const abort=new AbortController();manager.start(abort.signal);t.after(()=>manager.destroy());
  return {host,browser,folders,tab,root,manager,native,abort};
}

for(const nested of [false,true])for(const background of [false,true]) {
  test(`related link stays immediately after its origin (${nested?'nested':'root folder'}, ${background?'background':'foreground'})`,t=>{
    const f=fixture(t),folder=f.folders[nested?1:0],a=f.tab(folder),b=f.tab(folder),c=f.tab(folder);
    f.browser.selectedTab=b;
    const linked=f.browser.addTab('linked',{relatedToCurrent:true,inBackground:background});
    assert.equal(linked.group,folder);
    assert.deepEqual(folder.allItems,[a,b,linked,c]);
    assert.equal(f.browser.selectedTab,background?b:linked);
  });
}
test('explicit opener wins over a different selected folder and repeated links retain native order',t=>{
  const f=fixture(t),[folder,,other]=f.folders,a=f.tab(folder),b=f.tab(folder),outside=f.tab(other);
  f.browser.selectedTab=outside;
  const options={openerBrowser:a.linkedBrowser,relatedToCurrent:true,inBackground:true};
  const first=f.browser.addTab('one',options),second=f.browser.addTab('two',options);
  assert.deepEqual(folder.allItems,[a,first,second,b]);assert.deepEqual(other.allItems,[outside]);
  assert.equal(f.browser.selectedTab,outside);assert.equal(options.pinned,undefined,'caller options are not mutated');
});
test('referrer-related creation follows native implicit relatedness',t=>{
  const f=fixture(t),a=f.tab(f.folders[0]);f.browser.selectedTab=a;
  const linked=f.browser.addTab('linked',{referrerInfo:{originalReferrer:{spec:'source'}},inBackground:true});
  assert.equal(linked.group,a.group);
});

for(const nested of [false,true])for(const background of [false,true]) {
  test(`live window.open creation follows its actual folder opener (${nested?'nested':'root'}, background=${background})`,t=>{
    const f=fixture(t),folder=f.folders[nested?1:0],source=f.tab(folder),next=f.tab(folder),outside=f.tab(f.folders[2]);
    f.browser.selectedTab=outside;
    const openWindowInfo={parent:{top:source.linkedBrowser.browsingContext},forceNoOpener:false};
    const options={skipLoad:true,openerBrowser:source.linkedBrowser,openWindowInfo,inBackground:background};
    const opened=f.browser.addTab('about:blank',options);
    assert.equal(opened.group,folder);
    assert.deepEqual(folder.allItems,[source,opened,next]);
    assert.equal(f.browser.selectedTab,background?outside:opened);
    assert.equal(opened.nativeCreationOptions.skipLoad,true,'native window creation must still own loading');
    assert.equal(opened.nativeCreationOptions.openWindowInfo,openWindowInfo);
    assert.equal(opened.nativeCreationOptions.openerBrowser,source.linkedBrowser);
    assert.equal(options.pinned,undefined,'caller options are not mutated');
  });
}
for(const kind of ['missing-info','missing-opener','mismatched-parent','external','restore-insert','lazy','essential']) {
  test('provisional creation without a valid live opener stays native: '+kind,t=>{
    const f=fixture(t),source=f.tab(f.folders[0]);f.browser.selectedTab=source;
    const options={skipLoad:true,openerBrowser:source.linkedBrowser,openWindowInfo:{parent:{top:source.linkedBrowser.browsingContext}},inBackground:true};
    if(kind==='missing-info')delete options.openWindowInfo;
    if(kind==='missing-opener')delete options.openerBrowser;
    if(kind==='mismatched-parent')options.openWindowInfo.parent.top={};
    if(kind==='external')options.fromExternal=true;
    if(kind==='restore-insert')options.insertTab=false;
    if(kind==='lazy')options.createLazyBrowser=true;
    if(kind==='essential')options.essential=true;
    const opened=f.browser.addTab('about:blank',options);
    assert.equal(opened.group,null);assert.equal(opened.pinned,false);
  });
}
for(const options of [{},{fromExternal:true,relatedToCurrent:true},{skipLoad:true,relatedToCurrent:true},
  {createLazyBrowser:true,relatedToCurrent:true},{insertTab:false,relatedToCurrent:true},
  {relatedToCurrent:false,referrerInfo:{originalReferrer:{}}}]) {
  test('unrelated/restored creation stays native '+JSON.stringify(options),t=>{
    const f=fixture(t),a=f.tab(f.folders[0]);f.browser.selectedTab=a;
    const opened=f.browser.addTab('unrelated',{...options,inBackground:true});
    assert.equal(opened.group,null);assert.equal(opened.pinned,false);
  });
}
test('an explicit destination is not overwritten by an opener folder',t=>{
  const f=fixture(t),a=f.tab(f.folders[0]);f.browser.selectedTab=a;
  const result=f.browser.addTab('explicit',{relatedToCurrent:true,tabGroup:f.folders[2],pinned:true});
  assert.equal(result.group,null,'explicit placement keeps the unmodified native workspace fixup');
});
for(const unsupported of ['isLiveFolder','disconnected','foreign','essential']) {
  test('unsupported origin remains native: '+unsupported,t=>{
    const f=fixture(t),folder=f.folders[0],a=f.tab(folder);f.browser.selectedTab=a;
    if(unsupported==='isLiveFolder')folder.isLiveFolder=true;
    if(unsupported==='disconnected')a.isConnected=false;
    if(unsupported==='foreign')a.ownerGlobal={};
    if(unsupported==='essential')a.setAttribute('zen-essential','true');
    assert.equal(f.browser.addTab('linked',{relatedToCurrent:true,inBackground:true}).group,null);
  });
}
for(const existing of [false,true]) {
  test(`Glance expands into its actual parent folder (${existing?'existing':'new'} tab)`,async t=>{
    const f=fixture(t),folder=f.folders[1],a=f.tab(folder),b=f.tab(folder),outside=f.tab(f.folders[2]);
    f.browser.selectedTab=outside;
    const origins=[];
    f.host.__betterZenFoldersFolderPins={origins:{active:true,placeCreatedTab(tab,origin,operation){origins.push(origin);return operation();}}};
    const preview=await f.host.gZenGlanceManager.openGlance({url:'preview'},existing?f.tab():null,a);
    assert.equal(preview.group,null,'the transient preview must not be grouped early');
    await f.host.gZenGlanceManager.fullyOpenGlance();
    assert.deepEqual(folder.allItems,[a,preview,b]);assert.equal(f.browser.selectedTab,preview);
    assert.deepEqual(origins,[existing?'move':'new'],'new defaults must not erase existing URL-pin intent');
  });
}
test('abort restores owned hooks and leaves a later foreign wrapper intact',t=>{
  const f=fixture(t);const owned=f.browser.addTab;
  const foreign=function(...args){return Reflect.apply(owned,this,args);};f.browser.addTab=foreign;
  f.abort.abort();assert.equal(f.browser.addTab,foreign);assert.equal(f.browser.moveTabAfter,f.native.move);
  assert.equal(f.host.gZenGlanceManager.openGlance,f.native.open);assert.equal(f.host.gZenGlanceManager.fullyOpenGlance,f.native.expand);
  const a=f.tab(f.folders[0]);f.browser.selectedTab=a;
  assert.equal(f.browser.addTab('after unload',{relatedToCurrent:true,inBackground:true}).group,null);
});
test('a failed creation releases its folder exemption before the next native workspace fixup',t=>{
  const f=fixture(t),folder=f.folders[0],a=f.tab(folder);f.browser.selectedTab=a;f.host.failNext=true;
  assert.throws(()=>f.browser.addTab('failed',{relatedToCurrent:true,inBackground:true}),/native creation failed/);
  const ordinary=f.tab(folder);f.host.gZenWorkspaces.fixTabInsertLocation(ordinary);
  assert.equal(ordinary.group,null,'a completed/failed creation cannot exempt later native work');
});
test('invalid explicit opener never falls back to the selected folder',t=>{
  const f=fixture(t);f.browser.selectedTab=f.tab(f.folders[0]);
  const tab=f.browser.addTab('foreign',{openerBrowser:{},relatedToCurrent:true,inBackground:true});
  assert.equal(tab.group,null);assert.equal(tab.pinned,false);
});
test('related tabs opened from the regular area keep native placement',t=>{
  const f=fixture(t),a=f.tab();f.browser.selectedTab=a;
  const tab=f.browser.addTab('regular',{relatedToCurrent:true,inBackground:true});
  assert.equal(tab.group,null);assert.equal(tab.pinned,false);assert.equal(f.browser.selectedTab,a);
});
test('a synchronous unrelated restore cannot inherit its outer related creation exemption',t=>{
  const f=fixture(t),a=f.tab(f.folders[0]);f.browser.selectedTab=a;let restore;
  f.host.onTabOpen=()=>{f.host.onTabOpen=null;restore=f.browser.addTab('restored',{skipLoad:true,pinned:true,tabGroup:a.group,inBackground:true});};
  const linked=f.browser.addTab('related',{relatedToCurrent:true,inBackground:true});
  assert.equal(linked.group,a.group);assert.equal(restore.group,null);
});
test('folder placement does not introduce a browser opener when none was supplied',t=>{
  const f=fixture(t),a=f.tab(f.folders[0]);f.browser.selectedTab=a;
  const linked=f.browser.addTab('related',{relatedToCurrent:true,inBackground:true});
  assert.equal(linked.group,a.group);assert.equal(linked.linkedBrowser.crossGroupOpener,null);
});
test('a link inside Glance inherits its folder without replacing its real browser opener',async t=>{
  const f=fixture(t),a=f.tab(f.folders[0]);f.browser.selectedTab=a;
  const preview=await f.host.gZenGlanceManager.openGlance({url:'preview'},null,a);
  const linked=f.browser.addTab('related',{openerBrowser:preview.linkedBrowser,relatedToCurrent:true,inBackground:true});
  assert.equal(linked.group,a.group);
  assert.equal(linked.linkedBrowser.crossGroupOpener,preview.linkedBrowser.browsingContext);
});
