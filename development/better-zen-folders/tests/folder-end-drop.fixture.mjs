// Synthetic browser boundary: real manager/adapters, deterministic geometry and
// phased DOM delivery. Native receiver semantics are independently characterized
// by artifacts/round3-review/native-drag-contract.test.mjs.
class Surface {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn, options) {
    const list = this.listeners.get(type) ?? [];
    if (!list.some(entry => entry.fn === fn)) list.push({ fn, capture: options === true || options?.capture === true });
    this.listeners.set(type, list);
  }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter(entry => entry.fn !== fn)); }
  fire(event, capture) { for (const entry of [...this.listeners.get(event.type) ?? []]) if (entry.capture === capture) entry.fn(event); }
  count() { return [...this.listeners.values()].reduce((n, list) => n + list.length, 0); }
}

class Style {
  constructor() { this.values = new Map(); }
  setProperty(name, value, priority = '') { this.values.set(name, { value: String(value), priority }); }
  getPropertyValue(name) { return this.values.get(name)?.value ?? ''; }
  getPropertyPriority(name) { return this.values.get(name)?.priority ?? ''; }
  removeProperty(name) { this.values.delete(name); }
}

export class DropNode extends Surface {
  constructor(name = 'div', id = '') {
    super(); this.localName = name; this.id = id; this.children = []; this.attributes = new Map();
    this.style = new Style(); this.parentElement = null; this.textContent = '';
    this.classList = { contains: value => (this.getAttribute('class') ?? '').split(' ').includes(value) };
    this.rect = { top: 0, left: 0, width: 260, height: 30 };
  }
  get parentNode() { return this.parentElement; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { for (const child of [...this.children]) child.remove(); this._text = String(value); }
  get isConnected() { return this.root === true || Boolean(this.parentElement?.isConnected); }
  get group() { return this.parentElement?.closest('zen-folder') ?? null; }
  get pinned() { return this.isZenFolder === true || this.hasAttribute('pinned'); }
  get allItems() { return this.groupContainer?.children ?? []; }
  get tabs() { return this.children.flatMap(child => child.localName === 'tab' ? [child] : child.tabs); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  toggleAttribute(name, value) { if (value ?? !this.hasAttribute(name)) this.setAttribute(name, ''); else this.removeAttribute(name); }
  matches(selector) {
    if (selector.startsWith(':is(')) selector = selector.slice(4, -1);
    return selector.split(',').some(part => {
      part = part.trim();
      if (part.startsWith('.')) return this.classList.contains(part.slice(1));
      const attr = part.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
      if (attr) return attr[2] === undefined ? this.hasAttribute(attr[1]) : this.getAttribute(attr[1]) === attr[2];
      return this.localName === part;
    });
  }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  contains(node) { for (; node; node = node.parentElement) if (node === this) return true; return false; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  appendChild(child) { return this.insertBefore(child, null); }
  insertBefore(child, before) { child.remove(); child.parentElement = this; this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, child); return child; }
  after(child) { const siblings = this.parentElement.children; this.parentElement.insertBefore(child, siblings[siblings.indexOf(this) + 1]); }
  remove() { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; }
  getBoundingClientRect() {
    let rect = this.rect;
    if (this.classList.contains('better-zen-folders-drop-footer')) {
      rect = { top: 230 - (this.documentGlobal?.scrollShift ?? 0), left: 10,
        width: 250, height: this.children.length * 30 - 2 };
    }
    if (this.hasAttribute('data-bzf-folder-end-row')) {
      const index = this.parentElement.children.indexOf(this);
      const shift = this.documentGlobal?.scrollShift ?? 0;
      const indent = parseFloat(this.style.getPropertyValue('--bzf-drop-indent')) || 0;
      rect = { top: 230 + index * 30 - shift, left: 10 + indent, width: 250 - indent, height: 28 };
    }
    return { ...rect, x: rect.left, y: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height };
  }
  getClientRects() { return this.isConnected ? [this.getBoundingClientRect()] : []; }
}

export function makeFolderEndDropFixture(api, { install = true, destinationDelay = 0 } = {}) {
  const host = new Surface(); const root = new DropNode('window'); root.root = true;
  const tabContainer = root.appendChild(new DropNode('tabs'));
  tabContainer.rect = { top: 0, left: 0, width: 270, height: 400 };
  const pins = tabContainer.appendChild(new DropNode('vbox', 'pins')); pins.setAttribute('class', 'zen-workspace-pinned-tabs-section');
  pins.rect = { top: 0, left: 10, width: 250, height: 400 };
  const separator = pins.appendChild(new DropNode('hbox', 'separator')); separator.setAttribute('class', 'pinned-tabs-container-separator');
  pins.separatorElement = separator; pins.scrollbox = tabContainer;
  const normal = tabContainer.appendChild(new DropNode('vbox', 'normal'));
  const projection = new Map();
  const own = node => { node.documentGlobal = host; node.ownerDocument = host.document; return node; };
  host.document = { documentElement: root,
    createElement: name => own(new DropNode(name)), createXULElement: name => own(new DropNode(name)),
    createElementNS: (namespace, name) => { const node = own(new DropNode(name)); node.namespaceURI = namespace; return node; },
    getElementById: id => root.querySelectorAll('div').find(node => node.id === id) ?? null,
  };
  const addFolder = (id, parent, top, left) => {
    const folder = own(new DropNode('zen-folder', id)); folder.isZenFolder = true; folder.label = id; folder.collapsed = false;
    folder.setAttribute('zen-workspace-id', 'active');
    folder.labelContainerElement = folder.appendChild(own(new DropNode('hbox')));
    folder.labelContainerElement.setAttribute('class', 'tab-group-label-container'); folder.labelContainerElement.rect = { top, left, width: 260 - left, height: 30 };
    folder.labelElement = folder.labelContainerElement.appendChild(own(new DropNode('label'))); folder.labelElement.textContent = id;
    folder.groupContainer = folder.appendChild(own(new DropNode('div')));
    parent.insertBefore(folder, parent === pins ? separator : null); projection.set(folder, { visible: true }); return folder;
  };
  const parent = addFolder('Parent', pins, 60, 10); parent.collapsed = true;
  const child = addFolder('Child', parent.groupContainer, 90, 24);
  const last = own(new DropNode('tab', 'last')); last.setAttribute('pinned', 'true'); last.rect = { top: 200, left: 38, width: 222, height: 30 };
  child.groupContainer.appendChild(last); projection.set(last, { visible: true });
  const source = own(new DropNode('tab', 'source')); source.setAttribute('zen-workspace-id', 'active'); normal.appendChild(source);
  const timers = new Map(); let nextTimer = 0, now = 0; const observers = [];
  host.setTimeout = (fn, delay = 0) => { timers.set(++nextTimer, {fn, due: now + delay}); return nextTimer; }; host.clearTimeout = id => timers.delete(id);
  const advance = ms => {
    const end = now + ms;
    for (let count = 0; ; count++) {
      const next = [...timers].filter(([, value]) => value.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      if (count > 1000) throw new Error('fixture timer loop');
      timers.delete(next[0]); now = next[1].due; next[1].fn();
    }
    now = end;
  };
  host.MutationObserver = class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() { this.stopped = true; } };
  host.getComputedStyle = node => ({ display: node.getAttribute('data-bzf-visibility') === 'hidden' ? 'none' : 'flex',
    visibility: 'visible', direction: host.rtl ? 'rtl' : 'ltr', getPropertyValue: () => '14px' });
  const nativeCalls = []; let allowNative = true; let replayNativeDrop = null;
  const native = {
    getDropEffectForTabDrag: event => event.dataTransfer?.types?.includes('application/x-moz-tabbrowser-tab') && allowNative
      ? (event.dataTransfer.dropEffect === 'copy' ? 'copy' : 'move') : 'none',
    _clearDragOverSplit() { nativeCalls.push({ type: 'clear-split' }); },
  };
  const pinManager = { _dragIndicator: null,
    get dragIndicator() { return this._dragIndicator ??= root.appendChild(own(new DropNode('div', 'zen-drag-indicator'))); } };
  host.gZenPinnedTabManager = pinManager;
  host.gZenWorkspaces = { activeWorkspace: 'active', pinnedTabsContainer: pins, activeWorkspaceElement: { pinnedTabsContainer: pins, scrollbox: tabContainer } };
  host.gBrowser = { tabContainer, pinnedTabsContainer: pins, isTab: item => item?.localName === 'tab', isSplitViewWrapper: () => false };
  tabContainer.tabDragAndDrop = native;
  tabContainer.addEventListener('dragstart', event => {
    source._dragData ??= { movingTabs: [source], movingTabsSet: new Set([source]), dropElement: last, dropBefore: false };
    event.dataTransfer.types = ['application/x-moz-tabbrowser-tab']; event.stopPropagation();
  });
  tabContainer.addEventListener('dragover', event => {
    if (native.getDropEffectForTabDrag(event) === 'none') return;
    nativeCalls.push({ type: 'over', scroll: event.originalTarget === 'scroll-edge' });
    event.preventDefault(); event.stopPropagation();
    const indicator = pinManager.dragIndicator;
    indicator.style.setProperty('top', '230px'); indicator.style.setProperty('--indicator-left', '38px'); indicator.setAttribute('orientation', 'horizontal');
  });
  tabContainer.addEventListener('drop', event => {
    nativeCalls.push({ type: 'drop', anchor: source._dragData?.dropElement, before: source._dragData?.dropBefore,
      targetConnected: event.target.isConnected, pinnedAncestry: pins.contains(event.target), preventedBeforeNative: event.defaultPrevented });
    if (replayNativeDrop) { replayNativeDrop(event); return; }
    event.stopPropagation();
    if (event.dataTransfer.dropEffect !== 'move' || !allowNative || event.rejectNative) return;
    // Only the native event listener mutates membership in this fixture.
    if (pins.contains(event.target)) source.setAttribute('pinned', 'true');
    const { dropElement, dropBefore } = source._dragData;
    if (dropBefore) dropElement.parentElement.insertBefore(source, dropElement);
    else dropElement.after(source);
    delete source._dragData;
    pinManager._dragIndicator?.remove(); pinManager._dragIndicator = null;
  });
  const preferences = {get: name => name === 'dragDestinationDelayMs' ? destinationDelay : undefined};
  const adapters = api.createBrowserFolderEndDropAdapters?.(host, { projection }, preferences);
  const manager = adapters && api.FolderEndDropManager ? new api.FolderEndDropManager(adapters) : null;
  if (install) manager?.start();
  const emit = (type, target = source, fields = {}) => {
    // DOM dispatch fixes its path before capture. Detaching/reparenting the
    // target in a capture listener does NOT stop the already scheduled bubble.
    const path = [];
    for (let node = target; node; node = node.parentElement) path.push(node);
    path.push(host);
    const rowRect = target?.hasAttribute?.('data-bzf-folder-end-row') ? target.getBoundingClientRect() : null;
    const event = { type, target, relatedTarget: null, clientX: rowRect ? rowRect.left + 5 : 100,
      clientY: rowRect ? rowRect.top + 10 : 215,
      dataTransfer: { types: ['application/x-moz-tabbrowser-tab'], dropEffect: 'move', mozItemCount: 1,
        mozTypesAt: () => ['application/x-moz-tabbrowser-tab'], mozGetDataAt: () => source },
      defaultPrevented: false, stopped: 0, prevented: 0,
      composedPath: () => [...path],
      preventDefault() { this.defaultPrevented = true; this.prevented++; }, stopPropagation() { this.stopped++; }, ...fields };
    host.fire(event, true);
    if (path.includes(tabContainer) && !event.stopped) tabContainer.fire(event, false);
    if (!event.stopped) host.fire(event, false);
    return event;
  };
  return { host, root, tabContainer, pins, normal, separator, parent, child, last, source, projection, manager, adapters, nativeCalls,
    addFolder, own, emit, advance, preferences, rows: () => pins.querySelectorAll('[data-bzf-folder-end-row]'),
    reveal() {
      const end = adapters.getLayout(source)?.endRow ?? last;
      emit('dragover', end, {clientX: 11, clientY: end.getBoundingClientRect().bottom - 5});
      advance(destinationDelay);
    },
    flush() { for (let count = 0; timers.size && count < 20; count++) advance(Math.max(...[...timers.values()].map(value => value.due)) - now); },
    mutate() { for (const observer of observers) if (!observer.stopped) observer.fn([]); },
    pending: () => timers.size, setNativeAllowed(value) { allowNative = value; },
    setNativeDrop(callback) { replayNativeDrop = callback; },
  };
}
