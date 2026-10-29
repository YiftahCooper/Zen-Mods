import {AREA_KEY,parseAreaState,clampRatio} from './state.mjs';
export function rootOf(node) {
  let root=node;
  for(let parent=node?.parentElement;parent;parent=parent.parentElement) {
    if(parent.localName==='zen-folder'||parent.localName==='tab-group'&&parent.hasAttribute?.('split-view-group')) root=parent;
  }
  return root;
}
export function areaOf(node) {
  if(node?.closest?.('.zen-workspace-normal-tabs-section')) return 'lower';
  if(node?.closest?.('.zen-workspace-pinned-tabs-section')) return 'upper';
  return null;
}
export function orderedRoots(nodes,ids) {
  const byId=new Map(nodes.map(node=>[node.id,node]));
  const ordered=ids.map(id=>byId.get(id)).filter(Boolean);
  return [...ordered,...nodes.filter(node=>!ordered.includes(node))];
}
export class Zones {
  constructor(controller) { this.c=controller;this.host=controller.host;this.dividers=new Map();this.fallback=new Set(); }
  spaces() { return [...this.host.document.querySelectorAll('zen-workspace')].filter(s=>s.pinnedTabsContainer&&s.tabsContainer); }
  roots(container) { return [...container.children].filter(n=>['tab','zen-folder','tab-group'].includes(n.localName)&&n.id&&!n.hasAttribute('zen-essential')&&!n.hasAttribute('zen-empty-tab')); }
  space(node) { return node?.closest?.('zen-workspace'); }
  key(space) { return space.getAttribute('id')||space.getAttribute('workspace-id'); }
  anchor(container) { return [...container.children].find(n=>n.classList?.contains('pinned-tabs-container-separator')||n.id==='tabbrowser-arrowscrollbox-periphery')??null; }
  place(node,container,before=null) {
    const anchor=before?.parentNode===container?before:this.anchor(container);
    if(node!==anchor) container.insertBefore(node,anchor);
  }
  start() {
    const raw=this.host.SessionStore.getCustomWindowValue(this.host,AREA_KEY);
    this.state=parseAreaState(raw);
    if(!this.state) throw Error('Unsupported or damaged Better Pins zone metadata; left unchanged');
    if(!raw)for(const win of this.host.Services.wm.getEnumerator('navigator:browser')){
      if(win!==this.host&&win.gZenWindowSync===this.host.gZenWindowSync&&win.__betterPinsController?.zones?.active){
        this.state=JSON.parse(JSON.stringify(win.__betterPinsController.zones.state));
        this.host.SessionStore.setCustomWindowValue(this.host,AREA_KEY,JSON.stringify(this.state));break;
      }
    }
    this.active=true;
    this.project();this.layout();
    this.resize=new this.host.ResizeObserver(()=>this.layout());
    this.resize.observe(this.host.document.getElementById('tabbrowser-arrowscrollbox'));
    this.onRestore=()=>{if(this.active){this.project();this.layout();}};
    for(const event of ['SSTabRestored','ZenWorkspaceChanged']) this.host.addEventListener(event,this.onRestore);
  }
  project() {
    for(const space of this.spaces()) {
      const saved=this.state.spaces[this.key(space)];if(!saved)continue;
      const nodes=[...this.roots(space.pinnedTabsContainer),...this.roots(space.tabsContainer)];
      for(const [zone,container]of [['upper',space.pinnedTabsContainer],['lower',space.tabsContainer]]) {
        const ordered=saved[zone].map(id=>nodes.find(n=>n.id===id)).filter(node=>node&&this.c.supportedTree(node));
        let before=this.roots(container).find(node=>!ordered.includes(node))??null;
        for(const node of ordered.reverse()) {
          // Root tab native membership is reconciled only by explicit moves.
          // Restore projects placement; it never creates absent folder/tab IDs.
          this.place(node,container,before);before=node;
          if(zone==='lower'&&node.localName==='zen-folder')this.fallback.add(node);
        }
      }
    }
  }
  snapshot() {
    const spaces={};
    for(const space of this.spaces()) spaces[this.key(space)]={upper:this.roots(space.pinnedTabsContainer).map(n=>n.id),lower:this.roots(space.tabsContainer).map(n=>n.id)};
    return {schema:1,spaces};
  }
  save() {
    const state=this.snapshot(),raw=JSON.stringify(state);
    const participants=[{win:this.host,zones:this}];
    for(const win of this.host.Services.wm.getEnumerator('navigator:browser'))if(win!==this.host&&win.__betterPinsController?.zones?.active&&win.gZenWindowSync===this.host.gZenWindowSync)participants.push({win,zones:win.__betterPinsController.zones});
    const previous=participants.map(({win,zones})=>{
      const oldRaw=win.SessionStore.getCustomWindowValue(win,AREA_KEY)??'';
      if(!parseAreaState(oldRaw))throw Error('Peer has unsupported zone metadata');
      const positions=zones.spaces().flatMap(space=>[...zones.roots(space.pinnedTabsContainer),...zones.roots(space.tabsContainer)]).map(node=>({node,parent:node.parentNode,next:node.nextSibling}));
      return {win,zones,oldRaw,state:zones.state,positions};
    });
    const attempted=[];
    try{
      for(const entry of previous){attempted.push(entry);entry.win.SessionStore.setCustomWindowValue(entry.win,AREA_KEY,raw);if(entry.win.SessionStore.getCustomWindowValue(entry.win,AREA_KEY)!==raw)throw Error('Zone save verification failed');}
      for(const entry of previous){entry.zones.state=JSON.parse(raw);if(entry.win!==this.host)entry.zones.project();}
    }catch(cause){
      const failures=[];
      for(const entry of attempted.reverse())try{
        const current=entry.win.SessionStore.getCustomWindowValue(entry.win,AREA_KEY)??'';
        if(current!==raw&&current!==entry.oldRaw)throw Error('Zone rollback lost ownership');
        entry.win.SessionStore.setCustomWindowValue(entry.win,AREA_KEY,entry.oldRaw);
        if(entry.win.SessionStore.getCustomWindowValue(entry.win,AREA_KEY)!==entry.oldRaw)throw Error('Zone rollback failed');
      }catch(error){failures.push(error);}
      for(const entry of previous){entry.zones.state=entry.state;if(entry.win!==this.host)for(const pos of entry.positions.reverse())if(pos.node.isConnected)pos.parent.insertBefore(pos.node,pos.next?.parentNode===pos.parent?pos.next:null);}
      if(failures.length)throw new AggregateError([cause,...failures],'Zone save left uncertain state');
      throw cause;
    }
  }
  async move(item,zone,before=null) {
    if(!this.active||!['upper','lower'].includes(zone))return {ok:false,reason:'inactive'};
    const root=rootOf(item),space=this.space(root);
    if(!space||!this.c.supportedTree(root))return {ok:false,reason:'unsupported-tree'};
    const tabs=(root.localName==='tab'?[root]:[...(root.tabs??[])]).filter(t=>!t.hasAttribute('zen-empty-tab'));
    if(tabs.some(t=>this.c.policy.busy.has(t)))return {ok:false,reason:'busy'};
    if(tabs.some(t=>this.c.policy.blocked(t)))return {ok:false,reason:'url-state-unavailable'};
    const parent=root.parentNode,next=root.nextSibling,oldPinned=root.pinned;
    const baselines=tabs.map(tab=>[tab,this.c.adapters.getSavedBaseline(tab)]);
    try {
      if(root.localName==='tab')this.host.gBrowser[zone==='upper'?'pinTab':'unpinTab'](root);
      this.place(root,zone==='upper'?space.pinnedTabsContainer:space.tabsContainer,before);
      for(const [tab,baseline]of baselines)if(baseline)this.c.adapters.setSavedBaseline(tab,baseline);
      this.save();
      if(root.localName==='zen-folder'&&zone==='lower')this.fallback.add(root);
      this.c.presentation?.refresh();return {ok:true};
    } catch(error) {
      if(root.localName==='tab'&&root.pinned!==oldPinned)this.host.gBrowser[oldPinned?'pinTab':'unpinTab'](root);
      parent.insertBefore(root,next?.parentNode===parent?next:null);
      for(const [tab,baseline]of baselines)if(baseline)this.c.adapters.setSavedBaseline(tab,baseline);
      this.c.reportError(error);return {ok:false,reason:'zone-save-failed'};
    }
  }
  layout() {
    if(!this.active)return;
    for(const space of this.spaces()) {
      const upper=space.pinnedTabsContainer,lower=space.tabsContainer;
      let divider=this.dividers.get(space);
      if(!divider) {
        divider=this.host.document.createElementNS('http://www.w3.org/1999/xhtml','div');
        divider.className='better-pins-divider';divider.tabIndex=0;
        for(const[k,v]of Object.entries({role:'separator','aria-orientation':'horizontal','aria-label':'Upper and lower tab zones','aria-valuemin':'0','aria-valuemax':'100'}))divider.setAttribute(k,v);
        lower.before(divider);this.dividers.set(space,divider);
        const set=ratio=>{const h=this.height(space);this.ratio=clampRatio(ratio,h);this.host.Services.prefs.setIntPref('better-pins.upper-percent',Math.round(this.ratio*100));this.layout();};
        divider.addEventListener('keydown',e=>{
          const current=this.ratio??.5;
          const delta=e.shiftKey?.1:.025;
          const value={ArrowUp:current-delta,ArrowDown:current+delta,Home:0,End:1}[e.key];
          if(value!==undefined){e.preventDefault();e.stopPropagation();set(value);}
        });
        divider.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();divider.setPointerCapture(e.pointerId);divider._drag=e.pointerId;});
        divider.addEventListener('pointermove',e=>{if(divider._drag!==e.pointerId)return;set((e.clientY-upper.getBoundingClientRect().top)/this.height(space));});
        const end=e=>{if(divider._drag===e.pointerId){divider._drag=null;if(divider.hasPointerCapture(e.pointerId))divider.releasePointerCapture(e.pointerId);}};
        divider.addEventListener('pointerup',end);divider.addEventListener('pointercancel',end);
      }
      const height=this.height(space);if(height<1)continue;
      const ratio=clampRatio(this.host.Services.prefs.getIntPref('better-pins.upper-percent',50)/100,height);
      this.ratio=ratio;
      const first=Math.round(height*ratio),second=Math.max(1,height-first);
      space.style.setProperty('--better-pins-upper-height',first+'px');
      space.style.setProperty('--better-pins-lower-height',second+'px');
      divider.setAttribute('aria-valuenow',String(Math.round(ratio*100)));
      divider.setAttribute('aria-valuetext',`Upper ${Math.round(ratio*100)} percent, lower ${Math.round((1-ratio)*100)} percent`);
    }
  }
  height(space) { return Math.max(0,(space.querySelector('arrowscrollbox.workspace-arrowscrollbox')?.getBoundingClientRect().height??0)-10-(Number.parseFloat(space.style.getPropertyValue('--better-pins-button-height'))||0)); }
  destroy() {
    this.active=false;this.resize?.disconnect();
    for(const e of ['SSTabRestored','ZenWorkspaceChanged'])this.host.removeEventListener(e,this.onRestore);
    for(const folder of this.fallback)if(folder.isConnected&&areaOf(folder)==='lower'){
      const space=this.space(folder);if(space)this.place(folder,space.pinnedTabsContainer);
    }
    for(const [space,divider]of this.dividers){divider.remove();space.style.removeProperty('--better-pins-upper-height');space.style.removeProperty('--better-pins-lower-height');}
    this.dividers.clear();
  }
}
