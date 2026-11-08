// Real Chromium input/layout qualification of production HTML/CSS. The XUL
// panel below is a shim: this cannot establish native Zen widget geometry.
import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {posix} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.BROWSER_TEST_NODE_MODULES?process.env.BROWSER_TEST_NODE_MODULES+'/playwright':'playwright');
const root=new URL('../',import.meta.url),out=new URL('.backup-scratch/browser-qualification/',root);
await mkdir(out,{recursive:true});
const sources={name:'bounded-sources',setup(b){
 b.onResolve({filter:/.*/},args=>({path:posix.normalize(posix.join(args.importer?posix.dirname(args.importer):'',args.path)),namespace:'source'}));
 b.onLoad({filter:/.*/,namespace:'source'},async args=>({contents:await readFile(new URL(args.path,root),'utf8'),loader:'js'}));
}};
const bundle=await build({stdin:{contents:"import {createPopup} from './src/popup.mjs'; import {createSettingsControls} from './src/settings.mjs'; window.makePopup=createPopup; window.makeSettings=createSettingsControls;",resolveDir:fileURLToPath(root)},plugins:[sources],tsconfigRaw:{compilerOptions:{}},bundle:true,format:'iife',platform:'browser',write:false});
const context=await chromium.launchPersistentContext(fileURLToPath(new URL('profile-'+Date.now()+'/',out)),{...(process.env.BROWSER_TEST_EXECUTABLE?{executablePath:process.env.BROWSER_TEST_EXECUTABLE}:{}),headless:true,chromiumSandbox:true,viewport:{width:1280,height:900}}),page=await context.newPage();
const checks={},details={};
const check=(name,value,detail)=>{checks[name]=!!value;if(!value)details[name]=detail;};
try{
 await page.route('**/*',route=>route.abort());
 await page.setContent('<!doctype html><html><head></head><body><main id="content">browser fixture</main></body></html>');
 await page.addStyleTag({content:await readFile(new URL('style.css',root),'utf8')});
 await page.addStyleTag({content:'body{margin:0;background:#aaa} #define-word-panel{border:1px solid #888;border-radius:8px;overflow:hidden} :root{--arrowpanel-color:#eee;--arrowpanel-background:#202024;}'});
 await page.evaluate(()=>{
  Object.defineProperties(window,{mozInnerScreenX:{value:0},mozInnerScreenY:{value:0}});
  window.gBrowser={selectedBrowser:document.querySelector('#content')};window.openTrustedLinkIn=(url,where)=>window.opened={url,where};
  document.createXULElement=()=>{const panel=document.createElement('div');panel.hidden=true;panel.state='closed';panel.style.position='fixed';
   panel.getOuterScreenRect=()=>panel.getBoundingClientRect();panel.moveTo=(x,y)=>{panel.style.left=x+'px';panel.style.top=y+'px';};
   panel.openPopupAtScreen=(x,y)=>{panel.moveTo(x,y);panel.hidden=false;panel.state='open';panel.dispatchEvent(new Event('popupshown'));};
   panel.hidePopup=()=>{panel.hidden=true;panel.state='closed';panel.dispatchEvent(new Event('popuphidden'));};return panel;};
 });
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.evaluate(()=>{
  window.savedSize=null;window.queries=[];
  window.popup=makePopup(window,{readSize:()=>savedSize,onSizeChange:size=>savedSize=size,onClose:o=>popup.close(o),onSearch:q=>queries.push(q)});
  window.fixture={term:{original:'Account',language:'en'},providerId:'wiktionary-en',providers:[{id:'wiktionary-en',label:'Wiktionary'},{id:'mw-collegiate',label:'Merriam-Webster Collegiate · API key'}],textSize:14,outcome:{status:'ok',definition:{headword:'account',language:'en',senses:[{partOfSpeech:'noun',text:'A record of money received and spent.',examples:['An example sentence.']},{partOfSpeech:'verb',text:'To explain or consider something.'}],sourceUrl:'https://en.wiktionary.org/wiki/account',attribution:{label:'Fixture',url:'https://en.wiktionary.org/wiki/account'}}}};
  popup.render(fixture);popup.show({x:600,y:400,width:60,height:20});
 });
 const rect=async selector=>page.locator(selector).boundingBox();
 const initial=await rect('.dw-shell');
 const reopen=async anchor=>page.evaluate(a=>{popup.close();popup.render(fixture);popup.show(a);},anchor);
 for(let i=0;i<30;i++)await reopen({x:600,y:400,width:60,height:20});
 const repeated=await rect('.dw-shell');check('30_reopens_stable',Math.abs(initial.width-repeated.width)<1&&Math.abs(initial.height-repeated.height)<1,{initial,repeated});
 for(const [name,y] of [['top',24],['middle',420],['bottom',850]]){
  await reopen({x:600,y,width:60,height:20});const p=await rect('#define-word-panel');
  check('anchor_'+name,p.y>=0&&p.y+p.height<=900&&(p.y>=y+20||p.y+p.height<=y),p);
 }
 await reopen({x:600,y:400,width:60,height:20});
 const start=await rect('#define-word-panel'),header=await rect('.dw-bar strong');
 await page.mouse.move(header.x+20,header.y+5);await page.mouse.down();await page.mouse.move(header.x+60,header.y+35,{steps:4});await page.mouse.up();
 const moved=await rect('#define-word-panel');check('header_real_pointer_drag',moved.x!==start.x&&moved.y!==start.y,{start,moved});
 for(const edge of ['n','s','e','w','ne','nw','se','sw']){
  await page.evaluate(()=>{savedSize={width:480,height:300};});await reopen(null);
  // Move to a central position so each edge has expansion room.
  await page.evaluate(()=>document.querySelector('#define-word-panel').moveTo(350,250));
  const before=await rect('.dw-shell'),h=await rect(`[data-resize-edge="${edge}"]`);
  const dx=edge.includes('w')?-25:edge.includes('e')?25:0,dy=edge.includes('n')?-25:edge.includes('s')?25:0;
  await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2+dx,h.y+h.height/2+dy,{steps:4});await page.mouse.up();
  const after=await rect('.dw-shell');check('real_resize_'+edge,(!dx||after.width>before.width)&&(!dy||after.height>before.height),{before,after});
 }
 await reopen(null);const persisted=await page.evaluate(()=>({savedSize,actual:{width:document.querySelector('.dw-shell').getBoundingClientRect().width,height:document.querySelector('.dw-shell').getBoundingClientRect().height}}));
 check('remembered_size',Math.abs(persisted.savedSize.width-persisted.actual.width)<1&&Math.abs(persisted.savedSize.height-persisted.actual.height)<1,persisted);
 const text=page.locator('[data-result] li p').first(),textBox=await text.boundingBox();
 await page.mouse.move(textBox.x+2,textBox.y+8);await page.mouse.down();await page.mouse.move(textBox.x+150,textBox.y+8,{steps:5});await page.mouse.up();
 const selection=await page.evaluate(()=>getSelection().toString());check('definition_text_selection',selection.length>3,selection);
 for(const px of [10,14,22,32]){
  await page.evaluate(px=>{fixture.textSize=px;popup.render(fixture);},px);
  const sizes=await page.evaluate(()=>({h:parseFloat(getComputedStyle(document.querySelector('h2')).fontSize),p:parseFloat(getComputedStyle(document.querySelector('[data-result] p')).fontSize),shell:document.querySelector('.dw-shell').getBoundingClientRect().width,scroll:document.querySelector('.dw-card').scrollWidth,client:document.querySelector('.dw-card').clientWidth}));
  check('scale_'+px,sizes.h>sizes.p&&Math.abs(sizes.p-px)<1&&sizes.scroll<=sizes.client+1,sizes);
 }
 await page.evaluate(()=>{fixture.textSize=22;fixture.term={original:'שָׁלוֹם',language:'he'};fixture.outcome.definition={...fixture.outcome.definition,headword:'שָׁלוֹם',language:'he',senses:[{text:'מִלַּת בְּרָכָה וּפְרֵדָה, וְהֶעְדֵּר מִלְחָמָה.'}]};popup.render(fixture);});
 const rtl=await page.evaluate(()=>({direction:getComputedStyle(document.querySelector('[data-result]')).direction,line:parseFloat(getComputedStyle(document.querySelector('[data-result] li p')).lineHeight),font:parseFloat(getComputedStyle(document.querySelector('[data-result] li p')).fontSize),text:document.querySelector('[data-result]').textContent}));
 check('rtl_niqqud_layout',rtl.direction==='rtl'&&rtl.line>=rtl.font*1.5&&rtl.text.includes('שָׁלוֹם'),rtl);
 await page.screenshot({path:fileURLToPath(new URL('hebrew-popup.png',out))});
 await page.setViewportSize({width:520,height:440});await reopen({x:220,y:180,width:60,height:20});const small=await rect('#define-word-panel');
 check('small_viewport_fit',small.x>=0&&small.y>=0&&small.x+small.width<=520&&small.y+small.height<=440,small);
 await page.screenshot({path:fileURLToPath(new URL('small-popup.png',out))});
 await page.evaluate(()=>{fixture.term={original:'Define',language:'en'};popup.render(fixture);popup.renderSuggestions({label:'Matches',outcome:{status:'ok',suggestions:[{word:'define',language:'en'},{word:'DEFINE',language:'en'},{word:'sense',language:'en'}]}});});
 check('case_unique_suggestions',await page.locator('[role=option]').count()===2);
 await page.locator('[role=combobox]').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 check('real_keyboard_suggestion',await page.evaluate(()=>queries.at(-1)==='define'));
 await page.evaluate(()=>{fixture.term={original:'may',language:'en'};popup.render({...fixture,outcome:{status:'loading'}});});
 await page.locator('.dw-search button').click();check('unedited_query_preserves_case',await page.evaluate(()=>queries.at(-1)==='may'));
 await page.locator('[role=combobox]').fill('May');await page.locator('.dw-search button').click();check('edited_query_preserves_case',await page.evaluate(()=>queries.at(-1)==='May'));
 await page.evaluate(()=>{document.documentElement.style.setProperty('--arrowpanel-background','#fafafa');document.documentElement.style.setProperty('--arrowpanel-color','#202024');});
 check('theme_variables_repaint',await page.locator('.dw-shell').evaluate(el=>getComputedStyle(el).backgroundColor==='rgb(250, 250, 250)'&&getComputedStyle(el).color==='rgb(32, 32, 36)'));
 await page.keyboard.press('Escape');check('escape_dismisses',await page.locator('#define-word-panel').isHidden());
 await page.evaluate(()=>{
  popup.destroy();document.body.innerHTML='<section mod-id="define-word"><dialog open class="sineItemPreferenceDialog"><div class="sineItemPreferenceDialogContent"></div></dialog></section>';
  window.keyStore=new Map();window.preferences=new Map();
  const prefs={getStringPref:(key,d)=>preferences.get(key)??d,getBoolPref:(_key,d)=>d,setStringPref:(key,value)=>preferences.set(key,value)};
  const credentials={get:async id=>keyStore.get(id),set:async(id,value)=>keyStore.set(id,value),remove:async id=>keyStore.delete(id)};
  window.controls=makeSettings(window,{prefs,credentials});document.querySelector('.sineItemPreferenceDialogContent').append(controls.element);
 });
 const key=page.locator('#dw-key-mw-collegiate');await key.fill('synthetic-credential');await key.press('Tab');
 check('key_autosaves_on_blur',await page.evaluate(()=>keyStore.get('mw-collegiate')==='synthetic-credential'));
 check('one_reveal_button_per_field',await page.locator('.dw-key-reveal').count()===3&&await page.locator('.dw-key-field').count()===3);
 await page.locator('.dw-key-reveal').first().click();check('key_reveal',await key.getAttribute('type')==='text');
 await page.evaluate(()=>controls.reset());await page.waitForFunction(()=>document.querySelector('#dw-key-mw-collegiate').value==='synthetic-credential'&&!document.querySelector('#dw-key-mw-collegiate').disabled);
 check('key_mask_and_reopen',await key.getAttribute('type')==='password');
 await page.locator('#dw-text-size').fill('22');await page.locator('#dw-text-size').press('Tab');
 check('numeric_size_saves',await page.evaluate(()=>preferences.get('extension.define-word.text-size')==='22'));
 await page.locator('#dw-text-size').fill('99');await page.locator('#dw-text-size').press('Tab');
 check('invalid_size_preserves_previous',await page.evaluate(()=>preferences.get('extension.define-word.text-size')==='22'&&document.querySelector('#dw-text-size').getAttribute('aria-invalid')==='true'));
 const settingFit=await page.locator('dialog').evaluate(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth,client:el.clientWidth}));
 check('settings_narrow_and_no_horizontal_scroll',settingFit.width<=488&&settingFit.scroll<=settingFit.client,settingFit);
 await page.setViewportSize({width:1280,height:900});const wide=await page.locator('dialog').boundingBox();check('settings_800px_cap',wide.width<=800,wide);
 await page.locator('#dw-key-mw-collegiate').fill('');await page.locator('#dw-key-mw-collegiate').press('Tab');check('clearing_key_removes_only_own',await page.evaluate(()=>!keyStore.has('mw-collegiate')));
 await page.screenshot({path:fileURLToPath(new URL('settings.png',out))});
}catch(error){details.error=String(error);checks.execution=false;}
finally{await context.close();}
const report={scope:'Chromium production DOM/CSS with simulated XUL panel, not native Zen',checks,details};
await writeFile(new URL('report.json',out),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
if(Object.values(checks).some(value=>!value))process.exitCode=1;
