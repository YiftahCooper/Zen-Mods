import test from 'node:test';
import assert from 'node:assert/strict';
const module = await import('../../src/zen-icons-sine/tab-default.mjs').catch(()=>({}));
function setup(lookup=async()=> 'data:image/png;base64,c2l0ZQ==') {
  assert.equal(typeof module.createTabIconController,'function','tab native-icon restoration is implemented');
  const tab={linkedBrowser:{currentURI:{spec:'https://example.test/'},mIconURL:'data:image/png;base64,b3JpZw=='},zenStaticIcon:'chrome://custom.svg'};
  const saved=[];let active=true;
  const controller=module.createTabIconController({lookupFavicon:lookup,setIcon:(t,v)=>{t.linkedBrowser.mIconURL=v;},persistImage:(t,v)=>saved.push(v),isActive:()=>active});
  const clear=()=>{delete tab.zenStaticIcon;tab.linkedBrowser.mIconURL=null;};
  return {tab,controller,saved,clear,stop:()=>active=false};
}
test('Default restores the cached website image without making it a static override', async()=>{
  const {tab,controller,saved,clear}=setup();
  await controller.restore(tab,clear);
  assert.equal(tab.linkedBrowser.mIconURL,'data:image/png;base64,c2l0ZQ==');
  assert.equal(tab.zenStaticIcon,undefined);assert.deepEqual(saved,['data:image/png;base64,c2l0ZQ==']);
});
test('native icon remembered before custom selection restores even without persistent favicon cache', async()=>{
  const {tab,controller,clear}=setup(async()=>null);
  delete tab.zenStaticIcon;controller.remember(tab);tab.zenStaticIcon='chrome://custom.svg';
  await controller.restore(tab,clear);assert.equal(tab.linkedBrowser.mIconURL,'data:image/png;base64,b3JpZw==');
});
for(const race of ['selection','navigation','native-icon','unload','close']) test(`late favicon lookup cannot overwrite ${race}`,async()=>{
  let resolve;const {tab,controller,clear,stop,saved}=setup(()=>new Promise(r=>resolve=r));
  const pending=controller.restore(tab,clear);
  if(race==='selection'){controller.changed(tab);tab.zenStaticIcon='chrome://new.svg';}
  if(race==='navigation')tab.linkedBrowser.currentURI.spec='https://other.test/';
  if(race==='native-icon')tab.linkedBrowser.mIconURL='data:image/png;base64,bmV3';
  if(race==='unload')stop();
  if(race==='close')tab.closing=true;
  resolve('data:image/png;base64,bGF0ZQ==');await pending;assert.deepEqual(saved,[]);
});
test('cache failure leaves native reset intact and never fabricates a network favicon request',async()=>{
  const {tab,controller,clear,saved}=setup(async()=>{throw Error('no cache');});
  await controller.restore(tab,clear);assert.equal(tab.zenStaticIcon,undefined);assert.equal(tab.linkedBrowser.mIconURL,null);assert.deepEqual(saved,[]);
});
