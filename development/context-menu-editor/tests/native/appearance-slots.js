const {browser:w,Services,waitFor,pause,nativeEvent,sourceURI}=ctx;
const editor=await waitFor(()=>w.__contextMenuEditor?.controller&&w.__contextMenuEditor,'editor');
const root=w.document.getElementById('tabContextMenu'),checks={},details={cases:[]},fixtures=[];
const resource=Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler);
resource.setSubstitution('cme-slots',Services.io.newURI(sourceURI));
const model=ChromeUtils.importESModule('resource://cme-slots/src/model.mjs');
const patch=value=>Cu.getGlobalForObject(model.createState).JSON.parse(JSON.stringify(value));
const read=()=>model.parseState(editor.store.read().raw),save=state=>editor.store.save(w.JSON.parse(model.serializeState(state)),editor.store.read().raw);
const box=node=>{const r=node?.getBoundingClientRect();return r?{left:r.left,top:r.top,width:r.width,height:r.height,right:r.right}:null;};
const shown=node=>Boolean(node&&box(node).width>0&&box(node).height>0&&w.getComputedStyle(node).display!=='none'&&w.getComputedStyle(node).visibility==='visible');
const slot=node=>node.querySelector(':scope > .menu-icon');
async function close(){root.hidePopup();await pause(90);}
async function open(){
 const tab=w.gBrowser.selectedTab,r=tab.getBoundingClientRect();
 await nativeEvent.synthesizeMouseAtPoint(r.x+r.width/2,r.y+r.height/2,{type:'contextmenu',button:2},w);
 await waitFor(()=>root.state==='open','native menu');await pause(140);
}
try{
 for(const kind of ['plain','checkbox','radio','owner']){
  const row=w.document.createXULElement('menuitem');row.id='cme-slots-'+kind;row.setAttribute('label','Appearance '+kind);
  row.classList.add('menuitem-iconic');row.setAttribute('image','chrome://browser/skin/edit-copy.svg');
  if(['checkbox','radio'].includes(kind)){row.setAttribute('type',kind);row.setAttribute('checked','true');}
  root.append(row);fixtures.push(row);
 }
 await open();const inventory=editor.controller.getInventory().find(x=>x.id===root.id).items;
 let state=model.mergeInventory(model.createState(),root.id,patch(inventory));
 // Keep the native fixture menu short enough to expose all status slots.
 for(const item of inventory)if(!item.key.startsWith('cme-slots-'))state=model.updateItem(state,root.id,item.key,patch({hidden:true}));
 state=model.updateItem(state,root.id,'cme-slots-owner',patch({iconOwner:true}));save(state);await close();
 for(const [size,alignment,gap,icons]of [[12,'left',0,true],[12,'center',16,true],[12,'right',8,true],[24,'center',16,true],[16,'center',8,false]]){
  state=read();Object.assign(state.options,{iconSize:size,iconAlignment:alignment,iconGap:gap,showIcons:icons});save(state);
  await open();const name=`size${size}_${alignment}_gap${gap}_${icons?'on':'off'}`;
  const [plain,checkbox,radio,owner]=fixtures,deco=plain.querySelector(':scope > .cme-decoration'),image=deco?.querySelector('img');
  const label=[...plain.children].find(n=>n.matches('label.menu-text,label.menu-iconic-text'));
  const d=box(deco),i=box(image),l=box(label);
  checks[name+'_nativeStatusSlotsVisible']=[checkbox,radio].every(row=>shown(slot(row))&&row.getAttribute('checked')==='true');
  checks[name+'_ownerIconRetained']=shown(slot(owner))&&!owner.querySelector(':scope > .cme-decoration');
  if(icons){
   const expected=alignment==='left'?0:alignment==='right'?d.width-i.width:(d.width-i.width)/2;
   checks[name+'_sizeAndAlignment']=shown(image)&&Math.abs(i.width-size)<.6&&Math.abs(i.height-size)<.6&&Math.abs(i.left-d.left-expected)<.6;
   checks[name+'_gapApplied']=Math.abs(l.left-d.right-gap)<.6;
   checks[name+'_decorativeSlotCollapsed']=!shown(slot(plain));
  }else{
   checks[name+'_iconsOff']=!deco&&!shown(slot(plain));
  }
  details.cases.push({name,deco:d,image:i,label:l,status:fixtures.map(row=>({id:row.id,slot:box(slot(row)),display:slot(row)&&w.getComputedStyle(slot(row)).display,visibility:slot(row)&&w.getComputedStyle(slot(row)).visibility}))});
  await close();
 }
 return {checks,details};
}catch(error){checks.completed=false;details.error=String(error);details.stack=error.stack;return {checks,details};}
finally{await close();for(const row of fixtures)row.remove();resource.setSubstitution('cme-slots',null);}
