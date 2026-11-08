// Test-only I/O seam, loaded by Sine before either real mod. Neither mod's bytes
// are edited. Normal requests keep their original fetch implementation.
(()=>{
 const expected=/* EXPECTED_PROFILE */;
 const actual=Services.dirsvc.get('ProfD',Ci.nsIFile).path.replace(/^\\\\\?\\/,'');
 if(actual.toLowerCase()!==expected.toLowerCase())throw new Error('Wrong dictionary fixture profile');
 const original=window.fetch.bind(window),requests=[];
 const root=document.getElementById('contentAreaContextMenu');
 const menu=document.createXULElement('menu');menu.id='cme-foreign-fixture-menu';menu.setAttribute('label','Foreign tools');
 const popup=document.createXULElement('menupopup');menu.append(popup);
 const command=document.createXULElement('menuitem');command.id='cme-foreign-fixture-command';command.setAttribute('label','Fixture action');popup.append(command);
 const events=[];
 menu.addEventListener('popupshowing',()=>events.push('show'));
 command.addEventListener('command',event=>events.push({id:command.id,trusted:event.isTrusted}));
 root.append(menu);
 window.__cmeDictionaryFixture={requests,events,addLateSubmenu(){
  const late=document.createXULElement('menu');late.id='cme-late-foreign-menu';late.setAttribute('label','Late foreign tools');
  const popup=document.createXULElement('menupopup');late.append(popup);
  const child=document.createXULElement('menuitem');child.id='cme-late-foreign-child';child.setAttribute('label','Late foreign action');popup.append(child);
  root.append(late);return late;
 }};
 window.fetch=(input,options)=>{
  const url=new URL(typeof input==='string'?input:input.url);
  if(url.hostname!=='en.wiktionary.org'||url.pathname!=='/w/api.php')return original(input,options);
  requests.push({action:url.searchParams.get('action'),page:url.searchParams.get('page')});
  const data=url.searchParams.get('action')==='parse'
   ?{parse:{title:'browser',text:'<h2>English</h2><h3>Noun</h3><ol><li>A program used to view websites. Disposable integration fixture.</li></ol>'}}
   :{query:{prefixsearch:[],search:[],pages:[],searchinfo:{}}};
  return Promise.resolve(new window.Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}}));
 };
})();
