import {
  createState, mergeInventory, pruneUnsavedAbsentRows, moveItem, updateItem, addSubmenu, addSeparator,
  removeItem, restoreItem, resetRoot, restoreOriginalOrder, validatePlacement,
} from './model.mjs';
import {textIcon} from './icons.mjs';
import {appendFittedSymbol,fitSymbol} from './icon-view.mjs';

const HTML = 'http://www.w3.org/1999/xhtml';
const DRAG_TYPE = 'application/x-context-menu-editor';

/** One editable tree. Inventory and transient drafts never write on mount. */
export function createSettingsUI(window, {store, registry, icons}) {
  const document = window.document;
  const node = (tag, text, attributes = {}) => {
    const el = document.createElementNS(HTML, tag);
    if (text !== undefined && text !== null) el.textContent = text;
    for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, String(value));
    return el;
  };
  const element = node('div', null, {class:'cme-settings', 'data-cme-settings':''});
  function iconImage(src,fallbackSrc) {
    const image=node('img',null,{src,alt:''});
    if(fallbackSrc)image.addEventListener('error',()=>{image.src=fallbackSrc;},{once:true});
    return image;
  }
  const status = node('p', '', {class:'cme-status', role:'status', 'aria-live':'polite', 'data-cme-status':''});
  const ownerToken = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  status.id=`cme-${ownerToken}-status`;
  const expanded = new Set();
  let currentRoot = '', inventory = [], view, expectedRaw, readError, revision = 0;
  let destroyed = false, draft = null, tree = null, query = '', matchIndex = 0, selected = null;
  let dragged = null, autoscroll = null, scrollDirection = 0, statusMessage = '', sequence = 0;
  let inventoryFingerprint = '', inventoryDeferred = false, deferredRefresh = null;
  let popover = null, findOpen = false;
  const fitSymbols=()=>element.querySelectorAll('.cme-symbol').forEach(symbol=>fitSymbol(window,symbol));
  const symbolResize=typeof window.ResizeObserver==='function'?new window.ResizeObserver(fitSymbols):null;
  symbolResize?.observe(element);

  function announce(message) { statusMessage = message; status.textContent = message;const feedback=popover?.element.querySelector('[data-cme-feedback]');if(feedback)feedback.textContent=message; }
  function button(text, handler, attrs = {}) {
    const result = node('button', text, {type:'button', ...attrs});
    result.addEventListener('click', handler);
    return result;
  }
  function rootInfo() { return inventory.find(root => root.id === currentRoot); }
  function descriptors() { return rootInfo()?.items || []; }
  function records() { return view?.roots[currentRoot]?.records || {}; }
  function labelFor(key) {
    const record = records()[key], descriptor = descriptors().find(item => item.key === key);
    const raw=descriptor?.label,label=raw===key?raw.replace(/^context[-_]?(?:viewsource[-_])?/i,'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' '):raw;
    return record?.name || (label?label[0].toLocaleUpperCase()+label.slice(1):'') || (record?.kind === 'separator' ? 'Separator' : record?.kind === 'submenu' ? 'Submenu' : 'Unavailable command');
  }
  function parentOf(key) {
    const root = view?.roots[currentRoot];
    if (!root) return null;
    for (const [parent, record] of Object.entries(root.records)) if (record.children?.includes(key)) return parent;
    return null;
  }
  function childrenOf(parent) { return parent === null ? view.roots[currentRoot].children : records()[parent]?.children || []; }
  function cancelDraft() {
    if (!draft) return;
    draft.controller?.abort(); const editor=draft.element; draft = null;
    if(popover?.element===editor)closePopover(false);else editor.remove();
  }
  function rowFor(key) { return [...element.querySelectorAll('[data-cme-key]')].find(row=>row.dataset.cmeKey===key); }
  function closePopover(restore=true) {
    const old=popover;if(!old)return;popover=null;
    if(draft?.element===old.element){draft.controller?.abort();draft=null;flushDeferredInventory();}
    old.trigger?.setAttribute('aria-expanded','false');
    if(typeof old.element.hidePopover==='function')old.element.hidePopover();
    old.element.remove();if(restore&&old.trigger?.isConnected)old.trigger.focus();flushDeferredInventory();
  }
  function positionPopover() {
    if(!popover)return;
    const {element:panel,trigger}=popover,bounds=trigger.getBoundingClientRect();
    const width=Math.max(0,Math.min(popover.width,window.innerWidth-24)),height=window.innerHeight-24;
    panel.style.width=`${width}px`;panel.style.maxHeight=`${height}px`;
    const measured=panel.getBoundingClientRect(),below=window.innerHeight-bounds.bottom-12;
    const top=measured.height<=below?bounds.bottom+5:Math.max(12,bounds.top-measured.height-5);
    panel.style.left=`${Math.max(12,Math.min(bounds.left,window.innerWidth-width-12))}px`;
    panel.style.top=`${Math.min(top,Math.max(12,window.innerHeight-measured.height-12))}px`;
  }
  function openPopover(kind,trigger,title,{key=null,width=330,panel=null}={}) {
    closePopover(false);
    const popup=panel||node('div');popup.classList.add('cme-popover');
    popup.setAttribute('data-cme-popover',kind);popup.setAttribute('popover','manual');popup.setAttribute('role','dialog');
    if(key)popup.dataset.popoverKey=key;
    popup.setAttribute('aria-label',title);popup.id=`cme-${ownerToken}-popup`;
    const heading=node('div',null,{class:'cme-popover-heading'});
    heading.append(node('h3',title),button('×',()=>closePopover(),{'aria-label':'Close panel',class:'cme-close'}));popup.prepend(heading);
    trigger?.setAttribute('aria-expanded','true');trigger?.setAttribute('aria-controls',popup.id);
    popover={kind,key,element:popup,trigger,width};element.append(popup);
    // The top layer escapes Sine's scrolling dialog, including on small windows.
    if(typeof popup.showPopover==='function')popup.showPopover();
    positionPopover();return popup;
  }
  function focusPopover() { (popover?.element.querySelector('button:not(:disabled):not(.cme-close),input:not(:disabled),select:not(:disabled)')||popover?.element.querySelector('.cme-close'))?.focus();positionPopover(); }
  function outsidePointer(event) { if(popover&&!popover.element.contains(event.target)&&!popover.trigger?.contains(event.target))closePopover(false); }
  function popupKey(event) {
    if(!popover)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closePopover();return;}
    if(!popover.element.contains(event.target))return;
    // Action lists support arrow keys as well as ordinary Tab navigation.
    if(['actions','add','move','removed'].includes(popover.kind)&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&event.target.localName!=='select'){
      const controls=[...popover.element.querySelectorAll('button:not(:disabled):not(.cme-close),select:not(:disabled)')];
      let index=controls.indexOf(document.activeElement);index=event.key==='Home'?0:event.key==='End'?controls.length-1:(index+(event.key==='ArrowUp'?-1:1)+controls.length)%controls.length;
      event.preventDefault();controls[index]?.focus();
    }
  }
  document.addEventListener('pointerdown',outsidePointer,true);document.addEventListener('keydown',popupKey,true);
  window.addEventListener('resize',positionPopover);document.addEventListener('scroll',positionPopover,true);
  function editedKeys() {
    const keys=draft?[draft.key]:[];
    for(const input of element.querySelectorAll('[data-action="name"]')) {
      keys.push(input.closest('[data-cme-key]').dataset.cmeKey);
    }
    return keys;
  }
  function sameIdentity(key,nextInventory) {
    const nextRoot=nextInventory.find(root=>root.id===currentRoot);
    if(!nextRoot)return false;
    const record=records()[key];
    if(record?.kind==='submenu' || (record?.kind==='separator' && record.owned))return true;
    const before=descriptors().find(item=>item.key===key),after=nextRoot.items.find(item=>item.key===key);
    if(!before)return !after || after.kind===record?.kind;
    return Boolean(after && before.kind===after.kind && before.nativeId===after.nativeId);
  }
  function flushDeferredInventory() {
    if(!inventoryDeferred || deferredRefresh!==null || destroyed)return;
    // Let blur finish before rebuilding: a following click may open a new draft.
    deferredRefresh=window.setTimeout(()=>{deferredRefresh=null;if(inventoryDeferred)refresh();},0);
  }
  function stopScroll() { if (autoscroll !== null) window.clearInterval(autoscroll); autoscroll = null;scrollDirection=0; }
  function clearDrag() {
    stopScroll(); dragged = null;element.classList.remove('cme-dragging');
    element.querySelectorAll('.cme-drop-active').forEach(el => el.classList.remove('cme-drop-active'));
  }
  function capturedFocus() {
    const active = document.activeElement;
    if (!element.contains(active)) return null;
    return {id:active.dataset?.focus, start:active.selectionStart, end:active.selectionEnd};
  }
  function restoreFocus(focus, fallbackKey) {
    const target = focus?.id ? [...element.querySelectorAll('[data-focus]')].find(el => el.dataset.focus === focus.id) : null;
    const fallback = fallbackKey ? rowFor(fallbackKey)?.querySelector('[data-action="label"]') : null;
    const control = target || fallback;
    control?.focus();
    if (target && typeof focus.start === 'number' && target.setSelectionRange) {
      try { target.setSelectionRange(focus.start, focus.end); } catch { /* selects and checkboxes have no selection */ }
    }
  }
  function commit(transform, message, fallbackKey) {
    if (destroyed) return false;
    if (readError) { announce('Reset saved settings before making changes.'); return false; }
    const focus = capturedFocus(), raw = expectedRaw, reopen=['appearance','options','removed'].includes(popover?.kind)?popover.kind:null,moreOpen=popover?.element.querySelector('.cme-appearance-more')?.open;
    try {
      // Drafts can defer visual discovery, but a completed action always uses
      // fresh descriptors for discovery, native boundaries and owner groups.
      inventory=registry.getInventory() || [];
      let merged=view;
      for(const root of inventory)merged=mergeInventory(merged,root.id,root.items);
      let next = transform(merged);
      // Every save includes the discovered view; guard all inventoried roots,
      // including structural additions which do not go through moveItem.
      for (const root of inventory) next = validatePlacement(next, root.id, root.items);
      // Remembered rows that are absent now are shown for editing, but saved
      // only once they carry an edit (B4).
      next = pruneUnsavedAbsentRows(next, store.read().state, merged, inventory);
      store.save(next, raw);
      refresh(true);if(reopen){openTopPanel(reopen);const more=popover?.element.querySelector('.cme-appearance-more');if(more)more.open=Boolean(moreOpen);positionPopover();}announce(message); restoreFocus(focus, fallbackKey);
      return true;
    } catch (error) { refresh(true); announce(error.message || 'Could not save this change.'); return false; }
  }
  function itemChange(key, patch, message = 'Item updated.') {
    return commit(state => updateItem(state, currentRoot, key, patch), message, key);
  }
  function optionControl(parent, key, label, help, kind = 'checkbox', values) {
    const group = node('div', null, {class:'cme-setting'}), title = node('label', label);
    const id = `cme-${ownerToken}-${key}`; title.htmlFor = id;
    let control;
    if (kind === 'select') {
      control = node('select');
      for (const [value, text] of values) control.append(node('option', text, {value}));
      control.value = String(view.options[key]);
    } else {
      control = node('input', null, {type:kind});
      if (kind === 'checkbox') control.checked = Boolean(key==='hideUnavailable'?view.roots[currentRoot]?.hideUnavailable??view.options[key]:view.options[key]);
      else { control.value = String(view.options[key]); control.min = values[0]; control.max = values[1]; control.step = values[2] || 1; }
    }
    control.id = id; control.dataset.option = key; control.dataset.focus = `option:${key}`;
    control.setAttribute('aria-describedby', `${id}-help`);
    control.addEventListener('change', () => {
      const value = kind === 'checkbox' ? control.checked : kind === 'number' ? Number(control.value) : control.value;
      commit(state => {
        if(key==='hideUnavailable')return {...state,roots:{...state.roots,[currentRoot]:{...state.roots[currentRoot],hideUnavailable:value}}};
        const next={...state,options:{...state.options,[key]:value}};
        if(['showIcons','iconPack','iconSize','iconAlignment','iconGap','monochromeExtensions'].includes(key)){
          next.roots=Object.fromEntries(Object.entries(state.roots).map(([id,root])=>[id,{...root,records:Object.fromEntries(Object.entries(root.records).map(([item,record])=>{const copy={...record};delete copy.iconOwner;return[item,copy];}))}]));
        }return next;
      }, `${label} updated.`);
    });
    group.append(title, control, node('p', help, {class:'cme-help', id:`${id}-help`})); parent.append(group);
    return control;
  }

  function move(key, parent, index) {
    if(parent!==null){expanded.add(parent);for(const ancestor of ancestorKeys(parent))expanded.add(ancestor);}
    return commit(state => moveItem(state, currentRoot, key, parent, index, descriptors()), `${labelFor(key)} moved.`, key);
  }
  function keyboardMove(key, offset) {
    const parent = parentOf(key), peers = childrenOf(parent), index = peers.indexOf(key);
    if (index + offset < 0 || index + offset >= peers.length) return;
    move(key, parent, index + offset);
  }
  function ancestorKeys(key) {
    const result = [], seen = new Set();
    for (let parent = parentOf(key); parent !== null && !seen.has(parent); parent = parentOf(parent)) {
      seen.add(parent); result.push(parent);
    }
    return result;
  }
  function applyFind(scroll = true) {
    const search = query.trim().toLocaleLowerCase(), rows = [...element.querySelectorAll('[data-cme-key]')];
    const matches = rows.filter(row => {
      const key=row.dataset.cmeKey,source=descriptors().find(item=>item.key===key)?.source?.name||'';
      return search && `${labelFor(key)} ${source}`.toLocaleLowerCase().includes(search);
    });
    rows.forEach(row => row.classList.toggle('cme-match', matches.includes(row)));
    for (const row of matches) for (const key of ancestorKeys(row.dataset.cmeKey)) expanded.add(key);
    updateExpanded();
    matchIndex = matches.length ? ((matchIndex % matches.length) + matches.length) % matches.length : 0;
    rows.forEach(row => row.classList.toggle('cme-current-match', row === matches[matchIndex]));
    const count = element.querySelector('[data-cme-find-count]');
    if (count) count.textContent = search ? `${matches.length ? matchIndex + 1 : 0} of ${matches.length}` : '';
    if (scroll) matches[matchIndex]?.scrollIntoView?.({block:'nearest'});
  }
  function updateExpanded() {
    for (const row of element.querySelectorAll('[data-cme-key]')) {
      row.hidden = ancestorKeys(row.dataset.cmeKey).some(key => !expanded.has(key));
      const toggle = row.querySelector('[data-action="expand"]');
      if (toggle) { const open = expanded.has(row.dataset.cmeKey); toggle.textContent = open ? '▾' : '▸'; toggle.setAttribute('aria-expanded', String(open)); }
      const inside = row.querySelector('[data-drop="inside"]');
      if (inside) inside.hidden = !expanded.has(row.dataset.cmeKey);
    }
    fitSymbols();
  }
  function decorateIcon(target, descriptor, record) {
    target.replaceChildren();
    try {
      const resolved = icons.resolve(descriptor, {...record,showIcon:true}, {...view.options,showIcons:true});
      if (resolved?.type === 'image') target.append(iconImage(resolved.src,resolved.fallbackSrc));
      else appendFittedSymbol(window,target,resolved?.text||'◇',target.classList.contains('cme-icon-preview')?32:17);
    } catch { target.append(node('span', '◇', {'aria-hidden':'true'})); }
  }
  function dragStart(event, key) {
    if (!event.dataTransfer) return;
    closePopover(false);cancelDraft();element.classList.add('cme-dragging');dragged = {token:ownerToken, revision, root:currentRoot, key, raw:expectedRaw};
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(dragged)); event.dataTransfer.effectAllowed = 'move';
    selected = key;
  }
  function validDrop(event) {
    try {
      const value = JSON.parse(event.dataTransfer?.getData(DRAG_TYPE) || '{}');
      return dragged && value.token === ownerToken && value.revision === revision && value.root === currentRoot && value.key === dragged.key && value.raw === expectedRaw ? value : null;
    } catch { return null; }
  }
  function dropTarget(row, key, edge) {
    const area = node('div', edge === 'inside' ? 'Move inside' : '', {class:`cme-drop cme-drop-${edge}`, 'data-drop':edge});
    area.addEventListener('dragover', event => {
      if (!dragged || dragged.revision !== revision || dragged.root !== currentRoot) return;
      event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move';
      element.querySelectorAll('.cme-drop-active').forEach(el => el.classList.remove('cme-drop-active')); area.classList.add('cme-drop-active');
    });
    area.addEventListener('dragleave', () => area.classList.remove('cme-drop-active'));
    area.addEventListener('drop', event => {
      event.preventDefault(); event.stopPropagation(); const data = validDrop(event); clearDrag();
      if (!data) { announce('This drag is out of date. Try again.'); return; }
      if (data.key === key) return;
      const parent = edge === 'inside' ? key : parentOf(key);
      const peers = childrenOf(parent);
      let index = edge === 'inside' ? peers.length : peers.indexOf(key) + (edge === 'after' ? 1 : 0);
      // moveItem's index is the final position, after removing the moving row.
      if (parentOf(data.key) === parent && peers.indexOf(data.key) < index) index--;
      move(data.key, parent, index);
    });
    row.append(area);
  }
  function renderRows(parent = null, depth = 0) {
    const root = view.roots[currentRoot]; if (!root) return;
    for (const key of childrenOf(parent)) {
      const record = root.records[key]; if (!record || record.removed) continue;
      const descriptor = descriptors().find(item => item.key === key), label = labelFor(key);
      const row = node('div', null, {class:`cme-row cme-kind-${record.kind}`, 'data-cme-key':key, 'data-parent':parent || ''});
      row.style.setProperty('--cme-depth', depth);
      row.addEventListener('focusin', () => { selected = key;updateAddControls(); });
      dropTarget(row, key, 'before');
      const main = node('div', null, {class:'cme-row-main'});
      const actionButton = (text, action, callback, aria = `${text} ${label}`) => button(text, callback, {'data-action':action, 'data-focus':`${key}:${action}`, 'aria-label':aria});
      const drag = actionButton('⠿', 'drag', () => {}, `Drag ${label}`);drag.draggable = !descriptor?.locked;drag.disabled=Boolean(descriptor?.locked);drag.title = descriptor?.restriction || 'Drag to move';
      drag.addEventListener('dragstart', event => dragStart(event, key)); drag.addEventListener('dragend', clearDrag);
      main.append(drag);
      const enabled = node('input', null, {type:'checkbox','data-action':'enabled','data-focus':`${key}:enabled`,'aria-label':`Enable ${label}`});
      enabled.checked = !record.hidden; enabled.addEventListener('change', () => itemChange(key, {hidden:!enabled.checked}, `${label} ${enabled.checked ? 'enabled' : 'disabled'}.`)); main.append(enabled);
      if (record.kind !== 'separator') {
        const icon = actionButton('', 'icon', () => openIconEditor(key), `Edit icon for ${label}`);icon.setAttribute('aria-haspopup','dialog');icon.setAttribute('aria-expanded','false'); icon.classList.add('cme-icon-button');icon.classList.toggle('cme-icon-muted',record.showIcon===false||!view.options.showIcons&&!record.iconOwner); decorateIcon(icon, descriptor, record);main.append(icon);
      } else main.append(node('span', '—', {class:'cme-separator-preview','aria-hidden':'true'}));
      const name=actionButton(label,'label',()=>beginRename(key),`Rename ${label}`);name.classList.add('cme-name');name.dataset.focus=`${key}:name`;name.title='Click to rename';
      name.addEventListener('keydown',event=>{if(event.key==='F2'){event.preventDefault();beginRename(key);}});main.append(name);
      const badges = node('span', null, {class:'cme-badges'});
      const source=descriptor?.source,custom=record.kind==='submenu'||(record.kind==='separator'&&record.owned);
      const sourceName=custom?'Custom':source?.kind==='artwork'?`Icon: ${source.name}`:source?.name||'Source unknown';
      const tag=node('span',sourceName,{class:'cme-source','data-cme-source':custom?'custom':source?.id||source?.kind||'unknown','aria-label':`Source: ${sourceName}`,title:sourceName});tag.hidden=custom||source?.kind==='browser';badges.append(tag);
      const unavailable=!descriptor&&!custom?'Not currently available':descriptor?.available===false?'Unavailable here':'';
      if(unavailable)badges.append(node('span',unavailable,{class:'cme-sr-only'}));row.title=unavailable;
      main.append(badges);
      if (record.children) {
        const toggle = actionButton('▸', 'expand', () => { expanded.has(key) ? expanded.delete(key) : expanded.add(key);updateExpanded(); }, `Expand ${label}`);
        toggle.setAttribute('aria-expanded', String(expanded.has(key)));main.append(toggle);
      } else main.append(node('span', '', {class:'cme-expand-placeholder','aria-hidden':'true'}));
      main.append(actionButton('⋯','more',event=>openActions(key,event.currentTarget),`Options for ${label}`));
      main.lastChild.setAttribute('aria-haspopup','dialog');main.lastChild.setAttribute('aria-expanded','false');
      row.classList.toggle('cme-item-hidden',Boolean(record.hidden));row.append(main);
      if (record.kind === 'submenu') dropTarget(row, key, 'inside');
      dropTarget(row, key, 'after');tree.append(row);
      if (record.children) renderRows(key, depth + 1);
    }
  }

  function beginRename(key) {
    closePopover(false);const row=rowFor(key);if(!row)return;
    const existing=row.querySelector('[data-action="name"]');if(existing){existing.focus();existing.select();return;}
    const label=row.querySelector('[data-action="label"]'),value=labelFor(key);
    const input=node('input',null,{type:'text',class:'cme-name','data-action':'name','data-focus':`${key}:name`,'aria-label':`Name for ${value}`,'aria-describedby':status.id,maxlength:256});input.value=value;input.dataset.savedName=value;
    function finish(focus=false){input.value=input.dataset.savedName;if(input.isConnected){input.replaceWith(label);if(focus)label.focus();}flushDeferredInventory();}
    input.addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();const value=input.value.trim()||(records()[key]?.kind==='submenu'?'New submenu':null);itemChange(key,{name:value},'Name saved.');}
      if(event.key==='Escape'){event.preventDefault();finish(true);}
    });input.addEventListener('blur',()=>finish());label.replaceWith(input);input.focus();input.select();announce('Enter to save · Escape to cancel.');
  }
  function openActions(key,trigger=rowFor(key)?.querySelector('[data-action="more"]')) {
    const record=records()[key],label=labelFor(key),descriptor=descriptors().find(item=>item.key===key);
    if(!record||!trigger)return;selected=key;
    const panel=openPopover('actions',trigger,label,{key}),peers=childrenOf(parentOf(key));
    const action=(text,id,callback,disabled=false)=>{const control=button(text,callback,{'data-action':id});control.disabled=disabled;panel.append(control);};
    action('Rename','rename',()=>beginRename(key));
    if(record.kind!=='separator')action('Change icon…','change-icon',()=>openIconEditor(key));
    action('Move up','up',()=>keyboardMove(key,-1),descriptor?.locked||peers.indexOf(key)===0);
    action('Move down','down',()=>keyboardMove(key,1),descriptor?.locked||peers.indexOf(key)===peers.length-1);
    action('Move to…','move',()=>openMove(key,trigger),descriptor?.locked);
    action('Reset name','reset-name',()=>itemChange(key,{name:record.kind==='submenu'?'New submenu':null},'Name reset.'));
    action('Item details…','details',()=>{
      const details=openPopover('details',trigger,label,{key});
      const custom=record.kind==='submenu'||(record.kind==='separator'&&record.owned),source=descriptor?.source;
      details.append(node('p',`Source: ${custom?'Custom':source?.kind==='artwork'?`Icon: ${source.name}`:source?.name||'Source unknown'}`),node('code',descriptor?.nativeId||key));
      if(descriptor?.identity==='mod-label')details.append(node('p','Matched by mod and original label. If its mod changes the label, it appears as a new item.',{class:'cme-help'}));
      if(descriptor?.restriction||descriptor?.locked)details.append(node('p',descriptor.restriction||'This item stays in its original group.',{class:'cme-help'}));
      focusPopover();
    });
    action('Remove','remove',()=>{const fallback=[...element.querySelectorAll('[data-cme-key]')].find(other=>other.dataset.cmeKey!==key&&!other.hidden)?.dataset.cmeKey;commit(state=>removeItem(state,currentRoot,key),`${label} removed.`,fallback);});
    if(descriptor?.restriction||descriptor?.locked)panel.append(node('p',descriptor.restriction||'This item stays in its original group.',{class:'cme-help'}));
    focusPopover();
  }
  function openMove(key,trigger) {
    const panel=openPopover('move',trigger,`Move ${labelFor(key)}`,{key});
    const destinations=node('select',null,{'data-action':'move-to','aria-label':'Destination submenu'});
    destinations.append(node('option','Choose a destination…',{value:''}),node('option','Menu root',{value:'@root'}));
    for(const [candidate,container] of Object.entries(records()))if(container.kind==='submenu'&&!container.removed&&candidate!==key&&!ancestorKeys(candidate).includes(key))destinations.append(node('option',labelFor(candidate),{value:candidate}));
    destinations.addEventListener('change',()=>{if(!destinations.value)return;const target=destinations.value==='@root'?null:destinations.value;move(key,target,childrenOf(target).length-(parentOf(key)===target?1:0));});
    const parent=parentOf(key),toParent=button('Move to parent',()=>{if(parent===null)return;const next=parentOf(parent);move(key,next,childrenOf(next).indexOf(parent)+1);},{'data-action':'move-parent'});toParent.disabled=parent===null;
    panel.append(node('p','Choose a custom submenu or return to the main menu.',{class:'cme-help'}),destinations,toParent);focusPopover();
  }

  function addContext() {
    const parent=selected && records()[selected]?.children ? selected : selected ? parentOf(selected) : null;
    let blocked;
    for(const key of parent===null?[]:[parent,...ancestorKeys(parent)]) {
      const descriptor=descriptors().find(item=>item.key===key);
      if(records()[key]?.kind==='native-menu' && descriptor?.locked){blocked=descriptor.restriction || 'This group keeps its native children.';break;}
    }
    return {parent,blocked};
  }
  function updateAddControls() {
    const {blocked}=addContext();
    for(const button of element.querySelectorAll('[data-cme-add]')){button.disabled=!view.roots[currentRoot] || Boolean(blocked);button.title=blocked || '';}
    const help=element.querySelector('[data-cme-add-help]');if(help){help.textContent=blocked || 'Add after the selected item, or inside its submenu.';}
  }
  function add(kind) {
    const {parent,blocked}=addContext();if(blocked){announce(blocked);return;}
    const peers = childrenOf(parent), index = selected && peers.includes(selected) ? peers.indexOf(selected) + 1 : peers.length;
    const key = `custom-${kind}-${window.crypto?.randomUUID?.() || `${Date.now()}-${++sequence}`}`;
    const success = commit(state => kind === 'submenu' ? addSubmenu(state,currentRoot,'New submenu',parent,index,key) : addSeparator(state,currentRoot,parent,index,key), `${kind === 'submenu' ? 'Submenu' : 'Separator'} added.`, key);
    if (success) { expanded.add(key);for(const ancestor of ancestorKeys(key))expanded.add(ancestor);updateExpanded();selected = key;if(kind==='submenu')beginRename(key);else rowFor(key)?.querySelector('[data-action="label"]')?.focus(); }
  }

  function openIconEditor(key) {
    cancelDraft();const row = [...element.querySelectorAll('[data-cme-key]')].find(el => el.dataset.cmeKey === key);if (!row) return;
    const record = records()[key], label = labelFor(key), editor = node('div', null, {class:'cme-icon-editor','data-icon-editor':'',role:'group','aria-label':`Icon for ${label}`});
    draft = {key, raw:expectedRaw, revision, value:record.icon, show:record.showIcon !== false, element:editor, controller:null, pending:false, valid:true};
    const local = draft;
    editor.append(node('p',record.iconOwner?'This icon follows its mod. Save here to change it again.':view.options.showIcons?'Choose an icon, then save.':'Choose an icon, then save. Icons are off in Appearance.',{class:'cme-help'}));
    const preview = node('div',null,{class:'cme-icon-preview','aria-label':'Icon preview'});
    const draw = () => { preview.replaceChildren();const value=local.value;
      if (value?.kind === 'text') appendFittedSymbol(window,preview,value.text,32);
      else if (value?.kind === 'image') preview.append(iconImage(value.data));
      else if (value?.kind === 'asset') {const asset=icons.catalog().find(item=>item.pack===value.pack&&item.id===value.id);if(asset)preview.append(iconImage(asset.src,asset.fallbackSrc));}
      else decorateIcon(preview,descriptors().find(item=>item.key===key),{...record,icon:undefined});
    };
    const draftButton = (text,action,callback) => button(text,callback,{'data-icon-action':action,'aria-label':`${text} icon for ${label}`});
    const automatic=draftButton('Automatic','automatic',()=>{local.controller?.abort();local.pending=false;local.value=undefined;local.valid=true;local.error='';draw();announce('Suggested icon selected. Choose Save icon.');});
    const reset=draftButton('Reset icon','reset',()=>{local.controller?.abort();local.pending=false;local.value=undefined;local.show=true;show.checked=true;local.valid=true;local.error='';draw();announce('Suggested icon selected. Choose Save icon.');});
    automatic.title='Use the suggested icon; keep visibility.';reset.title='Use the suggested icon and show it.';
    const show=node('input',null,{type:'checkbox','data-icon-show':'','aria-label':`Show icon for ${label}`});show.checked=local.show;show.addEventListener('change',()=>{local.show=show.checked;});
    const showLabel=node('label','Show this icon');showLabel.prepend(show);const previewBar=node('div',null,{class:'cme-icon-preview-bar'});previewBar.append(preview,showLabel,automatic,reset);editor.append(previewBar);
    const tabs=node('div',null,{role:'tablist','aria-label':'Icon source',class:'cme-icon-tabs'}),panels={};
    const selectTab=id=>{for(const [name,panel] of Object.entries(panels)){panel.hidden=name!==id;const tab=tabs.querySelector(`[data-icon-tab="${name}"]`);tab.setAttribute('aria-selected',String(name===id));tab.tabIndex=name===id?0:-1;}positionPopover();};
    for(const [id,title] of [['built-in','Built-in'],['image','Image'],['symbol','Symbol']]){
      const tab=button(title,()=>selectTab(id),{role:'tab','data-icon-tab':id,id:`cme-${ownerToken}-tab-${id}`,'aria-controls':`cme-${ownerToken}-panel-${id}`});
      tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const choices=[...tabs.children],index=choices.indexOf(tab),next=choices[event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowLeft'?-1:1)+3)%3];next.click();next.focus();});tabs.append(tab);
      panels[id]=node('div',null,{role:'tabpanel','data-icon-panel':id,id:`cme-${ownerToken}-panel-${id}`,'aria-labelledby':tab.id});
    }editor.append(tabs,...Object.values(panels));
    const gallery=node('div',null,{class:'cme-gallery'});
    const gallerySearch=node('input',null,{type:'search',placeholder:'Find an icon','aria-label':'Find a built-in icon'}), galleryItems=node('div',null,{class:'cme-gallery-items'});
    const packFilter=node('select',null,{'aria-label':'Built-in icon pack'});packFilter.append(node('option','All packs',{value:''}),node('option','FluentUI',{value:'fluent'}),node('option','ZenUI',{value:'zen'}));
    const renderGallery=()=>{galleryItems.replaceChildren();const search=gallerySearch.value.toLocaleLowerCase();
      for(const asset of icons.catalog().filter(asset=>(!packFilter.value||asset.pack===packFilter.value)&&`${asset.label} ${(asset.tags||[]).join(' ')}`.toLocaleLowerCase().includes(search))) {
        const pick=button('',()=>{local.controller?.abort();local.pending=false;local.value={kind:'asset',pack:asset.pack,id:asset.id};local.valid=true;local.error='';draw();announce('Icon ready. Choose Save icon.');},{'data-icon-asset':asset.id,'aria-label':`${asset.label} (${asset.pack})`,title:asset.label});pick.append(iconImage(asset.src,asset.fallbackSrc),node('span',asset.label));galleryItems.append(pick);
      }
    };gallerySearch.addEventListener('input',renderGallery);packFilter.addEventListener('change',renderGallery);gallery.append(gallerySearch,packFilter,galleryItems);panels['built-in'].append(gallery);renderGallery();
    async function importValue(method,value) {
      if(destroyed || draft!==local)return;
      local.controller?.abort();const controller=new window.AbortController();local.controller=controller;local.pending=true;local.valid=true;announce('Loading icon…');
      try {
        const result=await icons[method](value,controller.signal);
        if (destroyed || draft!==local || controller.signal.aborted || local.controller!==controller) return;
        if(local.raw!==store.read().raw || local.revision!==revision){cancelDraft();refresh(true);announce('Settings changed. Open the icon editor again.');return;}
        local.value=result;local.pending=false;draw();announce('Icon ready. Choose Save icon.');
      } catch(error) {
        if (destroyed || draft!==local || controller.signal.aborted || local.controller!==controller) return;
        local.pending=false;local.valid=false;local.error=error.message || 'Could not load this image.';announce(local.error);
      }
    }
    const file=node('input',null,{type:'file',accept:'image/*','data-icon-file':'','aria-label':`Choose image file for ${label}`});file.addEventListener('change',()=>{if(file.files?.[0])importValue('importFile',file.files[0]);});
    const fileLabel=node('label','Choose file');fileLabel.append(file);panels.image.append(fileLabel);
    const url=node('input',null,{type:'url',placeholder:'https://…','data-icon-url':'','aria-label':`Image link for ${label}`});const urlLabel=node('label','Image link');urlLabel.append(url);panels.image.append(urlLabel,draftButton('Load image','load',()=>importValue('importURL',url.value)));
    const paste=draftButton('Paste','paste',async()=>{
      try {
        if(window.navigator.clipboard?.read){const clipboard=await window.navigator.clipboard.read();
          const image=clipboard.find(item=>item.types.some(type=>type.startsWith('image/')));
          if(image){const type=image.types.find(type=>type.startsWith('image/'));return importValue('importPaste',await image.getType(type));}
          const text=clipboard.find(item=>item.types.includes('text/plain'));if(text)return importValue('importPaste',await (await text.getType('text/plain')).text());
        }
        if(window.navigator.clipboard?.readText)return importValue('importPaste',await window.navigator.clipboard.readText());
        announce('Paste an image or text into this icon editor.');
      }catch(error){announce(error.message || 'Clipboard access was unavailable. Paste into this editor.');}
    });const pasteTarget=node('div','Click here and paste an image, link or symbol.',{tabindex:0,contenteditable:'plaintext-only',role:'textbox','aria-multiline':'false','data-icon-paste-target':'',class:'cme-paste-target','aria-label':'Paste an image, link or symbol'});panels.image.append(paste,pasteTarget);
    editor.addEventListener('paste',event=>{
      // Keep native paste in the URL, symbol and gallery-search fields. Only
      // the dedicated target (or a non-editable surface) imports immediately.
      if(!pasteTarget.contains(event.target)&&event.target.closest?.('input,textarea,[contenteditable]'))return;
      const clipboard=event.clipboardData;if(!clipboard)return;
      const image=[...(clipboard.items||[])].find(item=>item.kind==='file'&&item.type.startsWith('image/'));
      const value=image?.getAsFile?.() || clipboard.getData('text/plain');if(!value)return;
      event.preventDefault();importValue('importPaste',value);
    });
    const text=node('input',null,{type:'text','data-icon-text':'','aria-label':`Unicode symbol for ${label}`,maxlength:64});text.value=local.value?.kind==='text'?local.value.text:'';
    text.addEventListener('input',()=>{local.controller?.abort();local.pending=false;
      try{local.value=textIcon(text.value,window);local.valid=true;local.error='';draw();announce('Symbol ready. Choose Save icon.');}
      catch(error){local.valid=false;local.error=error.message;announce(local.error);}
    });const symbolLabel=node('label','Symbol or emoji');symbolLabel.append(text);panels.symbol.append(symbolLabel,node('p','Use 1–8 symbols. They resize to fit.',{class:'cme-help'}));
    selectTab(local.value?.kind==='text'?'symbol':local.value?.kind==='image'?'image':'built-in');
    const footer=node('div',null,{class:'cme-popover-footer'});footer.append(draftButton('Save icon','save',()=>{
      if (local.pending) { announce('Wait for this icon to finish loading.');return; }
      if (!local.valid) { announce(local.error || 'Choose an icon before saving.');return; }
      if(draft!==local || local.raw!==store.read().raw || local.revision!==revision){cancelDraft();refresh();announce('Settings changed. Open the icon editor again.');return;}
      commit(state=>updateItem(state,currentRoot,key,{icon:local.value || null,showIcon:local.show}),'Icon saved.',key);
    }),draftButton('Cancel','cancel',()=>closePopover()));editor.append(node('p','',{class:'cme-help','data-cme-feedback':''}),footer);
    openPopover('icon',row.querySelector('[data-action="icon"]'),`Icon for ${label}`,{key,width:400,panel:editor});draw();automatic.focus();positionPopover();
  }

  function openTopPanel(kind) {
    const trigger=element.querySelector(`[data-cme-toolbar="${kind==='removed'?'options':kind}"]`);if(!trigger)return;
    if(popover?.kind===kind){closePopover();return;}
    const panel=openPopover(kind,trigger,{add:'Add to this menu',appearance:'Appearance',options:'Menu options',removed:'Removed items'}[kind],{width:kind==='appearance'?360:320});
    if(kind==='add'){
      panel.append(button('Add submenu',()=>add('submenu'),{'data-cme-add':'submenu'}),button('Add separator',()=>add('separator'),{'data-cme-add':'separator'}),node('p','',{class:'cme-help','data-cme-add-help':''}));updateAddControls();
    }else if(kind==='appearance'){
      panel.append(node('p','Applies to all menus.',{class:'cme-help'}));
      optionControl(panel,'showIcons','Show icons','Display artwork beside menu items.');
      optionControl(panel,'iconPack','Automatic icon pack','Used for items without a custom icon.','select',[['fluent','FluentUI'],['zen','ZenUI']]);
      optionControl(panel,'iconSize','Icon size','Artwork size in pixels.','number',[12,24]);
      optionControl(panel,'iconAlignment','Icon alignment','Position within the icon column.','select',[['left','Left'],['center','Center'],['right','Right']]);
      optionControl(panel,'iconGap','Icon spacing','Gap between icon and text, in pixels.','number',[0,16]);
      const more=node('details',null,{class:'cme-appearance-more'});more.append(node('summary','Spacing and style'));
      more.addEventListener('toggle',positionPopover);
      optionControl(more,'rowSpacing','Row spacing','Extra vertical space, in pixels.','number',[0,8]);
      optionControl(more,'rounded','Rounded corners','Round menu item corners.');
      optionControl(more,'hoverShade','Hover shading','Shade the item under the pointer.');
      optionControl(more,'showSeparators','Show separators','Display enabled separators between items.');
      optionControl(more,'separatorOpacity','Separator strength','0 is invisible; 1 is solid.','number',[0,1,0.05]);
      optionControl(more,'monochromeExtensions','Monochrome extension icons','Show extension artwork in one color.');panel.append(more);
    }else if(kind==='options'){
      panel.append(node('p','Unavailable commands and restore actions affect this menu. Other switches apply to all menus.',{class:'cme-help'}));
      optionControl(panel,'enabled','Enable customization','Use your saved arrangement.');
      optionControl(panel,'hideUnavailable','Hide unavailable commands','Hide disabled commands in this menu.');
      optionControl(panel,'preferCleanLinks','Prefer clean links','On page menus, use Copy Clean Link when available.');
      optionControl(panel,'shiftBypass','Shift shows the original menu','Hold Shift when you right-click.');
      panel.append(button('Restore removed items…',()=>openTopPanel('removed'),{'data-cme-restore-removed':''}));
      const order=button('Restore original order',()=>commit(state=>restoreOriginalOrder(state,currentRoot,descriptors()),'Original order restored.'),{'data-cme-restore-order':''});
      const reset=button('Reset this menu',()=>commit(state=>resetRoot(state,currentRoot),'Menu reset.'),{'data-cme-reset-menu':''});order.disabled=reset.disabled=!view.roots[currentRoot];panel.append(order,reset);
    }else{
      const tombstones=Object.entries(records()).filter(([,record])=>record.removed);
      for(const [key] of tombstones)panel.append(button(`Restore ${labelFor(key)}`,()=>commit(state=>restoreItem(state,currentRoot,key),'Item restored.',key),{'data-restore':key}));
      if(!tombstones.length)panel.append(node('p','No removed items.',{class:'cme-help'}));
    }
    focusPopover();
  }

  function render() {
    element.replaceChildren();
    if(readError){element.append(node('p','Saved settings could not be read. Your original data is preserved.',{class:'cme-error'}),button('Reset saved settings',()=>{try{store.resetInvalid(expectedRaw);refresh();announce('Saved settings reset.');}catch(error){announce(error.message);}}));}
    const toolbar=node('div',null,{class:'cme-toolbar','aria-label':'Menu editor controls',role:'group'});element.append(toolbar);
    const menuChoice=node('select',null,{'aria-label':'Menu','data-cme-menu':'','data-focus':'menu'});
    for(const root of inventory)menuChoice.append(node('option',root.label,{value:root.id}));menuChoice.value=currentRoot;
    menuChoice.addEventListener('change',()=>{currentRoot=menuChoice.value;selected=null;query='';findOpen=false;matchIndex=0;refresh(true);});toolbar.append(menuChoice);
    for(const [id,title] of [['add','Add'],['appearance','Appearance'],['find','⌕'],['options','⋯']]){
      const control=button(title,()=>{
        if(id==='find'){findOpen=!findOpen;const bar=element.querySelector('.cme-find');bar.hidden=!findOpen;control.setAttribute('aria-expanded',String(findOpen));if(findOpen)bar.querySelector('input').focus();else{query='';bar.querySelector('input').value='';applyFind(false);}return;}
        openTopPanel(id);
      },{'data-cme-toolbar':id,'data-focus':`toolbar:${id}`,'aria-label':id==='find'?'Find an item':id==='options'?'Menu options':title,'aria-expanded':String(id==='find'&&findOpen)});
      if(id!=='find')control.setAttribute('aria-haspopup','dialog');toolbar.append(control);
    }
    const findbar=node('div',null,{class:'cme-find'}),find=node('input',null,{type:'search',placeholder:'Find in this menu','aria-label':'Find in this menu','data-cme-find':'','data-focus':'find'});find.value=query;
    find.addEventListener('input',()=>{query=find.value;matchIndex=0;applyFind();});findbar.hidden=!findOpen;
    find.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();element.querySelector('[data-cme-toolbar="find"]').click();element.querySelector('[data-cme-toolbar="find"]').focus();}if(event.key==='Enter'){event.preventDefault();matchIndex+=event.shiftKey?-1:1;applyFind();}});
    findbar.append(find,button('↑',()=>{matchIndex--;applyFind();},{'aria-label':'Previous match'}),button('↓',()=>{matchIndex++;applyFind();},{'aria-label':'Next match'}),node('span','',{'data-cme-find-count':'','aria-live':'polite'}));element.append(findbar);
    tree=node('div',null,{class:'cme-tree','data-cme-tree':'','aria-label':'Editable menu items'});
    tree.addEventListener('dragover',event=>{
      if(!dragged)return;const bounds=tree.getBoundingClientRect(),direction=event.clientY<bounds.top+32?-1:event.clientY>bounds.bottom-32?1:0;
      if(direction===scrollDirection)return;stopScroll();scrollDirection=direction;if(direction)autoscroll=window.setInterval(()=>{tree.scrollTop+=direction*12;},40);
    },true); // Insertion targets stop bubbling after accepting their drop.
    tree.addEventListener('dragleave',event=>{if(!tree.contains(event.relatedTarget))stopScroll();});tree.addEventListener('drop',stopScroll);
    element.append(tree);renderRows();
    if(!inventory.length)tree.append(node('p','Open a supported browser menu to discover its items.',{class:'cme-help'}));
    const footer=node('div',null,{class:'cme-footer'});footer.append(button('Undo',()=>{try{store.undo();refresh(true);announce('Last change undone.');}catch(error){announce(error.message || 'Could not undo.');}},{'data-cme-undo':'','data-focus':'undo'}),node('span','Drag to move · Click a name or icon to edit',{class:'cme-help'}));element.append(footer);
    status.textContent=statusMessage;element.append(status);updateExpanded();applyFind(false);
    if(readError)element.querySelectorAll('input,select,button').forEach(control=>{if(control.textContent!=='Reset saved settings')control.disabled=true;});
    fitSymbols();
  }
  function refresh(force = false) {
    if(destroyed)return;
    const focus=capturedFocus(), saved=store.read();
    const nextInventory=registry.getInventory() || [],fingerprint=JSON.stringify(nextInventory);
    if(force!==true && view && saved.raw===expectedRaw && saved.error===readError){
      if(fingerprint===inventoryFingerprint){inventoryDeferred=false;return;}
      const edits=editedKeys();
      if(popover&&(!popover.key||sameIdentity(popover.key,nextInventory))){inventoryDeferred=true;return;}
      if(edits.length && edits.every(key=>sameIdentity(key,nextInventory))){inventoryDeferred=true;return;}
    }
    expectedRaw=saved.raw;readError=saved.error;inventory=nextInventory;inventoryFingerprint=fingerprint;inventoryDeferred=false;
    let next=saved.state || createState();
    for(const root of inventory)next=mergeInventory(next,root.id,root.items);
    view=next;if(!inventory.some(root=>root.id===currentRoot))currentRoot=inventory[0]?.id || '';
    revision++;cancelDraft();closePopover(false);clearDrag();render();restoreFocus(focus);
  }
  // Sine invokes reset while closing/rebuilding. It is a draft lifecycle operation.
  function reset() { cancelDraft();closePopover(false);clearDrag();query='';findOpen=false;matchIndex=0;selected=null;expanded.clear();refresh(true); }
  const unsubscribeStore=store.subscribe(refresh),unsubscribeInventory=registry.subscribe(refresh);
  refresh();
  return {element,refresh,reset,destroy(){if(destroyed)return;destroyed=true;cancelDraft();closePopover(false);clearDrag();symbolResize?.disconnect();if(deferredRefresh!==null)window.clearTimeout(deferredRefresh);document.removeEventListener('pointerdown',outsidePointer,true);document.removeEventListener('keydown',popupKey,true);window.removeEventListener('resize',positionPopover);document.removeEventListener('scroll',positionPopover,true);unsubscribeStore?.();unsubscribeInventory?.();element.remove();}};
}
