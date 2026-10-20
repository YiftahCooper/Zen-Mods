/** Zen 1.22.2b routes cross-host URL-bar loads in every pinned tab to a new tab.
 * Keep ordinary navigation in the selected regular-folder tab or top-level pin
 * without changing the native preference or any prototype. */
export class FolderNavigationManager {
  constructor(host) {
    this.host = host;
    this.ui = null;
    this.originalDescriptor = null;
    this.wrapper = null;
    this.signal = null;
    this.onAbort = () => this.destroy();
  }

  start(signal) {
    if (this.wrapper || signal?.aborted) return;
    const ui = this.host.gZenUIManager;
    const original = ui?.getOpenUILinkWhere;
    if (typeof original !== "function") return;
    const originalDescriptor = Object.getOwnPropertyDescriptor(ui, "getOpenUILinkWhere");
    const manager = this;
    const wrapper = function (...args) {
      // Preserve the native receiver, all arguments, result and thrown errors
      // before considering this one current-tab exception.
      const destination = Reflect.apply(original, this, args);
      if (manager.wrapper !== wrapper || this !== ui
          || args[2] !== "current" || destination !== "tab") return destination;
      try {
        return manager.isOrdinaryFolderNavigation(args[1]) ? "current" : destination;
      } catch {
        return destination;
      }
    };
    ui.getOpenUILinkWhere = wrapper;
    this.ui = ui;
    this.originalDescriptor = originalDescriptor;
    this.wrapper = wrapper;
    this.signal = signal;
    signal?.addEventListener("abort", this.onAbort, { once: true });
  }

  isOrdinaryFolderNavigation(browser) {
    const { gBrowser, gURLBar } = this.host;
    if (gURLBar?.focused !== true || gURLBar.hasAttribute("zen-newtab")
        || this.ui._urlbarOwner != null || browser !== gBrowser?.selectedBrowser) return false;
    const tab = gBrowser.getTabForBrowser(browser);
    if (!tab || tab !== gBrowser.selectedTab || tab.linkedBrowser !== browser
        || tab.pinned !== true || tab.isConnected !== true || tab.closing
        || tab.hasAttribute("zen-essential") || tab.hasAttribute("zen-empty-tab")) return false;
    // A split member's native group may be the workspace pins wrapper. Its
    // nearest actual folder still identifies membership without changing splits.
    const folder = tab.closest?.("zen-folder") ?? tab.group;
    if (folder?.isZenFolder === true) return !folder.isLiveFolder && folder.isConnected === true;
    // A root pin's group can be the collapsed workspace-pins wrapper. Require
    // direct native-section membership so unrelated groups/splits stay native.
    return tab.parentElement?.matches?.(".zen-workspace-pinned-tabs-section") === true;
  }

  destroy() {
    this.signal?.removeEventListener("abort", this.onAbort);
    if (this.ui && Object.getOwnPropertyDescriptor(this.ui, "getOpenUILinkWhere")?.value === this.wrapper) {
      if (this.originalDescriptor) {
        Object.defineProperty(this.ui, "getOpenUILinkWhere", this.originalDescriptor);
      } else {
        delete this.ui.getOpenUILinkWhere;
      }
    }
    this.ui = this.originalDescriptor = this.wrapper = this.signal = null;
  }
}

/** Related creations inherit a real opener's immediate folder. Supply native
 * insertion options before TabOpen instead of relocating an arbitrary new tab.
 * Glance stays transient until its native full-open move identifies both tabs. */
export class RelatedFolderTabsManager {
  constructor(host) {
    this.host = host;this.active = false;this.owned = [];
    this.openingGlance = 0;this.expandingGlance = 0;this.freshGlances = new WeakSet();
    this.creatingRelated = null;
    this.onAbort = () => this.destroy();
  }
  wrap(owner, name, route) {
    const original = owner?.[name];
    if (typeof original !== 'function') return;
    const descriptor = Object.getOwnPropertyDescriptor(owner,name), manager = this;
    const wrapper = function(...args) {
      const native = replacement => Reflect.apply(original,this,replacement ?? args);
      return manager.active && this === owner ? route(args,native) : native();
    };
    Object.defineProperty(owner,name,{value:wrapper,writable:true,configurable:true,enumerable:descriptor?.enumerable??true});
    this.owned.push({owner,name,descriptor,wrapper});
  }
  sourceFolder(source) {
    if (!source || source.localName !== 'tab' || source.isConnected !== true || source.closing
        || (source.ownerGlobal ?? source.ownerDocument?.defaultView) !== this.host
        || source.hasAttribute('zen-essential') || source.hasAttribute('zen-empty-tab') || source.splitview) return null;
    const folder = source.group;
    return isRegularFolder(folder) && folder.isConnected === true
      && (folder.ownerGlobal ?? folder.ownerDocument?.defaultView) === this.host ? folder : null;
  }
  start(signal) {
    if (this.active || signal?.aborted) return;
    this.active = true;this.signal = signal;signal?.addEventListener('abort',this.onAbort,{once:true});
    const browser = this.host.gBrowser, glance = this.host.gZenGlanceManager;
    this.wrap(this.host.gZenWorkspaces,'fixTabInsertLocation',([tab],native)=>{
      // Zen 1.23.2b otherwise takes a correctly inserted structural pin back
      // out of its folder before TabOpen. Exempt only our synchronous creation.
      if (this.creatingRelated && tab?.group === this.creatingRelated) return;
      return native();
    });
    this.wrap(glance,'openGlance',(_args,native)=>{
      this.openingGlance++;
      try { return native(); } finally { this.openingGlance--; }
    });
    this.wrap(glance,'fullyOpenGlance',(_args,native)=>{
      this.expandingGlance++;
      try { return native(); } finally { this.expandingGlance--; }
    });
    this.wrap(glance,'getTabOrGlanceParent',([tab],native)=>this.pinningGlance === tab ? tab : native());
    this.wrap(browser,'addTab',(args,native)=>{
      const previous = this.creatingRelated;this.creatingRelated = null;
      try { return this.openTab(args,native); }
      finally { this.creatingRelated = previous; }
    });
    this.wrap(browser,'moveTabAfter',([tab,source],native)=>{
      if (!this.expandingGlance || !tab?.hasAttribute?.('zen-glance-tab') || !this.sourceFolder(source)) return native();
      const place = () => {
        // Native pinTab normally redirects a preview to its parent. During
        // this one promotion, pin the preview itself, without mutating IDs.
        const previous = this.pinningGlance;this.pinningGlance = tab;
        try { browser.pinTab(tab); } finally { this.pinningGlance = previous; }
        return native();
      };
      const hooks = this.host.__betterZenFoldersFolderPins?.origins;
      const origin = this.freshGlances.has(tab) ? 'new' : 'move';
      const result = hooks?.active ? hooks.placeCreatedTab(tab,origin,place) : place();
      this.freshGlances.delete(tab);return result;
    });
  }
  openTab([url,options = {}],native) {
      const browser = this.host.gBrowser, glance = this.host.gZenGlanceManager;
      if (this.openingGlance) {
        const tab = native();if (tab) this.freshGlances.add(tab);return tab;
      }
      if (options.fromExternal || options.skipLoad || options.createLazyBrowser || options.insertTab === false
          || options._forZenEmptyTab || options.essential) return native();
      let source = options.openerBrowser ? browser.getTabForBrowser(options.openerBrowser) : null;
      if (!options.openerBrowser) {
        const related = options.relatedToCurrent ?? Boolean(options.referrerInfo?.originalReferrer);
        source = related ? browser.selectedTab : null;
      }
      if (source?.hasAttribute?.('zen-glance-tab')) source = glance?.getTabOrGlanceParent?.(source);
      const folder = this.sourceFolder(source);
      if (!folder || (options.tabGroup != null && options.tabGroup !== folder)) return native();
      // "pinned" is native section membership here, not a saved URL choice.
      // Existing FolderPinOriginHooks apply the new-folder-tab URL-pin default.
      this.creatingRelated = folder;
      return native([url,{...options,pinned:true,tabGroup:folder}]);
  }
  destroy() {
    this.active = false;this.signal?.removeEventListener('abort',this.onAbort);this.signal = null;
    for (const {owner,name,descriptor,wrapper} of this.owned.reverse()) {
      if (Object.getOwnPropertyDescriptor(owner,name)?.value !== wrapper) continue;
      if (descriptor) Object.defineProperty(owner,name,descriptor);else delete owner[name];
    }
    this.owned = [];this.freshGlances = new WeakSet();
  }
}

/** Keep Zen's searchable preview beside its direct header. Zen 1.22.2b's
 * count-based negative Y offset can become a positive gap at the screen edge.
 * popupshowing runs after the native anchor is set; moveToAnchor accepts that
 * showing state. No native method, search content, timer or prototype is replaced. */
export class FolderPreviewAnchorManager {
  constructor(host) {
    this.host = host;
    this.panel = null;
    this.signal = null;
    this.onPopupShowing = this.onPopupShowing.bind(this);
    this.onAbort = () => this.destroy();
  }
  start(signal) {
    if (this.panel || signal?.aborted) return;
    const panel = this.host.document?.getElementById?.("zen-folder-tabs-popup");
    if (!panel || typeof panel.moveToAnchor !== "function") return;
    this.panel = panel;
    this.signal = signal;
    panel.addEventListener("popupshowing", this.onPopupShowing);
    signal?.addEventListener("abort", this.onAbort, { once: true });
  }
  onPopupShowing(event) {
    const panel = this.panel;
    if (!panel || event.target !== panel || event.defaultPrevented) return;
    try {
      const header = panel.anchorNode;
      const folder = header?.parentElement;
      if (!header?.isConnected || folder?.isZenFolder !== true || !folder.collapsed
        || !header.matches?.(".tab-group-label-container")
        || folder.querySelector?.(":scope > .tab-group-label-container") !== header
        || !this.host.gBrowser?.tabContainer?.contains?.(header)
        || header.closest?.('[data-bzf-visibility="hidden"]')) return;
      const rect = header.getBoundingClientRect();
      const style = this.host.getComputedStyle(header);
      if (rect.width <= 0 || rect.height <= 0
        || style.visibility === "hidden" || style.visibility === "collapse") return;
      const right = this.host.gZenVerticalTabsManager?._prefsRightSide === true;
      panel.moveToAnchor(header, right ? "topleft topright" : "topright topleft",
        right ? -10 : 10, 0, false);
    } catch (error) {
      this.host.console?.error?.("Better Zen Folders: preview header positioning", error);
    }
  }
  destroy() {
    this.panel?.removeEventListener("popupshowing", this.onPopupShowing);
    this.signal?.removeEventListener("abort", this.onAbort);
    this.panel = null;
    this.signal = null;
  }
}

/** Organise native preview rows without replacing their tab-activation handlers.
 * Headings and their expansion are transient popup state, never folder state. */
export class FolderPreviewHierarchyManager {
  constructor(host, preferences, state = {}) {
    this.host = host;
    this.preferences = preferences;
    this.state = state;
    this.session = null;
    this.onShow = event => {
      if (event.target !== this.panel) return;
      this.clear();
      try { this.open(); }
      catch (error) { this.clear(); this.host.console?.error?.('Better Zen Folders: preview grouping', error); }
    };
    this.onHide = event => { if (event.target === this.panel) this.clear(); };
    this.onInput = event => {
      if (!this.session || event.target !== this.session.search) return;
      // Native search assumes every direct child is a tab. Do not let it reveal
      // excluded descendants or count a heading as a search hit.
      event.stopImmediatePropagation();
      this.render();
    };
    this.onKey = event => this.key(event);
    this.onHover = event => {
      const s = this.session;
      const entry = s?.entries.find(entry => entry.row === event.target);
      if (!entry || entry.row.hidden) return;
      this.select(entry.row);
      // Keep keyboard focus aligned with pointer selection once navigating rows,
      // but never steal focus from someone typing in the search field.
      if (s.list.contains(this.host.document.activeElement)) entry.row.focus({preventScroll:true});
    };
    this.onClick = event => {
      const s = this.session;
      const entry = s?.entries.find(entry => entry.row.contains(event.target));
      if (!entry) return;
      const item = entry.tab ?? entry.folder;
      if (!s.root.isConnected || !s.root.contains(item) || entry.row.hidden) {
        event.preventDefault(); event.stopImmediatePropagation();
        this.panel.hidePopup?.();
      }
    };
    this.onAbort = () => this.destroy();
    this.onStatus = () => { if (this.session) this.render(); };
  }
  start(signal) {
    if (this.panel || signal?.aborted) return;
    const panel = this.host.document?.getElementById?.('zen-folder-tabs-popup');
    if (!panel) return;
    this.panel = panel;
    this.signal = signal;
    const native = this.host.gZenFolders;
    if (typeof native?.openTabsPopup === 'function') {
      const original = native.openTabsPopup, descriptor = Object.getOwnPropertyDescriptor(native, 'openTabsPopup');
      const manager = this;
      const wrapper = function(event, ...args) {
        const root = event?.target?.parentElement;
        if (this !== native || !root?.isZenFolder || !root.collapsed) return original.call(this,event,...args);
        return manager.withPreviewEligibility(root, () => original.call(this,event,...args));
      };
      native.openTabsPopup = wrapper;
      this.nativeOpen = {native, descriptor, wrapper};
    }
    panel.addEventListener('popupshowing', this.onShow);
    panel.addEventListener('popuphidden', this.onHide);
    panel.addEventListener('input', this.onInput, true);
    panel.addEventListener('click', this.onClick, true);
    panel.addEventListener('mouseenter', this.onHover, true);
    this.host.document.addEventListener('keydown', this.onKey, true);
    for (const type of ['BetterZenFolderStickyChanged','TabAttrModified','SSTabRestored']) {
      this.host.addEventListener?.(type,this.onStatus);
    }
    this.unsubscribe = this.preferences?.subscribe?.('previewSubfolders', () => {
      if (!this.session) return;
      this.session.collapsed.clear();
      for (const entry of this.session.entries) {
        if (entry.folder && this.startsCollapsed(entry.depth)) this.session.collapsed.add(entry.folder);
      }
      this.render();
    });
    signal?.addEventListener('abort', this.onAbort, {once:true});
  }
  mode() { return this.preferences?.get?.('previewSubfolders') ?? 'expanded'; }
  startsCollapsed(depth) { return this.mode() === 'collapsed' || (this.mode() === 'children' && depth > 0); }
  withPreviewEligibility(root, open) {
    // Zen's activeTabs can retain formerly exposed tabs after our projection
    // hides them. Use actual projected visibility only for this synchronous
    // native preview build. Never clear native active flags/indentation or the
    // remembered active array merely to populate a popup.
    if (!root.activeTabs?.some(tab => tab.closest?.('[data-bzf-visibility="hidden"]'))) return open();
    const own = Object.getOwnPropertyDescriptor(root, 'activeTabs');
    if (own?.configurable === false || !Object.isExtensible(root)) return open();
    let owner = root, descriptor;
    while (owner && !(descriptor = Object.getOwnPropertyDescriptor(owner,'activeTabs'))) owner = Object.getPrototypeOf(owner);
    if (!descriptor) return open();
    let value = descriptor.value;
    const get = () => (descriptor.get ? descriptor.get.call(root) : value)
      .filter(tab => !tab.closest?.('[data-bzf-visibility="hidden"]'));
    const set = descriptor.set ? next => descriptor.set.call(root,next)
      : descriptor.writable ? next => {value=next;} : undefined;
    Object.defineProperty(root,'activeTabs',{configurable:true,enumerable:descriptor.enumerable,get,set});
    try { return open(); }
    finally {
      if (Object.getOwnPropertyDescriptor(root,'activeTabs')?.get === get) {
        if (own) Object.defineProperty(root,'activeTabs', 'value' in own ? {...own,value} : own);
        else delete root.activeTabs;
      }
    }
  }
  open() {
    const header = this.panel.anchorNode, root = header?.parentElement;
    if (!root?.isZenFolder || !root.collapsed || !header.isConnected
      || !header.matches?.('.tab-group-label-container')
      || !this.host.gBrowser?.tabContainer?.contains?.(root)) return;
    const list = this.panel.querySelector('#zen-folder-tabs-list');
    const search = this.panel.querySelector('#zen-folder-tabs-list-search');
    if (!list || !search) return;
    const rows = Array.from(list.children);
    // popupshowing may arrive after the synchronous native build wrapper has
    // restored activeTabs. Apply the same visibility rule to grouping too.
    const active = new Set((root.activeTabs ?? []).filter(tab => !tab.closest?.('[data-bzf-visibility="hidden"]')));
    const tabs = Array.from(root.tabs ?? []).filter(tab => !active.has(tab)
      && !tab.hidden && !tab.hasAttribute('zen-empty-tab'));
    // Fail back to the native list if an upstream change or another writer has
    // altered row eligibility. Never guess the tab belonging to an action.
    if (!tabs.length || rows.length !== tabs.length
      || rows.some(row => !row.classList.contains('folders-tabs-list-item'))) return;
    const session = this.session = {root, header, list, search, rows, entries:[], collapsed:new Set(), restore:[]};
    const headings = new Map();
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i], path = [];
      if (!root.contains(tab)) throw new Error('preview tab left its folder');
      // Native tab.group can resolve to the Space's pins wrapper for split-view
      // members. Preview hierarchy follows physical containment, not that getter.
      for (let parent = tab.parentElement; parent && parent !== root; parent = parent.parentElement) {
        if (parent.isZenFolder) path.unshift(parent);
      }
      for (let depth = 0; depth < path.length; depth++) {
        const folder = path[depth];
        if (headings.has(folder)) continue;
        const button = this.host.document.createElementNS('http://www.w3.org/1999/xhtml', 'button');
        button.type = 'button';
        button.className = 'folders-tabs-list-item better-zen-folders-preview-folder';
        button.setAttribute('data-bzf-preview-folder', folder.id);
        button.setAttribute('data-bzf-preview-name', folder.name || folder.label || 'Folder');
        button.setAttribute('data-label', '');
        button.setAttribute('aria-label', folder.name || folder.label || 'Folder');
        const icon = this.host.document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
        icon.className = 'menu-iconic-left'; icon.setAttribute('aria-hidden','true');
        const label = this.host.document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
        label.className = 'better-zen-folders-preview-name'; label.textContent = folder.name || folder.label || 'Folder';
        const chevron = this.host.document.createElementNS('http://www.w3.org/1999/xhtml','span');
        chevron.className = 'better-zen-folders-preview-chevron'; chevron.setAttribute('aria-hidden','true');
        button.append(chevron, icon, label);
        list.appendChild(button);
        const colour = this.host.getComputedStyle(folder).getPropertyValue('--better-zen-folders-folder-color').trim();
        if (colour) button.style.setProperty('--bzf-preview-colour', colour);
        if (!snapshotLiveFolderMenuIcon(this.host, button, folder, '100')) {
          const image = this.host.document.createElementNS('http://www.w3.org/1999/xhtml','img');
          image.src = resolveFolderMenuIconSource(folder); image.alt = ''; icon.appendChild(image);
        }
        const entry = {row:button, folder, path:path.slice(0,depth), depth};
        headings.set(folder,entry); session.entries.push(entry);
        if (this.startsCollapsed(depth)) session.collapsed.add(folder);
        button.addEventListener('click', () => {
          if (this.session !== session || !root.isConnected || !root.contains(folder)) return;
          // Search expands matched paths temporarily; clicking still records a
          // choice for after search is cleared without hiding a matching result.
          if (session.collapsed.has(folder)) session.collapsed.delete(folder);
          else session.collapsed.add(folder);
          this.render();
        });
        button.addEventListener('mouseenter', () => this.select(button));
      }
      const row = rows[i];
      session.restore.push({row, hidden:row.hidden, tabindex:row.getAttribute('tabindex'), role:row.getAttribute('role'), padding:row.style.getPropertyValue('--bzf-preview-depth'), colour:row.style.getPropertyValue('--bzf-preview-colour')});
      row.setAttribute('tabindex','0'); row.setAttribute('role','button');
      session.entries.push({row, tab, path, depth:path.length});
    }
    list.replaceChildren(...session.entries.map(entry => entry.row));
    list.setAttribute('data-bzf-grouped-preview','true');
    this.render();
  }
  decorateStatus(entry) {
    const row = entry.row, item = entry.tab ?? entry.folder;
    const content = entry.folder ? row.querySelector('.menu-iconic-left')
      : row.querySelector('.folders-tabs-list-item-content');
    if (!content) return;
    const sticky = this.state.isSticky?.(item) === true;
    const pinned = !!entry.tab && this.state.isUrlPinned?.(entry.tab) === true;
    const colour = this.host.getComputedStyle(entry.folder ?? entry.tab.closest?.('zen-folder') ?? entry.tab)
      .getPropertyValue('--better-zen-folders-folder-color').trim();
    if (colour) row.style.setProperty('--bzf-preview-colour',colour);
    for (const [kind,show,label] of [['sticky',sticky,'Sticky'],['pin',pinned,'URL pinned']]) {
      let mark = row.querySelector('.better-zen-folders-preview-'+kind);
      if (!show) { mark?.remove(); continue; }
      if (!mark) {
        mark = this.host.document.createElementNS('http://www.w3.org/1999/xhtml','span');
        mark.className = 'better-zen-folders-preview-status better-zen-folders-preview-'+kind;
        mark.setAttribute('role','img');mark.setAttribute('aria-label',label);mark.setAttribute('title',label);
        if (kind === 'pin') mark.style.setProperty('background-image',`url("${URL_PIN_IMAGE}")`);
        content.appendChild(mark);
      }
    }
  }
  render() {
    const s = this.session; if (!s) return;
    const focused = this.host.document.activeElement;
    let restoreFocus = false;
    const query = s.search.value.toLowerCase().trim(), hide = this.mode() === 'hide';
    const matches = s.entries.filter(entry => entry.tab && (!hide || !entry.path.length)
      && (!query || entry.row.getAttribute('data-label').includes(query)));
    const matched = new Set(matches), ancestors = new Set(matches.flatMap(entry => entry.path));
    for (const entry of s.entries) {
      this.decorateStatus(entry);
      const excluded = hide && (entry.folder || entry.path.length);
      const visible = !excluded && (query
        ? entry.folder ? ancestors.has(entry.folder) : matched.has(entry)
        : !entry.path.some(folder => s.collapsed.has(folder)));
      entry.row.hidden = !visible;
      if (!visible && entry.row.contains(focused)) restoreFocus = true;
      entry.row.style.setProperty('--bzf-preview-depth', String(entry.depth));
      if (!visible) entry.row.removeAttribute('selected');
      if (entry.folder) entry.row.setAttribute('aria-expanded', String(query
        ? ancestors.has(entry.folder) : !s.collapsed.has(entry.folder)));
    }
    const noResults = this.panel.querySelector('#zen-folder-tabs-search-no-results');
    if (noResults) noResults.hidden = query ? matches.length > 0 : s.entries.some(entry => !entry.row.hidden);
    if (restoreFocus) s.search.focus();
  }
  select(row) {
    for (const entry of this.session?.entries ?? []) entry.row.removeAttribute('selected');
    row?.setAttribute('selected','true');
  }
  key(event) {
    const s = this.session;
    if (!s || !this.panel.contains(event.target) || event.ctrlKey || event.altKey || event.metaKey) return;
    const rows = s.entries.filter(entry => !entry.row.hidden).map(entry => entry.row);
    const current = rows.find(row => row.contains(event.target)) ?? rows.find(row => row.hasAttribute('selected'));
    const inSearch = event.target === s.search;
    let target = null, handled = true;
    if (['ArrowDown','ArrowUp'].includes(event.key)) {
      const index = rows.indexOf(current), step = event.key === 'ArrowDown' ? 1 : -1;
      target = index < 0 ? (step > 0 ? rows[0] : rows.at(-1)) : rows[(index + step + rows.length) % rows.length];
    } else if (event.key === 'Tab') {
      const stops = [s.search,...rows], index = stops.indexOf(inSearch ? s.search : current);
      target = stops[index + (event.shiftKey ? -1 : 1)];
      if (!target) { this.panel.hidePopup?.(); s.header.focus?.(); }
    } else if (!inSearch && ['Home','End'].includes(event.key)) {
      target = event.key === 'Home' ? rows[0] : rows.at(-1);
    } else if (event.key === 'Enter' || (!inSearch && event.key === ' ')) {
      current?.click();
    } else if (!inSearch && ['ArrowLeft','ArrowRight'].includes(event.key)) {
      const entry = s.entries.find(entry => entry.row === current && entry.folder);
      if (entry && !s.search.value) {
        const close = (event.key === 'ArrowLeft') !== (this.host.getComputedStyle(this.panel).direction === 'rtl');
        if (close) s.collapsed.add(entry.folder); else s.collapsed.delete(entry.folder);
        this.render();
      }
    } else handled = false;
    if (!handled) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (target) { this.select(target === s.search ? null : target); target.focus(); target.scrollIntoView?.({block:'nearest'}); }
  }
  clear() {
    const s = this.session; if (!s) return;
    this.session = null;
    for (const entry of s.entries) if (entry.folder) entry.row.remove();
    for (const saved of s.restore) {
      saved.row.hidden = saved.hidden;
      for (const name of ['tabindex','role']) {
        if (saved[name] === null) saved.row.removeAttribute(name); else saved.row.setAttribute(name,saved[name]);
      }
      if (saved.padding) saved.row.style.setProperty('--bzf-preview-depth',saved.padding);
      else saved.row.style.removeProperty('--bzf-preview-depth');
      if (saved.colour) saved.row.style.setProperty('--bzf-preview-colour',saved.colour);
      else saved.row.style.removeProperty('--bzf-preview-colour');
      for (const mark of saved.row.querySelectorAll('.better-zen-folders-preview-status')) mark.remove();
    }
    // Native population may already have replaced the list for a new opening.
    if (s.rows.some(row => row.parentElement === s.list)) s.list.replaceChildren(...s.rows);
    s.list.removeAttribute('data-bzf-grouped-preview');
  }
  destroy() {
    // Let Zen clear its query and per-opening handlers before restoring rows.
    if (this.session) this.panel?.hidePopup?.();
    this.clear();
    this.panel?.removeEventListener('popupshowing',this.onShow);
    this.panel?.removeEventListener('popuphidden',this.onHide);
    this.panel?.removeEventListener('input',this.onInput,true);
    this.panel?.removeEventListener('click',this.onClick,true);
    this.panel?.removeEventListener('mouseenter',this.onHover,true);
    if (this.panel) this.host.document.removeEventListener('keydown',this.onKey,true);
    for (const type of ['BetterZenFolderStickyChanged','TabAttrModified','SSTabRestored']) {
      this.host.removeEventListener?.(type,this.onStatus);
    }
    const hook = this.nativeOpen;
    if (hook && hook.native.openTabsPopup === hook.wrapper) {
      if (hook.descriptor) Object.defineProperty(hook.native,'openTabsPopup',hook.descriptor);
      else delete hook.native.openTabsPopup;
    }
    this.nativeOpen = null;
    this.unsubscribe?.(); this.unsubscribe=null;
    this.signal?.removeEventListener('abort',this.onAbort); this.signal=null; this.panel=null;
  }
}

/** Pure projection: keeps DOM order and never changes a remembered collapse state. */
export function projectFolderVisibility(roots, adapters, policy = "hide") {
  const anchors = new Map();
  const children = new Map();
  const measure = node => {
    if (anchors.has(node)) throw new TypeError("folder visibility requires an acyclic tree");
    anchors.set(node, false);
    const items = adapters.isFolder(node) ? Array.from(adapters.children(node)) : [];
    children.set(node, items);
    const descendantAnchors = items.map(measure).some(Boolean);
    const anchored = !!(adapters.isSticky(node) || adapters.isSelected(node)
      || adapters.isExposed(node) || descendantAnchors);
    anchors.set(node, anchored);
    return anchored;
  };
  roots.forEach(measure);
  const result = new Map();
  const visit = (node, visible, pathOnly, projected) => {
    const isFolder = adapters.isFolder(node);
    const collapsed = isFolder && adapters.isCollapsed(node);
    result.set(node, {visible, pathOnly, sticky: !!adapters.isSticky(node), projected});
    const full = visible && !collapsed && !pathOnly;
    for (const child of children.get(node)) {
      const childFolder = adapters.isFolder(child);
      const explicit = adapters.isSticky(child) || adapters.isExposed(child);
      const policyAllows = collapsed && !pathOnly && childFolder
        && (policy === "all" || (policy === "expanded" && !adapters.isCollapsed(child)));
      const normal = full || explicit || policyAllows;
      const childVisible = visible && !!(normal || anchors.get(child));
      visit(child, childVisible, childFolder && childVisible && !normal,
        projected || collapsed || pathOnly);
    }
  };
  roots.forEach(root => {
    const initial = adapters.rootInitialState?.(root, anchors.get(root));
    visit(root, initial?.visible ?? true, initial?.pathOnly ?? false, initial?.projected ?? false);
  });
  return result;
}

export const STICKY_TAB_KEY = "betterZenFolders.stickyTab.v1";
export const STICKY_FOLDER_KEY = "betterZenFolders.stickyFolders.v1";

export const FOLDER_PIN_INTENT_KEY = "better-zen-folders.url-pin.v1";
const folderPinDuplicates = new WeakSet();

/** No cache or external persistence: SessionStore controls private-session and
 * undo lifetimes. Missing, invalid and explicitly ordinary are different states.
 * Read errors propagate so callers cannot migrate an inaccessible record. */
export class FolderPinIntentStore {
  constructor(adapters) { this.adapters = adapters; }

  read(tab) {
    const id = this.adapters.getId(tab);
    if (typeof id !== "string" || !id.length) return {status: "invalid"};
    const raw = this.adapters.getTabValue(tab, FOLDER_PIN_INTENT_KEY);
    if (raw === "" || raw === null || raw === undefined) return {status: "missing"};
    let value;
    try { value = JSON.parse(raw); } catch { return {status: "invalid"}; }
    if (!value || value.schema !== 1 || value.tabId !== id
        || typeof value.explicit !== "boolean") return {status: "invalid"};
    return {status: "known", tabId: id, explicit: value.explicit};
  }

  write(tab, explicit) {
    if (typeof explicit !== "boolean") throw new TypeError("URL pin intent must be boolean");
    const tabId = this.adapters.getId(tab);
    if (typeof tabId !== "string" || !tabId.length) {
      throw new TypeError("URL pin intent requires a stable native identity");
    }
    const targets = [...new Set(this.adapters.getIntentTargets?.(tab) ?? [tab])];
    if (!targets.includes(tab) || targets.some(item => this.adapters.getId(item) !== tabId)) {
      throw new Error("URL pin identity changed before write");
    }
    const previous = targets.map(item => ({tab: item,
      raw: this.adapters.getTabValue(item, FOLDER_PIN_INTENT_KEY) ?? ""}));
    const raw = JSON.stringify({schema: 1, tabId, explicit});
    const attempted = [];
    try {
      for (const entry of previous) {
        attempted.push(entry);
        this.adapters.setTabValue(entry.tab, FOLDER_PIN_INTENT_KEY, raw);
      }
      for (const item of targets) {
        const saved = this.read(item);
        if (saved.status !== "known" || saved.tabId !== tabId || saved.explicit !== explicit) {
          throw new Error("Unable to verify saved URL pin intent");
        }
      }
      const current = [...new Set(this.adapters.getIntentTargets?.(tab) ?? [tab])];
      if (current.length !== targets.length || current.some(item => !targets.includes(item))) {
        throw new Error("URL pin mirror membership changed during write");
      }
      try { this.adapters.notifyIntentChanged?.(tab); }
      catch (error) { this.adapters.reportError?.(error); }
      return {status: "known", tabId, explicit};
    } catch (cause) {
      const failures = [];
      for (const entry of attempted.reverse()) {
        try {
          if (this.adapters.getId(entry.tab) !== tabId) throw new Error("URL pin identity changed during rollback");
          const current = this.adapters.getTabValue(entry.tab, FOLDER_PIN_INTENT_KEY) ?? "";
          if (current === entry.raw) continue;
          if (current !== raw) throw new Error("URL pin rollback no longer owns the record");
          this.adapters.setTabValue(entry.tab, FOLDER_PIN_INTENT_KEY, entry.raw);
          if ((this.adapters.getTabValue(entry.tab, FOLDER_PIN_INTENT_KEY) ?? "") !== entry.raw) {
            throw new Error("Unable to verify URL pin rollback");
          }
        } catch (rollback) { failures.push(rollback); }
      }
      if (failures.length) throw new AggregateError([cause, ...failures], `URL pin rollback failed: ${cause.message}`);
      throw cause;
    }
  }
}

/** The caller supplies a verified transaction origin, never guesses from the
 * final native pinned flag. null means defer/reject, not an ordinary default. */
export function resolveFolderPinIntent(record, {
  origin, settled = true, pinNew = false, incomingExplicit,
} = {}) {
  if (!settled) return null;
  if (origin === "duplicate") return false;
  if (record?.status === "known") return record.explicit;
  if (record?.status !== "missing") return null;
  if (origin === "new") return pinNew === true;
  if (origin === "legacy") return false;
  if (origin === "move" && typeof incomingExplicit === "boolean") return incomingExplicit;
  return null;
}

/** A grace period delays the actual write. Cancellation never repins the
 * current page or changes the previously saved destination. */
export class FolderPinUnpinGrace {
  constructor(adapters, store, policy, onChange = () => {}, onSettled = () => {}) {
    Object.assign(this, {adapters, store, policy, onChange, onSettled});
    this.pending = new Map();
    this.active = true;
  }
  cancel(tab) {
    const token = this.pending.get(tab);
    if (!token) return false;
    this.pending.delete(tab);
    this.adapters.clearTimer(token.timer);
    this.onChange(tab);
    if (this.active) this.onSettled({ok:true,reason:'cancelled'});
    return true;
  }
  async toggle(tab, delayMs = 0) {
    if (!this.active) return {ok: false, reason: "cancelled"};
    if (this.cancel(tab)) return {ok: true, reason: "cancelled"};
    const reason = this.policy.blocked(tab);
    if (reason) return {ok: false, reason};
    const record = this.store.read(tab);
    if (record.status !== "known" || !record.explicit) return {ok: false, reason: "not-url-pinned"};
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      const result = await this.policy.unpin(tab);
      if (this.active) this.onChange(tab);
      return result;
    }
    const a = this.adapters;
    const token = {id: a.getId(tab), location: a.getLocation(tab), baseline: a.captureBaseline(tab)};
    this.pending.set(tab, token);
    token.timer = a.setTimer(async () => {
      if (!this.active || this.pending.get(tab) !== token) return;
      this.pending.delete(tab);
      let result = {ok:true,reason:'cancelled'};
      try {
        if (!a.isConnected(tab) || a.getId(tab) !== token.id || a.getLocation(tab) !== token.location
            || !a.ownsBaseline(tab, token.baseline) || this.policy.blocked(tab)) return;
        const current = this.store.read(tab);
        if (current.status === "known" && current.explicit) result = await this.policy.unpin(tab);
      } catch (error) { a.reportError?.(error);result = {ok:false,reason:'failed'}; }
      finally { if (this.active) { this.onChange(tab);this.onSettled(result); } }
    }, delayMs);
    this.onChange(tab);
    return {ok: true, reason: "pending"};
  }
  destroy() {
    this.active = false;
    for (const tab of [...this.pending.keys()]) this.cancel(tab);
  }
}

/** Origin tokens are captured before native structural pinning and consumed
 * only at the verified end of that operation, never from final DOM flags. */
export class FolderPinLifecycle {
  constructor(adapters, store, policy) {
    this.adapters = adapters; this.store = store; this.policy = policy;
    this.active = false; this.generation = 0;
  }
  start() { this.active = true; }
  destroy() { this.active = false; this.generation++; }
  begin(tab, origin) {
    const a = this.adapters, record = this.store.read(tab), scope = a.classify(tab);
    return {tab, origin, id: a.getId(tab), generation: this.generation, record, scope,
      location: a.getLocation(tab), incomingExplicit: scope === "root" ? a.isNativePinned(tab) : undefined,
      baseline: a.getSavedBaseline(tab), done: false};
  }
  async settle(token, {settled = true, pinNew = false} = {}) {
    const a = this.adapters, tab = token?.tab;
    if (!token || !this.active || token.generation !== this.generation || a.getId(tab) !== token.id
        || !a.isConnected(tab)) return {ok: false, reason: "cancelled"};
    if (!settled) return {ok: false, reason: "unsettled"};
    if (token.done) return token.promise ?? token.result;
    if (a.coordinator?.uncertain.has(token.id)) return {ok:false,reason:'state-uncertain'};
    const held = a.coordinator?.locks.get(token.id);
    if (held) {
      if (!held.released) return {ok:false,reason:'busy'};
      const destination = a.getLocation(tab);
      await held.released;
      if (a.getLocation(tab) !== destination) return {ok:false,reason:'cancelled'};
      // Re-run every identity, intent, baseline and lifecycle check after the
      // command relinquishes ownership. Never lose an already completed move.
      return this.settle(token,{settled,pinNew});
    }
    if (a.getStartupResetEnabled() !== false || a.isRestorationReady() !== true) {
      return {ok: false, reason: "not-ready"};
    }
    const scope = a.classify(tab);
    if (!["root", "regular-folder"].includes(scope)) return {ok: false, reason: "unsupported"};
    const current = this.store.read(tab);
    // A later deliberate choice wins over an old movement/default token.
    if (token.origin !== "duplicate" && (current.status !== token.record.status
        || current.explicit !== token.record.explicit)) return {ok: false, reason: "changed-intent"};
    const explicit = resolveFolderPinIntent(token.record, {origin: token.origin, settled,
      pinNew, incomingExplicit: token.incomingExplicit});
    if (explicit === null) return {ok: false, reason: "unknown-intent"};
    // A new root tab is not a folder creation. Its native placement semantics
    // remain outside this feature; defaults cannot follow it indefinitely.
    if (scope === "root" && token.scope !== "regular-folder" && token.origin !== "duplicate") {
      return {ok: true, reason: "native-root"};
    }
    const baseline = a.getSavedBaseline(tab);
    if (explicit && token.origin !== "new" && baseline !== null && baseline !== undefined
        && JSON.stringify(baseline) !== JSON.stringify(token.baseline)) {
      return {ok: false, reason: "changed-baseline"};
    }
    token.done = true;
    const pinNewTab = explicit && token.origin === 'new' && token.record.status === 'missing';
    const lock = {}, previousBaseline = a.captureBaseline?.(tab);
    let changedBaseline = false, writtenBaseline;
    if (!pinNewTab) a.coordinator?.locks.set(token.id,lock);
    try {
      if (token.origin === "duplicate") {
        this.store.write(tab, false);
        a.clearDuplicateState(tab);
      } else if (pinNewTab) {
        this.store.write(tab, false);
        token.promise = this.policy.pin(tab);
        token.result = await token.promise;
        return token.result;
      } else {
        if (explicit && !isValidUrlPinRecovery({explicit: true, baseline: token.baseline})) {
          throw new Error("Moved explicit pin has no saved baseline");
        }
        // Restoring before a root pin prevents Zen from inventing a new reset
        // destination. Ordinary export may delete that obsolete native state.
        if (explicit) { writtenBaseline = a.setSavedBaseline(tab, token.baseline);changedBaseline = true; }
        this.store.write(tab, explicit);
        if (scope === "root") a.setRootPlacement(tab, explicit);
      }
      token.result = {ok: true};
    } catch (error) {
      if (changedBaseline && a.restoreBaseline && !a.restoreBaseline(tab,previousBaseline,writtenBaseline)) {
        a.reportError(new Error('Movement baseline rollback no longer owns the saved address'));
      }
      a.reportError(error);
      a.coordinator?.uncertain.add(token.id);
      token.result = {ok: false, reason: "failed"};
    } finally {
      if (a.coordinator?.locks.get(token.id) === lock) a.coordinator.locks.delete(token.id);
    }
    return token.result;
  }
}

/** Instance-owned origin hooks; wrappers retain native synchronous return types.
 * Duplicate provenance survives until SessionStore has restored chrome state. */
export class FolderPinOriginHooks {
  constructor(host, lifecycle, adapters, preferences) {
    Object.assign(this, {host, lifecycle, adapters, preferences});
    this.active = false; this.generation = 0; this.owned = [];
    this.transactions = new WeakMap(); this.duplicates = new Set();this.duplicateIdentities = new WeakMap();
    this.folders = new WeakSet(); this.pending = new Set(); this.creationOrigin = null;
    this.onRestore = event => {
      if (!this.active || !this.duplicates.has(event.target)) return;
      const identity = this.duplicateIdentities.get(event.target);
      if (identity && this.adapters.getId(event.target) === identity.source) {
        // Native duplicate clears zenSyncId, but legacy zenPinnedId can still
        // restore the source identity. Keep the native new-tab identity before
        // writing anything that propagates to synchronized mirrors.
        if (!identity.created || identity.created === identity.source) {
          this.adapters.reportError(new Error('Duplicate has no independent native identity'));return;
        }
        event.target.id = identity.created;
      }
      this.duplicates.delete(event.target);
      this.duplicateIdentities.delete(event.target);
      this.finish(this.lifecycle.begin(event.target, "duplicate"));
      // Other capture listeners in this dispatch must still know this is not
      // undo, even when native SessionStore copied the source's restore record.
      Promise.resolve().then(() => folderPinDuplicates.delete(event.target));
    };
    this.onAbort = () => this.destroy();
    this.onClose = event => { this.duplicates.delete(event.target);folderPinDuplicates.delete(event.target); };
  }
  wrap(owner, name, route) {
    const original = owner?.[name];
    if (typeof original !== "function") return;
    const descriptor = Object.getOwnPropertyDescriptor(owner, name), hooks = this, generation = this.generation;
    const wrapper = function(...args) {
      const native = () => Reflect.apply(original, this, args);
      return hooks.active && hooks.generation === generation ? route(args, native) : native();
    };
    Object.defineProperty(owner, name, {value: wrapper, writable: true, configurable: true,
      enumerable: descriptor?.enumerable ?? true});
    this.owned.push({owner, name, descriptor, wrapper});
  }
  members(items) {
    return [...new Set(Array.from(items ?? []).flatMap(item => item?.localName === "tab" ? [item]
      : Array.from(item?.tabs ?? item?.group?.tabs ?? [])))].filter(tab =>
      tab && !tab.hasAttribute?.("zen-empty-tab") && !tab.hasAttribute?.("zen-essential"));
  }
  finish(token, options = {pinNew: this.preferences?.get?.("pinNewFolderTabUrls") === true}) {
    const task = this.lifecycle.settle(token, options)
      .then(result => {
        if (!result.ok && !["unknown-intent", "unsupported", "cancelled"].includes(result.reason)) {
          this.adapters.reportError(new Error(`URL pin transition failed: ${result.reason}`));
        }
        return result;
      }).catch(error => { this.adapters.reportError(error); return {ok: false, reason: "failed"}; });
    this.pending.add(task);void task.finally(() => this.pending.delete(task));
    return task;
  }
  async flush() { while (this.pending.size) await Promise.all([...this.pending]); }
  adopt(source, native) {
    const owner = source?.ownerDocument?.defaultView?.__betterZenFoldersFolderPins;
    const origin = owner?.adapters, record = owner?.store?.read(source);
    if (!owner?.origins?.active || record?.status !== 'known'
        || !['root','regular-folder'].includes(origin.classify(source))) return native();
    if (origin.coordinator?.locks.has(record.tabId) || origin.coordinator?.uncertain.has(record.tabId)) {
      this.adapters.reportError(new Error('Window move refused while URL pin state is busy or uncertain'));
      return null;
    }
    // Clone data into this window's realm; strict recovery validation correctly
    // rejects objects whose prototypes belong to another window.
    const saved = JSON.parse(JSON.stringify({explicit:record.explicit,
      baseline:record.explicit ? origin.getSavedBaseline(source) : null}));
    const sourceRaw = origin.getTabValue(source,FOLDER_PIN_INTENT_KEY) ?? '';
    if (!isValidUrlPinRecovery(saved)) {
      this.adapters.reportError(new Error('Window move refused: saved URL is not recoverable'));return null;
    }
    const previous = this.creationOrigin;this.creationOrigin = 'adoption';
    let tab;
    try { tab = native(); } finally { this.creationOrigin = previous; }
    if (!tab) return tab;
    const generation = this.generation, id = this.adapters.getId(tab);
    const raw = this.adapters.getTabValue(tab,FOLDER_PIN_INTENT_KEY) ?? '';
    // Native drop can finish placing this returned tab later in the same
    // stack. Bind the transferred record only after that synchronous handoff.
    const task = Promise.resolve().then(() => {
      const a = this.adapters;
      if (!this.active || generation !== this.generation || a.getId(tab) !== id || !a.isConnected(tab)) return;
      if (raw && raw !== sourceRaw) throw new Error('Window move found conflicting destination intent');
      if ((a.getTabValue(tab,FOLDER_PIN_INTENT_KEY) ?? '') !== raw) throw new Error('Window move intent changed before handoff');
      const undo = new FolderPinRecovery(a,this.lifecycle.store).apply(tab,saved,{allowRoot:true});
      try { if (a.classify(tab) === 'root') a.setRootPlacement(tab,saved.explicit); }
      catch (error) { try { undo(); } catch (rollback) { a.reportError(rollback); }throw error; }
    }).catch(error => { this.adapters.coordinator?.uncertain.add(id);this.adapters.reportError(error); });
    this.pending.add(task);void task.finally(()=>this.pending.delete(task));
    return tab;
  }
  placeCreatedTab(tab, origin, operation) {
    if (!this.active) return operation();
    if (origin !== "new") return this.transaction([tab], "move", operation);
    const previous = this.creationOrigin;
    this.creationOrigin = "new";
    try {
      const value = operation();
      this.finishCreation(tab);
      return value;
    } finally { this.creationOrigin = previous; }
  }
  finishCreation(tab) {
    const generation = this.generation;
    const location = this.adapters.getLocation(tab);
    const pinNew = this.preferences?.get?.("pinNewFolderTabUrls") === true;
    const task = (async () => {
      if (this.adapters.waitForCreation && !await this.adapters.waitForCreation(tab, this.controller.signal, pinNew)) return;
      if (this.active && this.generation === generation && this.adapters.getLocation(tab) === location) {
        return this.finish(this.lifecycle.begin(tab, "new"), {pinNew});
      }
    })().catch(error => this.adapters.reportError(error));
    this.pending.add(task);void task.finally(() => this.pending.delete(task));
  }
  transaction(items, origin, native) {
    const actualOrigin = this.creationOrigin ?? origin;
    if (["new", "restore", "duplicate-pending", "adoption"].includes(actualOrigin)) return native();
    const tokens = [];
    for (const tab of this.members(items)) {
      if (this.transactions.has(tab) || this.duplicates.has(tab)) continue;
      const token = this.lifecycle.begin(tab, actualOrigin);
      this.transactions.set(tab, token);tokens.push(token);
    }
    const complete = success => {
      for (const token of tokens) {
        if (this.transactions.get(token.tab) !== token) continue;
        this.transactions.delete(token.tab);
        if (success && this.active) this.finish(token);
        // A root-to-root native drag may really be a Pin action. Defer its
        // automatic capture until placement is known, never discard it merely
        // because it travelled through the drop wrapper.
        if (this.active && token.nativeCapture && this.adapters.classify(token.tab) === 'root'
            && this.adapters.isNativePinned(token.tab) && !this.adapters.getSavedBaseline(token.tab)) {
          void Promise.resolve(token.nativeCapture()).catch(error => this.adapters.reportError(error));
        }
      }
    };
    try {
      const result = native();
      if (result?.then) return result.then(value => { complete(true);return value; }, error => { complete(false);throw error; });
      complete(true);return result;
    } catch (error) { complete(false);throw error; }
  }
  register(folder) {
    if (!isRegularFolder(folder) || this.folders.has(folder)) return;
    this.folders.add(folder);
    this.wrap(folder, "addTabs", ([tabs], native) => this.transaction(tabs, "move", native));
  }
  start(signal) {
    if (this.active || signal?.aborted) return;
    this.active = true;
    this.controller = new (this.host.AbortController ?? AbortController)();
    const browser = this.host.gBrowser, folders = this.host.gZenFolders;
    this.wrap(this.host.gZenWindowSync, 'setPinnedTabState', ([tab], native) => {
      const scope = this.adapters.classify(tab);
      if (scope === 'regular-folder') return Promise.resolve();
      if (scope === 'root' && this.creationOrigin === 'adoption') return Promise.resolve();
      const token = this.transactions.get(tab);
      if (scope === 'root' && token) {
        token.nativeCapture ??= native;
        return Promise.resolve();
      }
      return native();
    });
    this.wrap(folders, "_createFolderNode", (args, native) => { const folder = native();this.register(folder);return folder; });
    for (const folder of this.host.document.querySelectorAll("zen-folder")) this.register(folder);
    this.wrap(folders, "createFolder", ([tabs], native) => this.transaction(tabs, "move", native));
    this.wrap(folders, "on_TabOpen", ([event], native) => this.transaction([event.target], this.creationOrigin ?? "restore", native));
    this.wrap(browser, "addTab", ([url, options = {}], native) => {
      const previous = this.creationOrigin;
      this.creationOrigin ??= options.skipLoad || options.insertTab === false ? "restore" : "new";
      try {
        const tab = native();
        // TabOpen precedes Zen's identity assignment and initial load. The
        // exact tab returned by genuine addTab is the verified handoff.
        if (tab && this.creationOrigin === "new" && this.adapters.classify(tab) === "regular-folder") {
          this.finishCreation(tab);
        }
        return tab;
      } finally { this.creationOrigin = previous; }
    });
    this.wrap(browser, "duplicateTab", (args, native) => {
      const previous = this.creationOrigin;this.creationOrigin = "duplicate-pending";
      try { const tab = native();if (tab) {
        this.duplicateIdentities.set(tab,{source:this.adapters.getId(args[0]),created:this.adapters.getId(tab)});
        this.duplicates.add(tab);folderPinDuplicates.add(tab);
      }return tab; }
      finally { this.creationOrigin = previous; }
    });
    this.wrap(browser,'adoptTab',([source],native)=>this.adopt(source,native));
    for (const [name, explicit] of [["pinTab",true],["unpinTab",false]]) {
      this.wrap(browser,name,([tab],native)=>{
        const ownsChoice = !this.creationOrigin && !this.transactions.has(tab) && !this.duplicates.has(tab)
          && this.adapters.classify(tab) === 'root' && this.lifecycle.store.read(tab).status === 'known'
          && this.adapters.isNativePinned(tab) !== explicit;
        const result = native();
        if (ownsChoice && this.adapters.classify(tab) === 'root' && this.adapters.isNativePinned(tab) === explicit) {
          try { this.lifecycle.store.write(tab,explicit); }
          catch (error) { this.adapters.coordinator?.uncertain.add(this.adapters.getId(tab));this.adapters.reportError(error); }
        }
        return result;
      });
    }
    for (const name of ["moveTabToExistingGroup", "moveSplitViewToExistingGroup", "ungroupTab", "moveTabTo", "zenHandleTabMove"]) {
      this.wrap(browser, name, ([item], native) => this.transaction([item], "move", native));
    }
    for (const name of ['moveTabForward','moveTabBackward','moveTabToStart','moveTabToEnd']) {
      this.wrap(browser,name,(args,native)=>this.transaction([browser.selectedTab?.splitview ?? browser.selectedTab],'move',native));
    }
    this.wrap(this.host.gZenWorkspaces, 'moveTabsToWorkspace', ([tabs], native) =>
      this.transaction(this.members(tabs).flatMap(tab => tab.group?.hasAttribute?.('split-view-group')
        ? Array.from(tab.group.tabs) : [tab]), 'move', native));
    const drag = browser?.tabContainer?.tabDragAndDrop;
    this.wrap(drag, "handle_drop", ([event], native) => {
      let source;
      try { source = event?.dataTransfer?.mozGetDataAt?.("application/x-moz-tabbrowser-tab", 0); } catch {}
      return this.transaction(source?._dragData?.movingTabs ?? (source ? [source] : []), "move", native);
    });
    this.host.addEventListener("SSTabRestoring", this.onRestore, true);
    this.host.addEventListener("TabClose", this.onClose, true);
    this.signal = signal;signal?.addEventListener("abort", this.onAbort, {once: true});
  }
  destroy() {
    this.active = false;this.generation++;
    this.controller?.abort();
    this.signal?.removeEventListener("abort", this.onAbort);this.signal = null;
    this.host.removeEventListener("SSTabRestoring", this.onRestore, true);
    this.host.removeEventListener("TabClose", this.onClose, true);
    for (const tab of this.duplicates) folderPinDuplicates.delete(tab);
    for (const {owner, name, descriptor, wrapper} of this.owned.reverse()) {
      if (owner[name] !== wrapper) continue;
      if (descriptor) Object.defineProperty(owner, name, descriptor);else delete owner[name];
    }
    this.owned = [];this.folders = new WeakSet();this.duplicates.clear();this.transactions = new WeakMap();this.duplicateIdentities = new WeakMap();
  }
}

/** Undo evidence is independent of placement and of the currently enabled UI.
 * Restores only verified records, never infers intent from a structural pin. */
export class FolderPinRecovery {
  constructor(adapters, store) { this.adapters = adapters; this.store = store; }

  capture(tab) {
    const scope = this.adapters.classifyForRecovery?.(tab) ?? this.adapters.classify(tab);
    if (scope !== "regular-folder") return null;
    const intent = this.store.read(tab);
    if (intent.status !== "known") return null;
    const value = {explicit: intent.explicit,
      baseline: intent.explicit ? JSON.parse(JSON.stringify(tab._zenPinnedInitialState ?? null)) : null};
    if (!isValidUrlPinRecovery(value)) throw new Error("Explicit pin has no recoverable baseline");
    return value;
  }

  apply(tab, value, {allowRoot = false} = {}) {
    const scope = this.adapters.classify(tab);
    if (!isValidUrlPinRecovery(value) || (scope !== "regular-folder" && !(allowRoot && scope === 'root'))) {
      throw new Error("Invalid or unsupported URL pin recovery");
    }
    const a = this.adapters, id = a.getId(tab), token = {};
    if (a.coordinator.locks.has(id)) throw new Error("URL pin recovery is busy");
    a.coordinator.locks.set(id, token);
    let before, records, after;
    try {
      before = a.captureBaseline(tab);
      records = a.getIntentTargets(tab).map(item => ({tab: item, id: a.getId(item),
        raw: a.getTabValue(item, FOLDER_PIN_INTENT_KEY) ?? ""}));
      after = value.explicit ? a.setSavedBaseline(tab, value.baseline) : before;
      this.store.write(tab, value.explicit);
    } catch (cause) {
      if (after && after !== before && !a.restoreBaseline(tab, before, after)) {
        a.coordinator.uncertain.add(id);
        throw new AggregateError([cause], "URL pin recovery baseline rollback failed");
      }
      if (cause instanceof AggregateError) a.coordinator.uncertain.add(id);
      throw cause;
    } finally {
      if (a.coordinator.locks.get(id) === token) a.coordinator.locks.delete(id);
    }
    const written = JSON.stringify({schema: 1, tabId: id, explicit: value.explicit});
    let undone = false;
    return () => {
      if (undone) return;
      const current = a.getIntentTargets(tab);
      if (a.coordinator.locks.has(id) || !a.ownsBaseline(tab, after)
          || current.length !== records.length || records.some(entry => !current.includes(entry.tab)
            || a.getId(entry.tab) !== entry.id || a.getTabValue(entry.tab, FOLDER_PIN_INTENT_KEY) !== written)) {
        throw new Error("URL pin recovery rollback no longer owns state (later owner)");
      }
      // All ownership checked before restoring any part of the transaction.
      try {
        if (!a.restoreBaseline(tab, before, after)) throw new Error("URL pin recovery baseline rollback refused");
        for (const entry of records) {
          a.setTabValue(entry.tab, FOLDER_PIN_INTENT_KEY, entry.raw);
          if ((a.getTabValue(entry.tab, FOLDER_PIN_INTENT_KEY) ?? "") !== entry.raw) {
            throw new Error("URL pin recovery intent rollback refused");
          }
        }
        undone = true;
      } catch (error) { a.coordinator.uncertain.add(id); throw error; }
    };
  }
}

/** Semantic commands only. Native event interception/presentation own their
 * lifecycle separately. No command silently changes Zen's startup preference. */
export class FolderPinPolicy {
  constructor(adapters, store) {
    this.adapters = adapters;
    this.store = store;
    this.active = false;
    this.generation = 0;
    this.busy = new Set();
    this.uncertain = new WeakSet();
    this.coordinator = adapters.coordinator ?? {locks: new Map(), uncertain: new Set()};
    this.onAbort = () => this.destroy();
  }

  start(signal) {
    if (this.active || signal?.aborted) return;
    this.active = true;
    this.signal = signal;
    signal?.addEventListener("abort", this.onAbort, {once: true});
  }

  destroy() {
    this.active = false;
    this.generation++;
    this.signal?.removeEventListener("abort", this.onAbort);
    this.signal = null;
    // In-flight transactions retain their locks until their finally block.
  }

  blocked(tab) {
    if (!this.active) return "inactive";
    if (this.adapters.getStartupResetEnabled() !== false) return "startup-reset-enabled";
    if (this.adapters.isRestorationReady() !== true) return "restoring";
    if (this.adapters.classify(tab) !== "regular-folder") return "unsupported";
    const nativeBlock = this.adapters.getCommandBlockReason?.(tab);
    if (nativeBlock) return nativeBlock;
    if (this.uncertain.has(tab) || this.coordinator.uncertain.has(this.adapters.getId(tab))) return "uncertain-state";
    if (this.store.read(tab).status !== "known") return "unknown-intent";
    return null;
  }

  async run(tabs, action) {
    const targets = [...new Set(tabs)];
    if (!targets.length) return {ok: false, reason: "no-tabs"};
    const ids = targets.map(tab => this.adapters.getId(tab));
    let release;
    const lock = {released:new Promise(resolve=>{release=resolve;})};
    if (targets.some(tab => this.busy.has(tab)) || ids.some(id => this.coordinator.locks.has(id))) {
      return {ok: false, reason: "busy"};
    }
    try {
      for (const tab of targets) {
        const reason = this.blocked(tab);
        if (reason) return {ok: false, reason};
      }
      for (const tab of targets) this.busy.add(tab);
      for (const id of ids) this.coordinator.locks.set(id, lock);
      return await action(targets);
    } catch (error) {
      if (error instanceof AggregateError) {
        for (const tab of targets) this.markUncertain(tab);
      }
      this.adapters.reportError(error);
      return {ok: false, reason: "failed"};
    } finally {
      for (const tab of targets) this.busy.delete(tab);
      for (const id of ids) if (this.coordinator.locks.get(id) === lock) this.coordinator.locks.delete(id);
      release();
    }
  }

  markUncertain(tab) {
    this.uncertain.add(tab);
    this.coordinator.uncertain.add(this.adapters.getId(tab));
  }

  pin(tab) { return this.changeBaseline(tab, "pin"); }
  update(tab) { return this.changeBaseline(tab, "update"); }
  edit(tab) { return this.changeBaseline(tab, "edit"); }

  changeBaseline(tab, mode) {
    return this.run([tab], async () => {
      const explicit = this.store.read(tab).explicit;
      if (mode === "pin" && explicit) return {ok: true};
      if (mode !== "pin" && !explicit) return {ok: false, reason: "not-url-pinned"};
      const token = {generation: this.generation, id: this.adapters.getId(tab),
        location: this.adapters.getLocation(tab)};
      const stillCurrent = () => this.generation === token.generation && !this.blocked(tab)
        && this.store.read(tab).explicit === explicit
        && this.adapters.getId(tab) === token.id && this.adapters.getLocation(tab) === token.location;
      let url;
      if (mode === "edit") {
        url = await this.adapters.promptBaselineUrl(tab);
        if (url === null || !stillCurrent()) return {ok: false, reason: "cancelled"};
      }
      const previous = this.adapters.captureBaseline(tab);
      let next;
      const rollback = () => {
        try {
          // A concurrent explicit choice may now own this same baseline. Even
          // equal bytes do not authorise us to undo that choice.
          if (this.adapters.getId(tab) === token.id
              && this.store.read(tab).explicit === explicit
              && this.adapters.restoreBaseline(tab, previous, next) === true) return true;
        } catch (error) { this.adapters.reportError(error); }
        this.markUncertain(tab);
        return false;
      };
      try {
        next = mode === "edit" ? await this.adapters.setUrlAsBaseline(tab, url)
          : await this.adapters.setCurrentAsBaseline(tab);
        if (!stillCurrent() || this.adapters.ownsBaseline(tab, next) !== true) {
          if (!rollback()) return {ok: false, reason: "rollback-failed"};
          return {ok: false, reason: "cancelled"};
        }
        this.store.write(tab, true);
        return {ok: true};
      } catch (error) {
        // Adapters must roll back their own incomplete capture if they reject
        // before returning the new baseline; policy owns the completed capture.
        if (next !== undefined && !rollback()) {
          this.adapters.reportError(error);
          return {ok: false, reason: "rollback-failed"};
        }
        if (error instanceof AggregateError) this.markUncertain(tab);
        throw error;
      }
    });
  }

  unpin(tab) {
    return this.run([tab], () => {
      this.store.write(tab, false);
      return {ok: true};
    });
  }

  reset(tab) {
    return this.run([tab], async () => {
      if (!this.store.read(tab).explicit) return {ok: false, reason: "not-url-pinned"};
      await this.adapters.resetToBaseline(tab);
      return {ok: true};
    });
  }

  close(tabs, event) {
    return this.run(tabs, async targets => (await this.adapters.closeTabs(targets, event)) === true
      ? {ok: true} : {ok: false, reason: "refused"});
  }

  unload(tabs) {
    return this.run(tabs, async targets => (await this.adapters.unloadTabs(targets)) === true
      ? {ok: true} : {ok: false, reason: "refused"});
  }
}

/** Browser boundary for folder URL intent. Constructing it changes no tabs or
 * preferences. The controller must explicitly opt in after compatibility and
 * restoration gates; these adapters do not install native event hooks. */
export function createBrowserFolderPinAdapters(host, {flushTab} = {}) {
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const reportError = error => host.console?.error?.("Better Zen Folders URL pins", error);
  const nativeReset = host.gZenPinnedTabManager?.resetPinnedTab;
  const nativeChanged = host.gZenPinnedTabManager?.pinHasChangedUrl;
  // Shared only with windows participating in the same native sync service.
  // No tab references, URLs or private data are retained by this coordinator.
  const coordinatorOwner = !host.gZenWorkspaces?.privateWindowOrDisabled && host.gZenWindowSync
    ? host.gZenWindowSync : host;
  const coordinatorKey = Symbol.for("better-zen-folders.url-pin-coordinator.v1");
  const coordinator = coordinatorOwner[coordinatorKey] ??= {locks: new Map(), uncertain: new Set()};
  let restorationReady = false;
  const startup = host.gZenStartup?.promiseInitialized;
  const workspaces = host.gZenWorkspaces?.promiseInitialized;
  // Native Zen never resolves pinned initialization in these window modes.
  // Skipping that promise alone would not make its sync-only baseline API safe.
  const unsupportedWindow = host.gZenWorkspaces?.privateWindowOrDisabled === true
    || host.gZenPinnedTabManager?.enabled === false;
  const ready = unsupportedWindow ? Promise.resolve(false) : Promise.all([startup, workspaces, host.SessionStore?.promiseAllWindowsRestored,
    host.gZenWorkspaces?.promisePinnedInitialized]).then(() => {
    restorationReady = Boolean(startup?.then && workspaces?.then && !host.closed);
    return restorationReady;
  }).catch(error => { reportError(error); return false; });
  const location = tab => tab?.closest?.("zen-folder") ?? null;
  const classifyInDocument = (tab, document, {allowClosing = false} = {}) => {
    if (!tab || !document || tab.ownerDocument !== document || tab.localName !== "tab"
        || !tab.isConnected || (!allowClosing && tab.closing) || tab.hasAttribute("zen-empty-tab")) return "unsupported";
    if (tab.hasAttribute("zen-essential")) return "essential";
    const folder = location(tab);
    if (!folder) return "root";
    if ([folder, ...browserFolderAncestors(folder)].some(item => item.isLiveFolder)) return "live";
    return tab.pinned && isRegularFolder(folder) ? "regular-folder" : "unsupported";
  };
  const classify = (tab, options) => classifyInDocument(tab,host.document,options);
  // Migration may inspect a verified synchronized mirror, but command routing
  // must continue rejecting tabs owned by another document.
  const classifyIntentTarget = tab => {
    if (tab?.ownerDocument === host.document) return classify(tab);
    const owner = browserSynchronizedWindows(host).find(win=>win.document === tab?.ownerDocument
      && win.gZenWorkspaces?.allStoredTabs?.includes(tab));
    return owner ? classifyInDocument(tab,owner.document) : 'unsupported';
  };
  const mirrors = tab => {
    const found = new Set([tab]);
    if (host.gZenWorkspaces?.privateWindowOrDisabled) return [...found];
    for (const win of browserSynchronizedWindows(host)) {
      const other = win.gZenWorkspaces?.allStoredTabs?.find(item => item.id === tab.id);
      if (other) found.add(other);
    }
    return [...found];
  };
  const snapshot = tab => mirrors(tab).map(item => ({tab: item, id: item.id,
    owner: item._zenPinnedInitialState, value: clone(item._zenPinnedInitialState)}));
  const ownsBaseline = (tab, expected) => {
    const current = mirrors(tab);
    return current.length === expected.length && expected.every(entry =>
      current.includes(entry.tab) && entry.tab.id === entry.id
        && entry.tab.isConnected && entry.tab._zenPinnedInitialState === entry.owner);
  };
  const restoreBaseline = (tab, previous, expected) => {
    const current = mirrors(tab);
    if (previous.length !== expected.length || current.length !== expected.length
        || expected.some((entry, index) => entry.tab !== previous[index].tab
          || !current.includes(entry.tab) || entry.tab.id !== entry.id
          || !entry.tab.isConnected || entry.tab._zenPinnedInitialState !== entry.owner)) return false;
    for (const entry of previous) {
      if (entry.value === undefined) delete entry.tab._zenPinnedInitialState;
      else entry.tab._zenPinnedInitialState = clone(entry.value);
    }
    return true;
  };
  const getState = tab => JSON.parse(host.SessionStore.getTabState(tab));
  const refreshNativePresentation = tab => {
    for (const target of mirrors(tab)) {
      if (classifyIntentTarget(target) !== 'regular-folder') continue;
      const raw = host.SessionStore.getCustomTabValue(target,FOLDER_PIN_INTENT_KEY);
      let record;
      try { record = JSON.parse(raw || 'null'); } catch { continue; }
      if (record?.schema !== 1 || record.tabId !== target.id || typeof record.explicit !== 'boolean') continue;
      const owner = target.ownerDocument?.defaultView ?? host;
      // Native resetPinChangedUrl returns early for a split row carrying only
      // had-zen-pinned-changed. Clear both native presentations before deriving.
      target.removeAttribute?.('zen-pinned-changed');target.removeAttribute?.('had-zen-pinned-changed');
      target.style?.removeProperty('--zen-original-tab-icon');
      if (!record.explicit || !target._zenPinnedInitialState?.entry?.url) continue;
      const state = (owner.SessionStore ?? host.SessionStore).getTabState(target);
      const saved = JSON.parse(state);
      const current = target.hasAttribute('pending') ? saved.entries?.[saved.index - 1]?.url
        : target.linkedBrowser?.currentURI?.spec ?? saved.entries?.[saved.index - 1]?.url;
      if (!current) continue;
      const canonical = value => {
        const withoutHash = value.split('#')[0];
        return (owner.Services ?? host.Services).io?.newURI(withoutHash).spec ?? withoutHash;
      };
      if (canonical(current) !== canonical(target._zenPinnedInitialState.entry.url)) {
        const manager = owner.gZenPinnedTabManager ?? host.gZenPinnedTabManager;
        if (nativeChanged) Reflect.apply(nativeChanged,manager,[target]);
      }
    }
  };
  const commitBaseline = (tab, entry, image, previous = snapshot(tab)) => {
    try {
      host.gZenWindowSync.setPinnedInitialState(tab, entry, image);
      const next = snapshot(tab);
      if (next.length !== previous.length || next.some((item, index) =>
        item.tab !== previous[index].tab || item.owner?.entry !== entry)) {
        throw new Error("Unable to verify URL pin baseline");
      }
      return next;
    } catch (cause) {
      const partial = snapshot(tab);
      if (partial.length !== previous.length || partial.some((item, index) =>
        item.tab !== previous[index].tab || (item.owner !== previous[index].owner
          && item.owner?.entry !== entry)) || !restoreBaseline(tab, previous, partial)) {
        throw new AggregateError([cause], "URL pin baseline rollback failed");
      }
      throw cause;
    }
  };
  const adapters = {
    ready, classify, classifyIntentTarget, getLocation: location, reportError, coordinator, getIntentTargets: mirrors,
    refreshNativePresentation, getTabForBrowser: browser => host.gBrowser.getTabForBrowser?.(browser),
    notifyIntentChanged: tab => {
      refreshNativePresentation(tab);
      for (const target of mirrors(tab)) {
        const owner = target.ownerDocument?.defaultView ?? host;
        if (owner.CustomEvent) target.dispatchEvent?.(new owner.CustomEvent('BetterZenFoldersUrlPinChanged',{bubbles:true}));
        owner.gBrowser?._tabAttrModified?.(target,['better-zen-folders-url-pin']);
      }
    },
    classifyForRecovery: tab => classify(tab, {allowClosing: true}),
    getId: tab => tab?.id,
    waitForCreation: (tab, signal, waitForHistory = false) => new Promise(resolve => {
      let observer, completed = false, checking = false, recheck = false;
      const finish = value => { if (completed) return;completed = true;
        observer?.disconnect();host.gBrowser.removeTabsProgressListener?.(progress);
        host.removeEventListener("TabClose", close, true);
        signal?.removeEventListener("abort", abort);resolve(value); };
      const check = async () => {
        if (completed) return;
        if (checking) { recheck = true;return; }
        if (signal?.aborted || tab.closing || !tab.isConnected) finish(false);
        else if (tab.id) {
          if (!waitForHistory) return finish(true);
          checking = true;
          try {
            await host.gBrowser.TabStateFlusher.flush(tab.linkedBrowser);
            const state = getState(tab);
            if (!signal?.aborted && !tab.closing && state.entries?.[state.index - 1]?.url) finish(true);
          } catch (error) { reportError(error);finish(false); }
          finally { checking = false;if (recheck && !completed) { recheck = false;void check(); } }
        }
      };
      const progress = {
        onLocationChange: (browser, webProgress) => { if (browser === tab.linkedBrowser && webProgress.isTopLevel) void check(); },
        onStateChange: (browser, webProgress) => { if (browser === tab.linkedBrowser && webProgress.isTopLevel) void check(); },
      };
      const close = event => { if (event.target === tab) finish(false); };
      const abort = () => finish(false);
      observer = new host.MutationObserver(check);
      observer.observe(tab, {attributes: true, attributeFilter: ["id"]});
      if (waitForHistory) host.gBrowser.addTabsProgressListener(progress);
      host.addEventListener("TabClose", close, true);signal?.addEventListener("abort", abort, {once: true});check();
    }),
    isNativePinned: tab => tab?.pinned === true,
    isConnected: tab => tab?.isConnected === true && !tab.closing,
    getSavedBaseline: tab => clone(tab?._zenPinnedInitialState ?? null),
    setRootPlacement: (tab, pinned) => {
      if (location(tab)) throw new Error("Cannot export a tab before native movement completes");
      if (pinned !== tab.pinned) host.gBrowser[pinned ? "pinTab" : "unpinTab"](tab);
      if (pinned !== tab.pinned) throw new Error("Unable to verify exported tab placement");
    },
    clearDuplicateState: tab => {
      for (const other of mirrors(tab)) {
        delete other._zenPinnedInitialState;
        host.SessionStore.setCustomTabValue(other, STICKY_TAB_KEY, "");
        // A duplicate must not replay the source tab's undo snapshot.
        host.SessionStore.setCustomTabValue(other, RESTORE_KEY, "");
      }
    },
    getTabValue: (tab, key) => host.SessionStore.getCustomTabValue(tab, key),
    setTabValue: (tab, key, value) => host.SessionStore.setCustomTabValue(tab, key, value),
    getStartupResetEnabled: () => host.Services.prefs.getBoolPref(
      "zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url", false),
    isRestorationReady: () => restorationReady && !host.closed,
    captureBaseline: snapshot, restoreBaseline, ownsBaseline,
    setSavedBaseline: (tab, baseline) => {
      if (!isValidUrlPinRecovery({explicit: true, baseline})) throw new Error("Invalid saved URL baseline");
      return commitBaseline(tab, clone(baseline.entry), baseline.image);
    },
    getCommandBlockReason: tab => {
      const raw = adapters.getTabValue(tab, FOLDER_PIN_INTENT_KEY);
      return mirrors(tab).some(other => adapters.getTabValue(other, FOLDER_PIN_INTENT_KEY) !== raw)
        ? "conflicting-intent" : null;
    },
    promptBaselineUrl(tab) {
      const value = {value: tab._zenPinnedInitialState?.entry?.url ?? ""};
      return host.Services.prompt.prompt(host, "Edit Pinned URL",
        "Change the saved address only. Use Reset to Pinned URL to open it.",
        value, null, {value: false}) ? value.value : null;
    },
    setCurrentAsBaseline(tab) { return adapters.writeBaseline(tab); },
    setUrlAsBaseline(tab, input) {
      try {
        if (typeof input !== "string" || !input.trim()) throw new Error("Enter a valid URL");
        const uri = host.Services.uriFixup
          ? host.Services.uriFixup.getFixupURIInfo(input.trim(),
            host.Ci.nsIURIFixup.FIXUP_FLAG_FIX_SCHEME_TYPOS).preferredURI
          : host.Services.io.newURI(input.trim());
        // Editing a destination is not permission to execute script or target
        // privileged browser chrome. Normal navigable page schemes only.
        if (!uri || !["http", "https", "file", "about", "moz-extension", "ftp"].includes(uri.scheme)) {
          throw new Error("Unsupported pinned URL");
        }
        return adapters.writeBaseline(tab, uri.spec);
      } catch (error) { return Promise.reject(error); }
    },
    async writeBaseline(tab, editedUrl) {
      if (adapters.getCommandBlockReason(tab)) throw new Error("URL pin mirrors have conflicting intent");
      if (classify(tab) !== "regular-folder" || !adapters.isRestorationReady()
          || adapters.getStartupResetEnabled()) throw new Error("URL pin capture is not ready");
      const id = tab.id, folder = location(tab), previous = snapshot(tab);
      // Native setPinnedTabState mutates in finally(), even after a failed
      // flush. Flush ourselves and commit only after a successful read.
      if (editedUrl === undefined && !tab.hasAttribute("pending")) {
        if (flushTab) await flushTab(tab);
        else {
          await host.gBrowser.TabStateFlusher.flush(tab.linkedBrowser);
        }
      }
      const current = snapshot(tab);
      if (tab.id !== id || location(tab) !== folder || classify(tab) !== "regular-folder"
          || adapters.getStartupResetEnabled() || !adapters.isRestorationReady()
          || adapters.getCommandBlockReason(tab)
          || current.length !== previous.length || current.some((entry, index) =>
            entry.tab !== previous[index].tab || entry.owner !== previous[index].owner)) {
        throw new Error("URL pin capture changed while flushing");
      }
      const state = getState(tab), saved = editedUrl === undefined ? state.entries?.[state.index - 1]
        : {url: editedUrl, title: tab.zenStaticLabel ?? editedUrl};
      if (!saved || typeof saved.url !== "string" || !saved.url.length) {
        throw new Error("URL pin capture has no current history entry");
      }
      const entry = {url: saved.url, title: saved.title ?? tab.label ?? ""};
      return commitBaseline(tab, entry, editedUrl === undefined ? state.image : tab.zenStaticIcon, previous);
    },
    async resetToBaseline(tab) {
      const url = tab._zenPinnedInitialState?.entry?.url;
      if (!url || typeof nativeReset !== "function") throw new Error("No native pinned URL reset available");
      Reflect.apply(nativeReset, host.gZenPinnedTabManager, [tab]);
      const state = getState(tab);
      if (state.entries?.length !== 1 || state.entries[0]?.url !== url) {
        throw new Error("Unable to verify pinned URL reset");
      }
    },
    async closeTabs(tabs, event) {
      // Native removeTabs returns void. Keep permission prompts and SessionStore
      // undo intact, then inspect actual removal instead of trusting that return.
      host.gBrowser.removeTabs(tabs, {animate: true, triggeringEvent: event});
      return tabs.every(tab => tab.closing || !tab.isConnected);
    },
    async unloadTabs(tabs) {
      const accepted = await host.gBrowser.explicitUnloadTabs(tabs);
      return accepted === true && tabs.every(tab => tab.hasAttribute("pending"));
    },
  };
  return adapters;
}

/** Owned runtime entry points, separate from migration/presentation. Kept
 * uninstalled by bootstrap until the full capability contract is established. */
export class FolderPinNativeHooks {
  constructor(host, policy, adapters, onResult = () => {}) {
    this.host = host;
    this.policy = policy;
    this.adapters = adapters;
    this.onResult = onResult;
    this.active = false;
    this.generation = 0;
    this.owned = [];
    this.onAbort = () => this.destroy();
    this.onCommand = event => {
      if (!this.active || event.target !== this.host.document.getElementById("cmd_close")) return;
      const tab = this.host.gBrowser.selectedTab;
      if (!this.isFolder(tab)) return;
      this.consume(event);
      void this.complete(() => this.policy.close([tab], event));
    };
  }
  isFolder(tab) { return this.adapters.classify(tab) === "regular-folder"; }
  consume(event) {
    event?.preventDefault?.();
    if (event?.stopImmediatePropagation) event.stopImmediatePropagation();
    else event?.stopPropagation?.();
  }
  async complete(operation) {
    const generation = this.generation;
    const outcome = await operation();
    if (this.active && this.generation === generation) {
      try { this.onResult(outcome); } catch (error) { this.adapters.reportError(error); }
    }
    return outcome;
  }
  wrap(name, route) {
    const owner = this.host.gZenPinnedTabManager;
    const original = owner[name];
    if (typeof original !== "function") throw new Error(`Missing native pin entry: ${name}`);
    const descriptor = Object.getOwnPropertyDescriptor(owner, name);
    const hooks = this;
    const generation = this.generation;
    const wrapper = function(...args) {
      if (!hooks.active || hooks.generation !== generation) return Reflect.apply(original, this, args);
      return route(args, (...replacement) => Reflect.apply(original, this, replacement.length ? replacement : args));
    };
    Object.defineProperty(owner, name, {value: wrapper, writable: true, configurable: true,
      enumerable: descriptor?.enumerable ?? true});
    this.owned.push({owner, name, descriptor, wrapper});
  }
  start(signal) {
    if (this.active || signal?.aborted || !this.policy.active
        || this.adapters.getStartupResetEnabled() !== false
        || this.adapters.isRestorationReady() !== true) return;
    this.active = true;
    try {
      this.wrap("resetPinnedTab", ([tab], native) => {
        const target = tab ?? this.host.TabContextMenu?.contextTab;
        return this.isFolder(target) ? this.complete(() => this.policy.reset(target)) : native();
      });
      for (const name of ['onLocationChange','pinHasChangedUrl']) {
        if (typeof this.host.gZenPinnedTabManager[name] !== 'function') continue;
        this.wrap(name, ([value, progress], native) => {
          const tab = name === 'onLocationChange' ? this.adapters.getTabForBrowser?.(value) : value;
          if (!this.isFolder(tab)) return native();
          if (name !== 'onLocationChange' || progress?.isTopLevel) this.adapters.refreshNativePresentation?.(tab);
        });
      }
      for (const [name, action] of [["editPinnedUrl", "edit"], ["replacePinnedUrlWithCurrent", "update"]]) {
        this.wrap(name, ([tab], native) => {
          const target = tab ?? this.host.TabContextMenu?.contextTab;
          return this.isFolder(target) ? this.complete(() => this.policy[action](target)) : native();
        });
      }
      this.wrap("onCloseTabShortcut", ([event, selected, options = {}], native) => {
        const selectedTabs = selected ?? this.host.gBrowser.selectedTab;
        const tabs = Array.isArray(selectedTabs) ? selectedTabs : [selectedTabs];
        if (!tabs.some(tab => this.isFolder(tab))) return native();
        this.consume(event);
        const folders = tabs.filter(tab => this.isFolder(tab)), roots = tabs.filter(tab => !this.isFolder(tab));
        if (roots.some(tab => this.adapters.classify(tab) !== 'root')) {
          return this.complete(() => ({ok:false,reason:'unsupported-mixed-targets'}));
        }
        const unload = options.alwaysUnload || options.folderToUnload || options.noClose;
        const generation = this.generation;
        return this.complete(async () => {
          const result = await (unload ? this.policy.unload(folders) : this.policy.close(folders,event));
          if (!result.ok || !roots.length) return result;
          if (!this.active || this.generation !== generation) return {ok:false,reason:'cancelled'};
          // Never pass folder constituents to native's split/reset expansion.
          if (roots.some(tab => this.adapters.classify(tab) !== 'root')) return {ok:false,reason:'changed-targets'};
          if (unload) return await this.adapters.unloadTabs(roots) === true ? {ok:true} : {ok:false,reason:'refused'};
          const ordinary = roots.filter(tab => this.adapters.isNativePinned?.(tab) === false);
          const pinned = roots.filter(tab => !ordinary.includes(tab));
          if (ordinary.length && await this.adapters.closeTabs(ordinary,event) !== true) return {ok:false,reason:'refused'};
          if (!this.active || this.generation !== generation) return {ok:false,reason:'cancelled'};
          if (pinned.length) await native(event,pinned,options);
          return {ok:true,reason:'native-targets-dispatched'};
        });
      });
      this.wrap("_onTabResetPinButton", ([event, tab], native) => {
        if (!this.isFolder(tab)) return native();
        this.consume(event);
        // Native Accel duplicates then resets through a private callback. Do not
        // let that path bypass intent; the duplicate lifecycle is a rollout gate.
        if (event?.getModifierState?.("Accel")) {
          return this.complete(() => ({ok: false, reason: "unsupported-modified-reset"}));
        }
        return this.complete(() => this.policy.reset(tab));
      });
      // Zen bound its original handler before Sine loaded. A method wrapper
      // alone cannot protect keyboard Close, so capture that command earlier.
      this.host.document.addEventListener("command", this.onCommand, true);
      this.signal = signal;
      signal?.addEventListener("abort", this.onAbort, {once: true});
    } catch (error) {
      this.destroy();
      this.adapters.reportError(error);
    }
  }
  destroy() {
    this.active = false;
    this.generation++;
    this.signal?.removeEventListener("abort", this.onAbort);
    this.signal = null;
    this.host.document.removeEventListener("command", this.onCommand, true);
    for (const {owner, name, descriptor, wrapper} of this.owned.reverse()) {
      if (owner[name] !== wrapper) continue;
      if (descriptor) Object.defineProperty(owner, name, descriptor);
      else delete owner[name];
    }
    this.owned = [];
  }
}

/** Consent is independent of per-tab conversion. Failed/malformed records stay
 * unresolved and are never labelled as a completed migration. */
export class FolderPinActivation {
  constructor(adapters, store) { this.adapters = adapters;this.store = store;this.generation = 0;this.active = false; }
  start() {
    if (this.operation) return this.operation;
    this.active = true;const generation = this.generation;
    const current = () => this.active && generation === this.generation;
    this.operation = (async () => {
      const a = this.adapters;
      if (!await a.ready || !current()) return {ok:false,reason:'cancelled'};
      if (!a.isRestorationReady()) return {ok:false,reason:'not-ready'};
      if (!a.hasConsent() || a.getStartupResetEnabled() !== false) {
        const accepted = await a.requestConsent({startupReset:a.getStartupResetEnabled() !== false,first:!a.hasConsent()});
        if (!current()) return {ok:false,reason:'cancelled'};
        if (!accepted) { a.disableFeature();return {ok:false,reason:'declined'}; }
        if (a.getStartupResetEnabled() !== false) a.setStartupResetOff();
        if (a.getStartupResetEnabled() !== false) return {ok:false,reason:'startup-reset-enabled'};
        a.acceptConsent();
      }
      this.cleanup = a.install();
      let migrated = 0, unresolved = 0;
      for (const tab of a.listTabs()) {
        if (!current() || !a.isRestorationReady() || a.getStartupResetEnabled() !== false) return {ok:false,reason:'cancelled'};
        const scope = a.classify(tab);
        if (scope !== 'regular-folder' && scope !== 'root') continue;
        try {
          const targets = [...new Set(a.getIntentTargets?.(tab) ?? [tab])];
          const records = targets.map(target => this.store.read(target));
          if (scope === 'root') {
            const record = this.store.read(tab);
            // Only settled roots have unambiguous native pin semantics while
            // the feature was absent. Mixed placement across mirrors is not a
            // trustworthy root boundary and must not silently change intent.
            if (record.status !== 'known') continue;
            if (targets.some(target=>(a.classifyIntentTarget ?? a.classify)(target) !== 'root')) { unresolved++;continue; }
            const native = a.isNativePinned?.(tab);
            if (typeof native !== 'boolean') continue;
            if (records.some(other=>other.status === 'invalid')
                || targets.some(target=>a.isNativePinned(target) !== native)) { unresolved++;continue; }
            if (records.some(other=>other.status !== 'known' || other.explicit !== native)) this.store.write(tab,native);
            continue;
          }
          const choices = new Set(records.filter(record=>record.status === 'known').map(record=>record.explicit));
          if (records.some(record=>record.status === 'invalid') || choices.size > 1) { unresolved++;continue; }
          if (records.some(record=>record.status === 'missing')) {
            // A previously saved choice in another window defeats a legacy
            // default. Conflicting or malformed mirrors are never overwritten.
            this.store.write(tab,choices.size ? [...choices][0] : false);migrated++;
          }
          a.refreshNativePresentation?.(tab);
        } catch (error) { unresolved++;a.reportError(error); }
      }
      if (!current()) return {ok:false,reason:'cancelled'};
      return {ok:true,migrated,unresolved};
    })().catch(error => {
      if (!current()) return {ok:false,reason:'cancelled'};
      this.cleanup?.();this.cleanup = null;this.adapters.reportError(error);return {ok:false,reason:'failed'};
    });
    return this.operation;
  }
  destroy() {
    this.active = false;this.generation++;this.cleanup?.();this.cleanup = null;this.operation = null;
  }
}

/** Browser wiring stays inside the existing controller lifetime. The native
 * startup preference is changed only by the clearly labelled consent action. */
export class FolderPinRuntime {
  constructor(host, preferences) {
    Object.assign(this,{host,preferences});this.active = false;this.generation = 0;
    this.onAbort = () => this.destroy();
    this.onNativePreference = {observe:()=>{
      if (this.active && !this.changingPreference && this.adapters?.getStartupResetEnabled()) void this.enable();
    }};
  }
  reportError(error) { this.host.console?.error?.('Better Zen Folders URL pins:',error); }
  unavailable(reason) {
    this.result = {ok:false,reason};
    const document = this.host.document;
    if (!document?.createElementNS || !document.documentElement?.appendChild) return;
    const notice = this.notice = document.createElementNS('http://www.w3.org/1999/xhtml','div');
    notice.className = 'better-zen-folders-url-pin-status';
    notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.setAttribute('data-bzf-error','true');
    notice.textContent = reason === 'unsupported-window-mode'
      ? 'Folder URL Pins are not available in private or unsynchronised windows. Native Zen pin behaviour remains in effect here; saved choices have not been changed.'
      : 'Folder URL Pins are not available with this window’s native browser capabilities. Native Zen pin behaviour remains in effect here; saved choices have not been changed.';
    const dismiss = document.createElementNS('http://www.w3.org/1999/xhtml','button');
    dismiss.type = 'button';dismiss.textContent = 'Dismiss';dismiss.setAttribute('aria-label','Dismiss URL pin message');
    dismiss.addEventListener('click',()=>notice.remove());notice.appendChild(dismiss);
    document.documentElement.appendChild(notice);
  }
  start(signal) {
    if (this.active || signal?.aborted) return;
    this.active = true;this.signal = signal;signal?.addEventListener('abort',this.onAbort,{once:true});
    this.roots = new FolderPinRootIntegration(this.host,this.preferences);this.roots.start(signal);
    this.unsubscribe = this.preferences.subscribe('folderUrlPinsEnabled',enabled => { if (enabled) void this.enable();else this.disable(); });
    this.host.Services?.prefs?.addObserver?.('zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url',this.onNativePreference);
    if (this.preferences.get('folderUrlPinsEnabled')) void this.enable();
  }
  async enable() {
    this.disable();
    if (!this.active || !this.preferences.get('folderUrlPinsEnabled')) return;
    const generation = this.generation;
    const host = this.host, prefs = host.Services?.prefs;
    if (host.gZenWorkspaces?.privateWindowOrDisabled === true || host.gZenPinnedTabManager?.enabled === false) {
      this.unavailable('unsupported-window-mode');return;
    }
    if (!host.gZenPinnedTabManager || !host.gZenWindowSync || !host.SessionStore || !prefs || !host.Services.prompt
        || typeof prefs.addObserver !== 'function' || typeof prefs.removeObserver !== 'function') {
      this.unavailable('unsupported-native-capabilities');return;
    }
    const a = this.adapters = createBrowserFolderPinAdapters(host);
    a.reportError = error => this.reportError(error);
    this.store = new FolderPinIntentStore(a);
    const consentKey = 'better-zen-folders.folder-url-pins-consent-version';
    const activation = this.activation = new FolderPinActivation({...a,
      listTabs:()=>Array.from(host.gZenWorkspaces.allStoredTabs ?? host.gBrowser.tabs),
      hasConsent:()=>prefs.getIntPref(consentKey,0) === 1,
      requestConsent:async ({startupReset,first})=>{
        if (a.coordinator.consentPrompt) return a.coordinator.consentPrompt;
        let resolve;
        const pending = a.coordinator.consentPrompt = new Promise(r=>resolve=r);
        try {
          const prompt = host.Services.prompt;
          const message = (first ? 'Folder tabs will behave as ordinary tabs unless you choose Pin URL. Zen cannot tell us which existing folder tabs you manually pinned, so those without a saved Better Zen Folders choice will start ordinary. Their old initial URLs will no longer be automatic reset destinations. Existing root pins and saved Sticky choices stay unchanged.\n\n' : '')
            + (startupReset ? 'To enable this, turn off Zen’s automatic reset to pinned URLs on startup. All tabs will resume their last saved page instead. Manual Reset to Pinned URL remains available. This cannot recover history Zen has already reset.\n\n' : 'Tabs resume their last saved page; manual Reset to Pinned URL remains available.\n\n')
            + 'Disabling this feature keeps saved choices, but native Zen actions while it is disabled can change pages and cannot be reconstructed afterward.';
          const flags = prompt.BUTTON_POS_0 * prompt.BUTTON_TITLE_IS_STRING
            + prompt.BUTTON_POS_1 * prompt.BUTTON_TITLE_IS_STRING + prompt.BUTTON_POS_1_DEFAULT;
          const accepted = prompt.confirmEx(host,'Folder URL Pins',message,flags,
            startupReset ? 'Turn Off Startup Reset and Enable' : 'Enable Folder URL Pins','Not Now',null,null,{value:false}) === 0;
          resolve(accepted);
        } catch (error) { resolve(false);throw error; }
        finally { if (a.coordinator.consentPrompt === pending) delete a.coordinator.consentPrompt; }
        return pending;
      },
      acceptConsent:()=>prefs.setIntPref(consentKey,1),
      disableFeature:()=>prefs.setBoolPref(PREFERENCE_DEFINITIONS.folderUrlPinsEnabled.property,false),
      setStartupResetOff:()=>{
        this.changingPreference = true;
        try { prefs.setBoolPref('zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url',false); }
        finally { this.changingPreference = false; }
      },
      install:()=>{
        const controller = new host.AbortController();
        const policy = this.policy = new FolderPinPolicy(a,this.store);
        const lifecycle = this.lifecycle = new FolderPinLifecycle(a,this.store,policy);
        const presentation = this.presentation = new FolderPinPresentation(host,this.preferences,this.store,policy);
        const hooks = this.hooks = new FolderPinNativeHooks(host,policy,a,result=>{
          if (!result.ok) presentation.run(()=>result);else presentation.refresh();
        });
        const origins = this.origins = new FolderPinOriginHooks(host,lifecycle,a,this.preferences);
        const cleanup = ()=>{
          controller.abort();presentation.destroy();origins.destroy();hooks.destroy();lifecycle.destroy();policy.destroy();
          if (host.__betterZenFoldersFolderPins === this) delete host.__betterZenFoldersFolderPins;
        };
        try {
          policy.start(controller.signal);lifecycle.start();hooks.start(controller.signal);
          if (!hooks.active) throw new Error('Native URL-pin protection could not be installed');
          origins.start(controller.signal);presentation.start(controller.signal);
          host.__betterZenFoldersFolderPins = this;
          return cleanup;
        } catch (error) { cleanup();throw error; }
      },
    },this.store);
    const result = await activation.start();
    if (!this.active || this.generation !== generation) return;
    this.result = result;this.presentation?.refresh();
    if ((result.ok && result.unresolved) || (!result.ok && !['declined','cancelled'].includes(result.reason))) {
      host.Services.prompt.alert(host,'Folder URL Pins',result.ok
        ? `${result.unresolved} folder tab(s) have unreadable or unsaved URL-pin data. Those tabs have not been converted. Their pin commands are unavailable until the problem is resolved.`
        : `Folder URL Pins could not be enabled (${result.reason}). Do not rely on ordinary-folder pin behaviour in this window. Saved choices have been retained.`);
    }
  }
  disable() {
    this.generation++;this.activation?.destroy();this.activation = null;this.result = null;
    this.notice?.remove();this.notice = null;
  }
  destroy() {
    if (!this.active) return;
    this.active = false;this.disable();this.roots?.destroy();this.unsubscribe?.();this.signal?.removeEventListener('abort',this.onAbort);
    this.host.Services?.prefs?.removeObserver?.('zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url',this.onNativePreference);
  }
}

const URL_PIN_PATH = "M16 3H8L9 10L5 14V16H11V22H13V16H19V14L15 10Z";
const URL_PIN_IMAGE = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="context-fill" d="${URL_PIN_PATH}"/></svg>`)}`;
const URL_PIN_COMMAND_IMAGES = Object.fromEntries(Object.entries({
  'reset-url':'M12 4a8 8 0 1 1-7.5 5.2L2 7h7v7L6 11a6 6 0 1 0 6-5Z',
  'edit-url':'M3 17v4h4L20 8l-4-4Zm15-15 4 4-2 2-4-4Z',
  'update-url':'M3 3h18v18H3Zm2 2v4h14V5Zm0 6v8h14v-8Zm6 1h2v2h2v2h-2v2h-2v-2H9v-2h2Z',
}).map(([name,path])=>[name,`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="context-fill" d="${path}"/></svg>`)}`]));

/** Native root placement is independent of folder URL intent and its consent.
 * The optional badge calls native Unpin; it never invents a second pin area. */
export class FolderPinRootIntegration {
  constructor(host,preferences) {
    Object.assign(this,{host,preferences});this.active = false;this.buttons = new Map();
    this.onRefresh = () => this.refresh();this.onAbort = () => this.destroy();
    this.onMenu = event => { if (event.target === this.menu) this.showMenu(); };
    this.onMenuHidden = event => { if (event.target === this.menu) this.restoreMenu(); };
    this.onGesture = event => {
      const button = event.target?.closest?.('.better-zen-folders-url-pin'),tab = button?._bzfRootPinTab;
      if (!this.active || !tab || this.buttons.get(tab) !== button) return;
      if (['keydown','keypress','keyup'].includes(event.type)) {
        if (['Enter',' '].includes(event.key) && !event.ctrlKey && !event.altKey && !event.metaKey) event.stopImmediatePropagation();
        return;
      }
      if (event.button === 2) return;
      event.preventDefault();event.stopImmediatePropagation();
      if (event.type === 'click' && event.button === 0) {
        const result = this.unpin(tab);
        if (!result.ok) this.host.console?.error?.('Better Zen Folders native root Unpin',result.reason);
      }
    };
  }
  isRoot(tab) {
    return tab?.localName === 'tab' && tab.isConnected && !tab.closing && tab.pinned
      && !tab.hasAttribute('zen-essential') && !tab.hasAttribute('zen-empty-tab') && !tab.closest('zen-folder');
  }
  unpin(tab) {
    if (!this.active || !this.isRoot(tab)) return {ok:false,reason:'unsupported'};
    const id = tab.id;
    try {
      this.host.gBrowser.unpinTab(tab);
      return tab.isConnected && !tab.closing && tab.id === id && !tab.pinned && !tab.closest('zen-folder')
        ? {ok:true} : {ok:false,reason:'native-unpin-refused'};
    } catch (error) { this.host.console?.error?.(error);return {ok:false,reason:'native-unpin-refused'}; }
    finally { this.refresh(); }
  }
  refresh() {
    if (!this.active) return;
    const wanted = new Set();
    if (this.preferences.get('showRootPinBadge') === true) for (const tab of this.host.gBrowser.tabs ?? []) {
      if (!this.isRoot(tab)) continue;
      const content = tab.querySelector('.tab-content');if (!content) continue;
      wanted.add(tab);
      if (this.buttons.has(tab)) continue;
      const button = this.host.document.createElementNS('http://www.w3.org/1999/xhtml','button');
      button.type = 'button';button.className = 'better-zen-folders-url-pin';button._bzfRootPinTab = tab;
      button.setAttribute('aria-label','Unpin Tab');button.setAttribute('title','Unpin Tab');button.setAttribute('draggable','false');
      const svg = this.host.document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
      const path = this.host.document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',URL_PIN_PATH);
      svg.appendChild(path);button.appendChild(svg);content.insertBefore(button,content.querySelector('.tab-label-container'));
      this.buttons.set(tab,button);
    }
    for (const [tab,button] of this.buttons) if (!wanted.has(tab)) {button.remove();this.buttons.delete(tab);}
  }
  restoreMenu() {
    for (const id of ['context_unpinTab','context_unpinSelectedTabs']) setBzfCommandIcon(this.host.document.getElementById(id),null,'off',this.host);
  }
  showMenu() {
    if (!this.active) return;
    this.restoreMenu();const tab = this.host.TabContextMenu?.contextTab;
    const targets = tab?.multiselected ? Array.from(this.host.gBrowser.selectedTabs ?? []) : [tab];
    if (!targets.length || !targets.every(item=>this.isRoot(item))) return;
    for (const id of ['context_unpinTab','context_unpinSelectedTabs']) setBzfCommandIcon(this.host.document.getElementById(id),URL_PIN_IMAGE,this.preferences.get('commandIconMode'),this.host);
  }
  start(signal) {
    if (this.active || signal?.aborted || typeof this.host.document?.getElementById !== 'function'
        || !this.host.gBrowser?.tabContainer || typeof this.host.MutationObserver !== 'function') return;
    this.active = true;this.signal = signal;signal?.addEventListener('abort',this.onAbort,{once:true});
    this.events = ['TabPinned','TabUnpinned','TabMove','TabClose','SSTabRestored'];
    this.gestures = ['pointerdown','mousedown','mouseup','click','dblclick','auxclick','dragstart','keydown','keypress','keyup'];
    for (const name of this.events) this.host.addEventListener(name,this.onRefresh,true);
    for (const name of this.gestures) this.host.addEventListener(name,this.onGesture,true);
    this.systemOptions = {capture:true,mozSystemGroup:true};
    for (const name of ['keydown','keypress','keyup']) this.host.addEventListener(name,this.onGesture,this.systemOptions);
    this.menu = this.host.document.getElementById('tabContextMenu');
    this.menu?.addEventListener('popupshowing',this.onMenu);this.menu?.addEventListener('popuphidden',this.onMenuHidden);
    this.unsubscribes = [this.preferences.subscribe?.('showRootPinBadge',this.onRefresh),
      this.preferences.subscribe?.('commandIconMode',()=>this.showMenu())];
    this.observer = new this.host.MutationObserver(this.onRefresh);
    this.observer.observe(this.host.gBrowser.tabContainer,{subtree:true,childList:true,attributes:true,attributeFilter:['pinned','zen-essential']});
    this.refresh();
  }
  destroy() {
    if (!this.active) return;this.active = false;this.signal?.removeEventListener('abort',this.onAbort);
    this.observer?.disconnect();for (const unsubscribe of this.unsubscribes ?? []) unsubscribe?.();
    for (const name of this.events ?? []) this.host.removeEventListener(name,this.onRefresh,true);
    for (const name of this.gestures ?? []) this.host.removeEventListener(name,this.onGesture,true);
    for (const name of ['keydown','keypress','keyup']) this.host.removeEventListener(name,this.onGesture,this.systemOptions);
    this.menu?.removeEventListener('popupshowing',this.onMenu);this.menu?.removeEventListener('popuphidden',this.onMenuHidden);
    this.restoreMenu();for (const button of this.buttons.values()) button.remove();this.buttons.clear();
  }
}

/** Presentation never persists intent itself. Badges identify one tab, even in
 * split views, and never share the favicon/Sticky action surface. */
export class FolderPinPresentation {
  constructor(host, preferences, store, policy) {
    Object.assign(this, {host, preferences, store, policy});
    this.adapters = policy.adapters;
    this.buttons = new Map();this.commands = new Map();this.hiddenNative = new Map();
    this.active = false;this.scheduled = false;
    this.grace = new FolderPinUnpinGrace({...this.adapters,
      setTimer: (fn, ms) => host.setTimeout(fn, ms), clearTimer: id => host.clearTimeout(id)},
      store, policy, () => this.refresh(), result => { void this.run(() => result); });
    this.onGesture = event => {
      const button = event.target?.closest?.('.better-zen-folders-url-pin');
      const tab = button?._bzfUrlPinTab;
      // Text nodes (including native drag origins) have no closest(). Without
      // a real tab, undefined === Map.get(undefined) falsely claims the gesture.
      if (!this.active || !tab || this.buttons.get(tab) !== button) return;
      if (['keydown','keypress','keyup'].includes(event.type)) {
        if (['Enter',' '].includes(event.key) && !event.ctrlKey && !event.altKey && !event.metaKey) event.stopImmediatePropagation();
        return; // Let the native HTML button emit one keyboard click.
      }
      if (event.button === 2) return;
      event.preventDefault();event.stopImmediatePropagation();
      if (event.type === 'click' && event.button === 0) void this.unpin(tab);
    };
    this.onEvent = event => {
      if (['TabMove','TabClose','TabUngrouped','TabGrouped','TabPinned','TabUnpinned'].includes(event.type)) this.grace.cancel(event.target);
      this.schedule();
    };
    this.onMenu = event => { if (event.target === this.menu) this.showMenu(); };
    this.onMenuHidden = event => { if (event.target === this.menu) this.restoreMenu(); };
    this.onAbort = () => this.destroy();
  }
  async run(action) {
    let result;
    try { result = await action(); }
    catch (error) { this.adapters.reportError(error);result = {ok:false,reason:'failed'}; }
    if (this.active) {
      this.status.textContent = result?.ok ? (result.reason === 'pending' ? 'URL unpinning pending. Activate the pin again to cancel.'
        : result.reason === 'cancelled' ? 'URL unpinning cancelled.' : 'URL pin action completed.')
        : `URL pin action was not completed (${result?.reason ?? 'failed'}). Your saved choice was not reported as changed.`;
      if (!result?.ok) {
        this.status.setAttribute('data-bzf-error','true');
        const dismiss = this.host.document.createElementNS('http://www.w3.org/1999/xhtml','button');
        dismiss.type = 'button';dismiss.textContent = 'Dismiss';dismiss.setAttribute('aria-label','Dismiss URL pin message');
        dismiss.addEventListener('click',()=>{this.status.removeAttribute('data-bzf-error');this.status.textContent = '';});
        this.status.appendChild(dismiss);
      } else this.status.removeAttribute('data-bzf-error');
      this.refresh();
    }
    return result;
  }
  unpin(tab) { return this.run(() => this.grace.toggle(tab, Number(this.preferences.get('urlUnpinGraceSeconds')) * 1000)); }
  start(signal) {
    if (this.active || signal?.aborted) return;
    this.active = true;
    this.status = this.host.document.createElementNS('http://www.w3.org/1999/xhtml','div');
    this.status.className = 'better-zen-folders-url-pin-status';this.status.setAttribute('role','status');
    this.status.setAttribute('aria-live','polite');this.host.document.documentElement.appendChild(this.status);
    this.gestures = ['pointerdown','mousedown','mouseup','click','dblclick','auxclick','dragstart','keydown','keypress','keyup'];
    for (const name of this.gestures) this.host.addEventListener(name,this.onGesture,true);
    this.systemOptions = {capture:true,mozSystemGroup:true};
    for (const name of ['keydown','keypress','keyup']) this.host.addEventListener(name,this.onGesture,this.systemOptions);
    this.events = ['TabOpen','TabClose','TabMove','TabGrouped','TabUngrouped','TabPinned','TabUnpinned','SSTabRestored','BetterZenFoldersUrlPinChanged'];
    for (const name of this.events) this.host.addEventListener(name,this.onEvent,true);
    this.menu = this.host.document.getElementById('tabContextMenu');
    this.menu?.addEventListener('popupshowing',this.onMenu);this.menu?.addEventListener('popuphidden',this.onMenuHidden);
    this.observer = new this.host.MutationObserver(() => this.schedule());
    this.observer.observe(this.host.gBrowser.tabContainer,{subtree:true,childList:true,attributes:true,attributeFilter:['id','pinned','zen-essential']});
    this.unsubscribe = this.preferences.subscribe?.('commandIconMode',()=>this.showMenu());
    this.signal = signal;signal?.addEventListener('abort',this.onAbort,{once:true});this.refresh();
  }
  schedule() {
    if (!this.active || this.scheduled) return;
    this.scheduled = true;
    Promise.resolve().then(() => { this.scheduled = false;if (this.active) this.refresh(); });
  }
  refresh() {
    if (!this.active) return;
    const wanted = new Set();
    for (const tab of this.host.gBrowser.tabs ?? []) {
      if (this.adapters.classify(tab) !== 'regular-folder') continue;
      const record = this.store.read(tab);
      this.adapters.refreshNativePresentation?.(tab);
      if (record.status !== 'known' || !record.explicit) continue;
      const content = tab.querySelector('.tab-content');
      if (!content) continue; // No shared split-row badge: use the constituent menu.
      wanted.add(tab);
      let button = this.buttons.get(tab);
      if (!button) {
        button = this.host.document.createElementNS('http://www.w3.org/1999/xhtml','button');
        button.type = 'button';button.className = 'better-zen-folders-url-pin';
        button.setAttribute('draggable','false');button._bzfUrlPinTab = tab;
        const svg = this.host.document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
        const path = this.host.document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',URL_PIN_PATH);
        svg.appendChild(path);button.appendChild(svg);
        content.insertBefore(button,content.querySelector('.tab-label-container'));
        this.buttons.set(tab,button);
      }
      const pending = this.grace.pending.has(tab);
      const label = pending ? 'Cancel unpinning URL' : 'Unpin URL';
      button.setAttribute('aria-label',label);button.setAttribute('title',label);
      button.toggleAttribute('data-bzf-url-unpin-pending',pending);
      button.disabled = Boolean(this.policy.blocked(tab));
    }
    for (const [tab,button] of this.buttons) if (!wanted.has(tab)) {
      this.grace.cancel(tab);button.remove();this.buttons.delete(tab);
    }
  }
  restoreMenu() {
    for (const [item,previous] of this.hiddenNative) if (item.hidden === true) item.hidden = previous;
    this.hiddenNative.clear();
    for (const command of this.commands.values()) command.hidden = true;
    if (this.urlMenu) this.urlMenu.hidden = true;
  }
  showMenu() {
    if (!this.active || !this.menu) return;
    this.restoreMenu();
    const tab = this.host.TabContextMenu?.contextTab;
    const targets = tab?.multiselected ? Array.from(this.host.gBrowser.selectedTabs ?? [tab]) : [tab];
    if (!targets.some(item => this.adapters.classify(item) === 'regular-folder')) return;
    const single = targets.length === 1 && this.adapters.classify(tab) === 'regular-folder';
    const record = single ? this.store.read(tab) : {status:'invalid'};
    const explicit = record.status === 'known' && record.explicit;
    for (const id of ['context_pinTab','context_unpinTab','context_pinSelectedTabs','context_unpinSelectedTabs',
      'context_zen-reset-pinned-tab','context_zen-edit-pinned-page']) {
      const item = this.host.document.getElementById(id);
      if (item) { this.hiddenNative.set(item,item.hidden);item.hidden = true; }
    }
    const definitions = [
      ['pin-url',single ? (explicit ? 'Unpin URL' : 'Pin URL') : 'URL pins: select one folder tab',
        () => explicit ? this.unpin(tab) : this.run(() => this.policy.pin(tab)),false],
      ['reset-url','Reset to Pinned URL',() => this.run(() => this.policy.reset(tab)),true],
      ['edit-url','Edit Pinned URL…',() => this.run(() => this.policy.edit(tab)),true],
      ['update-url','Use Current Page as Pinned URL',() => this.run(() => this.policy.update(tab)),true],
    ];
    if (!this.urlMenu) {
      this.urlMenu = this.host.document.createXULElement('menu');this.urlMenu.id = 'better-zen-folders-url-pin-menu';
      this.urlMenu.classList.add('menu-iconic');this.urlMenu.setAttribute('label','Pinned URL');
      this.urlPopup = this.host.document.createXULElement('menupopup');this.urlMenu.appendChild(this.urlPopup);
      const anchor = this.host.document.getElementById('context_unpinTab');
      this.menu.insertBefore(this.urlMenu,anchor?.parentElement === this.menu ? anchor : null);
    }
    this.urlMenu.hidden = false;
    setBzfCommandIcon(this.urlMenu,URL_PIN_IMAGE,this.preferences.get('commandIconMode'),this.host);
    for (const [name,label,action,needsPin] of definitions) {
      let item = this.commands.get(name);
      if (!item) {
        item = this.host.document.createXULElement('menuitem');item.id = `better-zen-folders-${name}`;
        item.addEventListener('command',event=>{event.stopPropagation();if (!item.disabled && !item.hidden) void item._bzfAction?.();});
        this.urlPopup.appendChild(item);
        this.commands.set(name,item);
      }
      item.hidden = false;item.setAttribute('label',label);item._bzfAction = action;
      item.disabled = !single || record.status !== 'known' || Boolean(this.policy.blocked(tab)) || (needsPin && !explicit);
      setBzfCommandIcon(item,URL_PIN_COMMAND_IMAGES[name] ?? URL_PIN_IMAGE,this.preferences.get('commandIconMode'),this.host);
    }
  }
  destroy() {
    if (!this.active) return;
    this.active = false;this.grace.destroy();this.observer?.disconnect();this.unsubscribe?.();
    this.signal?.removeEventListener('abort',this.onAbort);
    for (const name of this.gestures) this.host.removeEventListener(name,this.onGesture,true);
    for (const name of ['keydown','keypress','keyup']) this.host.removeEventListener(name,this.onGesture,this.systemOptions);
    for (const name of this.events) this.host.removeEventListener(name,this.onEvent,true);
    this.menu?.removeEventListener('popupshowing',this.onMenu);this.menu?.removeEventListener('popuphidden',this.onMenuHidden);
    this.restoreMenu();for (const item of this.commands.values()) item.remove();this.commands.clear();
    this.urlMenu?.remove();this.urlMenu = this.urlPopup = null;
    for (const button of this.buttons.values()) button.remove();this.buttons.clear();this.status?.remove();
  }
}

/** SessionStore owns persistence, including private-window lifetime. Native Zen IDs
 * survive undo/restart; native duplicateTab deliberately creates a different ID. */
export class StickyStateStore {
  constructor(adapters) {
    this.adapters = adapters;
    this.folders = new Set();
    try {
      const stored = JSON.parse(adapters.getWindowValue() || "null");
      if (stored?.version === 1 && Array.isArray(stored.folders)) {
        this.folders = new Set(stored.folders.filter(id => typeof id === "string" && id.length));
      }
    } catch {}
  }
  has(item) {
    const id = this.adapters.getId(item);
    if (!id) return false;
    if (this.adapters.isFolder(item)) return this.folders.has(id);
    try {
      const value = JSON.parse(this.adapters.getTabValue(item) || "null");
      return value?.id === id && value?.sticky === true;
    } catch { return false; }
  }
  set(item, sticky) {
    const id = this.adapters.getId(item);
    if (!id) throw new TypeError("Sticky items require a native stable identity");
    if (this.adapters.isFolder(item)) {
      const next = new Set(this.folders);
      if (sticky) next.add(id); else next.delete(id);
      this.adapters.setWindowValue(JSON.stringify({version:1, folders:[...next]}));
      this.folders = next;
    } else {
      this.adapters.setTabValue(item, sticky ? JSON.stringify({id, sticky:true}) : "");
    }
  }
}

export class StickyBranchExposure {
  constructor(parent) { this.parent = parent; this.exposed = new Set(); this.expandedParents = new WeakSet(); }
  has(folder) { return this.exposed.has(folder); }
  expose(folder) { this.exposed.add(folder); }
  isWithin(folder, ancestor) {
    const seen = new Set();
    for (let current = folder; current && !seen.has(current); current = this.parent(current)) {
      if (current === ancestor) return true;
      seen.add(current);
    }
    return false;
  }
  onCollapseChanged(folder, collapsed) {
    if (!collapsed) { this.expandedParents.add(folder); return; }
    for (const branch of this.exposed) {
      if (branch === folder || (this.expandedParents.has(folder) && this.isWithin(branch, folder))) {
        this.exposed.delete(branch);
      }
    }
    this.expandedParents.delete(folder);
  }
  clear() { this.exposed.clear(); this.expandedParents = new WeakSet(); }
}

/** Browser projection owns attributes and decorations only. It does not patch
 * prototypes, reparent children, mutate native pins or change ancestor states. */
export class StickyFolderVisibilityManager {
  constructor(host, preferences) {
    this.host = host;
    this.preferences = preferences;
    this.started = false;
    this.records = new Map();
    this.decorations = new Set();
    this.projection = new Map();
    this.activeIconFolders = new Set();
    this.selectionChanged = false;
    this.nativeActiveAdditions = new Map();
    this.dragExposure = new Map();
    this.expansionHandoffs = new Map();
    this.stickyRemovals = new Map();
    this.motion = new StickyProjectionMotion(this);
    this.changingDragState = false;
    this.exposure = new StickyBranchExposure(folder => folder?.group?.isZenFolder
      ? folder.group : this.pinnedWorkspace(folder)?.collapsiblePins ?? null);
    this.onEvent = this.handleEvent.bind(this);
    this.onStickySystemKey = this.handleStickyToggle.bind(this);
    this.stickySystemKeyOptions = {capture:true, mozSystemGroup:true};
    this.pending = null;
    this.store = null;
  }
  start(signal) {
    if (this.started || !this.host.gBrowser?.tabContainer || !this.host.document?.querySelectorAll
      || typeof this.host.SessionStore?.setCustomWindowValue !== "function") return;
    this.started = true;
    this.store = new StickyStateStore({
      getId: item => item?.id,
      isFolder: item => item?.isZenFolder === true,
      getTabValue: tab => this.host.SessionStore.getCustomTabValue(tab, STICKY_TAB_KEY),
      setTabValue: (tab, value) => this.host.SessionStore.setCustomTabValue(tab, STICKY_TAB_KEY, value),
      getWindowValue: () => this.host.SessionStore.getCustomWindowValue(this.host, STICKY_FOLDER_KEY),
      setWindowValue: value => this.host.SessionStore.setCustomWindowValue(this.host, STICKY_FOLDER_KEY, value),
    });
    this.events = ["TabSelect", "TabOpen", "TabClose", "TabMove", "SSTabRestoring", "SSTabRestored",
      "TabGroupCollapse", "TabGroupExpand", "TabGroupAnimationComplete", "click", "keydown", "keypress", "keyup",
      "pointerdown", "mousedown", "mouseup", "auxclick", "dblclick",
      "dragstart", "dragenter", "dragover", "drop", "TabPinned", "TabUnpinned", "TabMultiSelect",
      "ZenWorkspacesUIUpdate", "AfterWorkspacesSessionRestore"];
    for (const event of this.events) this.host.addEventListener(event, this.onEvent, true);
    // Gecko dispatches a separate system group after normal propagation. Its
    // tabstrip key handler may still retain the folder label as ariaFocusedItem.
    // Isolate only our button's activation keys in both groups; leave HTML's
    // native default activation intact instead of synthesising a second click.
    for (const type of ['keydown','keypress','keyup']) {
      this.host.addEventListener(type, this.onStickySystemKey, this.stickySystemKeyOptions);
    }
    // Native main-popupset initialises TabContextMenu on the popup itself.
    // Window capture runs before that, seeing null/the previously opened tab.
    this.menus = ['tabContextMenu', 'zenFolderActions']
      .map(id => this.host.document.getElementById(id)).filter(Boolean);
    for (const menu of this.menus) menu.addEventListener('popupshowing', this.onEvent);
    this.observer = typeof this.host.MutationObserver === "function"
      ? new this.host.MutationObserver(() => this.schedule()) : null;
    this.observer?.observe(this.host.gBrowser.tabContainer, {subtree:true, childList:true, attributes:true,
      attributeFilter:["collapsed", "collapsedpinnedtabs", "active", "pinned", "hidden", "selected",
        "multiselected", "visuallyselected", "zen-workspace-id", "id",
        "zen-icons-enlarge-inner-icon", "zen-icons-custom-unavailable", "zen-essential", "href"]});
    const subscriptions = ['subfolderCollapsePolicy', 'folderStateChevron', 'stickyTabsEnabled', 'stickyFoldersEnabled', 'stickyMarker', 'showEmptyFolderActiveIndicator']
      .map(name => this.preferences?.subscribe?.(name, () => this.schedule()));
    subscriptions.push(this.preferences?.subscribe?.('commandIconMode', mode => {
      for (const id of ['better-zen-folders-sticky-tab', 'better-zen-folders-sticky-folder']) {
        setStickyMenuDecoration(this.host.document.getElementById(id), mode, this.host, this.preferences?.get?.('stickyMarker'));
      }
    }));
    this.unsubscribe = () => subscriptions.forEach(unsubscribe => unsubscribe?.());
    signal?.addEventListener?.("abort", () => this.destroy(), {once:true});
    this.installIconProjection();
    this.refresh();
    this.motion.start();
    Promise.all([this.host.SessionStore.promiseAllWindowsRestored,
      this.host.gZenWorkspaces?.promiseInitialized]).then(() => {
      if (!this.started) return;
      // Window values may have been unavailable until native session restore completed.
      this.store = new StickyStateStore(this.store.adapters);
      this.refresh();
    }).catch(error => this.report(error));
  }
  report(error) { this.host.console?.error?.("Better Zen Folders: Sticky visibility", error); }
  schedule() {
    if (!this.started || this.pending !== null) return;
    this.pending = this.host.setTimeout(() => { this.pending = null; this.refresh(); }, 0);
  }
  write(node, name, value) {
    if (!node?.getAttribute) return;
    let attributes = this.records.get(node);
    if (!attributes) this.records.set(node, attributes = new Map());
    if (!attributes.has(name)) attributes.set(name, {before:node.getAttribute(name), last:null});
    const record = attributes.get(name);
    const text = value === null ? null : String(value);
    if (node.getAttribute(name) !== text) {
      if (text === null) node.removeAttribute(name); else node.setAttribute(name, text);
    }
    record.last = text;
  }
  restoreAttribute(node, name) {
    const attributes = this.records.get(node), record = attributes?.get(name);
    if (!record) return;
    if (node.getAttribute(name) === record.last) {
      if (record.before === null) node.removeAttribute(name); else node.setAttribute(name, record.before);
    }
    attributes.delete(name);
    if (!attributes.size) this.records.delete(node);
  }
  isSticky(item) { return this.store?.has(item) === true; }
  stickyEnabled(item) {
    return this.preferences?.get(item?.isZenFolder ? 'stickyFoldersEnabled' : 'stickyTabsEnabled') !== false;
  }
  setSticky(item, sticky) {
    if (!this.store || item?.hasAttribute?.("zen-essential") || isEmptyDirectItem(item)) return false;
    for (const [row, pending] of this.stickyRemovals) {
      if (pending.targets.includes(item)) this.cancelStickyRemoval(row);
    }
    this.store.set(item, sticky);
    this.refresh();
    // Existing restore metadata observer will snapshot the changed folder flag.
    item.dispatchEvent?.(new this.host.CustomEvent("BetterZenFolderStickyChanged", {bubbles:true}));
    return true;
  }
  cancelStickyRemoval(item) {
    const pending = this.stickyRemovals.get(item);
    if (!pending) return false;
    this.host.clearTimeout(pending.timer);
    this.stickyRemovals.delete(item);
    return true;
  }
  validStickyRemoval(item, pending) {
    const targets = this.stickyToggleTargets(item);
    return this.started && item.isConnected && this.stickyEnabled(item)
      && this.isCurrentWorkspaceItem(item) && item.parentElement === pending.parent
      && this.preferences?.get('stickyMarker') === pending.marker
      && targets.length === pending.targets.length && targets.every((target,i) => target === pending.targets[i]);
  }
  toggleStickyFromMarker(item) {
    if (this.cancelStickyRemoval(item)) { this.refresh(); return; }
    const targets = this.stickyToggleTargets(item);
    if (!this.rowSticky(item)) {
      for (const target of targets) this.setSticky(target, true);
      return;
    }
    const delay = parseNumericSetting('stickyRemovalDelaySeconds', this.preferences?.get('stickyRemovalDelaySeconds')) ?? 0;
    const commit = () => {
      // Capture the outermost collapsed boundary before removing its final
      // Sticky anchor, so only rows which actually disappear animate away.
      let group = null;
      for (let parent = item.group; parent?.isZenFolder; parent = parent.group) if (parent.collapsed) group = parent;
      const workspace = this.pinnedWorkspace(item);
      if (workspace?.hasCollapsedPinnedTabs) group = workspace.collapsiblePins;
      try {
        if (group) this.motion.prepare(group);
        for (const target of targets) this.setSticky(target, false);
      } finally {
        // A rejected SessionStore write must clear pending paint and consume
        // the prepared snapshot against whatever state was actually saved.
        this.refresh();
        if (group && this.motion.before.has(group)) this.motion.animate(group).catch(error => this.report(error));
      }
    };
    if (!delay) { commit(); return; }
    const pending = {targets, parent:item.parentElement, marker:this.preferences?.get('stickyMarker'), timer:null};
    pending.timer = this.host.setTimeout(() => {
      if (this.stickyRemovals.get(item) !== pending) return;
      this.stickyRemovals.delete(item);
      try {
        if (this.validStickyRemoval(item, pending)) commit(); else this.refresh();
      } catch (error) { this.report(error); this.refresh(); }
    }, delay * 1000);
    this.stickyRemovals.set(item, pending);
    this.refresh();
  }
  items(folder) {
    return Array.from(folder.allItems ?? []).filter(item => this.isVisibilityItem(item));
  }
  activeWorkspace() {
    return this.host.gZenWorkspaces?.activeWorkspaceElement
      ?? this.host.document.querySelector?.('zen-workspace[active="true"]') ?? null;
  }
  isCurrentWorkspaceItem(item) {
    const workspace = item?.closest?.('zen-workspace');
    return !workspace || workspace === this.activeWorkspace();
  }
  pinnedWorkspace(item) {
    const workspace = item?.closest?.('zen-workspace');
    return workspace && workspace === this.activeWorkspace()
      && workspace.pinnedTabsContainer?.contains(item) ? workspace : null;
  }
  isVisibilityItem(item) {
    return !!item && !isEmptyDirectItem(item) && !item.hidden && !item.closing
      && !item.hasAttribute?.('zen-essential') && this.isCurrentWorkspaceItem(item)
      && (item.isZenFolder || this.host.gBrowser.isTab?.(item)
        || (this.host.gBrowser.isSplitViewWrapper?.(item)
          && !Array.from(item.tabs ?? []).some(tab => tab.hasAttribute?.('zen-essential'))));
  }
  isRootPinnedItem(item) {
    const workspace = this.pinnedWorkspace(item);
    return !!workspace && item.parentElement === workspace.pinnedTabsContainer
      && (item.isZenFolder || item.pinned || item.hasAttribute?.('pinned')
        || (this.host.gBrowser.isSplitViewWrapper?.(item)
          && Array.from(item.tabs ?? []).some(tab => tab.pinned)));
  }
  rowSticky(item) {
    if (!this.stickyEnabled(item)) return false;
    if (this.host.gBrowser.isSplitViewWrapper?.(item)) return Array.from(item.tabs ?? [])
      .some(tab => !tab.hasAttribute?.("zen-essential") && this.isSticky(tab));
    return !item.hasAttribute?.("zen-essential") && this.isSticky(item);
  }
  rowSelected(item, nativeWorkspace = false) {
    const tabs = this.host.gBrowser.isSplitViewWrapper?.(item) ? Array.from(item.tabs ?? []) : [item];
    return tabs.some(tab => tab.selected || tab.multiselected || (!nativeWorkspace
      && (tab === this.host.gBrowser.selectedTab || tab.hasAttribute?.("visuallyselected"))));
  }
  installIconProjection() {
    const native = this.host.gZenFolders, original = native?.updateFolderIcon;
    if (typeof original !== 'function') return;
    const descriptor = Object.getOwnPropertyDescriptor(native,'updateFolderIcon'), manager = this;
    const wrapper = function(group,...args) {
      const result = Reflect.apply(original,this,[group,...args]);
      if (manager.started) manager.projectFolderIcon(group,true);
      return result;
    };
    native.updateFolderIcon = wrapper;this.iconHook = {native,original,descriptor,wrapper};
  }
  projectFolderIcon(folder,nativeUpdated = false) {
    if (!isRegularFolder(folder) || !this.projection.has(folder)) return;
    const svg = folder.querySelector?.(':scope > .tab-group-label-container > .tab-group-folder-icon > svg');
    if (!svg) return;
    // Advance the handback value when native selection updates the artwork.
    // A startup projection may predate that selection without any row motion.
    const record = this.records.get(svg)?.get('active');
    if (nativeUpdated && record) record.before = svg.getAttribute('active');
    const icon = folder.iconURL ?? svg.querySelector('.icon image')?.getAttribute('href') ?? '';
    const show = this.preferences?.get('showEmptyFolderActiveIndicator') === true || Boolean(icon);
    // Native activeTabs can retain a previously selected tab. The artwork must
    // describe the rows actually exposed by this projection, not that old list.
    this.write(svg,'active',String(folder.collapsed && show && this.activeIconFolders.has(folder)));
  }
  refresh() {
    if (!this.started) return;
    try {
      for (const [item, pending] of this.stickyRemovals) {
        if (!this.validStickyRemoval(item, pending)) this.cancelStickyRemoval(item);
      }
      const folders = Array.from(this.host.document.querySelectorAll("zen-folder"));
      const workspace = this.activeWorkspace(), pins = workspace?.pinnedTabsContainer;
      const roots = [...new Set([
        ...Array.from(pins?.children ?? []).filter(item => this.isVisibilityItem(item) && this.isRootPinnedItem(item)),
        ...folders.filter(folder => this.isVisibilityItem(folder) && !folder.group?.isZenFolder),
      ])];
      const projection = projectFolderVisibility(roots, {
        isFolder: item => item.isZenFolder === true,
        children: folder => this.items(folder), isCollapsed: folder => folder.collapsed === true,
        isSticky: item => this.rowSticky(item), isSelected: item => !item.isZenFolder
          && this.rowSelected(item, this.pinnedWorkspace(item)?.hasCollapsedPinnedTabs),
        isExposed: folder => this.exposure.has(folder),
        rootInitialState: (item, anchored) => {
          if (!workspace?.hasCollapsedPinnedTabs || !this.isRootPinnedItem(item)) return;
          // Space collapse is always anchor-only. The ordinary subfolder policy
          // applies below an explicitly visible folder, never to root pins.
          return {visible:anchored, projected:true, pathOnly:anchored && item.isZenFolder
            && !this.rowSticky(item) && !this.exposure.has(item)};
        },
      }, this.preferences?.get("subfolderCollapsePolicy") ?? "hide");
      const selectionMotion = this.selectionChanged ? this.motion.prepareSelection(projection) : [];
      this.selectionChanged = false;
      this.projection = projection;
      this.activeIconFolders.clear();
      for (const [item,state] of projection) {
        if (!state.visible || item.isZenFolder) continue;
        for (let folder = item.group; folder?.isZenFolder; folder = folder.group) this.activeIconFolders.add(folder);
      }
      if (pins) this.write(pins, 'data-bzf-workspace-projection', workspace.hasCollapsedPinnedTabs
        ? (roots.some(item => item.parentElement === pins && projection.get(item)?.visible) ? 'visible' : 'hidden') : null);
      if (pins) this.write(pins, 'data-bzf-stable-pins', this.motion.contains(pins) ? 'true' : null);
      this.projectNativeActiveTabs(projection);
      const active = this.host.document.activeElement;
      let focusFallback = null;
      for (const [item, state] of projection) {
        const projected = state.projected;
        this.write(item, 'data-bzf-stable-row', this.motion.contains(item)
          ? (state.visible ? 'visible' : 'hidden') : null);
        this.write(item, "data-bzf-visibility", projected ? (state.visible ? "visible" : "hidden") : null);
        if (!state.visible && item.contains?.(active)) {
          let ancestor = item.group;
          while (ancestor?.isZenFolder && !projection.get(ancestor)?.visible) ancestor = ancestor.group;
          focusFallback = ancestor?.labelElement ?? this.pinnedWorkspace(item)?.indicator ?? focusFallback;
        }
        if (item.isZenFolder) {
          let depth = 0;
          const ancestors = new Set([item]);
          for (let ancestor = item.group; ancestor?.isZenFolder && !ancestors.has(ancestor); ancestor = ancestor.group) {
            ancestors.add(ancestor); depth++;
          }
          this.write(item, 'data-bzf-guide-level', depth % 4);
          this.write(item, "data-bzf-projection", item.collapsed || projected ? "true" : null);
          this.write(item, "data-bzf-path-only", state.pathOnly ? "true" : null);
          this.write(item, "data-bzf-has-visible-children",
            this.items(item).some(child => projection.get(child)?.visible) ? "true" : null);
          if (projected) this.write(item.labelElement, "aria-hidden", state.visible ? null : "true");
          else this.restoreAttribute(item.labelElement, "aria-hidden");
          if (state.pathOnly) this.write(item.labelElement, "aria-expanded", "false");
          else this.write(item.labelElement, "aria-expanded", String(!item.collapsed));
          this.decorateChevron(item, state);
          this.projectFolderIcon(item);
        } else {
          const nodes = this.host.gBrowser.isSplitViewWrapper?.(item) ? [item,...Array.from(item.tabs ?? [])] : [item];
          for (const tab of nodes) {
            if (projected) this.write(tab, "aria-hidden", state.visible ? null : "true");
            else this.restoreAttribute(tab, "aria-hidden");
          }
        }
        this.decorateEar(item, true);
        const accessible = item.isZenFolder ? item.labelElement : item;
        if (state.sticky && this.stickyToggleTargets(item).length) {
          this.write(accessible, "aria-description", "Sticky: remains visible when containing folders or Space pins are collapsed.");
        } else this.restoreAttribute(accessible, "aria-description");
      }
      // Leaving a folder and its workspace pins makes Sticky inactive, not erased.
      for (const node of [...this.records.keys()]) {
        const item = node.isZenFolder || this.host.gBrowser.isTab?.(node)
          || this.host.gBrowser.isSplitViewWrapper?.(node) ? node : node.closest?.('zen-folder');
        const split = item && browserSplitWrapper(this.host, item);
        if (item && !projection.has(item)) {
          // A split wrapper is the projected row. Remove old constituent-row
          // controls, but retain accessibility/active state managed by the split.
          this.decorateEar(item, false);
          this.restoreAttribute(item, 'data-bzf-visibility');
          this.restoreAttribute(item, 'aria-description');
          if (!projection.has(split)) {
            for (const name of [...this.records.get(node)?.keys() ?? []]) this.restoreAttribute(node, name);
          }
        }
        if (!node.isConnected || !this.isCurrentWorkspaceItem(node)) {
          for (const name of [...this.records.get(node)?.keys() ?? []]) this.restoreAttribute(node, name);
        }
        if (node !== pins) this.restoreAttribute(node, 'data-bzf-workspace-projection');
        if (node !== pins) this.restoreAttribute(node, 'data-bzf-stable-pins');
      }
      for (const decoration of this.decorations) {
        const folder = decoration.classList?.contains('better-zen-folders-state-chevron')
          ? decoration.closest?.('zen-folder') : null;
        if (folder && !projection.has(folder)) { decoration.remove(); this.decorations.delete(decoration); }
      }
      for (const branch of this.exposure.exposed) if (!branch.isConnected) this.exposure.exposed.delete(branch);
      if (focusFallback?.classList?.contains('zen-current-workspace-indicator') && !focusFallback.hasAttribute('tabindex')) {
        this.write(focusFallback, 'tabindex', '-1');
      }
      focusFallback?.focus?.();
      this.host.gBrowser.tabContainer._invalidateCachedVisibleTabs?.();
      this.projectNativeFocusableItems();
      this.motion.measure(projection);
      for (const group of selectionMotion) void this.motion.animate(group).catch(error=>this.report(error));
    } catch (error) { this.report(error); }
  }
  stickyToggleTargets(item) {
    if (!item?.isConnected || !this.stickyEnabled(item) || !this.isVisibilityItem(item)
      || !(item.group?.isZenFolder || this.isRootPinnedItem(item))) return [];
    const targets = this.host.gBrowser.isSplitViewWrapper?.(item)
      ? Array.from(item.tabs ?? []) : [item];
    return targets.filter(target => target?.isConnected && !isEmptyDirectItem(target)
      && !target.hasAttribute?.('zen-essential')
      && (target.isZenFolder || this.host.gBrowser.isTab?.(target)));
  }
  decorateEar(item, available) {
    const row = item.isZenFolder ? item.labelElement?.parentElement : item;
    if (!row) return;
    let button = Array.from(row.children ?? []).find(node => node.classList?.contains('better-zen-folders-sticky-toggle'));
    if (!available || !this.stickyToggleTargets(item).length) {
      this.removeUnderline(button);
      button?.remove(); if (button) this.decorations.delete(button); return;
    }
    if (!button) {
      button = this.host.document.createElementNS('http://www.w3.org/1999/xhtml', 'button');
      button.type = 'button';
      button.className = 'better-zen-folders-sticky-toggle';
      button.setAttribute('data-better-zen-folders-owned', 'true');
      button.setAttribute('draggable', 'false');
      button._bzfStickyTarget = item;
      const ear = this.host.document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      ear.className = 'better-zen-folders-sticky-ear';
      ear.setAttribute('aria-hidden', 'true');
      button.appendChild(ear);row.appendChild(button);this.decorations.add(button);
    }
    const sticky = this.rowSticky(item);
    if (this.isRootPinnedItem(item)) button.setAttribute('data-bzf-root-sticky-control', 'true');
    else button.removeAttribute('data-bzf-root-sticky-control');
    const kind = item.isZenFolder ? 'Folder'
      : this.host.gBrowser.isSplitViewWrapper?.(item) ? 'Split View' : 'Tab';
    button.setAttribute('aria-label', `Sticky ${kind}`);
    button.setAttribute('aria-pressed', String(sticky));
    button.setAttribute('title', sticky ? `Turn off Sticky for this ${kind.toLowerCase()}.`
      : `Make this ${kind.toLowerCase()} Sticky — keep visible when its folder or Space pins are collapsed.`);
    const pendingRemoval = this.stickyRemovals.has(item);
    button.toggleAttribute('data-bzf-sticky-pending', pendingRemoval);
    if (pendingRemoval) {
      button.setAttribute('data-bzf-sticky-pending', 'true');
      button.setAttribute('title', 'Removing Sticky shortly. Click again to keep it Sticky.');
      button.setAttribute('aria-label', `Cancel removing Sticky from this ${kind.toLowerCase()}`);
    }
    // One active keyboard/pointer surface per mode. The hidden corner control
    // retains state only; it must never remain an invisible gutter target.
    const icon = this.preferences?.get('stickyMarker') === 'underline'
      ? row.querySelector?.(item.isZenFolder ? ':scope > .tab-group-folder-icon' : '.tab-icon-stack') : null;
    if (button._bzfUnderline?.parentElement !== icon) this.removeUnderline(button);
    if (icon && !button._bzfUnderline) {
      const mark = this.host.document.createElementNS('http://www.w3.org/1999/xhtml', 'button');
      mark.type = 'button';
      mark.className = 'better-zen-folders-sticky-underline';
      mark.setAttribute('draggable', 'false');
      mark._bzfStickyControl = button;
      icon.appendChild(mark); button._bzfUnderline = mark; this.decorations.add(mark);
    }
    if (button._bzfUnderline) {
      button.setAttribute('data-bzf-sticky-marker', 'underline');
      button.setAttribute('tabindex','-1'); button.setAttribute('aria-hidden','true');
      button._bzfUnderline.setAttribute('data-bzf-sticky', String(sticky));
      button._bzfUnderline.setAttribute('aria-label',button.getAttribute('aria-label'));
      button._bzfUnderline.setAttribute('aria-pressed',String(sticky));
      button._bzfUnderline.setAttribute('title', button.getAttribute('title'));
      button._bzfUnderline.toggleAttribute('data-bzf-sticky-pending', pendingRemoval);
      if (item.isZenFolder) {
        // Native folder fronts and outline-free glyphs can be translated inside
        // their slot. Centre under the visible artwork without moving that art.
        const art = icon.querySelector(item.hasAttribute('zen-icons-enlarge-inner-icon') ? 'svg .icon' : 'svg .front')
          ?? icon.querySelector('svg');
        const slot = icon.getBoundingClientRect(), paint = art?.getBoundingClientRect();
        if (paint?.width > 0 && slot.width > 0) {
          const centre = paint.x + paint.width / 2;
          const offset = this.host.getComputedStyle(icon).direction === 'rtl' ? slot.right-centre : centre-slot.x;
          button._bzfUnderline.style.setProperty('--bzf-sticky-icon-centre',`${offset}px`);
        } else button._bzfUnderline.style.removeProperty('--bzf-sticky-icon-centre');
      }
    } else {
      button.removeAttribute('data-bzf-sticky-marker');
      button.removeAttribute('tabindex'); button.removeAttribute('aria-hidden');
    }
  }
  removeUnderline(button) {
    const mark = button?._bzfUnderline;
    if (!mark) return;
    mark.remove(); this.decorations.delete(mark); button._bzfUnderline = null;
  }
  handleStickyToggle(event) {
    const button = event.target?.closest?.('.better-zen-folders-sticky-toggle')
      ?? event.target?.closest?.('.better-zen-folders-sticky-underline')?._bzfStickyControl;
    if (!button || !this.decorations.has(button)) return false;
    if (button._bzfUnderline && !button._bzfUnderline.contains(event.target)) return false;
    if (['keydown','keypress','keyup'].includes(event.type)) {
      if (!['Enter', ' '].includes(event.key) || event.ctrlKey || event.altKey || event.metaKey) return false;
      // Let the HTML button generate its native keyboard click, exactly once.
      event.stopImmediatePropagation();return true;
    }
    if (!['pointerdown','mousedown','mouseup','click','dblclick','auxclick','dragstart'].includes(event.type)) return false;
    if (event.button === 2) return false; // Retain the ordinary right-click menu.
    // Native selection starts on mouse-down, before click. The gutter control
    // owns the entire gesture, including middle-click and attempted dragging.
    event.preventDefault();event.stopImmediatePropagation();
    if (event.type === 'click' && event.button === 0) {
      const item = button._bzfStickyTarget;
      try { this.toggleStickyFromMarker(item); }
      catch (error) { this.report(error); }
    }
    return true;
  }
  projectNativeActiveTabs(projection) {
    const wanted = new Map();
    for (const [item, state] of projection) {
      if (!state.visible || item.isZenFolder) continue;
      const tabs = this.host.gBrowser.isSplitViewWrapper?.(item) ? Array.from(item.tabs ?? []) : [item];
      for (const tab of tabs) {
        for (let folder = item.group; folder?.isZenFolder; folder = folder.group) {
          if (!folder.collapsed) continue;
          if (!wanted.has(folder)) wanted.set(folder, new Set());
          wanted.get(folder).add(tab);
        }
        const workspace = this.pinnedWorkspace(item);
        if (workspace?.hasCollapsedPinnedTabs && workspace.collapsiblePins && !tab.selected && !tab.multiselected) {
          const owner = workspace.collapsiblePins;
          if (!wanted.has(owner)) wanted.set(owner, new Set());
          wanted.get(owner).add(tab);
        }
      }
    }
    const active = new Set();
    for (const folder of new Set([...this.nativeActiveAdditions.keys(), ...wanted.keys()])) {
      if (!Array.isArray(folder.activeTabs)) continue;
      const previous = this.nativeActiveAdditions.get(folder) ?? new Set();
      const retained = folder.activeTabs.filter(tab => !previous.has(tab) || tab.selected || tab.multiselected);
      const additions = new Set([...wanted.get(folder) ?? []].filter(tab => !retained.includes(tab)));
      const next = [...retained, ...additions];
      for (const tab of additions) this.write(tab, 'folder-active', 'true');
      if (next.length !== folder.activeTabs.length || next.some((tab,index)=>tab !== folder.activeTabs[index])) {
        // The native setter can clear a different ancestor's indentation.
        // Borrow membership only; the attribute ledger owns our added flags.
        folder.activeTabs.splice(0, folder.activeTabs.length, ...next);
      }
      if (additions.size) this.nativeActiveAdditions.set(folder, additions);
      else this.nativeActiveAdditions.delete(folder);
      for (const tab of next) active.add(tab);
    }
    // The native setter does not clear removed entries when a nonempty list replaces it.
    for (const [node, attributes] of [...this.records]) {
      if (attributes.has('folder-active') && (node.selected || node.multiselected)) {
        // Selection has transferred ownership to Zen; do not undo its active flag.
        attributes.delete('folder-active');
        if (!attributes.size) this.records.delete(node);
        continue;
      }
      if (attributes.has('folder-active') && !active.has(node)) this.restoreAttribute(node, 'folder-active');
    }
  }
  projectNativeFocusableItems() {
    // Zen 1.22 uses this shared, mutable list for both keyboard focus and drop
    // geometry. Project its contents in place, never replace a browser getter
    // or prototype. Native invalidation rebuilds it; event capture reapplies the
    // projection before native input handling. No synthetic tab/folder nodes.
    const items = this.host.gBrowser.tabContainer.ariaFocusableItems;
    if (!Array.isArray(items) || !Object.isExtensible(items)) return;
    const candidates = new Set(items.filter(node => !node?.closest?.('[data-bzf-visibility="hidden"]')));
    for (const [item, state] of this.projection) {
      if (!state.projected || !state.visible) continue;
      const nodes = item.isZenFolder ? [item.labelElement]
        : this.host.gBrowser.isSplitViewWrapper?.(item) ? Array.from(item.tabs ?? []) : [item];
      for (const node of nodes) {
        const workspace = node?.closest?.('zen-workspace');
        const current = this.host.gZenWorkspaces?.activeWorkspaceElement;
        if (current && workspace !== current) continue;
        if (!current && workspace && workspace.getAttribute('active') !== 'true') continue;
        if ((workspace ?? current)?.hasCollapsedPinnedTabs
          && node.closest?.('.zen-workspace-pinned-tabs-section')?.getAttribute('data-bzf-workspace-projection') !== 'visible') continue;
        const rect = node?.getBoundingClientRect?.();
        // Never add a row from a hidden workspace/sidebar section.
        if (!rect || rect.width <= 0 || rect.height <= 0
          || this.host.getComputedStyle?.(node)?.visibility === 'hidden') continue;
        candidates.add(node);
      }
    }
    const ordered = [...candidates].sort((left,right) => {
      const position = left.compareDocumentPosition?.(right) ?? 0;
      return position & 4 ? -1 : position & 2 ? 1 : 0;
    });
    items.splice(0, items.length, ...ordered);
    items.forEach((item,index) => { item.elementIndex = index; });
  }
  decorateChevron(folder, state) {
    const row = folder.labelElement?.parentElement;
    if (!row) return;
    const mode = this.preferences?.get("folderStateChevron") ?? "outline-free";
    const show = mode === "always" || (mode === "outline-free"
      && folder.hasAttribute("zen-icons-enlarge-inner-icon"));
    this.write(folder, "data-bzf-chevron", show ? "true" : null);
    let chevron = Array.from(row.children ?? []).find(node => node.classList?.contains("better-zen-folders-state-chevron"));
    if (!show) { chevron?.remove(); if (chevron) this.decorations.delete(chevron); return; }
    if (!chevron) {
      // A decoration inside the existing folder toggle, not a second collapse control.
      chevron = this.host.document.createElementNS("http://www.w3.org/1999/xhtml", "span");
      chevron.className = "better-zen-folders-state-chevron";
      chevron.setAttribute("aria-hidden", "true"); row.appendChild(chevron);this.decorations.add(chevron);
    }
    const closed = folder.collapsed || state.pathOnly;
    chevron.setAttribute("data-closed", String(closed));
  }
  toggleFolder(folder) {
    if (!folder?.isZenFolder) return;
    this.motion.prepare(folder);
    if (folder.collapsed || this.projection.get(folder)?.pathOnly) {
      if (folder.group?.isZenFolder || this.pinnedWorkspace(folder)?.hasCollapsedPinnedTabs) this.exposure.expose(folder);
      folder.collapsed = false;
      this.exposure.onCollapseChanged(folder, false);
    } else {
      folder.collapsed = true;
      this.exposure.onCollapseChanged(folder, true);
    }
    this.refresh();
  }
  commitDragExpansion(folder) {
    if (!folder?.isZenFolder) return;
    this.exposure.expose(folder);
    this.refresh();
  }
  beginDragExpansion(folder) {
    if (!this.started) return;
    if (!this.dragExposure.has(folder)) this.dragExposure.set(folder, {
      collapsed:folder.collapsed, exposed:this.exposure.has(folder),
    });
    this.exposure.expose(folder);
    this.changingDragState = true;
    this.motion.prepare(folder);
    try { folder.collapsed = false; } finally { this.changingDragState = false; }
    this.refresh();
  }
  cancelDragExpansion(folder) {
    const before = this.dragExposure.get(folder);
    if (!before) return false;
    this.dragExposure.delete(folder);
    if (!before.exposed) this.exposure.exposed.delete(folder);
    this.changingDragState = true;
    this.motion.prepare(folder);
    try { folder.collapsed = before.collapsed; } finally { this.changingDragState = false; }
    this.refresh();return true;
  }
  releaseDragExpansion(folder) { this.dragExposure.delete(folder); }
  prepareNativeExpansion(folder) {
    const workspace = folder.parentElement?.collapsiblePins === folder ? folder.parentElement : null;
    const owner = workspace?.pinnedTabsContainer ?? folder;
    const projectionAttribute = workspace ? 'data-bzf-workspace-projection' : 'data-bzf-projection';
    const expandingAttribute = workspace ? 'data-bzf-workspace-expanding' : 'data-bzf-expanding';
    if (!owner.hasAttribute(projectionAttribute)) return;
    const spacer = folder.groupStartElement
      ?? folder.groupContainer?.querySelector?.(':scope > .zen-tab-group-start');
    const token = {margin:spacer?.style?.getPropertyValue?.('margin-top') ?? ''};
    this.expansionHandoffs.set(folder, token);
    // Reveal the new layout BEFORE Zen measures its expansion keyframes. A
    // hidden nested label otherwise measures zero and overlaps the following
    // row until native cleanup. Keep the old negative spacer offset masked.
    this.write(owner, expandingAttribute, 'true');
    this.refresh();
    Promise.resolve().then(async () => {
      const animations = spacer?.getAnimations?.() ?? [];
      await Promise.allSettled(animations.map(animation => animation.finished));
      if (!this.started || this.expansionHandoffs.get(folder) !== token) return;
      // Native cancellation skips its final margin write, including cancellation
      // before getAnimations() can see the animation. Clear only the unchanged
      // obsolete collapse offset, never a newer writer's value or a closed state.
      if (!folder.collapsed && Number.parseFloat(token.margin) < 0
        && spacer?.style?.getPropertyValue?.('margin-top') === token.margin) {
        spacer.style.removeProperty('margin-top');
      }
      this.expansionHandoffs.delete(folder);
      this.restoreAttribute(owner, expandingAttribute);
      this.refresh();
    }).catch(error => this.report(error));
  }
  contextItem(event, folderMenu) {
    const candidates = [event.target?.triggerNode, event.explicitOriginalTarget,
      event.originalTarget, this.host.document.popupNode];
    for (const candidate of candidates) {
      if (folderMenu) {
        const folder = candidate?.isZenFolder ? candidate
          : candidate?.closest?.('zen-folder') ?? candidate?.group;
        if (folder?.isZenFolder) return folder;
      } else {
        const tab = candidate?.tab ?? candidate?.closest?.('tab');
        if (this.host.gBrowser.isTab?.(tab)) return tab;
      }
    }
    return folderMenu ? null : this.host.TabContextMenu?.contextTab ?? null;
  }
  showMenu(event) {
    const menu = event.target;
    if (!['zenFolderActions','tabContextMenu'].includes(menu?.id)) return;
    const folderMenu = menu.id === 'zenFolderActions';
    const item = this.contextItem(event, folderMenu);
    const eligible = item && this.stickyEnabled(item) && !isEmptyDirectItem(item) && !item.hasAttribute?.('zen-essential')
      && (folderMenu ? item.isZenFolder && item.localName !== 'zen-workspace-collapsible-pins'
        : this.stickyToggleTargets(browserSplitWrapper(this.host, item) ?? item).length > 0);
    const id = folderMenu ? 'better-zen-folders-sticky-folder' : 'better-zen-folders-sticky-tab';
    let command = this.host.document.getElementById(id);
    if (!command) {
      command = this.host.document.createXULElement('menuitem');
      command.id = id;command.setAttribute('type','checkbox');command.setAttribute('autocheck','false');
      command.addEventListener('command', () => {
        const target = command._bzfStickyTarget;
        if (!target?.isConnected) return;
        try { this.setSticky(target, !this.isSticky(target)); } catch(error) { this.report(error); }
        this.syncStickyMenuCheck(command);
      });
      menu.appendChild(command);this.decorations.add(command);
    }
    // Native appearance controls precede an anonymous separator. Use direct
    // children so a similarly named item in a submenu cannot become an anchor.
    const appearanceIds = folderMenu
      ? ['context_zenFolderRename', 'context_zenFolderChangeIcon', 'better-zen-folders-folder-colour']
      : ['context_zen-edit-tab-title', 'context_zen-edit-tab-icon'];
    const structuralIds = folderMenu
      ? ['context_zenFolderUnloadAll', 'context_zenFolderNewSubfolder', 'context_zenChangeFolderSpace',
        'context_zenFolderToSpace', 'context_zenShareFolder', 'context_zenFolderUnpack', 'context_zenFolderDelete']
      : ['context_pinTab', 'context_unpinTab', 'context_pinSelectedTabs', 'context_unpinSelectedTabs',
        'context_unloadTab', 'context_duplicateTab', 'context_duplicateTabs'];
    const children = Array.from(menu.children);
    const appearance = children.filter(child => appearanceIds.includes(child.id)).at(-1);
    const before = appearance ? appearance.nextSibling
      : children.find(child => structuralIds.includes(child.id)) ?? null;
    if (before !== command) menu.insertBefore(command, before);
    command.hidden = !eligible;command._bzfStickyTarget = eligible ? item : null;
    command.setAttribute('label',folderMenu ? 'Sticky Folder' : 'Sticky Tab');
    command.setAttribute('tooltiptext','Keep visible when containing folders are collapsed; original order is preserved.');
    this.syncStickyMenuCheck(command);
    // The check uses the native .menu-icon slot even when decorative icons are
    // off. BZF's generic command class hides that slot without [image]; CMI
    // instead hides it itself and supplies a [checked]::before checkmark.
    command.classList.remove('better-zen-folders-command-item');
    command.classList.add('menuitem-iconic');
    command.style.setProperty('--menu-image', 'none');
    // Sticky is a state checkbox, not a decorative command icon. Keep one
    // meaning in this slot: empty when off, a check when on, in every theme.
    command.removeAttribute('image');
    setStickyMenuDecoration(command, this.preferences?.get?.('commandIconMode') ?? 'mod', this.host, this.preferences?.get?.('stickyMarker'));
  }
  syncStickyMenuCheck(command) {
    // Both installed Windows menu.css and CMI match presence, not value.
    if (command._bzfStickyTarget && this.isSticky(command._bzfStickyTarget)) command.setAttribute('checked', 'true');
    else command.removeAttribute('checked');
  }
  handleEvent(event) {
    if (!this.started) return;
    if (this.handleStickyToggle(event)) return;
    if (['pointerdown','mousedown','mouseup','auxclick','dblclick','keyup'].includes(event.type)) return;
    if (event.type === 'TabSelect') {
      this.selectionChanged = true;
      // Native animateSelect auto-expands a folder when all children are active.
      // Sticky contributes visibility, not selection intent: remove our loans
      // before that synchronous native guard, then re-project after dispatch.
      this.projectNativeActiveTabs(new Map());
    }
    if (event.type.startsWith('drag') || event.type === 'drop') {
      if (Array.from(event.dataTransfer?.types ?? []).includes('application/x-moz-tabbrowser-tab')) {
        this.projectNativeFocusableItems();
      }
      return;
    }
    if (event.type === 'keydown' && this.host.gBrowser.tabContainer.contains?.(event.target)) {
      this.projectNativeFocusableItems();
    }
    if (event.type === 'popupshowing') { this.showMenu(event); return; }
    if (event.type === 'click' || event.type === 'keydown') {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (target?.closest?.('input, textarea, textbox, [contenteditable="true"]')
        || event.ctrlKey || event.altKey || event.metaKey) return;
      const row = target?.closest?.('.tab-group-label-container');
      const folder = row?.parentElement;
      if (!folder?.isZenFolder || folderHeaderTargetIsControl(event)) return;
      if (event.type === 'keydown') {
        if (!['Enter',' ','ArrowRight','ArrowLeft'].includes(event.key)) return;
        if (event.key === 'ArrowRight' && !folder.collapsed && !this.projection.get(folder)?.pathOnly) return;
        if (event.key === 'ArrowLeft' && folder.collapsed) return;
      } else {
        if (event.button !== 0) return;
        // Title-text clicks remain owned by the existing delayed rename adapter.
        const rename = createBrowserFolderDoubleClickRenameAdapters(this.host, this.preferences);
        if (this.preferences?.get('doubleClickRename') !== false
          && Number(this.preferences?.get('folderTitleClickDelayMs') ?? 300) > 0
          && rename.getLabelFolder(event)) return;
      }
      event.preventDefault();event.stopImmediatePropagation();this.toggleFolder(folder);return;
    }
    const groupChange = (event.type === 'TabGroupExpand' || event.type === 'TabGroupCollapse') && event.target?.isZenFolder;
    if (groupChange) this.motion.prepare(event.target);
    if (!this.changingDragState && groupChange) {
      const workspace = event.target.parentElement;
      if (workspace?.collapsiblePins === event.target) {
        // Both Space boundaries reset its pinned branches, including the first
        // collapse and events from an inactive Space. Ordinary folders keep their cycle rule.
        for (const branch of this.exposure.exposed) {
          if (workspace.pinnedTabsContainer?.contains(branch)) this.exposure.exposed.delete(branch);
        }
      } else this.exposure.onCollapseChanged(event.target, event.type === 'TabGroupCollapse');
    }
    if (event.type === 'TabGroupExpand' && event.target?.isZenFolder && !this.motion.owns(event.target)) {
      this.prepareNativeExpansion(event.target);
    }
    this.schedule();
  }
  destroy() {
    if (!this.started) return;
    for (const item of this.stickyRemovals.keys()) this.cancelStickyRemoval(item);
    for (const folder of this.dragExposure.keys()) this.cancelDragExpansion(folder);
    this.started = false;
    this.motion.destroy();
    const hook = this.iconHook;this.iconHook = null;
    if (hook && hook.native.updateFolderIcon === hook.wrapper) {
      if (hook.descriptor) Object.defineProperty(hook.native,'updateFolderIcon',hook.descriptor);
      else delete hook.native.updateFolderIcon;
    }
    this.projectNativeActiveTabs(new Map());
    if (this.pending !== null) this.host.clearTimeout(this.pending);
    this.pending = null;this.observer?.disconnect();this.unsubscribe?.();
    for (const event of this.events) this.host.removeEventListener(event, this.onEvent, true);
    for (const type of ['keydown','keypress','keyup']) {
      this.host.removeEventListener(type, this.onStickySystemKey, this.stickySystemKeyOptions);
    }
    for (const menu of this.menus ?? []) menu.removeEventListener('popupshowing', this.onEvent);
    for (const node of this.decorations) node.remove();this.decorations.clear();
    for (const [node, attributes] of [...this.records]) {
      for (const name of [...attributes.keys()]) this.restoreAttribute(node, name);
    }
    this.projection.clear();this.activeIconFolders.clear();this.selectionChanged=false;this.exposure.clear();this.expansionHandoffs.clear();
    this.motion.restoreNativeLayout();
    this.host.gBrowser.tabContainer._invalidateCachedVisibleTabs?.();
  }
}

/** A per-window animation adapter, never a prototype patch. Native collapse
 * events (including SessionStore observers) still run. Every branch whose rows
 * are projected here uses this measured accordion, including ordinary folders.
 * Unmanaged and live folders retain their native animation.
 * Height is interpolated on changed rows only. A new gesture snapshots the
 * current heights and retires the old writer before reversing direction. */
export class StickyProjectionMotion {
  constructor(manager) {
    this.manager = manager; this.host = manager.host;
    this.roots = new Set(); this.hooks = []; this.before = new Map(); this.running = new Map();
    this.managedGroups = new Set();
    this.measurements = new Map();
  }
  start() {
    if (this.hooks.length) return;
    const native = this.host.gZenFolders;
    for (const name of ['animateCollapse', 'animateExpand']) {
      if (typeof native?.[name] !== 'function') continue;
      const original = native[name], motion = this;
      const wrapper = function(group, ...args) {
        if (motion.manager.started && motion.owns(group)) return motion.animate(group);
        return original.call(this, group, ...args);
      };
      const descriptor = Object.getOwnPropertyDescriptor(native, name);
      native[name] = wrapper; this.hooks.push({native, name, original, wrapper, descriptor});
    }
  }
  contains(item) { return [...this.roots].some(root => root === item || root.contains?.(item)); }
  measure(projection) {
    for (const root of this.roots) if (!root.isConnected) this.roots.delete(root);
    for (const group of this.managedGroups) if (!group.isConnected) this.managedGroups.delete(group);
    for (const [group, token] of this.running) if (!group.isConnected) token.finish();
    for (const group of this.before.keys()) if (!group.isConnected) this.before.delete(group);
    const next = new Map();
    for (const [item, state] of projection) {
      const height = state.visible && !item.hasAttribute('data-bzf-motion')
        ? item.getBoundingClientRect().height : 0;
      const retained = height > 0 ? height : this.measurements.get(item);
      if (retained) next.set(item, retained);
    }
    this.measurements = next;
  }
  owns(group) {
    if (!this.hooks.length || !group?.isZenFolder || group.isLiveFolder) return false;
    if (this.contains(group)) return true;
    const container = group.parentElement?.collapsiblePins === group ? group.groupContainer : group;
    // Projection hides ordinary children too. Delegating those branches to
    // native motion measures rows after they vanished and produces a snap.
    return [...this.manager.projection].some(([item]) => container?.contains?.(item));
  }
  prepareSelection(projection) {
    const groups = new Set();
    for (const [item,old] of this.manager.projection) {
      const next = projection.get(item);
      if (!next || old.visible === next.visible || (!old.projected && !next.projected)) continue;
      let group = null;
      for (let parent = item.group; parent?.isZenFolder; parent = parent.group) if (parent.collapsed) group = parent;
      const workspace = this.manager.pinnedWorkspace(item);
      if (workspace?.hasCollapsedPinnedTabs) group = workspace.collapsiblePins;
      if (group && this.owns(group)) groups.add(group);
    }
    const roots = [...groups].filter(group=>![...groups].some(other=>other!==group && other.contains?.(group)));
    for (const group of roots) this.prepare(group);
    return roots;
  }
  prepare(group) {
    if (!this.owns(group) || this.before.has(group)) return;
    const container = group.parentElement?.collapsiblePins === group ? group.groupContainer : group;
    const snapshot = new Map();
    for (const [item, state] of this.manager.projection) {
      if (container !== item && !container?.contains?.(item)) continue;
      const moving = item.hasAttribute('data-bzf-motion');
      const current = item.getBoundingClientRect().height;
      // Native groups may set aria-hidden before the collapse event. Do not
      // mistake that instant CSS hide for the previous visible geometry.
      const height = !moving && state.visible && current === 0
        ? this.measurements.get(item) ?? 0 : current;
      snapshot.set(item, {visible:state.visible, height, moving});
    }
    for (const token of [...this.running.values()]) {
      if (container === token.container || container?.contains?.(token.container)
        || token.container?.contains?.(container)) token.finish();
    }
    let root = group;
    if (group.parentElement?.collapsiblePins === group) root = group.groupContainer;
    else while (root.group?.isZenFolder) root = root.group;
    this.roots.add(root);
    this.managedGroups.add(group);
    for (const item of this.manager.projection.keys()) {
      if (item.isZenFolder && this.contains(item)) this.managedGroups.add(item);
    }
    this.before.set(group, snapshot);
  }
  async animate(group) {
    const manager = this.manager;
    if (!this.before.has(group)) this.prepare(group);
    const before = this.before.get(group) ?? new Map(); this.before.delete(group);
    this.host.gZenFolders?.cancelPopupTimer?.();
    // Native restoration can leave the container hidden. CSS projects it while
    // collapsed; an explicit expansion must also perform native unhide/cleanup.
    group.groupContainer?.removeAttribute('hidden');
    if (!group.collapsed) {
      group.removeAttribute('has-active');
      if (Array.isArray(group.activeTabs)) group.activeTabs = [];
    }
    manager.refresh();
    if (group.collapsed && group.activeTabs?.length) manager.write(group, 'has-active', 'true');
    this.host.gZenFolders?.updateFolderIcon?.(group);
    const changed = new Map();
    for (const [item, state] of manager.projection) {
      const old = before.get(item);
      if (!old || !this.contains(item) || (old.visible === state.visible && !old.moving)) continue;
      changed.set(item, {from:old.height, to:state.visible ? item.getBoundingClientRect().height : 0});
    }
    // A whole hidden subfolder is one accordion row, not a second animation
    // on every descendant inside it.
    for (const item of [...changed.keys()]) {
      for (let parent = item.parentElement; parent; parent = parent.parentElement) {
        if (changed.has(parent)) { changed.delete(item); break; }
      }
    }
    if (this.host.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !changed.size) return;
    await new Promise(resolve => {
      const heights = new Map();
      const setHeight = (item, value) => {
        let record = heights.get(item);
        const current = item.style.getPropertyValue('--bzf-motion-height');
        const priority = item.style.getPropertyPriority('--bzf-motion-height');
        if (!record) {
          record = {before:current, priority, last:current, lastPriority:priority};
          heights.set(item, record);
        }
        // A later owner of this property wins, including at teardown.
        if (current !== record.last || priority !== record.lastPriority) return;
        item.style.setProperty('--bzf-motion-height', value);
        record.last = value; record.lastPriority = '';
      };
      const token = {frame:null,
        container:group.parentElement?.collapsiblePins === group ? group.groupContainer : group,
        finish:() => {
        if (this.running.get(group) !== token) return;
        if (token.frame !== null) this.host.cancelAnimationFrame(token.frame);
        for (const item of changed.keys()) {
          manager.restoreAttribute(item, 'data-bzf-motion');
          const record = heights.get(item);
          if (record && item.style.getPropertyValue('--bzf-motion-height') === record.last
            && item.style.getPropertyPriority('--bzf-motion-height') === record.lastPriority) {
            if (record.before) item.style.setProperty('--bzf-motion-height', record.before, record.priority);
            else item.style.removeProperty('--bzf-motion-height');
          }
        }
        this.running.delete(group); resolve();
      }};
      this.running.set(group, token);
      for (const [item, height] of changed) {
        setHeight(item, `${height.from}px`);
        manager.write(item, 'data-bzf-motion', 'true');
      }
      let start;
      const tick = time => {
        if (!manager.started || this.running.get(group) !== token) return token.finish();
        start ??= time;
        const progress = Math.min(1, (time - start) / 180);
        const eased = progress * progress * (3 - 2 * progress);
        for (const [item, height] of changed) setHeight(item, `${height.from + (height.to - height.from) * eased}px`);
        if (progress === 1) token.finish();
        else token.frame = this.host.requestAnimationFrame(tick);
      };
      token.frame = this.host.requestAnimationFrame(tick);
    });
    if (manager.started) manager.refresh();
  }
  destroy() {
    for (const token of [...this.running.values()]) token.finish();
    this.nativeHandoff = {
      groups:[...this.managedGroups],
      methods:new Map(this.hooks.map(hook => [hook.name, {native:hook.native, original:hook.original}])),
    };
    for (const root of this.roots) {
      const workspace = root.closest?.('zen-workspace');
      if (workspace?.pinnedTabsContainer === root && workspace.collapsiblePins) this.nativeHandoff.groups.push(workspace.collapsiblePins);
    }
    for (const {native,name,wrapper,descriptor} of this.hooks) {
      if (native[name] !== wrapper) continue;
      if (descriptor) Object.defineProperty(native,name,descriptor); else delete native[name];
    }
    this.hooks=[];this.before.clear();this.roots.clear();this.managedGroups.clear();this.measurements.clear();
  }
  restoreNativeLayout() {
    // Run only after the projection and borrowed active flags are gone. Zen
    // must recompute its own collapsed layout when the mod is disabled/reloaded.
    const handoff = this.nativeHandoff; this.nativeHandoff = null;
    if (!handoff) return;
    for (const group of handoff.groups.reverse()) {
      if (!group.isConnected) continue;
      // Hidden workspaces cannot supply a meaningful collapse height. With no
      // native active member, hiding the container is Zen's collapsed endpoint
      // and its next expansion removes that attribute normally.
      if (!this.manager.isCurrentWorkspaceItem(group) && group.collapsed
        && !group.activeTabs?.length) {
        group.groupContainer?.setAttribute('hidden', 'true');
        continue;
      }
      const method = handoff.methods.get(group.collapsed ? 'animateCollapse' : 'animateExpand');
      try { Promise.resolve(method?.original.call(method.native, group)).catch(error => this.manager.report(error)); }
      catch (error) { this.manager.report(error); }
    }
  }
}

export function isRegularFolder(folder) {
  return Boolean(folder?.isZenFolder && !folder?.isLiveFolder);
}

const DRAG_DIAGNOSTIC_TYPES = new Set([
  "dragstart-capture", "dragstart-postnative", "capture", "postnative", "acceptance", "track",
  "dwell-start", "dwell-cancel", "dwell-expiry", "suspend", "chooser-show", "chooser-hide",
  "layout-stale", "dragleave", "drop", "dragend", "cancel", "cleanup", "refresh",
  "copy-request", "copy-success", "copy-failure",
]);
const DRAG_DIAGNOSTIC_REASONS = new Set([
  "source_missing", "source_not_tab", "source_disconnected", "source_foreign", "source_outside_tabs",
  "source_unsupported", "source_placeholder", "source_multiselected", "source_tab_list", "source_workspace",
  "moving_items", "session_missing", "session_changed", "layout_missing", "target_outside_pins",
  "target_outside_root", "outside_viewport", "outside_trigger", "pointer_missing", "suspended",
  "finish_pending", "pointer_not_accepted", "layout_invalidated", "mime_missing", "multiple_transfer_items",
  "payload_mismatch", "native_rejected", "copy_effect", "release_not_move", "acceptance_exception",
  "source_ineligible", "default_not_prevented", "default_prevented", "geometry_unavailable", "sampling_failed",
]);

// Only fixed-schema primitives enter this buffer. No events, nodes, native data,
// names, URLs or error messages are retained; object correlation uses weak IDs.
export class DragDiagnosticRecorder {
  constructor({preferences = null, now = () => globalThis.performance?.now?.() ?? 0, capacity = 8192} = {}) {
    this.preferences = preferences;
    this.now = now;
    this.capacity = Number.isInteger(capacity) ? Math.max(1, Math.min(8192, capacity)) : 8192;
    this.enabled = false;
    this.started = false;
    this.clear();
  }

  clear() {
    this.entries = [];
    this.droppedEvents = {};
    this.truncated = this.sequence = this.attempt = this.nextToken = 0;
    this.lastStart = this.startedAt = null;
    this.tokens = new WeakMap();
    this.lastRecords = new Map();
  }

  start() {
    if (this.started) return;
    this.started = true;
    const update = value => {
      const enabled = value === true;
      if (enabled !== this.enabled) this.clear();
      this.enabled = enabled;
    };
    try {
      update(this.preferences?.get?.("dragDiagnosticsEnabled"));
      this.unsubscribe = this.preferences?.subscribe?.("dragDiagnosticsEnabled", update);
    } catch { this.enabled = false; }
  }

  token(object) {
    if (!this.enabled || !object || !["object", "function"].includes(typeof object)) return null;
    if (!this.tokens.has(object)) this.tokens.set(object, ++this.nextToken);
    return this.tokens.get(object);
  }

  beginAttempt(event) {
    if (!this.enabled) return;
    const token = this.token(event);
    if (token !== this.lastStart) { this.attempt++; this.lastStart = token; this.lastRecords.clear(); }
  }

  alias(pointer, event) {
    if (this.enabled && pointer && event) this.tokens.set(pointer, this.token(event));
  }

  record(type, fields = {}) {
    if (!this.enabled || !DRAG_DIAGNOSTIC_TYPES.has(type)) return;
    try {
      const now = this.now();
      if (this.startedAt === null) this.startedAt = Number.isFinite(now) ? now : 0;
      const entry = {seq: ++this.sequence, ms: Number.isFinite(now) ? Math.max(0, Math.round(now - this.startedAt)) : 0,
        attempt: this.attempt, type, reasons: []};
      for (const key of ["event", "source", "target", "candidate", "x", "y", "delay", "itemCount",
        "endTop", "endBottom", "triggerTop", "triggerBottom", "sectionLeft", "sectionRight",
        "viewportTop", "viewportBottom", "footerTop", "footerBottom"]) {
        const value = fields[key];
        if (typeof value === "number" && Number.isFinite(value)) entry[key] = Math.round(value * 10) / 10;
      }
      for (const key of ["suspended", "pointerAccepted", "finishPending", "invalidated", "footerVisible",
        "defaultPrevented", "sessionCurrent", "inTabs", "inPins", "inRoot", "inViewport", "inTrigger",
        "accepted", "mimePresent", "payloadMatches", "nativeChecked", "sourceValid", "activeDrag"]) {
        if (typeof fields[key] === "boolean") entry[key] = fields[key];
      }
      if (["dragstart", "dragover", "dragleave", "drop", "dragend", "blur", "pointerdown", "click", "keydown", "dragenter", "TabGroupExpand", "TabGroupCollapse"].includes(fields.eventType)) entry.eventType = fields.eventType;
      if (["source", "folder", "section", "footer", "separator", "tabs", "other", "none"].includes(fields.targetKind)) entry.targetKind = fields.targetKind;
      if (["move", "copy", "none", "link", "other"].includes(fields.nativeEffect)) entry.nativeEffect = fields.nativeEffect;
      if (Array.isArray(fields.reasons)) entry.reasons = [...new Set(fields.reasons.filter(reason => DRAG_DIAGNOSTIC_REASONS.has(reason)))];
      // Coalesce only unchanged per-type observations within this attempt. Keep
      // count/time ranges and first/latest event IDs, not an invented delivery cause.
      const coalescible = ["capture", "postnative", "acceptance", "track", "suspend"].includes(type);
      const key = `${type}:${entry.eventType ?? ""}`;
      const {seq, ms, event, ...stable} = entry;
      const fingerprint = coalescible ? JSON.stringify(stable) : null;
      const previous = this.lastRecords.get(key);
      if (coalescible && previous?.fingerprint === fingerprint) {
        previous.entry.repeatCount++;
        previous.entry.lastMs = ms;
        if (event !== undefined) previous.entry.lastEvent = event;
        return;
      }
      entry.repeatCount = 1; entry.lastMs = ms;
      if (event !== undefined) entry.lastEvent = event;
      if (this.entries.length === this.capacity) {
        const dropped = this.entries.shift(); this.truncated++;
        this.droppedEvents[dropped.type] = (this.droppedEvents[dropped.type] ?? 0) + dropped.repeatCount;
        const droppedKey = `${dropped.type}:${dropped.eventType ?? ""}`;
        if (this.lastRecords.get(droppedKey)?.entry === dropped) this.lastRecords.delete(droppedKey);
      }
      this.entries.push(entry);
      if (coalescible) this.lastRecords.set(key, {entry, fingerprint});
    } catch { /* Diagnostics must never participate in native drag decisions. */ }
  }

  snapshot() {
    const configuredDelays = {};
    for (const key of ["dragDestinationDelayMs", "dragHoverDelayMs", "dragRecollapseDelayMs"]) {
      try {
        const value = this.preferences?.get?.(key);
        configuredDelays[key] = Number.isInteger(value) && value >= 0 && value <= 2147483647 ? value : null;
      } catch { configuredDelays[key] = null; }
    }
    return {schema: 1, diagnosticBuild: "0.3.24", configuredDelays,
      enabled: this.enabled, capacity: this.capacity, truncated: this.truncated,
      droppedEvents: {...this.droppedEvents}, attempts: this.attempt,
      entries: this.entries.map(entry => ({...entry, reasons: [...entry.reasons]}))};
  }

  destroy() {
    try { this.unsubscribe?.(); } catch {}
    this.unsubscribe = null;
    this.enabled = this.started = false;
    this.clear();
  }
}

export class DragDiagnosticsMenuManager {
  constructor(host, preferences, recorder) {
    this.host = host; this.preferences = preferences; this.recorder = recorder;
    this.stops = []; this.item = this.menu = this.folder = null;
  }

  start(signal) {
    if (this.started || signal?.aborted) return;
    this.started = true;
    try {
      this.menu = this.host.document?.getElementById?.("zenFolderActions");
      this.onShowing = event => { if (event.target === this.menu) this.show(event); };
      this.menu?.addEventListener("popupshowing", this.onShowing);
      for (const key of ["dragDiagnosticsEnabled", "commandIconMode"]) {
        const stop = this.preferences?.subscribe?.(key, () => {
          try { if (!this.recorder.enabled) this.removeItem(); else this.decorate(); } catch {}
        });
        if (stop) this.stops.push(stop);
      }
      signal?.addEventListener?.("abort", () => this.destroy(), {once: true});
    } catch { this.destroy(); }
  }

  decorate() {
    setBzfCommandIcon(this.item, "chrome://global/skin/icons/edit-copy.svg",
      this.preferences?.get?.("commandIconMode") ?? "mod", this.host);
  }

  show(event) {
    try {
      this.folder = browserContextFolder(this.host, event);
      if (!this.recorder.enabled) { this.removeItem(); return; }
      const eligible = isRegularFolder(this.folder) && this.folder.isConnected;
      if (!this.item && eligible) {
        const item = this.host.document.createXULElement("menuitem");
        item.id = "better-zen-folders-copy-drag-diagnostics";
        item.setAttribute("label", "Copy Drag Diagnostics");
        this.onCommand = command => { if (command.target === item) this.copy(command); };
        item.addEventListener("command", this.onCommand);
        this.menu.appendChild(item); this.item = item;
      }
      if (this.item) { this.item.hidden = !eligible; this.decorate(); }
    } catch { /* Never break native popup delivery. */ }
  }

  copy(event) {
    try {
      if (!this.started || !this.recorder.enabled || !this.item || this.item.hidden
        || !isRegularFolder(this.folder) || !this.folder.isConnected) return;
      event.preventDefault(); event.stopPropagation();
      this.recorder.record("copy-request");
      const classes = this.host.Cc ?? this.host.Components?.classes;
      const interfaces = this.host.Ci ?? this.host.Components?.interfaces;
      // Native clipboard only, once, and only for this explicit command.
      const helper = classes?.["@mozilla.org/widget/clipboardhelper;1"]?.getService(interfaces?.nsIClipboardHelper);
      if (!helper) throw new Error();
      helper.copyString(JSON.stringify(this.recorder.snapshot(), null, 2));
      this.recorder.record("copy-success");
      this.item.setAttribute("tooltiptext", "Drag diagnostics copied");
    } catch {
      try { this.recorder.record("copy-failure"); this.item?.setAttribute("tooltiptext", "Unable to copy drag diagnostics"); } catch {}
    }
  }

  removeItem() {
    if (!this.item) return;
    this.item.removeEventListener("command", this.onCommand);
    setBzfCommandIcon(this.item, null, "off", this.host);
    this.item.remove(); this.item = null;
  }

  destroy() {
    try { this.menu?.removeEventListener("popupshowing", this.onShowing); } catch {}
    for (const stop of this.stops.splice(0)) { try { stop(); } catch {} }
    try { this.removeItem(); } catch {}
    this.menu = this.folder = null; this.started = false;
  }
}

// A drag-only footer supplies explicit hierarchy boundaries; native Zen still
// accepts the event, pins the tab, moves it, and owns autoscroll/drag teardown.
export class FolderEndDropManager {
  constructor(adapters) {
    this.adapters = adapters;
    this.listeners = [];
    this.source = null;
    this.footer = null;
    this.layout = null;
    this.pointer = null;
    this.restorePreview = null;
    this.restoreDrop = null;
    this.stopWatching = null;
    this.cancelRefresh = null;
    this.cancelFinish = null;
    this.suspended = false;
    this.invalidated = false;
    this.retiredFooter = null;
    this.dragData = null;
    this.cancelDwell = null;
    this.pointerAccepted = false;
  }

  diagnose(type, event = this.pointer, extra = {}) {
    try {
      const recorder = this.adapters.diagnostics;
      if (!recorder?.enabled) return;
      if (type === "dragstart-capture" || type === "dragstart-postnative") recorder.beginAttempt(event);
      const source = this.source ?? (type.startsWith("dragstart") ? this.adapters.getSource(event) : null);
      let sample;
      try { sample = this.adapters.diagnosticState?.(source, event, this.layout, this.footer) ?? {}; }
      catch { sample = {reasons: ["sampling_failed"]}; }
      const reasons = [...(sample.reasons ?? [])];
      if (this.suspended) reasons.push("suspended");
      if (this.cancelFinish) reasons.push("finish_pending");
      if (!this.pointerAccepted) reasons.push("pointer_not_accepted");
      if (this.invalidated) reasons.push("layout_invalidated");
      if (this.source && this.source._dragData !== this.dragData) reasons.push("session_changed");
      recorder.record(type, {...sample, event: recorder.token(event), source: recorder.token(source),
        target: recorder.token(event?.target), eventType: event?.type, x: event?.clientX, y: event?.clientY,
        suspended: this.suspended, pointerAccepted: this.pointerAccepted, finishPending: !!this.cancelFinish,
        invalidated: this.invalidated, footerVisible: !!this.footer, defaultPrevented: event?.defaultPrevented,
        ...extra, reasons: [...reasons, ...(extra.reasons ?? [])]});
    } catch { /* Observing a drag must not change its outcome. */ }
  }

  start(signal) {
    if (this.listeners.length || signal?.aborted) return;
    const root = this.adapters.eventTarget();
    const tabs = this.adapters.dragStartTarget();
    if (!root || !tabs) return;
    try { this.adapters.diagnostics?.start(); } catch {}
    const listen = (target, type, callback, capture = false) => {
      target.addEventListener(type, callback, capture);
      this.listeners.push(() => target.removeEventListener(type, callback, capture));
    };
    // Registered after native on the SAME target: stopPropagation in native
    // does not block this listener, whereas a window bubble listener would miss it.
    listen(tabs, "dragstart", event => this.begin(event));
    listen(root, "dragstart", event => this.diagnose("dragstart-capture", event), true);
    listen(root, "dragover", event => this.beforeDragOver(event), true);
    listen(tabs, "dragover", event => this.afterNativeDragOver(event));
    listen(root, "drop", event => this.prepareDrop(event), true);
    listen(root, "dragleave", event => this.leave(event), true);
    listen(root, "dragend", event => { this.diagnose("dragend", event); if (!this.cancelFinish) this.cleanup(); }, true);
    for (const type of ["pointerdown", "click"]) {
      listen(root, type, event => { this.diagnose("cancel", event); this.cleanup(); }, true);
    }
    listen(root, "blur", event => {
      this.diagnose("capture", event);
      if (event.target === root) this.suspend();
    }, true);
    listen(root, "keydown", event => { if (event.key === "Escape") { this.diagnose("cancel", event); this.cleanup(); } }, true);
    if (signal?.addEventListener) listen(signal, "abort", () => this.destroy());
  }

  begin(event) {
    this.cleanup();
    this.diagnose("dragstart-postnative", event);
    const source = this.adapters.getSource(event);
    if (!source || !this.adapters.accepts(source, event, false, true)) return;
    this.source = source;
    this.dragData = source._dragData;
    this.stopWatching = this.adapters.watch(() => {
      if (this.cancelRefresh || this.cancelFinish) return;
      this.cancelRefresh = this.adapters.defer(() => {
        this.cancelRefresh = null;
        this.diagnose("refresh");
        if (this.pointer && this.pointerAccepted) this.track(this.pointer);
      });
    });
  }

  clearPreview() {
    this.restorePreview?.();
    this.restorePreview = null;
  }

  hideFooter() {
    if (this.footer) this.diagnose("chooser-hide");
    this.clearPreview();
    this.footer?.element.remove();
    this.footer = null;
  }

  cancelDestinationDwell() {
    if (this.cancelDwell) this.diagnose("dwell-cancel");
    this.cancelDwell?.();
    this.cancelDwell = null;
  }

  sameLayout(a, b) {
    return Boolean(a && b && a.pins === b.pins && a.root === b.root
      && a.chain.length === b.chain.length && a.chain.every((folder, i) => folder === b.chain[i])
      && a.intents.every((intent, i) => intent.folder === b.intents[i]?.folder
        && intent.anchor === b.intents[i]?.anchor && intent.before === b.intents[i]?.before));
  }

  currentSession() {
    return Boolean(this.source && this.adapters.isSessionCurrent(this.source, this.dragData));
  }

  suspend() {
    this.diagnose("suspend");
    this.cancelDestinationDwell();
    this.hideFooter();
    this.layout = this.pointer = null;
    this.pointerAccepted = false;
    this.invalidated = false;
    this.suspended = true;
  }

  leave(event) {
    this.diagnose("dragleave", event);
    if (!this.source || this.cancelFinish) return;
    // A descendant transition can be delivered after entering its new target.
    // Preserve a valid trigger/chooser region, but never retain an outside one.
    const pointer = { ...this.pointer, target: event.relatedTarget,
      clientX: event.clientX, clientY: event.clientY };
    if (this.footer?.element.contains(event.relatedTarget)
      || (this.layout && this.adapters.inTrigger(this.layout, pointer))) return;
    if (event.relatedTarget && this.pointer?.target !== event.target
      && !event.target?.contains?.(this.pointer?.target)
      && this.adapters.inTrigger(this.layout, this.pointer)) return;
    this.suspend();
  }

  refresh({ target = this.pointer?.target, rearm = false, dropping = false } = {}) {
    if (!this.source || this.cancelFinish || this.suspended) return false;
    const next = this.adapters.getLayout(this.source, this.layout?.root);
    if (this.invalidated || !this.sameLayout(next, this.layout)) {
      this.diagnose("layout-stale");
      // Invalidation is not drag termination. Keep the source and watcher so a
      // hover expansion/recollapse can re-arm on a later accepted move.
      this.invalidated = true;
      this.clearPreview();
      const oldFooter = this.footer?.element ?? this.retiredFooter;
      const occupied = oldFooter?.contains(target) === true;
      if (dropping || (occupied && (next || rearm))) {
        // The event path is already fixed, but native pin routing reads LIVE
        // closest() ancestry. Never detach its target during drop capture.
        // Occupied rows also retain their old labels, with no custom receiver.
        this.footer?.element.setAttribute("data-bzf-drop-stale", "true");
        this.footer?.element.setAttribute("aria-disabled", "true");
        return false;
      }
      this.retiredFooter = oldFooter;
      this.hideFooter();
      this.layout = null;
      if (!next || !rearm || occupied) return false;
      this.invalidated = false;
      this.retiredFooter = null;
    }
    this.layout = next;
    if (this.footer) this.adapters.updateFooter(this.footer, next);
    return true;
  }

  track(pointer) {
    this.diagnose("track", pointer);
    if (!this.currentSession()) { this.cleanup(); return; }
    if (!this.adapters.accepts(this.source, pointer)) { this.suspend(); return; }
    this.clearPreview();
    const occupied = Boolean(this.adapters.hitTest(this.footer, pointer));
    if (this.footer) {
      if (!this.refresh({ target: pointer.target }) && occupied) return;
      if (this.footer && (occupied || this.adapters.inTrigger(this.layout, pointer))) {
        this.preview(pointer);
        return;
      }
      this.hideFooter();
    }
    const next = this.adapters.findLayout(this.source, pointer);
    if (!next) {
      this.cancelDestinationDwell(); this.layout = null; this.invalidated = false;
      return;
    }
    // Native drag handling can move the boundary after our capture check.
    // This fresh, accepted trigger restores eligibility; a previous outside
    // result must not strand the newly started dwell in the suspended state.
    this.suspended = false;
    if (this.cancelDwell && this.sameLayout(next, this.layout)) return;
    this.cancelDestinationDwell();
    this.layout = next; this.invalidated = false; this.retiredFooter = null;
    const delay = parseNumericSetting("dragDestinationDelayMs", this.adapters.getDestinationDelayMs()) ?? 300;
    const dragData = this.dragData;
    this.diagnose("dwell-start", pointer, {delay});
    const reveal = () => {
      this.diagnose("dwell-expiry");
      if (this.layout !== next || this.dragData !== dragData) return;
      this.cancelDwell = null;
      if (!this.currentSession()) { this.cleanup(); return; }
      if (this.suspended || this.cancelFinish || !this.pointerAccepted || this.layout !== next) return;
      const current = this.adapters.getLayout(this.source, next.root);
      if (!this.sameLayout(current, next) || !this.adapters.inTrigger(current, this.pointer)
        || !this.adapters.accepts(this.source, this.pointer)) { this.layout = null; return; }
      this.layout = current;
      this.footer = this.adapters.createFooter(current);
      this.diagnose("chooser-show");
    };
    if (delay === 0) reveal();
    else this.cancelDwell = this.adapters.setDestinationTimer(reveal, delay);
  }

  beforeDragOver(event) {
    this.diagnose("capture", event);
    this.clearPreview();
    this.pointer = null;
    this.pointerAccepted = false;
    if (!this.source || this.cancelFinish) return;
    if (!this.currentSession()) { this.cleanup(); return; }
    if (!this.adapters.accepts(this.source, event)) {
      this.suspend();
      return;
    }
    if (!this.adapters.hitTest(this.footer, event) && !this.adapters.findLayout(this.source, event)) {
      this.suspend();
      return;
    }
    this.suspended = false;
    if (this.footer) this.refresh({ target: event.target });
  }

  afterNativeDragOver(event) {
    this.diagnose("postnative", event, {reasons: event.defaultPrevented ? [] : ["default_not_prevented"]});
    if (!this.source || this.cancelFinish || !event.defaultPrevented
      || !this.adapters.accepts(this.source, event)) return;
    this.pointer = { target: event.target, clientX: event.clientX, clientY: event.clientY,
      dataTransfer: event.dataTransfer };
    try { this.adapters.diagnostics?.alias(this.pointer, event); } catch {}
    this.pointerAccepted = true;
    this.track(this.pointer);
  }

  preview(pointer) {
    if (this.invalidated) return;
    const hit = this.adapters.hitTest(this.footer, pointer);
    if (hit) this.restorePreview = this.adapters.showPreview(hit);
  }

  prepareDrop(event) {
    this.diagnose("drop", event);
    if (!this.source || this.cancelFinish) return;
    this.cancelDestinationDwell();
    this.clearPreview();
    // Re-read coordinates, projection, native acceptance, and anchors at release.
    if (this.currentSession() && this.footer && !event.defaultPrevented && this.adapters.accepts(this.source, event, true)) {
      this.suspended = false;
      if (this.refresh({ target: event.target, dropping: true })) {
        const hit = this.adapters.hitTest(this.footer, event);
        if (hit) this.restoreDrop = this.adapters.prepareNativeDrop(this.source, hit.intent);
      }
    }
    if (!this.source) return;
    // Keep target ancestry intact until native's bubble listener has pinned/moved
    // the tab and the hover guard has captured its semantic destination.
    this.cancelFinish = this.adapters.defer(() => {
      this.cancelFinish = null;
      this.cleanup();
    });
  }

  composeHoverAdapters(adapters) {
    const folderFor = (target, fallback) => {
      const entry = !this.invalidated && this.footer?.rows.find(row => row.element.contains(target));
      return entry ? entry.intent.folder : fallback();
    };
    return {
      ...adapters,
      // Chooser hover preserves an already-open path without starting a native
      // folder expansion. Drop resolution below still uses the selected intent.
      getDestinationHoverFolder: event => {
        if (!this.source || this.invalidated) return undefined;
        if (this.adapters.hitTest(this.footer, event)) return this.layout?.chain.at(-1);
        return this.adapters.findLayout(this.source, event)?.chain.at(-1);
      },
      getTargetFolder: event => {
        const hit = !this.invalidated && this.adapters.hitTest(this.footer, event);
        return hit ? hit.intent.folder : folderFor(event.target, () => adapters.getTargetFolder(event));
      },
      getRelatedTargetFolder: event => folderFor(event.relatedTarget, () => adapters.getRelatedTargetFolder(event)),
    };
  }

  cleanup() {
    if (this.source || this.footer || this.cancelDwell) this.diagnose("cleanup");
    this.cancelDestinationDwell();
    this.cancelRefresh?.();
    this.cancelFinish?.();
    this.cancelRefresh = this.cancelFinish = null;
    this.stopWatching?.();
    this.stopWatching = null;
    this.hideFooter();
    this.restoreDrop?.();
    this.restoreDrop = null;
    this.source = this.layout = this.pointer = null;
    this.dragData = null;
    this.pointerAccepted = false;
    this.suspended = false;
    this.invalidated = false;
    this.retiredFooter = null;
  }

  destroy() {
    this.cleanup();
    for (const remove of this.listeners.splice(0)) remove();
    try { this.adapters.diagnostics?.destroy(); } catch {}
  }
}

export class FolderPopulationRegistry {
  constructor() {
    this.holds = new WeakMap();
    this.releaseSubscribers = new Set();
  }

  hold(folder) {
    if (!folder || (typeof folder !== "object" && typeof folder !== "function")) {
      throw new TypeError("folder population hold requires an object");
    }
    this.holds.set(folder, (this.holds.get(folder) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const count = this.holds.get(folder) ?? 0;
      if (count > 1) {
        this.holds.set(folder, count - 1);
        return;
      }
      this.holds.delete(folder);
      for (const callback of [...this.releaseSubscribers]) {
        try { callback(folder); } catch {}
      }
    };
  }

  isHeld(folder) {
    return (this.holds.get(folder) ?? 0) > 0;
  }

  subscribeReleased(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("folder population release subscriber must be a function");
    }
    this.releaseSubscribers.add(callback);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.releaseSubscribers.delete(callback);
    };
  }
}

export const RESTORE_KEY = "betterZenFolders.restore.v1";
export const DEFAULT_MAX_FOLDER_DEPTH = 5;
export const DRAG_HOVER_DELAY_MS = 500;
export const FOLDER_DOUBLE_CLICK_DELAY_MS = 300;
export const PREFERENCE_BRANCH = "better-zen-folders.";
export const FOLDER_COLOR_LEDGER_PREF = "better-zen-folders.folder-colors.v1";
export const FOLDER_COLOR_BINDINGS_PREF = "better-zen-folders.folder-color-presets.v1";
export const MAX_FOLDER_COLOR_ENTRIES = 256;

const FOLDER_COLOR_RECORD_VERSION = 1;

export function normalizeFolderColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

function preferenceDefinition(property, kind, defaultValue, allowedValues = null) {
  return Object.freeze({
    property: `${PREFERENCE_BRANCH}${property}`,
    kind,
    defaultValue,
    allowedValues: allowedValues ? Object.freeze([...allowedValues]) : null,
  });
}

const DEFAULT_FOLDER_COLOR_SWATCHES = Object.freeze([
  ["Red", "#e76565"], ["Orange", "#ef8f4b"], ["Yellow", "#e3bd41"], ["Green", "#51c67c"],
  ["Cyan", "#3ebcd2"], ["Blue", "#5f95eb"], ["Purple", "#9b79ea"], ["Pink", "#e46da9"],
].map(Object.freeze));

export function folderColorSwatches(preferences) {
  if (preferences?.get?.('customPaletteEnabled') !== true) return DEFAULT_FOLDER_COLOR_SWATCHES;
  return DEFAULT_FOLDER_COLOR_SWATCHES.map(([, color], i) => [
    `Swatch ${i + 1}`, normalizeFolderColor(preferences.get(`palette${i + 1}`)) ?? color,
  ]);
}

export const PREFERENCE_DEFINITIONS = Object.freeze({
  folderUrlPinsEnabled: preferenceDefinition("folder-url-pins-enabled", "boolean", true),
  showRootPinBadge: preferenceDefinition("show-root-pin-badge", "boolean", false),
  showEmptyFolderActiveIndicator: preferenceDefinition("show-empty-folder-active-indicator", "boolean", false),
  pinNewFolderTabUrls: preferenceDefinition("pin-new-folder-tab-urls", "boolean", false),
  urlUnpinGraceSeconds: preferenceDefinition("url-unpin-grace-seconds", "string", "0"),
  stickyTabsEnabled: preferenceDefinition("sticky-tabs-enabled", "boolean", true),
  stickyFoldersEnabled: preferenceDefinition("sticky-folders-enabled", "boolean", true),
  stickyMarker: preferenceDefinition("sticky-marker", "string", "underline", ["underline", "corner"]),
  stickyRemovalDelaySeconds: preferenceDefinition("sticky-removal-delay-seconds", "string", "0.5"),
  previewSubfolders: preferenceDefinition("preview-subfolders", "string", "expanded", ["expanded", "children", "collapsed", "hide"]),
  subfolderCollapsePolicy: preferenceDefinition("subfolder-collapse-policy", "string", "hide", ["hide", "expanded", "all"]),
  folderStateChevron: preferenceDefinition("folder-state-chevron", "string", "outline-free", ["outline-free", "always", "hidden"]),
  showFolderUnloadButton: preferenceDefinition("show-folder-unload-button", "boolean", false),
  dragDiagnosticsEnabled: preferenceDefinition("drag-diagnostics-enabled", "boolean", false),
  dragRecollapseDelayMs: preferenceDefinition("drag-recollapse-delay-ms", "number", 500),
  newTabButtonVisibility: preferenceDefinition(
    "new-tab-button-visibility",
    "string",
    "hover",
    ["hover", "always", "hidden"],
  ),
  newTabPosition: preferenceDefinition("new-tab-position", "string", "bottom", ["bottom", "top"]),
  movedTabPosition: preferenceDefinition("moved-tab-position", "string", "bottom", ["bottom", "top"]),
  movedFolderPosition: preferenceDefinition("moved-folder-position", "string", "bottom", ["bottom", "top"]),
  subfolderPosition: preferenceDefinition(
    "subfolder-position",
    "string",
    "bottom",
    ["bottom", "top"],
  ),
  dragHoverDelayMs: preferenceDefinition(
    "drag-hover-delay-ms",
    "number",
    500,
  ),
  dragDestinationDelayMs: preferenceDefinition("drag-destination-delay-ms", "number", 300),
  colourCodeDragDestinations: preferenceDefinition("colour-code-drag-destinations", "boolean", true),
  middleClickDelete: preferenceDefinition("middle-click-delete", "boolean", true),
  deleteEmptyRegularFolders: preferenceDefinition(
    "delete-empty-regular-folders",
    "boolean",
    true,
  ),
  decorateMoveToFolderMenu: preferenceDefinition(
    "decorate-move-to-folder-menu",
    "boolean",
    true,
  ),
  showFolderColourMenuIcon: preferenceDefinition(
    // Migration input only; the three-way setting below owns command icons.
    "show-folder-colour-menu-icon",
    "boolean",
    true,
  ),
  commandIconMode: preferenceDefinition("command-icon-mode", "string", "mod", ["off", "mod", "compatibility"]),
  doubleClickRename: preferenceDefinition("double-click-rename", "boolean", true),
  renameEscapeAction: preferenceDefinition("rename-escape-action", "string", "save", ["save", "cancel"]),
  folderTitleClickDelayMs: preferenceDefinition("folder-title-click-delay-ms", "number", 300),
  showHierarchyGuides: preferenceDefinition("show-hierarchy-guides", "boolean", true),
  folderNameSize: preferenceDefinition(
    "folder-name-size",
    "string",
    "14",
  ),
  menuIconSizePercent: preferenceDefinition("menu-icon-size-percent", "string", "120"),
  customPaletteEnabled: preferenceDefinition("custom-palette-enabled", "boolean", false),
  useSpaceColour: preferenceDefinition("use-space-colour", "boolean", true),
  ...Object.fromEntries(DEFAULT_FOLDER_COLOR_SWATCHES.map(([, color], i) => [
    `palette${i + 1}`, preferenceDefinition(`palette-${i + 1}`, "string", color),
  ])),
});

// Strings retain fractional CSS sizes; native integer preferences retain timer compatibility.
export function parseNumericSetting(name, raw) {
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  if (typeof raw === "string" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim())) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (name === 'stickyRemovalDelaySeconds' || name === 'urlUnpinGraceSeconds') return value >= 0 && value <= 2147483.647 ? value : null;
  if (name === "dragHoverDelayMs" || name === "dragDestinationDelayMs" || name === "dragRecollapseDelayMs" || name === "folderTitleClickDelayMs") {
    return Number.isInteger(value) && value >= 0 && value <= 2147483647 ? value : null;
  }
  if (name === "folderNameSize" || name === "menuIconSizePercent") return value > 0 ? value : null;
  return null;
}

const NUMERIC_SETTING_NAMES = new Set([
  "urlUnpinGraceSeconds",
  "stickyRemovalDelaySeconds",
  "dragHoverDelayMs", "dragDestinationDelayMs", "dragRecollapseDelayMs", "folderTitleClickDelayMs", "folderNameSize", "menuIconSizePercent",
]);
const LEGACY_FONT_SIZES = Object.freeze({default:"13", "slightly-larger":"14", larger:"15", "extra-large":"16"});

const PREFERENCE_ENTRIES = Object.entries(PREFERENCE_DEFINITIONS);
const PREFERENCE_BY_PROPERTY = new Map(
  PREFERENCE_ENTRIES.map(([name, definition]) => [definition.property, [name, definition]]),
);

export function createBrowserPreferenceAdapters(host) {
  const prefs = host.Services?.prefs;
  const requiredMethods = [
    "getPrefType",
    "getStringPref",
    "getIntPref",
    "getBoolPref",
    "setStringPref",
    "setIntPref",
    "setBoolPref",
    "clearUserPref",
    "addObserver",
    "removeObserver",
  ];
  if (!prefs || requiredMethods.some(method => typeof prefs[method] !== "function")) {
    return Object.freeze({
      prefTypes: Object.freeze({ invalid: 0, string: 32, number: 64, boolean: 128 }),
      getPrefType: () => 0,
      read: () => null,
      write: () => {},
      clearUserPref: () => {},
      addObserver: () => {},
      removeObserver: () => {},
      warn: () => {},
    });
  }
  const observers = new Map();
  const prefTypes = Object.freeze({
    invalid: prefs.PREF_INVALID,
    string: prefs.PREF_STRING,
    number: prefs.PREF_INT,
    boolean: prefs.PREF_BOOL,
  });
  const getter = Object.freeze({
    string: property => prefs.getStringPref(property),
    number: property => prefs.getIntPref(property),
    boolean: property => prefs.getBoolPref(property),
  });
  const setter = Object.freeze({
    string: (property, value) => prefs.setStringPref(property, value),
    number: (property, value) => prefs.setIntPref(property, value),
    boolean: (property, value) => prefs.setBoolPref(property, value),
  });
  return Object.freeze({
    prefTypes,
    getPrefType: property => prefs.getPrefType(property),
    hasUserValue: property => typeof prefs.prefHasUserValue === "function"
      ? prefs.prefHasUserValue(property) : prefs.getPrefType(property) !== prefs.PREF_INVALID,
    read: (kind, property) => getter[kind](property),
    write: (kind, property, value) => setter[kind](property, value),
    clearUserPref: property => prefs.clearUserPref(property),
    addObserver(observer) {
      const browserObserver = { observe: (...args) => observer(...args) };
      observers.set(observer, browserObserver);
      prefs.addObserver(PREFERENCE_BRANCH, browserObserver);
    },
    removeObserver(observer) {
      const browserObserver = observers.get(observer);
      if (!browserObserver) return;
      observers.delete(observer);
      prefs.removeObserver(PREFERENCE_BRANCH, browserObserver);
    },
    warn: message => host.console?.warn?.(message),
  });
}

export class BetterZenFoldersPreferences {
  constructor(adapters) {
    this.adapters = adapters;
    this.values = new Map(PREFERENCE_ENTRIES.map(([name, definition]) => [name, definition.defaultValue]));
    this.subscribers = new Map(PREFERENCE_ENTRIES.map(([name]) => [name, new Set()]));
    this.warnedProperties = new Set();
    this.started = false;
    this.destroyed = false;
    this.signal = null;
    this.boundObserve = this.observe.bind(this);
    this.boundDestroy = this.destroy.bind(this);
    this.normalizing = new Set();
  }

  get(name) {
    if (!PREFERENCE_DEFINITIONS[name]) throw new RangeError(`unknown Better Zen Folders preference: ${name}`);
    return this.values.get(name);
  }

  subscribe(name, callback) {
    if (!PREFERENCE_DEFINITIONS[name]) throw new RangeError(`unknown Better Zen Folders preference: ${name}`);
    if (typeof callback !== "function") throw new TypeError("preference subscriber must be a function");
    const subscribers = this.subscribers.get(name);
    subscribers.add(callback);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      subscribers.delete(callback);
    };
  }

  start(signal) {
    if (this.started || this.destroyed || signal?.aborted) return;
    for (const [name, definition] of PREFERENCE_ENTRIES) {
      this.values.set(name, this.normalize(definition));
    }
    this.started = true;
    this.signal = signal ?? null;
    this.adapters.addObserver(this.boundObserve);
    this.signal?.addEventListener?.("abort", this.boundDestroy, { once: true });
  }

  observe(_, topic, property) {
    if (!this.started || topic !== "nsPref:changed") return;
    const entry = PREFERENCE_BY_PROPERTY.get(property)
      ?? PREFERENCE_BY_PROPERTY.get(`${PREFERENCE_BRANCH}${property}`);
    if (!entry) return;
    const [name, definition] = entry;
    if (this.normalizing.has(definition.property)) return;
    const previous = this.values.get(name);
    const value = this.normalize(definition);
    this.values.set(name, value);
    if (Object.is(previous, value)) return;
    for (const callback of [...this.subscribers.get(name)]) {
      try { callback(value); } catch {}
    }
  }

  normalize(definition) {
    const storedType = this.adapters.getPrefType(definition.property);
    // Only migrate when no user choice exists. Sine can materialize defaults on
    // the user branch; those are indistinguishable from an explicit choice and
    // must not be silently overwritten on a later startup.
    if (definition === PREFERENCE_DEFINITIONS.commandIconMode
      && (storedType === this.adapters.prefTypes.invalid
        || this.adapters.hasUserValue?.(definition.property) === false)) {
      const legacy = PREFERENCE_DEFINITIONS.showFolderColourMenuIcon;
      if (this.adapters.getPrefType(legacy.property) === this.adapters.prefTypes.boolean
        && this.adapters.hasUserValue?.(legacy.property) !== false) {
        const mode = this.adapters.read("boolean", legacy.property) ? "mod" : "off";
        this.normalizing.add(definition.property);
        try { this.adapters.write("string", definition.property, mode); }
        finally { this.normalizing.delete(definition.property); }
        return mode;
      }
    }
    if (storedType === this.adapters.prefTypes.invalid) return definition.defaultValue;
    let value;
    const name = PREFERENCE_BY_PROPERTY.get(definition.property)?.[0];
    try {
      if (storedType !== this.adapters.prefTypes[definition.kind]) throw new TypeError("wrong type");
      value = this.adapters.read(definition.kind, definition.property);
      if (name === "folderNameSize" && Object.hasOwn(LEGACY_FONT_SIZES, value)) {
        value = LEGACY_FONT_SIZES[value];
        this.adapters.write("string", definition.property, value);
      }
      if (NUMERIC_SETTING_NAMES.has(name) && parseNumericSetting(name, value) === null) {
        throw new RangeError("invalid numeric value");
      }
      if (/^palette[1-8]$/.test(name)) {
        const normalized = normalizeFolderColor(value.trim());
        if (!normalized) throw new RangeError("invalid palette colour");
        value = normalized;
      }
      if (definition.allowedValues && !definition.allowedValues.includes(value)) {
        throw new RangeError("unsupported value");
      }
      return value;
    } catch {
      const replacement = this.started && (NUMERIC_SETTING_NAMES.has(name) || /^palette[1-8]$/.test(name))
        ? this.values.get(name) : definition.defaultValue;
      this.normalizing.add(definition.property);
      try {
        this.adapters.clearUserPref(definition.property);
        this.adapters.write(definition.kind, definition.property, replacement);
      } finally { this.normalizing.delete(definition.property); }
      if (!this.warnedProperties.has(definition.property)) {
        this.warnedProperties.add(definition.property);
        this.adapters.warn(`Better Zen Folders: reset invalid preference ${definition.property}`);
      }
      return replacement;
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.started) this.adapters.removeObserver(this.boundObserve);
    this.started = false;
    this.signal?.removeEventListener?.("abort", this.boundDestroy);
    this.signal = null;
    for (const subscribers of this.subscribers.values()) subscribers.clear();
  }
}

// Enhance only this mod's existing Sine fields, before Sine's change handler saves.
// No Sine files, other mods' controls or browser prototypes are changed.
export function installNumericSettingsUi(host, preferences) {
  const document = host.document;
  const records = new Map();
  // Sine settings can live in content where this mod's chrome sheet is absent.
  // One owned sheet also handles closed dialogs and Sine's replacement rows.
  const menuSizing = document.createElementNS('http://www.w3.org/1999/xhtml', 'style');
  menuSizing.textContent = `
    dialog.sineItemPreferenceDialog:has(.sineItemPreferenceDialogContent [id^="better-zen-folders-"]) {
      width: min(54rem, calc(100vw - 32px)) !important;
      min-width: 0; max-width: calc(100vw - 32px);
      margin-inline: auto;
    }
    .sineItemPreferenceDialogContent:has([id^="better-zen-folders-"]) {
      width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box;
    }
    .sineItemPreferenceDialogContent hbox[id^="better-zen-folders-"] {
      display: flex; flex-wrap: wrap; gap: .5em 1em;
      min-inline-size: 0; max-inline-size: 100%; box-sizing: border-box;
    }
    .sineItemPreferenceDialogContent hbox[id^="better-zen-folders-"] > .sineItemPreferenceLabel {
      flex: 1 1 23em; min-inline-size: 0; white-space: pre-line; overflow-wrap: anywhere;
    }
    .sineItemPreferenceDialogContent hbox[id^="better-zen-folders-"] > :is(input,menulist) {
      max-inline-size: 100%; box-sizing: border-box;
    }
    #better-zen-folders-command-icon-mode {
      display: flex; flex-wrap: wrap; gap: .5em 1em;
      min-inline-size: 0; max-inline-size: 100%; box-sizing: border-box;
    }
    #better-zen-folders-command-icon-mode > .sineItemPreferenceLabel {
      flex: 1 1 24em; min-inline-size: 0; white-space: normal; overflow-wrap: anywhere;
    }
    #better-zen-folders-command-icon-mode > menulist {
      inline-size: 24em; flex: 0 1 24em; min-inline-size: 0; max-inline-size: 100%;
      box-sizing: border-box; margin-inline: 0;
    }
  `;
  document.documentElement.appendChild(menuSizing);
  const ownedAttributes = ["type", "min", "max", "step", "inputmode", "aria-label", "aria-describedby", "aria-invalid"];
  const release = (input, record) => {
    record.message.remove();
    input.setCustomValidity("");
    for (const [name, value] of record.attributes) {
      if (value === null) input.removeAttribute(name);
      else input.setAttribute(name, value);
    }
    records.delete(input);
  };
  const refresh = () => {
    for (const [input, record] of records) if (!input.isConnected) release(input, record);
    for (const name of NUMERIC_SETTING_NAMES) {
      const definition = PREFERENCE_DEFINITIONS[name];
      const row = document.getElementById(definition.property.replaceAll(".", "-"));
      const input = row?.querySelector("input");
      if (!input || records.has(input)) continue;
      const attributes = new Map(ownedAttributes.map(key => [key, input.getAttribute(key)]));
      const integer = definition.kind === "number";
      input.type = "number";
      input.min = "0";
      if (integer) input.max = "2147483647";
      if (name === 'stickyRemovalDelaySeconds' || name === 'urlUnpinGraceSeconds') input.max = '2147483.647';
      input.step = integer ? "1" : "any";
      input.inputMode = integer ? "numeric" : "decimal";
      input.setAttribute("aria-label", row.querySelector(".sineItemPreferenceLabel")?.textContent
        || definition.property);
      input.value = String(preferences.get(name));
      const message = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
      message.id = `${row.id}-validation`;
      message.setAttribute("role", "alert");
      message.hidden = true;
      row.appendChild(message);
      input.setAttribute("aria-describedby", [attributes.get("aria-describedby"), message.id].filter(Boolean).join(" "));
      records.set(input, {name, attributes, message, integer});
    }
  };
  const validate = (input, record) => {
    const valid = parseNumericSetting(record.name, input.value) !== null;
    const error = valid ? "" : record.integer
      ? "Enter a whole number from 0 to 2147483647 milliseconds. Your previous setting is unchanged."
      : (record.name === 'stickyRemovalDelaySeconds' || record.name === 'urlUnpinGraceSeconds')
        ? "Enter seconds from 0 to 2147483.647. Decimals are allowed. Your previous setting is unchanged."
        : "Enter a number greater than 0. Your previous setting is unchanged.";
    input.setCustomValidity(error);
    if (valid) input.removeAttribute("aria-invalid");
    else input.setAttribute("aria-invalid", "true");
    record.message.textContent = error;
    record.message.hidden = valid;
    return valid;
  };
  const onChange = event => {
    const record = records.get(event.target);
    if (!record) return;
    if (!validate(event.target, record)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    event.target.value = String(Number(event.target.value));
  };
  const onKey = event => {
    const record = records.get(event.target);
    if (!record || (event.key !== "Enter" && event.key !== "Escape")) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      event.target.value = String(preferences.get(record.name));
      validate(event.target, record);
    } else event.target.dispatchEvent(new host.Event("change", {bubbles:true, cancelable:true}));
  };
  const onInput = event => {
    const record = records.get(event.target);
    if (record && event.target.hasAttribute("aria-invalid")) validate(event.target, record);
  };
  document.addEventListener("change", onChange, true);
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("input", onInput, true);
  const observer = new host.MutationObserver(refresh);
  observer.observe(document.documentElement, {childList:true, subtree:true});
  refresh();
  return () => {
    observer.disconnect();
    menuSizing.remove();
    document.removeEventListener("change", onChange, true);
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("input", onInput, true);
    for (const [input, record] of records) release(input, record);
  };
}

// Sine owns the saved string fields. Enhance only our eight rows, and send a
// validated change through Sine's existing handler instead of keeping a store.
export function installPaletteSettingsUi(host, preferences) {
  const document = host.document;
  const records = new Map();
  const namespace = 'http://www.w3.org/1999/xhtml';
  const sheet = document.createElementNS(namespace, 'style');
  sheet.textContent = `
    [id^="better-zen-folders-palette-"],
    .sineItemPreferenceDialogContent hbox[id^="better-zen-folders-palette-"]:not(.sineItemPreferenceCheckbox) {
      justify-content: flex-start; flex-wrap: wrap; gap: .5em;
    }
    .sineItemPreferenceDialogContent hbox[id^="better-zen-folders-palette-"] > .sineItemPreferenceLabel {
      margin-inline: 0; flex: 0 0 auto;
    }
    [id^="better-zen-folders-palette-"] > input:not([type="color"]) {
      inline-size: 8em; min-inline-size: 7em; flex: 0 1 8em;
    }
    .better-zen-folders-palette-preview {
      inline-size: 36px; block-size: 36px; min-inline-size: 36px;
      padding: 2px; cursor: pointer; flex: 0 0 36px;
    }
    .better-zen-folders-palette-reset { min-inline-size: 24px; min-block-size: 36px; flex: 0 0 auto; }
    .better-zen-folders-palette-reset[hidden] { display: none; }
    .better-zen-folders-palette-preview:focus-visible,
    .better-zen-folders-palette-reset:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    .better-zen-folders-palette-error { flex-basis: 100%; white-space: normal; }
  `;
  document.documentElement.appendChild(sheet);
  const validate = (input, record) => {
    const color = normalizeFolderColor(input.value.trim());
    const error = color ? '' : 'Enter # followed by six hexadecimal digits (for example, #51c67c). Your previous colour is unchanged.';
    input.setCustomValidity(error);
    if (color) {
      input.removeAttribute('aria-invalid');
      record.picker.style.backgroundColor=color;
      record.picker.setAttribute('data-colour',color);
    }
    else input.setAttribute('aria-invalid', 'true');
    const isDefault = (color ?? preferences.get(record.name)) === record.defaultColor;
    if (isDefault && document.activeElement === record.reset) input.focus();
    record.reset.hidden = isDefault;
    record.message.textContent = error;
    record.message.hidden = Boolean(color);
    return color;
  };
  const release = (input, record) => {
    record.generation++;record.unsubscribe?.();record.picker.remove();record.reset.remove();record.message.remove();
    input.setCustomValidity('');
    for (const [name,value] of record.attributes) {
      if (value === null) input.removeAttribute(name); else input.setAttribute(name,value);
    }
    records.delete(input);
  };
  const refresh = () => {
    for (const [input,record] of records) if (!input.isConnected) release(input,record);
    for (let i=1;i<=8;i++) {
      const name = `palette${i}`;
      const row = document.getElementById?.(`better-zen-folders-palette-${i}`);
      const input = row?.querySelector('input:not([type="color"])');
      if (!input || records.has(input)) continue;
      const attributes = new Map(['aria-label','aria-describedby','aria-invalid','spellcheck','placeholder'].map(k=>[k,input.getAttribute(k)]));
      input.setAttribute('aria-label', `Swatch ${i} hex colour`);
      input.setAttribute('spellcheck','false');input.setAttribute('placeholder','#51c67c');
      const picker = document.createElementNS(namespace,'button');
      picker.type='button';picker.className='better-zen-folders-palette-preview';
      picker.setAttribute('aria-label',`Choose Swatch ${i} colour`);
      picker.title=`Choose Swatch ${i} colour`;
      const color=normalizeFolderColor(input.value.trim()) ?? preferences.get(name);
      picker.style.backgroundColor=color;picker.setAttribute('data-colour',color);
      const defaultColor=PREFERENCE_DEFINITIONS[name].defaultValue;
      const reset=document.createElementNS(namespace,'button');
      reset.type='button';reset.className='better-zen-folders-palette-reset';
      reset.textContent='Reset';reset.setAttribute('aria-label',`Reset Swatch ${i} to default`);
      reset.title=`Reset Swatch ${i} to ${defaultColor}`;reset.hidden=color===defaultColor;
      const message=document.createElementNS(namespace,'span');
      message.id=`${row.id}-validation`;message.className='better-zen-folders-palette-error';
      message.setAttribute('role','alert');message.hidden=true;
      input.setAttribute('aria-describedby',[attributes.get('aria-describedby'),message.id].filter(Boolean).join(' '));
      input.after(picker,reset);row.appendChild(message);
      const record={name,picker,reset,defaultColor,message,attributes,generation:0};records.set(input,record);
      reset.addEventListener('click',()=>{
        if(records.get(input)!==record || !input.isConnected)return;
        // Retire the native dialog before dispatching the one Sine-owned write.
        record.generation++;
        input.value=defaultColor;
        input.dispatchEvent(new host.Event('change',{bubbles:true,cancelable:true}));
      });
      picker.addEventListener('click',()=>{
        const initial=normalizeFolderColor(input.value.trim()) ?? preferences.get(name);
        const generation=++record.generation;
        const commit=value=>{
          if(records.get(input)!==record || !input.isConnected || generation!==record.generation)return;
          record.generation++;
          const selected=normalizeFolderColor(value);
          if(!selected || selected===initial)return;
          input.value=selected;input.dispatchEvent(new host.Event('change',{bubbles:true,cancelable:true}));
        };
        const classes=host.Cc ?? host.Components?.classes;
        const interfaces=host.Ci ?? host.Components?.interfaces;
        const context=host.browsingContext ?? host.docShell?.browsingContext;
        // Do not use HTML input[type=color]: Windows can emit a sampled change
        // on Cancel. As in Folder Colour, accept only native completion.
        try {
          const factory=classes?.['@mozilla.org/colorpicker;1'];
          if(factory && interfaces?.nsIColorPicker && context){
            const native=factory.createInstance(interfaces.nsIColorPicker);
            native.init(context,`Swatch ${i}`,initial,[]);
            const callback={update(){},done:commit};
            if(host.ChromeUtils?.generateQI)callback.QueryInterface=host.ChromeUtils.generateQI(['nsIColorPickerShownCallback']);
            native.open(callback);return;
          }
        } catch { /* The labelled hex field remains available. */ }
        input.focus();input.select?.();
      });
      record.unsubscribe=preferences.subscribe?.(name, value=>{
        // External preference changes are authoritative, including reset.
        record.generation++;input.value=value;validate(input,record);
      });
    }
  };
  const onChange = event => {
    const record=records.get(event.target);if(!record)return;
    const color=validate(event.target,record);
    if (!color) { event.preventDefault();event.stopImmediatePropagation(); }
    else event.target.value=color;
  };
  const onInput=event=>{const record=records.get(event.target);if(record)validate(event.target,record);};
  const onKey=event=>{
    const record=records.get(event.target);
    if(!record || !['Enter','Escape'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    if(event.key==='Escape'){event.target.value=preferences.get(record.name);validate(event.target,record);}
    else event.target.dispatchEvent(new host.Event('change',{bubbles:true,cancelable:true}));
  };
  document.addEventListener('change',onChange,true);
  document.addEventListener('input',onInput,true);
  document.addEventListener('keydown',onKey,true);
  const observer=new host.MutationObserver(refresh);
  observer.observe(document.documentElement,{childList:true,subtree:true});refresh();
  return ()=>{
    observer.disconnect();sheet.remove();
    document.removeEventListener('change',onChange,true);
    document.removeEventListener('input',onInput,true);
    document.removeEventListener('keydown',onKey,true);
    for(const [input,record] of records)release(input,record);
  };
}

export class FolderColorManager {
  constructor(adapters, preferences = null) {
    this.adapters = adapters;
    this.preferences = preferences;
    this.entries = new Map();
    this.bindings = new Map();
    this.paletteSubscriptions = [];
    this.projectedFolders = new Set();
    this.projectedColors = new Map();
    this.observer = null;
    this.signal = null;
    this.started = false;
    this.destroyed = false;
    this.warnedInvalidLedger = false;
    this.handlingLedgerChange = false;
    this.pendingLedgerChange = false;
    this.boundDestroy = this.destroy.bind(this);
    this.boundLedgerChanged = this.onLedgerChanged.bind(this);
  }

  start(signal) {
    if (this.started || this.destroyed || signal?.aborted) return;
    this.started = true;
    this.signal = signal ?? null;
    this.load();
    this.loadBindings();
    this.reconcileAll();
    this.adapters.addLedgerObserver?.(this.boundLedgerChanged);
    for (const name of ['customPaletteEnabled', ...Array.from({length:8}, (_, i) => `palette${i+1}`)]) {
      const unsubscribe = this.preferences?.subscribe?.(name, () => this.onPaletteChanged());
      if (unsubscribe) this.paletteSubscriptions.push(unsubscribe);
    }
    const tabContainer = this.adapters.tabContainer?.();
    if (tabContainer) {
      this.observer = this.adapters.createMutationObserver?.(() => this.reconcileAll()) ?? null;
      this.observer?.observe?.(tabContainer, {
        attributes: true,
        attributeFilter: ["id"],
        childList: true,
        subtree: true,
      });
    }
    this.signal?.addEventListener?.("abort", this.boundDestroy, { once: true });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.started = false;
    this.observer?.disconnect?.();
    this.observer = null;
    this.signal?.removeEventListener?.("abort", this.boundDestroy);
    this.adapters.removeLedgerObserver?.(this.boundLedgerChanged);
    for (const unsubscribe of this.paletteSubscriptions.splice(0)) unsubscribe();
    this.signal = null;
    const folders = new Set([
      ...this.projectedFolders,
      ...(this.adapters.listFolders?.() ?? []),
    ]);
    for (const folder of folders) this.clearProjection(folder);
    this.projectedFolders.clear();
  }

  getColor(folderOrId) {
    const id = this.folderId(folderOrId);
    const entry = id === null ? null : this.entries.get(id);
    if (!entry) return null;
    const index = this.getPresetIndex(id);
    return index === null ? entry.color : folderColorSwatches(this.preferences)[index - 1][1];
  }

  getPresetIndex(folderOrId) {
    const id = this.folderId(folderOrId), entry = this.entries.get(id), binding = this.bindings.get(id);
    return entry && binding?.color === entry.color && binding.updatedAt === entry.updatedAt
      ? binding.swatch : null;
  }

  setPresetColor(folder, index) {
    if (!Number.isInteger(index) || index < 1 || index > 8
      || typeof this.adapters.writeBindings !== 'function') return false;
    return this.setColor(folder, folderColorSwatches(this.preferences)[index - 1][1], index);
  }

  setColor(folder, value, preset = null) {
    const id = this.folderId(folder);
    const color = normalizeFolderColor(value);
    if (id === null || color === null || (preset !== null
      && (!Number.isInteger(preset) || preset < 1 || preset > 8))) return false;
    if (this.entries.get(id)?.color === color && this.getPresetIndex(id) === preset) return false;
    const previous = new Map(this.entries);
    const previousBindings = new Map(this.bindings);
    const updatedAt = Math.max(this.timestamp(), (this.entries.get(id)?.updatedAt ?? -1) + 1);
    if (!Number.isSafeInteger(updatedAt)) return false;
    this.entries.delete(id);
    this.entries.set(id, {color, updatedAt});
    this.bindings.delete(id);
    if (preset !== null) this.bindings.set(id, {swatch:preset, color, updatedAt});
    this.trim();
    if (!this.persistOrRollback(previous, previousBindings)) return false;
    const resolved = this.getColor(id);
    this.project(folder, resolved);
    this.adapters.dispatchColorChanged?.(folder, resolved);
    return true;
  }

  clearColor(folder) {
    const id = this.folderId(folder);
    if (id === null || !this.entries.has(id)) return false;
    const previous = new Map(this.entries);
    const previousBindings = new Map(this.bindings);
    this.entries.delete(id);
    this.bindings.delete(id);
    if (!this.persistOrRollback(previous, previousBindings)) return false;
    this.clearProjection(folder);
    this.adapters.dispatchColorChanged?.(folder, null);
    return true;
  }

  captureLedgerState(folder) {
    const id = this.folderId(folder);
    const entry = id === null ? null : this.entries.get(id) ?? null;
    const binding = this.getPresetIndex(id) === null ? null : this.bindings.get(id);
    return entry
      ? Object.freeze({ exists: true, color: entry.color, updatedAt: entry.updatedAt,
        ...(binding ? {binding:Object.freeze({...binding})} : {}) })
      : Object.freeze({ exists: false });
  }

  restoreLedgerState(folder, state) {
    const id = this.folderId(folder);
    if (id === null || !isPlainObject(state) || typeof state.exists !== "boolean") return false;
    const previous = new Map(this.entries);
    const previousBindings = new Map(this.bindings);
    if (state.exists) {
      const color = normalizeFolderColor(state.color);
      if (color === null || !Number.isSafeInteger(state.updatedAt) || state.updatedAt < 0) {
        return false;
      }
      if (state.binding !== undefined && (!this.validBinding(state.binding)
        || state.binding.color !== color || state.binding.updatedAt !== state.updatedAt)) return false;
      this.entries.delete(id);
      this.entries.set(id, { color, updatedAt: state.updatedAt });
      this.bindings.delete(id);
      if (state.binding) this.bindings.set(id, {...state.binding});
      this.trim();
    } else {
      this.entries.delete(id);
      this.bindings.delete(id);
    }
    if (!this.persistOrRollback(previous, previousBindings)) return false;
    const color = this.getColor(id);
    if (color === null) this.clearProjection(folder);
    else this.project(folder, color);
    this.adapters.dispatchColorChanged?.(folder, color);
    return true;
  }

  reconcileAll() {
    if (this.destroyed) return;
    const current = new Set();
    for (const folder of this.adapters.listFolders?.() ?? []) {
      if (this.adapters.isFolder?.(folder) !== true) continue;
      current.add(folder);
      const color = this.getColor(folder);
      if (color === null) this.clearProjection(folder);
      else this.project(folder, color);
    }
    for (const folder of [...this.projectedFolders]) {
      if (!current.has(folder)) this.clearProjection(folder);
    }
  }

  onLedgerChanged() {
    if (this.destroyed) return;
    if (this.handlingLedgerChange) { this.pendingLedgerChange = true; return; }
    this.handlingLedgerChange = true;
    try {
      do {
        this.pendingLedgerChange = false;
        const previous = new Map([...this.entries.keys()].map(id =>
          [id, [this.getColor(id), this.getPresetIndex(id)]]));
        this.load();
        this.loadBindings();
        this.reconcileAll();
        for (const folder of this.adapters.listFolders?.() ?? []) {
          if (this.adapters.isFolder?.(folder) !== true) continue;
          const id = this.folderId(folder);
          if (id === null) continue;
          const [beforeColor, beforePreset] = previous.get(id) ?? [null, null];
          const after = this.getColor(id);
          if (beforeColor !== after || beforePreset !== this.getPresetIndex(id)) {
            this.adapters.dispatchColorChanged?.(folder, after);
          }
        }
      } while (this.pendingLedgerChange && !this.destroyed);
    } finally {
      this.handlingLedgerChange = false;
    }
  }

  onPaletteChanged() {
    if (this.destroyed) return;
    const previous = new Map(this.projectedColors);
    this.reconcileAll();
    for (const [folder, color] of this.projectedColors) {
      if (previous.get(folder) !== color) this.adapters.dispatchColorChanged?.(folder, color);
    }
  }

  validBinding(value) {
    return isPlainObject(value) && hasOnlyFields(value, ['swatch','color','updatedAt'])
      && Number.isInteger(value.swatch) && value.swatch >= 1 && value.swatch <= 8
      && normalizeFolderColor(value.color) === value.color
      && Number.isSafeInteger(value.updatedAt) && value.updatedAt >= 0;
  }

  loadBindings() {
    this.bindings = new Map();
    try {
      const raw = this.adapters.readBindings?.() ?? '';
      if (!raw) return;
      const value = JSON.parse(raw);
      if (!isPlainObject(value) || !hasOnlyFields(value,['version','entries']) || value.version !== 1
        || !Array.isArray(value.entries) || value.entries.length > MAX_FOLDER_COLOR_ENTRIES) throw Error('invalid preset associations');
      for (const record of value.entries) {
        if (!isPlainObject(record) || !isNonEmptyString(record.id) || this.bindings.has(record.id)) throw Error('invalid preset identity');
        const {id,...binding} = record;
        if (!this.validBinding(binding)) throw Error('invalid preset association');
        this.bindings.set(id,binding);
      }
    } catch {
      this.bindings.clear();
      if (!this.warnedInvalidBindings) {
        this.warnedInvalidBindings = true;
        this.adapters.warn?.('Better Zen Folders: ignored invalid preset associations; saved folder colours are unchanged');
      }
    }
  }

  load() {
    let raw = "";
    try {
      raw = this.adapters.readLedger?.() ?? "";
      if (raw === "") {
        this.entries.clear();
        return;
      }
      const parsed = JSON.parse(raw);
      if (!isPlainObject(parsed)
        || !hasOnlyFields(parsed, ["version", "entries"])
        || parsed.version !== FOLDER_COLOR_RECORD_VERSION
        || !Array.isArray(parsed.entries)
        || parsed.entries.length > MAX_FOLDER_COLOR_ENTRIES) {
        throw new TypeError("invalid folder colour ledger");
      }
      const entries = new Map();
      for (const entry of parsed.entries) {
        if (!isPlainObject(entry)
          || !hasOnlyFields(entry, ["id", "color", "updatedAt"])
          || !isNonEmptyString(entry.id)
          || entries.has(entry.id)
          || normalizeFolderColor(entry.color) !== entry.color
          || !Number.isSafeInteger(entry.updatedAt)
          || entry.updatedAt < 0) {
          throw new TypeError("invalid folder colour ledger entry");
        }
        entries.set(entry.id, { color: entry.color, updatedAt: entry.updatedAt });
      }
      this.entries = entries;
    } catch {
      this.entries.clear();
      try {
        this.persist();
      } catch (error) {
        this.adapters.warn?.(`Better Zen Folders: unable to repair folder colour data: ${error}`);
      }
      if (!this.warnedInvalidLedger) {
        this.warnedInvalidLedger = true;
        this.adapters.warn?.("Better Zen Folders: reset invalid folder colour data");
      }
    }
  }

  folderId(folderOrId) {
    const value = typeof folderOrId === "string"
      ? folderOrId
      : this.adapters.getFolderId?.(folderOrId);
    return isNonEmptyString(value) ? value : null;
  }

  timestamp() {
    const value = this.adapters.now?.() ?? Date.now();
    return Number.isSafeInteger(value) && value >= 0 ? value : Date.now();
  }

  trim() {
    while (this.entries.size > MAX_FOLDER_COLOR_ENTRIES) {
      this.entries.delete(this.entries.keys().next().value);
    }
    for (const id of this.bindings.keys()) if (!this.entries.has(id)) this.bindings.delete(id);
  }

  persistOrRollback(previous, previousBindings = new Map(this.bindings)) {
    const bindingChanged = JSON.stringify([...previousBindings]) !== JSON.stringify([...this.bindings]);
    const wasHandling = this.handlingLedgerChange;
    this.handlingLedgerChange = true;
    const ledgerNext = JSON.stringify({version:FOLDER_COLOR_RECORD_VERSION,
      entries:[...this.entries].map(([id,entry])=>({id,...entry}))});
    const bindingsNext = JSON.stringify({version:1,
      entries:[...this.bindings].map(([id,binding])=>({id,...binding}))});
    let ledgerBefore, bindingsBefore, ledgerAttempted = false, bindingsAttempted = false;
    try {
      ledgerBefore = this.adapters.readLedger?.() ?? '';
      if (bindingChanged) bindingsBefore = this.adapters.readBindings?.() ?? '';
      ledgerAttempted = true;
      this.adapters.writeLedger?.(ledgerNext);
      // A synchronous preference observer may save another folder while this
      // write is notifying. Do not publish stale association snapshots over it.
      if (this.adapters.readLedger && this.adapters.readLedger() !== ledgerNext) {
        throw Error('folder colours changed during the save');
      }
      if (bindingChanged) {
        if (this.adapters.readBindings() !== bindingsBefore) throw Error('preset associations changed during the save');
        bindingsAttempted = true;
        this.adapters.writeBindings(bindingsNext);
      }
      if ((this.adapters.readLedger && this.adapters.readLedger() !== ledgerNext)
        || (bindingChanged && this.adapters.readBindings() !== bindingsNext)) {
        throw Error('folder colours changed during the save');
      }
      return true;
    } catch (error) {
      this.entries = previous;
      this.bindings = previousBindings;
      let uncertain = false;
      // Compensate only bytes still owned by this attempted save. Another
      // window's successful intervening write must never be rolled back.
      if (ledgerAttempted) {
        try {
          const current = this.adapters.readLedger?.();
          if (current === ledgerNext) this.adapters.writeLedger(ledgerBefore);
          else if (current !== ledgerBefore) uncertain = true;
        }
        catch { uncertain = true; this.adapters.warn?.('Better Zen Folders: unable to roll back a partial colour save'); }
      }
      if (bindingsAttempted) {
        try {
          const current = this.adapters.readBindings();
          if (current === bindingsNext) this.adapters.writeBindings(bindingsBefore);
          else if (current !== bindingsBefore) uncertain = true;
        } catch { uncertain = true; this.adapters.warn?.('Better Zen Folders: unable to roll back a partial preset association'); }
      }
      if (uncertain) this.pendingLedgerChange = true;
      this.adapters.warn?.(`Better Zen Folders: unable to save folder colour: ${error}`);
      return false;
    } finally {
      this.handlingLedgerChange = wasHandling;
      if (!wasHandling && this.pendingLedgerChange) this.onLedgerChanged();
    }
  }

  persist() {
    this.adapters.writeLedger?.(JSON.stringify({
      version: FOLDER_COLOR_RECORD_VERSION,
      entries: [...this.entries].map(([id, entry]) => ({ id, ...entry })),
    }));
  }

  project(folder, color) {
    if (!folder || this.adapters.isFolder?.(folder) !== true) return;
    this.adapters.projectColor?.(folder, color);
    this.projectedFolders.add(folder);
    this.projectedColors.set(folder, color);
  }

  clearProjection(folder) {
    if (!folder) return;
    this.adapters.clearProjectedColor?.(folder);
    this.projectedFolders.delete(folder);
    this.projectedColors.delete(folder);
  }
}

export class FolderColorMenuManager {
  constructor(adapters, colorManager) {
    this.adapters = adapters;
    this.colorManager = colorManager;
    this.menu = null;
    this.menuItem = null;
    this.contextFolder = null;
    this.unsubscribeIconPreference = null;
    this.signal = null;
    this.started = false;
    this.destroyed = false;
    this.boundPopupShowing = this.onPopupShowing.bind(this);
    this.boundPopupHidden = this.onPopupHidden.bind(this);
    this.boundCommand = this.onCommand.bind(this);
    this.boundDestroy = this.destroy.bind(this);
  }

  start(signal) {
    if (this.started || this.destroyed || signal?.aborted) return;
    this.menu = this.adapters.menuTarget?.() ?? null;
    this.menuItem = this.adapters.ensureMenuItem?.() ?? null;
    if (!this.menu || !this.menuItem) return;
    this.started = true;
    this.signal = signal ?? null;
    this.adapters.setMenuItemIconMode?.(this.menuItem,
      this.adapters.preferences?.get?.("commandIconMode") ?? "mod");
    this.unsubscribeIconPreference = this.adapters.preferences?.subscribe?.(
      "commandIconMode",
      mode => this.adapters.setMenuItemIconMode?.(this.menuItem, mode),
    ) ?? null;
    this.menu.addEventListener?.("popupshowing", this.boundPopupShowing);
    this.menu.addEventListener?.("popuphidden", this.boundPopupHidden);
    this.menu.addEventListener?.("command", this.boundCommand);
    this.signal?.addEventListener?.("abort", this.boundDestroy, { once: true });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.started = false;
    this.menu?.removeEventListener?.("popupshowing", this.boundPopupShowing);
    this.menu?.removeEventListener?.("popuphidden", this.boundPopupHidden);
    this.menu?.removeEventListener?.("command", this.boundCommand);
    this.signal?.removeEventListener?.("abort", this.boundDestroy);
    this.signal = null;
    this.contextFolder = null;
    this.unsubscribeIconPreference?.();
    this.unsubscribeIconPreference = null;
    this.adapters.removeOwnedUi?.(this.menuItem);
    this.menuItem = null;
    this.menu = null;
  }

  onPopupShowing(event) {
    if (!this.started || event?.target && event.target !== this.menu) return;
    const folder = this.adapters.getContextFolder?.(event) ?? null;
    this.contextFolder = folder?.isZenFolder === true ? folder : null;
    this.adapters.setMenuItemState?.(this.menuItem, {
      folder: this.contextFolder,
      color: this.contextFolder ? this.colorManager.getColor(this.contextFolder) : null,
    });
  }

  onPopupHidden(event) {
    if (event?.target && event.target !== this.menu) return;
    this.contextFolder = null;
  }

  onCommand(event) {
    if (!this.started || event?.target !== this.menuItem || !this.contextFolder) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    const folder = this.contextFolder;
    const color = this.colorManager.getColor(folder);
    this.adapters.openPicker?.(folder, color, {
      read: () => this.colorManager.getColor(folder),
      readPreset: () => this.colorManager.getPresetIndex(folder),
      applyPreset: index => this.colorManager.setPresetColor(folder, index),
      apply: value => {
        const normalized = normalizeFolderColor(value);
        return normalized === null ? false : this.colorManager.setColor(folder, normalized);
      },
      reset: () => this.colorManager.clearColor(folder),
    });
  }
}

export class MoveToFolderMenuDecorator {
  constructor(adapters, colorManager) {
    this.adapters = adapters;
    this.colorManager = colorManager;
    this.menu = null;
    this.decoratedItems = new Set();
    this.unsubscribe = null;
    this.signal = null;
    this.enabled = true;
    this.started = false;
    this.destroyed = false;
    this.boundPopupShowing = this.onPopupShowing.bind(this);
    this.boundPopupHidden = this.clearAll.bind(this);
    this.boundDestroy = this.destroy.bind(this);
  }

  start(signal) {
    if (this.started || this.destroyed || signal?.aborted) return;
    this.menu = this.adapters.menuTarget?.() ?? null;
    if (!this.menu) return;
    this.started = true;
    this.signal = signal ?? null;
    this.enabled = this.adapters.preferences?.get?.("decorateMoveToFolderMenu") ?? true;
    this.unsubscribe = this.adapters.preferences?.subscribe?.(
      "decorateMoveToFolderMenu",
      enabled => {
        this.enabled = enabled === true;
        if (!this.enabled) this.clearAll();
      },
    ) ?? null;
    this.menu.addEventListener?.("popupshowing", this.boundPopupShowing);
    this.menu.addEventListener?.("popuphidden", this.boundPopupHidden);
    this.signal?.addEventListener?.("abort", this.boundDestroy, { once: true });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.started = false;
    this.menu?.removeEventListener?.("popupshowing", this.boundPopupShowing);
    this.menu?.removeEventListener?.("popuphidden", this.boundPopupHidden);
    this.signal?.removeEventListener?.("abort", this.boundDestroy);
    this.signal = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.clearAll();
    this.menu = null;
  }

  onPopupShowing() {
    this.clearAll();
    if (!this.started) return;
    for (const item of this.adapters.listNativeItems?.() ?? []) {
      const folder = this.adapters.getItemFolder?.(item) ?? null;
      if (folder?.isZenFolder !== true) continue;
      if (!this.enabled) {
        this.adapters.showPlainItem?.(item);
        this.decoratedItems.add(item);
        continue;
      }
      const customColor = this.colorManager?.getColor?.(folder) ?? null;
      const color = this.adapters.getFolderDisplayColor?.(folder, customColor) ?? customColor;
      try {
        this.adapters.decorateItem?.(item, folder, color);
        this.decoratedItems.add(item);
      } catch (error) {
        try { this.adapters.reportError?.(error); } catch {}
      }
    }
  }

  clearAll() {
    for (const item of this.decoratedItems) {
      try { this.adapters.clearItem?.(item); } catch {}
    }
    this.decoratedItems.clear();
  }
}

export class FolderIconIntegrityManager {
  constructor(adapters) {
    this.adapters = adapters;
    this.eventTarget = null;
    this.observer = null;
    this.signal = null;
    this.started = false;
    this.destroyed = false;
    this.pendingFolderCreateRepairs = new WeakSet();
    this.boundReconcileAll = this.reconcileAll.bind(this);
    this.boundFolderEvent = this.onFolderEvent.bind(this);
    this.boundDestroy = this.destroy.bind(this);
  }

  start(signal) {
    if (this.started || this.destroyed || signal?.aborted) return;
    this.started = true;
    this.signal = signal ?? null;
    this.eventTarget = this.adapters.eventTarget?.() ?? null;
    this.eventTarget?.addEventListener?.("TabGroupCreate", this.boundFolderEvent, true);
    const tabContainer = this.adapters.tabContainer?.() ?? null;
    if (tabContainer) {
      this.observer = this.adapters.createMutationObserver?.(this.boundReconcileAll) ?? null;
      this.observer?.observe?.(tabContainer, { childList: true, subtree: true });
    }
    this.reconcileAll();
    this.signal?.addEventListener?.("abort", this.boundDestroy, { once: true });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.started = false;
    this.eventTarget?.removeEventListener?.("TabGroupCreate", this.boundFolderEvent, true);
    this.observer?.disconnect?.();
    this.observer = null;
    this.eventTarget = null;
    this.signal?.removeEventListener?.("abort", this.boundDestroy);
    this.signal = null;
  }

  onFolderEvent(event) {
    const folder = event?.target;
    if (
      this.destroyed
      || this.adapters.isFolder?.(folder) !== true
      || this.pendingFolderCreateRepairs.has(folder)
    ) return;
    this.pendingFolderCreateRepairs.add(folder);
    const reconcileAfterNativeSetup = () => {
      this.pendingFolderCreateRepairs.delete(folder);
      if (!this.destroyed) this.reconcileFolder(folder);
    };
    try {
      const schedule = this.adapters.scheduleAfterFolderCreate;
      if (typeof schedule === "function") schedule(reconcileAfterNativeSetup);
      else Promise.resolve().then(reconcileAfterNativeSetup);
    } catch (error) {
      this.pendingFolderCreateRepairs.delete(folder);
      try { this.adapters.reportError?.(error); } catch {}
    }
  }

  reconcileAll() {
    if (!this.started || this.destroyed) return;
    for (const folder of this.adapters.listFolders?.() ?? []) this.reconcileFolder(folder);
  }

  reconcileFolder(folder) {
    if (this.destroyed || this.adapters.isFolder?.(folder) !== true) return false;
    if (this.adapters.hasNativeIcon?.(folder) === true) return false;
    try {
      return this.adapters.repairNativeIcon?.(folder) === true;
    } catch (error) {
      try { this.adapters.reportError?.(error); } catch {}
      return false;
    }
  }
}

export class SubfolderCreationManager {
  constructor(adapters) {
    this.adapters = adapters;
    this.menu = null;
    this.contextFolder = null;
    this.unsubscribe = null;
    this.signal = null;
    this.position = "bottom";
    this.started = false;
    this.destroyed = false;
    this.boundPopupShowing = this.onPopupShowing.bind(this);
    this.boundPopupHidden = this.onPopupHidden.bind(this);
    this.boundCommand = this.onCommand.bind(this);
    this.boundDestroy = this.destroy.bind(this);
  }

  start(signal) {
    if (this.started || this.destroyed || signal?.aborted) return;
    this.menu = this.adapters.menuTarget?.() ?? null;
    if (!this.menu) return;
    this.started = true;
    this.signal = signal ?? null;
    this.position = this.adapters.preferences?.get?.("subfolderPosition") === "top"
      ? "top"
      : "bottom";
    this.unsubscribe = this.adapters.preferences?.subscribe?.(
      "subfolderPosition",
      position => { this.position = position === "top" ? "top" : "bottom"; },
    ) ?? null;
    this.menu.addEventListener?.("popupshowing", this.boundPopupShowing);
    this.menu.addEventListener?.("popuphidden", this.boundPopupHidden);
    this.menu.addEventListener?.("command", this.boundCommand, { capture: true });
    this.signal?.addEventListener?.("abort", this.boundDestroy, { once: true });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.started = false;
    this.menu?.removeEventListener?.("popupshowing", this.boundPopupShowing);
    this.menu?.removeEventListener?.("popuphidden", this.boundPopupHidden);
    this.menu?.removeEventListener?.("command", this.boundCommand, { capture: true });
    this.signal?.removeEventListener?.("abort", this.boundDestroy);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.contextFolder = null;
    this.signal = null;
    this.menu = null;
  }

  onPopupShowing(event) {
    if (!this.started || event?.target && event.target !== this.menu) return;
    const folder = this.adapters.getContextFolder?.(event) ?? null;
    this.contextFolder = folder?.isZenFolder === true ? folder : null;
  }

  onPopupHidden(event) {
    if (event?.target && event.target !== this.menu) return;
    this.contextFolder = null;
  }

  onCommand(event) {
    if (
      !this.started
      || !this.contextFolder
      || this.adapters.isCreateCommand?.(event) !== true
    ) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    const parent = this.contextFolder;
    try {
      this.adapters.createSubfolder?.(parent, this.position);
    } catch (error) {
      try { this.adapters.reportError?.(error); } catch {}
    }
  }
}

export class FolderDoubleClickRenameManager {
  constructor(adapters) {
    this.adapters = adapters;
    this.eventTarget = null;
    this.renameEventTarget = null;
    this.pendingClick = null;
    this.unsubscribe = null;
    this.unsubscribeDelay = null;
    this.clickDelayMs = FOLDER_DOUBLE_CLICK_DELAY_MS;
    this.signal = null;
    this.enabled = true;
    this.started = false;
    this.destroyed = false;
    this.boundClick = this.onClick.bind(this);
    this.boundDoubleClick = this.onDoubleClick.bind(this);
    this.boundPointerDown = this.onPointerDown.bind(this);
    this.boundRenameExit = this.onRenameExit.bind(this);
    this.boundDestroy = this.destroy.bind(this);
  }

  start(signal) {
    if (this.started || this.destroyed || signal?.aborted) return;
    this.eventTarget = this.adapters.eventTarget?.() ?? null;
    if (!this.eventTarget) return;
    this.started = true;
    this.signal = signal ?? null;
    this.enabled = this.adapters.preferences?.get?.("doubleClickRename") ?? true;
    this.clickDelayMs = this.adapters.preferences?.get?.("folderTitleClickDelayMs") ?? FOLDER_DOUBLE_CLICK_DELAY_MS;
    this.unsubscribeDelay = this.adapters.preferences?.subscribe?.("folderTitleClickDelayMs", value => {
      this.commitPendingClick();
      this.clickDelayMs = value;
    }) ?? null;
    this.unsubscribe = this.adapters.preferences?.subscribe?.(
      "doubleClickRename",
      enabled => {
        if (this.enabled && enabled !== true) this.commitPendingClick();
        this.enabled = enabled === true;
      },
    ) ?? null;
    this.eventTarget.addEventListener?.("click", this.boundClick, { capture: true });
    this.eventTarget.addEventListener?.("dblclick", this.boundDoubleClick, { capture: true });
    this.renameEventTarget = this.adapters.renameEventTarget?.() ?? this.eventTarget;
    this.renameEventTarget.addEventListener?.("pointerdown", this.boundPointerDown, { capture: true });
    for (const type of ["keydown", "blur", "compositionstart", "compositionend"]) {
      this.renameEventTarget.addEventListener?.(type, this.boundRenameExit, { capture: true });
    }
    this.signal?.addEventListener?.("abort", this.boundDestroy, { once: true });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.started = false;
    this.eventTarget?.removeEventListener?.("click", this.boundClick, { capture: true });
    this.eventTarget?.removeEventListener?.("dblclick", this.boundDoubleClick, { capture: true });
    this.renameEventTarget?.removeEventListener?.("pointerdown", this.boundPointerDown, { capture: true });
    for (const type of ["keydown", "blur", "compositionstart", "compositionend"]) {
      this.renameEventTarget?.removeEventListener?.(type, this.boundRenameExit, { capture: true });
    }
    this.adapters.clearRenameState?.();
    this.renameEventTarget = null;
    this.signal?.removeEventListener?.("abort", this.boundDestroy);
    this.cancelPendingClick();
    this.signal = null;
    this.unsubscribeDelay?.();
    this.unsubscribeDelay = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.eventTarget = null;
  }

  blockNativeToggle(event) {
    event.preventDefault?.();
    event.stopPropagation?.();
  }

  onPointerDown(event) {
    if (!this.started) return;
    try {
      this.adapters.commitActiveRenameOnOutsidePointer?.(event);
    } catch (error) {
      try { this.adapters.reportError?.(error); } catch {}
    }
  }

  onRenameExit(event) {
    if (!this.started) return;
    try {
      this.adapters.handleRenameExit?.(event);
    } catch (error) {
      try { this.adapters.reportError?.(error); } catch {}
    }
  }

  onClick(event) {
    if (!this.started || !this.enabled || event?.button !== 0) return;
    const folder = this.adapters.getLabelFolder?.(event) ?? null;
    if (folder?.isZenFolder !== true) return;
    if (event.detail > 1) {
      if (this.pendingClick?.folder === folder) this.cancelPendingClick();
      this.blockNativeToggle(event);
      return;
    }
    if (event.detail !== 1) return;
    if (this.clickDelayMs === 0) return;
    if (this.pendingClick) this.commitPendingClick();
    this.blockNativeToggle(event);
    const pending = { folder, timer: null };
    this.pendingClick = pending;
    pending.timer = this.adapters.setTimeout?.(() => {
      if (this.pendingClick !== pending || this.destroyed) return;
      this.pendingClick = null;
      try {
        this.adapters.toggleFolder?.(folder);
      } catch (error) {
        try { this.adapters.reportError?.(error); } catch {}
      }
    }, this.clickDelayMs) ?? null;
    if (pending.timer === null) this.commitPendingClick();
  }

  cancelPendingClick() {
    const pending = this.pendingClick;
    this.pendingClick = null;
    if (pending?.timer !== null && pending?.timer !== undefined) {
      this.adapters.clearTimeout?.(pending.timer);
    }
  }

  commitPendingClick() {
    const pending = this.pendingClick;
    if (!pending) return;
    this.cancelPendingClick();
    try {
      this.adapters.toggleFolder?.(pending.folder);
    } catch (error) {
      try { this.adapters.reportError?.(error); } catch {}
    }
  }

  onDoubleClick(event) {
    if (!this.started || !this.enabled || event?.button !== 0) return;
    const folder = this.adapters.getLabelFolder?.(event) ?? null;
    if (folder?.isZenFolder !== true) return;
    if (this.pendingClick?.folder === folder) this.cancelPendingClick();
    else if (this.pendingClick) this.commitPendingClick();
    this.blockNativeToggle(event);
    try {
      this.adapters.renameFolder?.(folder);
    } catch (error) {
      try { this.adapters.reportError?.(error); } catch {}
    }
  }
}

const RECORD_VERSION = 1;
const FOLDER_FIELDS = [
  "id", "parentId", "slot", "previousId", "nextId", "workspaceId", "name", "iconUrl",
  "collapsed", "saved", "type", "color", "live", "dismissed", "sticky",
];
const PLACEMENT_FIELDS = ["folderId", "slot", "previousId", "nextId"];
const LIVE_FIELDS = ["providerType", "serializedState"];
const SERIALIZED_LIVE_FIELDS = ["state"];
const COMMON_LIVE_STATE_FIELDS = ["interval", "lastFetched", "options", "lastErrorId"];
const RSS_LIVE_STATE_FIELDS = [...COMMON_LIVE_STATE_FIELDS, "url", "maxItems", "timeRange"];
const GITHUB_LIVE_STATE_FIELDS = [
  ...COMMON_LIVE_STATE_FIELDS, "type", "url", "repos", "isJsonApi",
];
const GITHUB_OPTION_FIELDS = [
  "authorMe", "assignedMe", "reviewRequested", "includeDrafts", "repoExcludes",
];
const RSS_ITEM_LIMITS = new Set([5, 10, 25, 50]);
const RSS_TIME_RANGES = new Set([
  0,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
]);
const PRESENTATION_FIELDS = ["label", "iconUrl", "muted"];
const LIVE_TAB_FIELDS = ["itemId", "label"];
const SPLIT_FIELDS = ["id", "itemSlot"];
const RECORD_FIELDS = ["version", "placement", "folders", "presentation", "liveTab", "split", "urlPin", "sticky"];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function ownDataDescriptors(value) {
  const entries = Reflect.ownKeys(value).map(key => ({
    key,
    descriptor: Object.getOwnPropertyDescriptor(value, key),
  }));
  return entries.some(({ key, descriptor }) =>
    typeof key !== "string" || !descriptor || !("value" in descriptor)
  ) ? null : entries;
}

function isArrayIndex(key, length) {
  if (key === "" || !/^(?:0|[1-9]\d*)$/.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
}

function isSafeData(value, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  const entries = ownDataDescriptors(value);
  if (!entries) return false;
  if (Array.isArray(value)) {
    const lengthDescriptor = entries.find(entry => entry.key === "length")?.descriptor;
    const length = lengthDescriptor?.value;
    if (!lengthDescriptor || lengthDescriptor.enumerable || !Number.isSafeInteger(length) || length < 0) {
      return false;
    }
    const indices = entries.filter(entry => entry.key !== "length");
    if (indices.length !== length || indices.some(({ key, descriptor }) =>
      !descriptor.enumerable || !isArrayIndex(key, length)
    )) return false;
    return indices.every(({ descriptor }) => isSafeData(descriptor.value, seen));
  }
  if (!isPlainObject(value) || entries.some(({ descriptor }) => !descriptor.enumerable)) return false;
  return entries.every(({ descriptor }) => isSafeData(descriptor.value, seen));
}

function hasOnlyFields(value, allowed) {
  return Object.keys(value).every(key => allowed.includes(key));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isNullableId(value) {
  return value === null || isNonEmptyString(value);
}

function isSlot(value) {
  return Number.isInteger(value) && value >= 0;
}

function deepFreezeClone(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(deepFreezeClone));
  if (isPlainObject(value)) {
    const clone = {};
    for (const [key, item] of Object.entries(value)) clone[key] = deepFreezeClone(item);
    return Object.freeze(clone);
  }
  return value;
}

function structurallyEqualData(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => structurallyEqualData(value, right[index]));
  }
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index]
      && structurallyEqualData(left[key], right[key]));
}

function structurallyEqualSerializedState(left, right) {
  if (left === right) return true;
  try {
    const leftData = JSON.parse(left);
    const rightData = JSON.parse(right);
    return isSafeData(leftData)
      && isSafeData(rightData)
      && structurallyEqualData(leftData, rightData);
  } catch {
    return false;
  }
}

function structurallyEqualLiveState(left, right) {
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  return LIVE_FIELDS.every(field => {
    const leftHasField = Object.hasOwn(left, field);
    const rightHasField = Object.hasOwn(right, field);
    if (leftHasField !== rightHasField) return false;
    if (!leftHasField) return true;
    return field === "serializedState"
      ? structurallyEqualSerializedState(left[field], right[field])
      : structurallyEqualData(left[field], right[field]);
  });
}

function structurallyEqualFolderSnapshot(left, right) {
  return FOLDER_FIELDS.every(field => {
    const leftHasField = Object.hasOwn(left, field);
    const rightHasField = Object.hasOwn(right, field);
    if (leftHasField !== rightHasField) return false;
    if (!leftHasField) return true;
    return field === "live"
      ? structurallyEqualLiveState(left[field], right[field])
      : structurallyEqualData(left[field], right[field]);
  });
}

function canonicalizeFolderSnapshotsById(entries) {
  const canonicalById = new Map();
  for (const { record } of entries) {
    for (const snapshot of record.folders) {
      const canonical = canonicalById.get(snapshot.id);
      if (canonical && !structurallyEqualFolderSnapshot(canonical, snapshot)) {
        throw new Error(`conflicting restored folder snapshots: ${snapshot.id}`);
      }
      if (!canonical) canonicalById.set(snapshot.id, snapshot);
    }
  }
  return canonicalById;
}

function serializedStateValidator(registered) {
  if (typeof registered === "function") return registered;
  if (registered === null || typeof registered !== "object") return null;
  const descriptor = Object.getOwnPropertyDescriptor(registered, "validateSerializedState");
  return descriptor && "value" in descriptor && typeof descriptor.value === "function"
    ? descriptor.value
    : null;
}

function providerValidator(providerValidators, providerType) {
  if (providerValidators instanceof Map) {
    return providerValidators.has(providerType)
      ? serializedStateValidator(providerValidators.get(providerType))
      : null;
  }
  if (providerValidators === null || typeof providerValidators !== "object") return null;
  const descriptor = Object.getOwnPropertyDescriptor(providerValidators, providerType);
  return descriptor && "value" in descriptor ? serializedStateValidator(descriptor.value) : null;
}

function isStructurallyValidLiveState(value) {
  if (!isPlainObject(value) || !hasOnlyFields(value, LIVE_FIELDS)) return false;
  if (!isNonEmptyString(value.providerType) || typeof value.serializedState !== "string") return false;
  return true;
}

function isValidLiveProvider(value, providerValidators) {
  const validate = providerValidator(providerValidators, value.providerType);
  if (typeof validate !== "function") return false;
  try {
    return validate(value.serializedState) === true;
  } catch {
    return false;
  }
}

function parseSerializedLiveData(value) {
  if (typeof value !== "string") return null;
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!isSafeData(parsed) || !isPlainObject(parsed) || !hasOnlyFields(parsed, SERIALIZED_LIVE_FIELDS)) {
    return null;
  }
  if (!isPlainObject(parsed.state)) return null;
  return parsed;
}

function hasRequiredFields(value, required) {
  return required.every(field => Object.hasOwn(value, field));
}

function isUniqueStringArray(value) {
  return Array.isArray(value) && new Set(value).size === value.length
    && value.every(isNonEmptyString);
}

function isValidHttpUrl(value) {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function hasValidCommonLiveState(state, allowedFields, allowedErrors) {
  if (!hasOnlyFields(state, allowedFields)
    || !hasRequiredFields(state, ["interval", "lastFetched", "options"])
    || !Number.isSafeInteger(state.interval) || state.interval <= 0
    || !Number.isSafeInteger(state.lastFetched) || state.lastFetched < 0
    || !isPlainObject(state.options)) return false;
  return !Object.hasOwn(state, "lastErrorId")
    || state.lastErrorId === null
    || allowedErrors.includes(state.lastErrorId);
}

function validateRssLiveData(serializedState) {
  const data = parseSerializedLiveData(serializedState);
  if (!data || !hasValidCommonLiveState(
    data.state,
    RSS_LIVE_STATE_FIELDS,
    ["zen-live-folder-failed-fetch"],
  )) return null;
  const { state } = data;
  if (!hasRequiredFields(state, ["url", "maxItems", "timeRange"])
    || !isValidHttpUrl(state.url)
    || !RSS_ITEM_LIMITS.has(state.maxItems)
    || !RSS_TIME_RANGES.has(state.timeRange)
    || Object.keys(state.options).length !== 0) return null;
  return data;
}

function validateGithubLiveData(serializedState) {
  const data = parseSerializedLiveData(serializedState);
  if (!data || !hasValidCommonLiveState(
    data.state,
    GITHUB_LIVE_STATE_FIELDS,
    [
      "zen-live-folder-failed-fetch",
      "zen-live-folder-github-no-filter",
      "zen-live-folder-github-no-auth",
    ],
  )) return null;
  const { state } = data;
  if (!hasRequiredFields(state, ["type", "url", "repos"])
    || (state.type !== "issues" && state.type !== "pull-requests")
    || state.url !== (state.type === "pull-requests"
      ? "https://github.com/pulls"
      : "https://github.com/issues/assigned")
    || !isUniqueStringArray(state.repos)
    || (Object.hasOwn(state, "isJsonApi") && typeof state.isJsonApi !== "boolean")
    || !hasOnlyFields(state.options, GITHUB_OPTION_FIELDS)
    || !hasRequiredFields(state.options, ["repoExcludes"])
    || !isUniqueStringArray(state.options.repoExcludes)) return null;
  return GITHUB_OPTION_FIELDS.filter(field => field !== "repoExcludes")
    .every(field => !Object.hasOwn(state.options, field) || typeof state.options[field] === "boolean")
    ? data
    : null;
}

function trustedBrowserLiveData(providerType, serializedState) {
  switch (providerType) {
    case "rss": return validateRssLiveData(serializedState);
    case "github": return validateGithubLiveData(serializedState);
    default: return null;
  }
}

function trustedBrowserProviderValidator(providerType) {
  if (providerType !== "rss" && providerType !== "github") return null;
  return serializedState => trustedBrowserLiveData(providerType, serializedState) !== null;
}

function isValidDismissedState(value, folderId) {
  if (typeof value === "boolean") return true;
  if (!Array.isArray(value) || new Set(value).size !== value.length) return false;
  const prefix = `${folderId}:`;
  return value.every(itemId => isNonEmptyString(itemId) && itemId.startsWith(prefix)
    && itemId.length > prefix.length);
}

function isValidPlacement(value) {
  return isPlainObject(value)
    && hasOnlyFields(value, PLACEMENT_FIELDS)
    && isNonEmptyString(value.folderId)
    && isSlot(value.slot)
    && isNullableId(value.previousId)
    && isNullableId(value.nextId);
}

function isValidPresentation(value) {
  return isPlainObject(value)
    && hasOnlyFields(value, PRESENTATION_FIELDS)
    && typeof value.label === "string"
    && (value.iconUrl === null || typeof value.iconUrl === "string")
    && typeof value.muted === "boolean";
}

function isValidLiveTabState(value, folderId) {
  const prefix = `${folderId}:`;
  return isPlainObject(value)
    && hasOnlyFields(value, LIVE_TAB_FIELDS)
    && isNonEmptyString(value.itemId)
    && value.itemId.startsWith(prefix)
    && value.itemId.length > prefix.length
    && (value.label === null || typeof value.label === "string");
}

function isValidSplit(value) {
  return isPlainObject(value)
    && hasOnlyFields(value, SPLIT_FIELDS)
    && isNonEmptyString(value.id)
    && isSlot(value.itemSlot);
}

export function isValidUrlPinRecovery(value) {
  if (!isPlainObject(value) || !hasOnlyFields(value, ["explicit", "baseline"])
      || typeof value.explicit !== "boolean") return false;
  if (!value.explicit) return value.baseline === null;
  const baseline = value.baseline;
  return isPlainObject(baseline) && hasOnlyFields(baseline, ["entry", "image"])
    && isPlainObject(baseline.entry) && hasOnlyFields(baseline.entry, ["url", "title"])
    && isNonEmptyString(baseline.entry.url)
    && (baseline.entry.title === undefined || typeof baseline.entry.title === "string")
    && (baseline.image === undefined || baseline.image === null || typeof baseline.image === "string");
}

function applyRestoredUrlPin(state, adapters) {
  if (state.record?.urlPin) {
    if (typeof adapters.applyUrlPinRecovery !== "function") throw new Error("URL pin recovery adapter unavailable");
    state.urlPinRollback = adapters.applyUrlPinRecovery(state.tab, state.record.urlPin);
    if (typeof state.urlPinRollback !== "function") throw new Error("URL pin recovery rollback unavailable");
  }
  if (typeof state.record?.sticky === 'boolean') {
    if (typeof adapters.applyStickyRecovery !== 'function') throw new Error('Sticky recovery adapter unavailable');
    state.stickyRollback = adapters.applyStickyRecovery(state.tab,state.record.sticky);
    if (typeof state.stickyRollback !== 'function') throw new Error('Sticky recovery rollback unavailable');
  }
}

function isStructurallyValidFolderSnapshot(value) {
  if (!isPlainObject(value) || !hasOnlyFields(value, FOLDER_FIELDS)) return false;
  if (!isNonEmptyString(value.id) || !isNullableId(value.parentId) || !isSlot(value.slot)) return false;
  if (!isNullableId(value.previousId) || !isNullableId(value.nextId)) return false;
  if (!isNonEmptyString(value.workspaceId) || typeof value.name !== "string") return false;
  if (value.iconUrl !== null && typeof value.iconUrl !== "string") return false;
  if ("color" in value && normalizeFolderColor(value.color) !== value.color) return false;
  if ("sticky" in value && typeof value.sticky !== "boolean") return false;
  if (typeof value.collapsed !== "boolean" || typeof value.saved !== "boolean") return false;
  if (value.type !== "regular" && value.type !== "live") return false;
  if (value.type === "regular") return !("live" in value) && !("dismissed" in value);
  if ("dismissed" in value && !isValidDismissedState(value.dismissed, value.id)) return false;
  return "live" in value && isStructurallyValidLiveState(value.live);
}

function parseRestoreRecord(raw) {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

/**
 * Validates only the versioned data owned by this mod and returns no mutable
 * reference to the supplied value. Provider validators are registered by the
 * caller, so unrecognised live-folder state never reaches restore code.
 */
function structurallyValidRestoreRecord(raw, maxDepth) {
  if (!isSlot(maxDepth) || maxDepth === 0) return null;
  const value = parseRestoreRecord(raw);
  if (!isSafeData(value) || !isPlainObject(value) || !hasOnlyFields(value, RECORD_FIELDS)) return null;
  if (value.version !== RECORD_VERSION || !isValidPlacement(value.placement)) return null;
  if (!Array.isArray(value.folders) || value.folders.length < 1 || value.folders.length > maxDepth) return null;
  if ("presentation" in value && !isValidPresentation(value.presentation)) return null;
  if ("split" in value && !isValidSplit(value.split)) return null;
  if ("urlPin" in value && !isValidUrlPinRecovery(value.urlPin)) return null;
  if ("sticky" in value && typeof value.sticky !== 'boolean') return null;
  if (!value.folders.every(isStructurallyValidFolderSnapshot)) return null;
  if (value.placement.folderId !== value.folders.at(-1).id) return null;
  if (!value.folders.every((folder, index) =>
    folder.parentId === (index === 0 ? null : value.folders[index - 1].id)
  )) return null;
  if (new Set(value.folders.map(folder => folder.id)).size !== value.folders.length) return null;
  const leaf = value.folders.at(-1);
  if (leaf.type === "live") {
    if (!("presentation" in value) || !isValidLiveTabState(value.liveTab, leaf.id)) return null;
  } else if ("presentation" in value || "liveTab" in value) {
    return null;
  }
  return value;
}

export function validateRestoreRecord(raw, {
  maxDepth = DEFAULT_MAX_FOLDER_DEPTH,
  providerValidators = {},
  deferProviderValidation = false,
} = {}) {
  const value = structurallyValidRestoreRecord(raw, maxDepth);
  if (!value) return null;
  if (!deferProviderValidation && !value.folders.filter(folder => folder.type === "live").every(folder =>
    isValidLiveProvider(folder.live, providerValidators)
  )) return null;
  return deepFreezeClone(value);
}

function isEmptyDirectItem(item) {
  return item?.zenEmptyTab === true
    || item?.hasAttribute?.("zen-empty-tab") === true
    || item?.getAttribute?.("zen-empty-tab") === "true";
}

/**
 * Chooses a direct visual insertion point. The ordinal is authoritative;
 * neighbour IDs are persisted for later diagnostics only.
 */
export function resolveDirectInsertion(items, placement) {
  if (!Array.isArray(items) || !isSlot(placement?.slot)) return null;
  const visible = items.filter(item => !isEmptyDirectItem(item));
  return visible[Math.min(placement.slot, visible.length)] ?? null;
}

function visibleDirectItems(items, adapters) {
  return items.filter(item => !(adapters.isEmptyTab?.(item) ?? isEmptyDirectItem(item)));
}

function directPlacement(item, container, adapters) {
  const directItem = adapters.getDirectItem?.(item) ?? item;
  const visible = visibleDirectItems(
    adapters.getDirectItems(container, directItem) ?? [],
    adapters,
  );
  const slot = visible.indexOf(directItem);
  if (slot < 0) throw new TypeError("restore item is not a direct visible item");
  return {
    slot,
    previousId: slot === 0 ? null : adapters.getStableId(visible[slot - 1]),
    nextId: slot === visible.length - 1 ? null : adapters.getStableId(visible[slot + 1]),
  };
}

function isRestorableFolderTab(tab, adapters) {
  if (adapters.isSupportedTab?.(tab) !== true) return false;
  if (adapters.isEssential?.(tab) === true || adapters.isEmptyTab?.(tab) === true) return false;
  const folder = adapters.getTabFolder?.(tab);
  if (!folder || adapters.isSupportedFolder?.(folder) !== true) return false;
  const directItem = adapters.getDirectItem?.(tab) ?? tab;
  return directItem === tab || adapters.isSupportedSplitWrapper?.(directItem) === true;
}

function isClosableFolderTab(tab, adapters) {
  if (adapters.isSupportedTab?.(tab) !== true) return false;
  if (adapters.isEssential?.(tab) === true || adapters.isEmptyTab?.(tab) === true) return false;
  return adapters.getTabFolder?.(tab)?.isZenFolder === true;
}

const OWNED_BUTTON_SELECTOR = '[data-better-zen-folders-owned="true"]';
const FOLDER_HEADER_CONTROL_SELECTORS = [
  OWNED_BUTTON_SELECTOR,
  ".tab-reset-button",
  ".tab-group-overflow-count-container",
];

function folderHeaderTargetIsControl(event) {
  const path = event.composedPath?.();
  const targets = Array.isArray(path) && path.length > 0 ? path : [event.target];
  return targets.some(target => FOLDER_HEADER_CONTROL_SELECTORS.some(selector =>
    target?.matches?.(selector)
  ));
}

function folderFromDirectHeaderTarget(event) {
  if (folderHeaderTargetIsControl(event)) return null;
  const row = event.target?.closest?.(".tab-group-label-container") ?? null;
  const folder = row?.parentElement ?? null;
  return folder?.isZenFolder === true && folder.labelElement?.parentElement === row
    ? folder
    : null;
}

function buildFolderSnapshot(folder, parent, adapters) {
  const data = adapters.getFolderData(folder);
  const placement = directPlacement(folder, parent, adapters);
  const color = adapters.getFolderColor?.(folder) ?? null;
  const snapshot = {
    id: data.id,
    parentId: parent ? adapters.getFolderData(parent).id : null,
    ...placement,
    workspaceId: data.workspaceId,
    name: data.name,
    iconUrl: data.iconUrl,
    collapsed: data.collapsed,
    saved: data.saved,
    type: data.type,
  };
  if (color !== null) snapshot.color = color;
  if (adapters.getFolderSticky?.(folder) === true) snapshot.sticky = true;
  if (data.type === "live") {
    const dismissed = adapters.getDismissed?.(folder);
    if (dismissed !== undefined) snapshot.dismissed = dismissed;
    snapshot.live = adapters.getLiveFolderState?.(folder);
  }
  return snapshot;
}

/**
 * Captures only serialisable restoration evidence. It has no browser-global
 * dependency; callers supply folder and provider adapters for their window.
 */
export function buildRestoreRecord(tab, adapters, {
  deferProviderValidation = false,
  folderSnapshots = null,
} = {}) {
  const leaf = adapters.getTabFolder?.(tab);
  if (!leaf) throw new TypeError("tab has no folder for restoration");
  const ancestors = adapters.getFolderAncestors?.(leaf) ?? [];
  const folders = [...ancestors].reverse().concat(leaf);
  const snapshots = folders.map((folder, index) => {
    const cached = folderSnapshots?.get(folder);
    if (cached) return cached;
    const snapshot = buildFolderSnapshot(folder, index === 0 ? null : folders[index - 1], adapters);
    folderSnapshots?.set(folder, snapshot);
    return snapshot;
  });
  const placement = {
    folderId: snapshots.at(-1).id,
    ...directPlacement(tab, leaf, adapters),
  };
  const record = { version: RECORD_VERSION, placement, folders: snapshots };
  const sticky = adapters.getTabSticky?.(tab);
  if (typeof sticky === 'boolean') record.sticky = sticky;
  const urlPin = adapters.getUrlPinRecovery?.(tab);
  if (urlPin !== undefined && urlPin !== null) record.urlPin = urlPin;
  if (snapshots.at(-1).type === "live") {
    const presentation = adapters.getTabPresentation?.(tab);
    if (presentation !== undefined && presentation !== null) record.presentation = presentation;
    const liveTab = adapters.getLiveTabState?.(tab);
    if (liveTab !== undefined && liveTab !== null) record.liveTab = liveTab;
  }
  const split = adapters.getSplit?.(tab);
  if (split !== undefined && split !== null) record.split = split;
  const validationOptions = {
    maxDepth: adapters.getMaxFolderDepth?.()
      ?? adapters.maxFolderDepth
      ?? DEFAULT_MAX_FOLDER_DEPTH,
    deferProviderValidation,
  };
  if (!deferProviderValidation) validationOptions.providerValidators = adapters.providerValidators;
  const validated = validateRestoreRecord(record, validationOptions);
  if (!validated) throw new TypeError("invalid restore record from adapters");
  return validated;
}

function nextAvailableFolderId(adapters) {
  const attempted = new Set();
  while (true) {
    const id = adapters.newFolderId();
    if (!isNonEmptyString(id) || attempted.has(id)) {
      throw new Error("unable to allocate a collision-safe Zen folder ID");
    }
    attempted.add(id);
    if (adapters.isIdFree(id) === true) return id;
  }
}

function createdFolderHasUserContent(folder, adapters) {
  const items = adapters.getDirectItems?.(folder, folder) ?? folder?.allItems ?? [];
  return Array.from(items).some(item =>
    !(adapters.isEmptyTab?.(item) ?? isEmptyDirectItem(item))
  );
}

async function rollbackCreatedFolders(created, adapters) {
  const failures = [];
  for (const folder of [...created].reverse()) {
    if (createdFolderHasUserContent(folder, adapters)) continue;
    try {
      if (typeof adapters.rollbackCreatedFolder === "function") {
        await adapters.rollbackCreatedFolder(folder);
      } else {
        await folder.delete();
      }
    } catch (cause) {
      failures.push(new Error(`failed to roll back created folder ${folder.id}`, { cause }));
    }
  }
  if (failures.length) {
    throw new AggregateError(
      failures,
      `failed to roll back ${failures.length} transaction-created folder(s)`,
    );
  }
}

function combineRestoreAndRollbackError(restoreError, rollbackError) {
  return new AggregateError(
    [restoreError, rollbackError],
    "Better Zen Folders restore failed and rollback was incomplete",
  );
}

const RESTORE_TAB_CANCELLED = Symbol("Better Zen Folders tab restore cancelled");

function throwIfRestoreTabCancelled(isCancelled) {
  if (isCancelled()) throw RESTORE_TAB_CANCELLED;
}

async function rollbackRestoredTabMutations(journal, adapters) {
  const failures = [];
  const tabStates = journal.tabStates ?? [journal];
  const attempt = async (label, callback) => {
    try {
      await callback();
    } catch (cause) {
      failures.push(new Error(`failed to roll back restored tab ${label}`, { cause }));
    }
  };

  for (const state of [...tabStates].reverse()) {
    if (!state.restoreValueWritten) continue;
    await attempt("metadata", () => adapters.sessionStore.setCustomTabValue(
      state.tab,
      RESTORE_KEY,
      state.originalRestoreValue,
    ));
  }
  if (journal.selectionChanged) {
    await attempt("selection", () => {
      if (typeof adapters.restoreSelectedTab !== "function") {
        throw new Error("selected-tab rollback adapter is unavailable");
      }
      adapters.restoreSelectedTab(journal.originalSelectedTab);
    });
  }
  for (const state of [...tabStates].reverse()) {
    if (!state.liveTabStateChanged) continue;
    await attempt("live identity before placement", () => {
      if (typeof adapters.restoreLiveTabState !== "function") {
        throw new Error("live-tab identity rollback adapter is unavailable");
      }
      adapters.restoreLiveTabState(state.tab, null);
    });
  }
  if (journal.directItemMoved) {
    await attempt("placement", () => {
      if (typeof adapters.restoreDirectItemPlacement !== "function") {
        throw new Error("direct-item placement rollback adapter is unavailable");
      }
      adapters.restoreDirectItemPlacement(journal.directItem, journal.originalPlacement);
      adapters.invalidateTabCaches();
    });
  }
  for (const state of [...tabStates].reverse()) {
    if (!state.liveTabStateChanged) continue;
    await attempt("live identity", () => {
      if (typeof adapters.restoreLiveTabState !== "function") {
        throw new Error("live-tab identity rollback adapter is unavailable");
      }
      adapters.restoreLiveTabState(state.tab, state.originalLiveTabState);
    });
  }
  for (const state of [...tabStates].reverse()) {
    if (!state.presentationChanged) continue;
    await attempt("presentation", () => {
      if (typeof adapters.restoreTabPresentation !== "function") {
        throw new Error("tab-presentation rollback adapter is unavailable");
      }
      adapters.restoreTabPresentation(state.tab, state.originalPresentation);
    });
  }
  for (const state of [...tabStates].reverse()) {
    if (!state.pinnedByTransaction) continue;
    await attempt("pin state", () => {
      if (typeof adapters.unpinTab !== "function") {
        throw new Error("tab-unpin rollback adapter is unavailable");
      }
      adapters.unpinTab(state.tab);
    });
  }
  for (const state of [...tabStates].reverse()) {
    if (state.stickyRollback) await attempt("Sticky state", state.stickyRollback);
    if (state.urlPinRollback) await attempt("URL pin intent and baseline", state.urlPinRollback);
  }

  if (failures.length) {
    throw new AggregateError(failures, "restored-tab rollback was incomplete");
  }
}

const FOLDER_PATH_CANCELLED = Symbol("Better Zen Folders path reconstruction cancelled");

function throwIfFolderPathCancelled(isCancelled) {
  if (isCancelled()) throw FOLDER_PATH_CANCELLED;
}

function releasePopulationHolds(releases) {
  for (const release of releases.splice(0)) release();
}

function requirePersistedZenFolderIds(ensuredPaths, adapters) {
  const storedFolders = adapters.collectPersistedZenFolders();
  if (!Array.isArray(storedFolders)) {
    throw new Error("Zen folder session-store collector returned malformed data");
  }
  const storedIds = new Set();
  for (const folder of storedFolders) {
    if (!isPlainObject(folder) || !isNonEmptyString(folder.id)) {
      throw new Error("Zen folder session-store collector returned malformed data");
    }
    storedIds.add(folder.id);
  }
  for (const ensured of ensuredPaths.values()) {
    for (const resolvedId of ensured.idMap.values()) {
      if (!storedIds.has(resolvedId)) {
        throw new Error(`Zen folder session-store collector omitted restored folder: ${resolvedId}`);
      }
    }
  }
}

function snapshotRestoreCollapseStates(record, ensured) {
  const folders = ensured?.folders;
  if (!Array.isArray(folders) || folders.length !== record.folders.length) {
    throw new Error("resolved Zen folder path is incomplete");
  }
  const created = new Set(ensured.created);
  return folders.map((folder, index) => ({
    folder,
    collapsed: created.has(folder)
      ? record.folders[index].collapsed
      : folder.collapsed === true,
  }));
}

function restoreCollapseStates(snapshots, adapters) {
  for (const { folder, collapsed } of snapshots) {
    if (adapters?.setFolderCollapsed) adapters.setFolderCollapsed(folder,collapsed);
    else folder.collapsed = collapsed;
  }
}

function captureOriginalLiveTabState(record, tab, adapters) {
  if (!record.liveTab) return null;
  const state = adapters.getLiveTabState?.(tab) ?? null;
  const separator = isNonEmptyString(state?.itemId) ? state.itemId.indexOf(":") : -1;
  if (separator <= 0) return null;
  const folderId = state.itemId.slice(0, separator);
  if (!isValidLiveTabState(state, folderId)) return null;
  return { itemId: state.itemId, label: state.label };
}

function clearLiveTabStateForNativeMovement(state, adapters) {
  if (!state.restoredLiveTabState) return;
  state.liveTabStateChanged = true;
  if (typeof adapters.restoreLiveTabState !== "function") {
    throw new Error("Zen live-tab identity restore adapter is unavailable");
  }
  adapters.restoreLiveTabState(state.tab, null);
}

function applyRestoredLiveTabState(state, adapters) {
  if (!state.restoredLiveTabState) return;
  state.liveTabStateChanged = true;
  if (typeof adapters.restoreLiveTabState !== "function") {
    throw new Error("Zen live-tab identity restore adapter is unavailable");
  }
  adapters.restoreLiveTabState(state.tab, state.restoredLiveTabState);
}

function resolvedLiveTabState(record, ensured) {
  if (!record.liveTab) return null;
  const recordedFolderId = record.folders.at(-1).id;
  const resolvedFolderId = ensured.idMap.get(recordedFolderId);
  if (!isNonEmptyString(resolvedFolderId)) {
    throw new Error(`resolved live-folder ID is unavailable: ${recordedFolderId}`);
  }
  const prefix = `${recordedFolderId}:`;
  if (!record.liveTab.itemId.startsWith(prefix)) {
    throw new Error("recorded live tab identity has an incompatible folder prefix");
  }
  return {
    itemId: `${resolvedFolderId}:${record.liveTab.itemId.slice(prefix.length)}`,
    label: record.liveTab.label,
  };
}

async function startRestoredLiveProviders(
  liveProviders,
  liveTabs,
  adapters,
  runOperation = operation => operation(),
) {
  const started = new Set();
  for (const entry of liveProviders) {
    if (started.has(entry.provider)) continue;
    started.add(entry.provider);
    if (typeof adapters.startRestoredLiveProvider !== "function") {
      throw new Error("Zen live-folder provider start adapter is unavailable");
    }
    const tabsState = liveTabs
      .filter(state => state.folder === entry.folder)
      .map(state => state.liveTab);
    await runOperation(() =>
      adapters.startRestoredLiveProvider(
        entry.folder,
        entry.provider,
        tabsState,
      )
    );
  }
}

/**
 * Resolves a recorded root-to-leaf path, recreating only missing Zen folders.
 * Existing folders are identity matches and are deliberately left untouched.
 */
export async function ensureFolderPath(record, adapters, {
  isCancelled = () => false,
  holdPopulation = null,
  resolvedFolders = new Map(),
} = {}) {
  const idMap = new Map();
  const created = [];
  const folders = [];
  const liveProviders = [];
  const populationReleases = [];
  let parent = null;
  let warnedWorkspaceFallback = false;

  if (isCancelled()) return { leaf: null, idMap, created, folders, liveProviders, populationReleases, cancelled: true };
  if (typeof adapters.findZenFolder !== "function") {
    const folders = adapters.resolveFolderPath?.(record.folders);
    if (isCancelled()) return { leaf: null, idMap, created, folders: [], liveProviders, populationReleases, cancelled: true };
    if (!folders?.length) return { leaf: null, idMap, created, folders: [], liveProviders, populationReleases };
    for (let index = 0; index < record.folders.length; index++) {
      idMap.set(record.folders[index].id, folders[index].id);
    }
    return { leaf: folders.at(-1), idMap, created, folders, liveProviders, populationReleases };
  }

  try {
    const path = record.folders.map(snapshot => ({
      snapshot,
      folder: resolvedFolders.get(snapshot.id) ?? adapters.findZenFolder(snapshot.id),
    }));
    for (const { snapshot, folder } of path) {
      if (folder || snapshot.type !== "live") continue;
      const valid = typeof adapters.validateMissingLiveFolder === "function"
        ? adapters.validateMissingLiveFolder(snapshot)
        : isValidLiveProvider(snapshot.live, adapters.providerValidators);
      if (valid !== true) {
        throw new Error(
          `registered Zen live-folder provider is unavailable or incompatible: ${snapshot.live.providerType}`,
        );
      }
    }

    for (const entry of path) {
      const { snapshot } = entry;
      let { folder } = entry;
      if (!folder) {
        const id = adapters.isIdFree(snapshot.id) === true
          ? snapshot.id
          : nextAvailableFolderId(adapters);
        const workspaceId = adapters.resolveWorkspace(snapshot.workspaceId);
        if (!isNonEmptyString(workspaceId)) {
          throw new Error(`unable to resolve workspace ${snapshot.workspaceId}`);
        }
        if (workspaceId !== snapshot.workspaceId && !warnedWorkspaceFallback) {
          throwIfFolderPathCancelled(isCancelled);
          warnedWorkspaceFallback = true;
          adapters.reportWarning?.(
            `Better Zen Folders: recorded workspace ${snapshot.workspaceId} is unavailable; using active workspace ${workspaceId}`,
          );
        }

        throwIfFolderPathCancelled(isCancelled);
        folder = adapters.createFolder([], {
          id,
          label: snapshot.name,
          collapsed: snapshot.collapsed,
          saveOnWindowClose: snapshot.saved,
          workspaceId,
          isLiveFolder: snapshot.type === "live",
        });
        if (!folder?.isZenFolder || !isNonEmptyString(folder.id)) {
          throw new Error("Zen folder creation returned an incompatible node");
        }
        created.push(folder);
        const releasePopulation = holdPopulation?.(folder);
        if (typeof releasePopulation === "function") populationReleases.push(releasePopulation);
        throwIfFolderPathCancelled(isCancelled);
        adapters.setFolderIcon(folder, snapshot.iconUrl);
        if (snapshot.sticky === true) {
          if (typeof adapters.setFolderSticky !== "function") {
            throw new Error("Better Zen Folders Sticky restore adapter is unavailable");
          }
          adapters.setFolderSticky(folder, true);
        }
        if (Object.hasOwn(snapshot, "color")) {
          if (typeof adapters.setFolderColor !== "function") {
            throw new Error("Better Zen Folders colour restore adapter is unavailable");
          }
          throwIfFolderPathCancelled(isCancelled);
          adapters.setFolderColor(folder, snapshot.color, snapshot.id);
        }
        throwIfFolderPathCancelled(isCancelled);
        adapters.placeFolder(folder, parent, snapshot);
        if (snapshot.type === "live") {
          throwIfFolderPathCancelled(isCancelled);
          const provider = await adapters.restoreLiveProvider(folder, snapshot);
          liveProviders.push({ folder, provider });
          throwIfFolderPathCancelled(isCancelled);
        }
      }
      throwIfFolderPathCancelled(isCancelled);
      idMap.set(snapshot.id, folder.id);
      folders.push(folder);
      parent = folder;
    }
    // Share identity across sibling paths only after this path succeeds. A
    // collided original ID must continue to resolve to its one replacement.
    record.folders.forEach((snapshot, index) => resolvedFolders.set(snapshot.id, folders[index]));
    return { leaf: parent, idMap, created, folders, liveProviders, populationReleases };
  } catch (error) {
    try {
      await rollbackCreatedFolders(created, adapters);
    } catch (rollbackError) {
      for (const release of populationReleases) release();
      if (error === FOLDER_PATH_CANCELLED) throw rollbackError;
      throw combineRestoreAndRollbackError(error, rollbackError);
    }
    for (const release of populationReleases) release();
    if (error === FOLDER_PATH_CANCELLED) {
      return {
        leaf: null,
        idMap,
        created: [],
        folders: [],
        liveProviders: [],
        populationReleases: [],
        cancelled: true,
      };
    }
    throw error;
  }
}

const RESTORE_METADATA_EVENTS = [
  "BetterZenFolderStickyChanged",
  "TabGrouped",
  "TabUngrouped",
  "TabMove",
  "FolderGrouped",
  "FolderUngrouped",
  "TabGroupUpdate",
  "TabGroupCollapse",
  "TabGroupExpand",
  "ZenFolderChangedWorkspace",
  "SSTabRestored",
  "command",
];
const RESTORE_METADATA_ATTRIBUTES = [
  "collapsed",
  "href",
  "id",
  "image",
  "label",
  "muted",
  "zen-live-folder-item-id",
  "zen-show-sublabel",
  "zen-workspace-id",
];
const RSS_PROMPT_CLOSE_EVENT = "DOMModalDialogClosed";

function isLiveFolderOptionCommand(event) {
  return event?.type === "command"
    && isNonEmptyString(event.target?.getAttribute?.("option-folder"));
}

function isRssFeedUrlOptionCommand(event) {
  return isLiveFolderOptionCommand(event)
    && event.target.getAttribute("option-key") === "feedURL";
}

export class RestoreMetadataSynchronizer {
  constructor(adapters, { isRestoreActive = () => false } = {}) {
    this.adapters = adapters;
    this.isRestoreActive = isRestoreActive;
    this.observer = null;
    this.started = false;
    this.destroyed = false;
    this.scheduled = false;
    this.cancelLiveOptionTask = null;
    this.rssPromptCloseArmed = false;
    this.deferredByRestore = false;
    this.generation = 0;
    this.boundSchedule = event => {
      this.schedule();
      if (!isLiveFolderOptionCommand(event)) return;
      this.scheduleLiveOptionTask();
      if (isRssFeedUrlOptionCommand(event)) this.rssPromptCloseArmed = true;
    };
    this.boundRssPromptClose = () => {
      if (this.destroyed || !this.rssPromptCloseArmed) return;
      this.rssPromptCloseArmed = false;
      this.scheduleLiveOptionTask();
    };
  }

  start(signal) {
    if (this.started || this.destroyed || signal?.aborted) return;
    this.started = true;
    const eventTarget = this.adapters.eventTarget?.();
    for (const type of RESTORE_METADATA_EVENTS) {
      eventTarget?.addEventListener(type, this.boundSchedule, { capture: true, signal });
    }
    eventTarget?.addEventListener(RSS_PROMPT_CLOSE_EVENT, this.boundRssPromptClose, {
      capture: true,
      signal,
    });
    const tabContainer = this.adapters.tabContainer?.();
    if (tabContainer) {
      this.observer = this.adapters.createMutationObserver?.(this.boundSchedule) ?? null;
      this.observer?.observe?.(tabContainer, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: RESTORE_METADATA_ATTRIBUTES,
      });
    }
    signal?.addEventListener?.("abort", () => this.destroy(), { once: true });
    this.schedule();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.started = false;
    this.generation++;
    this.scheduled = false;
    this.cancelLiveOptionTask?.();
    this.cancelLiveOptionTask = null;
    this.rssPromptCloseArmed = false;
    this.deferredByRestore = false;
    this.observer?.disconnect?.();
    this.observer = null;
  }

  schedule() {
    if (this.destroyed || this.scheduled) return;
    this.scheduled = true;
    const generation = this.generation;
    Promise.resolve().then(() => {
      this.scheduled = false;
      if (this.destroyed || generation !== this.generation) return;
      if (this.isRestoreActive()) {
        this.deferredByRestore = true;
        return;
      }
      this.synchronize();
    });
  }

  scheduleLiveOptionTask() {
    if (this.destroyed || this.cancelLiveOptionTask !== null) return;
    const generation = this.generation;
    const cancel = this.adapters.deferMetadataSynchronization?.(() => {
      this.cancelLiveOptionTask = null;
      if (this.destroyed || generation !== this.generation) return;
      if (this.isRestoreActive()) {
        this.deferredByRestore = true;
        return;
      }
      this.synchronize();
    });
    this.cancelLiveOptionTask = typeof cancel === "function" ? cancel : null;
  }

  resumeAfterRestore() {
    if (!this.deferredByRestore) return;
    this.deferredByRestore = false;
    this.schedule();
  }

  synchronize() {
    let tabs;
    try {
      tabs = this.adapters.listTabs?.() ?? [];
    } catch (error) {
      this.reportError(error);
      return;
    }
    // Only this synchronous pass shares snapshots; later edits and close events
    // always recapture them. Tab-specific ordering/presentation remains separate.
    const folderSnapshots = new Map();
    for (const tab of tabs) this.synchronizeTab(tab, folderSnapshots);
  }

  synchronizeTab(tab, folderSnapshots = null) {
    let current;
    try {
      current = this.adapters.sessionStore.getCustomTabValue(tab, RESTORE_KEY);
      if (!isRestorableFolderTab(tab, this.adapters)) {
        if (this.adapters.isSessionRestoreCandidate?.(tab) === true) return;
        if (current !== "") this.adapters.clearRestoreValue(tab);
        return;
      }
      const serialized = JSON.stringify(buildRestoreRecord(tab, this.adapters, { folderSnapshots }));
      if (serialized !== current) {
        this.adapters.sessionStore.setCustomTabValue(tab, RESTORE_KEY, serialized);
      }
    } catch (error) {
      try {
        if (current !== "" && current !== undefined) this.adapters.clearRestoreValue(tab);
      } catch (clearError) {
        this.reportError(combineRestoreAndRollbackError(error, clearError));
        return;
      }
      this.reportError(error);
    }
  }

  reportError(error) {
    try { this.adapters.reportError?.(error); } catch {}
  }
}

export class FolderRestoreManager {
  constructor(adapters) {
    this.adapters = adapters;
    this.queue = Promise.resolve();
    this.started = false;
    this.destroyed = false;
    this.generation = 0;
    this.handledEarlyRestores = new WeakSet();
    this.pendingNativeGroupRestores = new WeakMap();
    this.pendingNativeTabRestores = new WeakMap();
    this.pendingNativeGroupStates = new Set();
    this.activeRestoreTransactions = 0;
    this.metadataSynchronizer = typeof adapters.listTabs === "function"
      ? new RestoreMetadataSynchronizer(adapters, {
        isRestoreActive: () => this.activeRestoreTransactions > 0,
      })
      : null;
    this.boundCaptureClose = this.captureClose.bind(this);
    this.boundCaptureGroupClose = this.captureGroupClose.bind(this);
    this.boundCaptureNativeGroupCreate = this.captureNativeGroupCreate.bind(this);
    this.boundCaptureMiddleClick = this.captureMiddleClick.bind(this);
    this.boundCaptureCloseCommand = this.captureCloseCommand.bind(this);
    this.closeCommandTarget = null;
    this.boundRestoreTab = event => { void this.restoreTab(event); };
  }

  start(signal) {
    if (this.started || this.destroyed || signal?.aborted) return;
    this.started = true;
    const eventTarget = this.adapters.eventTarget?.();
    eventTarget?.addEventListener("TabClose", this.boundCaptureClose, {
      capture: true,
      signal,
    });
    eventTarget?.addEventListener(
      "TabGroupRemoveRequested",
      this.boundCaptureGroupClose,
      { capture: true, signal },
    );
    eventTarget?.addEventListener("TabGroupCreate", this.boundCaptureNativeGroupCreate, {
      capture: true,
      signal,
    });
    eventTarget?.addEventListener("click", this.boundCaptureMiddleClick, {
      capture: true,
      signal,
    });
    this.closeCommandTarget = eventTarget;
    eventTarget?.addEventListener("command", this.boundCaptureCloseCommand, {
      capture: true,
      signal,
    });
    eventTarget?.addEventListener("SSTabRestoring", this.boundRestoreTab, {
      capture: true,
      signal,
    });
    this.metadataSynchronizer?.start(signal);
    signal?.addEventListener?.("abort", () => this.destroy(), { once: true });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.started = false;
    this.generation++;
    this.closeCommandTarget?.removeEventListener?.("command", this.boundCaptureCloseCommand, true);
    this.closeCommandTarget = null;
    for (const state of [...this.pendingNativeGroupStates]) {
      if (state.transactionStarted) {
        state.requestCancellation();
        continue;
      }
      try {
        state.cancel?.();
      } catch (error) {
        this.reportError(error);
      }
      state.cancel = null;
      this.settlePendingNativeGroup(state, false);
    }
    this.clearDestroyedNativeGroupOwnership();
    this.metadataSynchronizer?.destroy();
  }

  async runRestoreTransaction(callback) {
    this.activeRestoreTransactions++;
    try {
      return await callback();
    } finally {
      this.activeRestoreTransactions--;
      if (this.activeRestoreTransactions === 0) {
        this.metadataSynchronizer?.resumeAfterRestore();
      }
    }
  }

  reportError(error) {
    try {
      this.adapters.reportError?.(error);
    } catch {
      // Error reporting must never interfere with Firefox's tab lifecycle.
    }
  }

  captureTabRecord(tab) {
    try {
      this.adapters.clearRestoreValue(tab);
      if (!isRestorableFolderTab(tab, this.adapters)) return false;
      const record = buildRestoreRecord(tab, this.adapters);
      this.adapters.sessionStore.setCustomTabValue(tab, RESTORE_KEY, JSON.stringify(record));
      return true;
    } catch (error) {
      this.reportError(error);
      return false;
    }
  }

  captureClose(event) {
    if (this.destroyed || event.detail?.adoptedBy || event.detail?.skipSessionStore) return false;
    return this.captureTabRecord(event.target);
  }

  captureGroupClose(event) {
    if (
      this.destroyed
      || event.detail?.skipSessionStore
      || event.target?.isZenFolder !== true
    ) return false;
    let captured = 0;
    for (const tab of this.adapters.getGroupTabsForClose?.(event.target) ?? []) {
      if (this.captureTabRecord(tab)) captured++;
    }
    return captured > 0;
  }

  nativeGroupRestoreBoundaryError() {
    for (const name of [
      "deferNativeGroupRestore",
      "isNativeRestoredGroup",
      "isSessionRestoreCandidate",
      "getNativeGroupTabs",
      "collectPersistedZenFolders",
      "releaseNativeGroupId",
      "armNativeGroupRemoval",
    ]) {
      if (typeof this.adapters[name] !== "function") {
        return new Error(`native group restore adapter is unavailable: ${name}`);
      }
    }
    return this.adapters.nativeGroupRestoreAvailabilityError?.() ?? null;
  }

  createNativeGroupRestoreGuard(group) {
    let resolve;
    let resolveCancellation;
    const cancellationPromise = new Promise(currentResolve => {
      resolveCancellation = currentResolve;
    });
    const state = {
      group,
      cancel: null,
      transactionStarted: false,
      cancellationRequested: false,
      cancellationPromise,
      requestCancellation: () => {
        if (state.cancellationRequested) return;
        state.cancellationRequested = true;
        resolveCancellation();
      },
      settled: false,
      result: null,
      associatedTabs: new Set(),
      promise: new Promise(currentResolve => { resolve = currentResolve; }),
      resolve: result => resolve(result),
    };
    this.pendingNativeGroupRestores.set(group, state);
    this.pendingNativeGroupStates.add(state);
    return state;
  }

  beginNativeGroupRestore(group, state) {
    if (state.settled || state.transactionStarted) return;
    state.transactionStarted = true;
    this.enqueueNativeGroupRestore(group, state).then(
      result => this.settlePendingNativeGroup(state, result),
      error => {
        this.reportError(error);
        this.settlePendingNativeGroup(state, false);
      },
    );
  }

  async runInterruptibleNativeGroupOperation(state, operation) {
    if (!state) return operation();
    if (state.cancellationRequested) throw RESTORE_TAB_CANCELLED;

    const pending = Promise.resolve(operation());
    const observed = pending.then(
      value => ({ status: "fulfilled", value }),
      error => ({ status: "rejected", error }),
    );
    const outcome = await Promise.race([
      observed,
      state.cancellationPromise.then(() => ({ status: "cancelled" })),
    ]);
    if (outcome.status === "cancelled") throw RESTORE_TAB_CANCELLED;
    if (outcome.status === "rejected") throw outcome.error;
    return outcome.value;
  }

  associateNativeGroupTabs(state, tabs) {
    if (!state || state.settled) return;
    for (const tab of tabs) {
      this.pendingNativeTabRestores.set(tab, state);
      state.associatedTabs.add(tab);
    }
  }

  clearNativeGroupTabAssociations(state) {
    for (const tab of state.associatedTabs) {
      if (this.pendingNativeTabRestores.get(tab) === state) {
        this.pendingNativeTabRestores.delete(tab);
      }
    }
    state.associatedTabs.clear();
  }

  clearDestroyedNativeGroupOwnership() {
    if (!this.destroyed || this.pendingNativeGroupStates.size !== 0) return;
    this.pendingNativeGroupRestores = new WeakMap();
    this.pendingNativeTabRestores = new WeakMap();
  }

  settlePendingNativeGroup(state, result) {
    if (state.settled) return;
    state.settled = true;
    state.result = result;
    this.pendingNativeGroupStates.delete(state);
    this.clearNativeGroupTabAssociations(state);
    if (
      (this.destroyed || state.group?.isConnected !== true)
      && this.pendingNativeGroupRestores.get(state.group) === state
    ) {
      this.pendingNativeGroupRestores.delete(state.group);
    }
    this.clearDestroyedNativeGroupOwnership();
    state.resolve(result);
  }

  captureNativeGroupCreate(event) {
    const group = event.target;
    if (
      this.destroyed
      || group?.isZenFolder === true
      || this.adapters.isExcludedNativeGroup?.(group) === true
    ) return false;
    const existing = this.pendingNativeGroupRestores.get(group);
    if (existing && group?.isConnected === true) {
      return existing.settled ? existing.result : true;
    }
    if (existing) this.pendingNativeGroupRestores.delete(group);

    const state = this.createNativeGroupRestoreGuard(group);
    const boundaryError = this.nativeGroupRestoreBoundaryError();
    if (boundaryError) {
      this.settlePendingNativeGroup(state, false);
      this.reportError(boundaryError);
      return false;
    }
    try {
      state.cancel = this.adapters.deferNativeGroupRestore(() => {
        state.cancel = null;
        if (state.settled) return;
        this.beginNativeGroupRestore(group, state);
      });
    } catch (error) {
      this.settlePendingNativeGroup(state, false);
      this.reportError(error);
      return false;
    }
    return true;
  }

  captureCloseCommand(event) {
    if (
      this.destroyed || event.defaultPrevented
      || this.adapters.isCloseTabCommand?.(event) !== true
      || typeof this.adapters.closeFolderTabs !== "function"
    ) return false;
    let tabs;
    try {
      tabs = [...new Set(this.adapters.getCloseCommandTabs?.() ?? [])];
      // Keep mixed selections entirely native: do not change the user's close
      // policy for ordinary pins or Essentials, or redirect after partial close.
      if (!tabs.length || tabs.some(tab => !tab || tab.closing || tab.isConnected === false
        || !isClosableFolderTab(tab, this.adapters))) return false;
    } catch (error) {
      this.reportError(error);
      return false;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      Promise.resolve(this.adapters.closeFolderTabs(tabs, event))
        .catch(error => this.reportError(error));
    } catch (error) {
      this.reportError(error);
    }
    return true;
  }

  captureMiddleClick(event) {
    if (this.destroyed || event.button !== 1) return false;
    const tab = event.target?.closest?.("tab") ?? null;
    if (tab) {
      if (
        !isClosableFolderTab(tab, this.adapters)
        || typeof this.adapters.closeFolderTab !== "function"
      ) return false;
      try {
        this.adapters.closeFolderTab(tab, event);
      } catch (error) {
        this.reportError(error);
        return false;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }

    if (this.adapters.preferences?.get?.("middleClickDelete") === false) return false;
    const folder = folderFromDirectHeaderTarget(event);
    if (!folder || typeof this.adapters.deleteFolderFromHeader !== "function") return false;
    try {
      const deletion = this.adapters.deleteFolderFromHeader(folder);
      event.preventDefault();
      event.stopImmediatePropagation();
      Promise.resolve(deletion).catch(error => this.reportError(error));
      return true;
    } catch (error) {
      this.reportError(error);
      return false;
    }
  }

  restoreTab(event) {
    const tab = event.target;
    if (this.adapters.isDuplicateTab?.(tab) === true) return Promise.resolve(false);
    const associatedNativeGroupGuard = this.pendingNativeTabRestores.get(tab);
    if (associatedNativeGroupGuard) return associatedNativeGroupGuard.promise;
    if (this.handledEarlyRestores.has(tab)) {
      this.handledEarlyRestores.delete(tab);
      return Promise.resolve(true);
    }
    if (this.destroyed) return Promise.resolve(false);
    const nativeGroup = this.adapters.getTabFolder?.(tab) ?? tab?.group ?? null;
    const nativeGroupGuard = this.pendingNativeGroupRestores.get(nativeGroup);
    if (nativeGroupGuard) {
      if (nativeGroup?.isConnected === true) return nativeGroupGuard.promise;
      this.pendingNativeGroupRestores.delete(nativeGroup);
    }
    let raw;
    let record;
    try {
      raw = this.adapters.sessionStore.getCustomTabValue(tab, RESTORE_KEY);
      const validationOptions = {
        maxDepth: this.adapters.getMaxFolderDepth?.() ?? DEFAULT_MAX_FOLDER_DEPTH,
        deferProviderValidation: true,
      };
      record = validateRestoreRecord(raw, validationOptions);
    } catch (error) {
      this.reportError(error);
      return Promise.resolve(false);
    }
    if (!record) return Promise.resolve(false);

    const generation = this.generation;
    const requestedSelection = this.adapters.isSelected?.(tab) === true;
    const transaction = this.queue.then(() => {
      if (this.destroyed || generation !== this.generation) return false;
      const isCancelled = () => this.destroyed || generation !== this.generation;
      return this.runRestoreTransaction(() =>
        this.restoreTransaction(tab, record, requestedSelection, isCancelled, raw)
      );
    }).catch(error => {
      this.reportError(error);
      return false;
    });
    this.queue = transaction.then(() => undefined);
    return transaction;
  }

  restoreNativeGroup(group, { retrySettledFailure = false } = {}) {
    if (this.destroyed) return Promise.resolve(false);
    const existing = this.pendingNativeGroupRestores.get(group);
    if (existing && group?.isConnected === true) {
      if (!existing.settled || existing.result !== false || !retrySettledFailure) {
        return existing.promise;
      }
    }
    if (existing) this.pendingNativeGroupRestores.delete(group);

    const state = this.createNativeGroupRestoreGuard(group);
    this.beginNativeGroupRestore(group, state);
    return state.promise;
  }

  enqueueNativeGroupRestore(group, state) {
    const generation = this.generation;
    const transaction = this.queue.then(() => {
      if (this.destroyed || generation !== this.generation) return false;
      const isCancelled = () => this.destroyed || generation !== this.generation;
      return this.runRestoreTransaction(() =>
        this.restoreNativeGroupTransaction(group, isCancelled, state)
      );
    }).catch(error => {
      this.reportError(error);
      return false;
    });
    this.queue = transaction.then(() => undefined);
    return transaction;
  }

  async restoreNativeGroupTransaction(
    group,
    isCancelled = () => this.destroyed,
    nativeGroupGuard = null,
  ) {
    let idTransaction = null;
    const created = [];
    const populationReleases = [];
    const handledTabs = [];
    const mutatedJournals = [];
    const collapseSnapshots = [];
    let nativeRemoval = null;
    let finalJournal = null;
    try {
      const boundaryError = this.nativeGroupRestoreBoundaryError();
      if (boundaryError) throw boundaryError;
      throwIfRestoreTabCancelled(isCancelled);
      if (
        group?.isZenFolder === true
        || this.adapters.isExcludedNativeGroup?.(group) === true
        || this.adapters.isNativeRestoredGroup(group) !== true
      ) return false;

      const tabs = this.adapters.getNativeGroupTabs(group);
      if (tabs.length === 0) return false;
      const validationOptions = {
        maxDepth: this.adapters.getMaxFolderDepth?.() ?? DEFAULT_MAX_FOLDER_DEPTH,
        deferProviderValidation: true,
      };
      const entries = [];
      for (const tab of tabs) {
        if (this.adapters.isSessionRestoreCandidate(tab) !== true) return false;
        const raw = this.adapters.sessionStore.getCustomTabValue(tab, RESTORE_KEY);
        const record = validateRestoreRecord(raw, validationOptions);
        if (!record) return false;
        entries.push({ tab, raw, record });
      }
      canonicalizeFolderSnapshotsById(entries);

      const originalGroupId = group.id;
      if (
        !isNonEmptyString(originalGroupId)
        || !entries.every(({ record }) =>
          record.folders.some(folder => folder.id === originalGroupId)
        )
      ) return false;

      this.associateNativeGroupTabs(nativeGroupGuard, tabs);

      throwIfRestoreTabCancelled(isCancelled);
      idTransaction = this.adapters.releaseNativeGroupId(group);
      if (
        typeof idTransaction?.commit !== "function"
        || typeof idTransaction?.rollback !== "function"
      ) throw new Error("native group ID release did not return a transaction");

      const paths = new Map();
      for (const entry of entries) {
        const pathKey = JSON.stringify(entry.record.folders.map(folder => folder.id));
        if (!paths.has(pathKey)) paths.set(pathKey, entry.record);
        entry.pathKey = pathKey;
      }
      const ensuredPaths = new Map();
      const resolvedFolders = new Map();
      for (const [pathKey, record] of paths) {
        throwIfRestoreTabCancelled(isCancelled);
        const ensured = await ensureFolderPath(record, this.adapters, {
          isCancelled,
          resolvedFolders,
          holdPopulation: folder => this.adapters.populationRegistry?.hold(folder),
        });
        if (ensured.cancelled || isCancelled()) throw RESTORE_TAB_CANCELLED;
        if (!ensured.leaf) throw new Error("unable to reconstruct native group folder path");
        created.push(...ensured.created);
        populationReleases.push(...ensured.populationReleases);
        collapseSnapshots.push(...snapshotRestoreCollapseStates(record, ensured));
        ensuredPaths.set(pathKey, ensured);
      }

      const journalByItem = new Map();
      for (const entry of entries) {
        throwIfRestoreTabCancelled(isCancelled);
        const directItem = this.adapters.getDirectItem?.(entry.tab, entry.record) ?? entry.tab;
        let journal = journalByItem.get(directItem);
        if (!journal) {
          journal = {
            directItem,
            leaf: ensuredPaths.get(entry.pathKey).leaf,
            pathKey: entry.pathKey,
            slot: entry.record.placement.slot,
            originalPlacement: this.adapters.captureDirectItemPlacement?.(directItem) ?? null,
            originalSelectedTab: null,
            directItemMoved: false,
            selectionChanged: false,
            tabStates: [],
          };
          journalByItem.set(directItem, journal);
        } else if (journal.pathKey !== entry.pathKey) {
          throw new Error("one restored direct item targets multiple folder paths");
        } else {
          journal.slot = Math.min(journal.slot, entry.record.placement.slot);
        }
        const requestedSelection = this.adapters.isSelected?.(entry.tab) === true;
        if (requestedSelection && journal.originalSelectedTab === null) {
          journal.originalSelectedTab = this.adapters.getSelectedTab?.() ?? null;
        }
        journal.tabStates.push({
          tab: entry.tab,
          record: entry.record,
          originalRestoreValue: entry.raw,
          originalPresentation: entry.record.presentation
            ? this.adapters.getTabPresentation?.(entry.tab)
            : null,
          originalLiveTabState: captureOriginalLiveTabState(
            entry.record,
            entry.tab,
            this.adapters,
          ),
          restoredLiveTabState: resolvedLiveTabState(
            entry.record,
            ensuredPaths.get(entry.pathKey),
          ),
          requestedSelection,
          pinnedByTransaction: false,
          presentationChanged: false,
          liveTabStateChanged: false,
          restoreValueWritten: false,
        });
      }

      const journals = [...journalByItem.values()].sort((left, right) => left.slot - right.slot);
      finalJournal = journals.at(-1);
      nativeRemoval = this.adapters.armNativeGroupRemoval(group);
      if (
        typeof nativeRemoval?.cancel !== "function"
        || !nativeRemoval.promise
        || typeof nativeRemoval.promise.then !== "function"
      ) throw new Error("native group removal listener is unavailable");

      for (const journal of journals) {
        throwIfRestoreTabCancelled(isCancelled);
        mutatedJournals.push(journal);
        for (const state of journal.tabStates) {
          if (this.adapters.isPinned?.(state.tab) === true) continue;
          state.pinnedByTransaction = true;
          this.adapters.pinTab(state.tab);
          throwIfRestoreTabCancelled(isCancelled);
        }
        for (const state of journal.tabStates) {
          clearLiveTabStateForNativeMovement(state, this.adapters);
          throwIfRestoreTabCancelled(isCancelled);
        }
        if (journal === finalJournal) continue;
        journal.directItemMoved = true;
        journal.leaf.addTabs([journal.directItem]);
        throwIfRestoreTabCancelled(isCancelled);
        const directItems = (this.adapters.getDirectItems(journal.leaf, journal.directItem) ?? [])
          .filter(item => item !== journal.directItem);
        const placement = journal.tabStates.reduce(
          (best, state) => state.record.placement.slot < best.slot
            ? state.record.placement
            : best,
          journal.tabStates[0].record.placement,
        );
        const target = resolveDirectInsertion(directItems, placement);
        this.adapters.insertDirectItem(journal.leaf, journal.directItem, target);
        throwIfRestoreTabCancelled(isCancelled);
        this.adapters.invalidateTabCaches();
      }
      releasePopulationHolds(populationReleases);
      restoreCollapseStates(collapseSnapshots,this.adapters);

      const restoredLiveTabs = [];
      for (const journal of journals) {
        for (const state of journal.tabStates) {
          if (!state.restoredLiveTabState) continue;
          applyRestoredLiveTabState(state, this.adapters);
          restoredLiveTabs.push({
            folder: journal.leaf,
            liveTab: state.restoredLiveTabState,
          });
          throwIfRestoreTabCancelled(isCancelled);
        }
      }
      const liveProviders = [...ensuredPaths.values()]
        .flatMap(ensured => ensured.liveProviders);
      await startRestoredLiveProviders(
        liveProviders,
        restoredLiveTabs,
        this.adapters,
        operation => this.runInterruptibleNativeGroupOperation(nativeGroupGuard, operation),
      );
      throwIfRestoreTabCancelled(isCancelled);

      for (const journal of journals) {
        if (journal === finalJournal) continue;
        for (const state of journal.tabStates) {
          throwIfRestoreTabCancelled(isCancelled);
          if (state.record.presentation) {
            state.presentationChanged = true;
            this.adapters.restoreTabPresentation?.(state.tab, state.record.presentation);
          }
          applyRestoredUrlPin(state, this.adapters);
          if (state.requestedSelection) {
            journal.selectionChanged = true;
            this.adapters.selectTab(state.tab);
          }
          const refreshed = buildRestoreRecord(state.tab, this.adapters, {
            deferProviderValidation: true,
          });
          state.restoreValueWritten = true;
          this.adapters.sessionStore.setCustomTabValue(
            state.tab,
            RESTORE_KEY,
            JSON.stringify(refreshed),
          );
          handledTabs.push(state.tab);
        }
      }

      throwIfRestoreTabCancelled(isCancelled);
      for (const state of finalJournal.tabStates) {
        clearLiveTabStateForNativeMovement(state, this.adapters);
      }
      finalJournal.directItemMoved = true;
      finalJournal.leaf.addTabs([finalJournal.directItem]);
      const finalDirectItems = (
        this.adapters.getDirectItems(finalJournal.leaf, finalJournal.directItem) ?? []
      ).filter(item => item !== finalJournal.directItem);
      const finalPlacement = finalJournal.tabStates.reduce(
        (best, state) => state.record.placement.slot < best.slot
          ? state.record.placement
          : best,
        finalJournal.tabStates[0].record.placement,
      );
      this.adapters.insertDirectItem(
        finalJournal.leaf,
        finalJournal.directItem,
        resolveDirectInsertion(finalDirectItems, finalPlacement),
      );
      this.adapters.invalidateTabCaches();
      restoreCollapseStates(collapseSnapshots,this.adapters);
      for (const state of finalJournal.tabStates) {
        applyRestoredLiveTabState(state, this.adapters);
        if (state.record.presentation) {
          state.presentationChanged = true;
          this.adapters.restoreTabPresentation?.(state.tab, state.record.presentation);
        }
        applyRestoredUrlPin(state, this.adapters);
        if (state.requestedSelection) {
          finalJournal.selectionChanged = true;
          this.adapters.selectTab(state.tab);
        }
        const refreshed = buildRestoreRecord(state.tab, this.adapters, {
          deferProviderValidation: true,
        });
        state.restoreValueWritten = true;
        this.adapters.sessionStore.setCustomTabValue(
          state.tab,
          RESTORE_KEY,
          JSON.stringify(refreshed),
        );
        handledTabs.push(state.tab);
      }

      requirePersistedZenFolderIds(ensuredPaths, this.adapters);

      await this.runInterruptibleNativeGroupOperation(
        nativeGroupGuard,
        () => nativeRemoval.promise,
      );
      idTransaction.commit();
      for (const tab of handledTabs) this.handledEarlyRestores.add(tab);
      return true;
    } catch (error) {
      const rollbackFailures = [];
      if (finalJournal?.directItemMoved && group?.tabs?.length === 0) {
        try {
          this.adapters.restoreDirectItemPlacement(finalJournal.directItem, finalJournal.originalPlacement);
          this.adapters.invalidateTabCaches();
          finalJournal.directItemMoved = false;
        } catch (rollbackError) {
          rollbackFailures.push(rollbackError);
        }
      }
      nativeRemoval?.cancel();
      for (const journal of [...mutatedJournals].reverse()) {
        try {
          await rollbackRestoredTabMutations(journal, this.adapters);
        } catch (rollbackError) {
          rollbackFailures.push(rollbackError);
        }
      }
      try {
        restoreCollapseStates(collapseSnapshots,this.adapters);
      } catch (rollbackError) {
        rollbackFailures.push(rollbackError);
      }
      try {
        await rollbackCreatedFolders(created, this.adapters);
      } catch (rollbackError) {
        rollbackFailures.push(rollbackError);
      }
      if (idTransaction) {
        try {
          idTransaction.rollback();
        } catch (rollbackError) {
          rollbackFailures.push(rollbackError);
        }
      }
      for (const tab of handledTabs) this.handledEarlyRestores.delete(tab);

      const rollbackError = rollbackFailures.length > 1
        ? new AggregateError(rollbackFailures, "Better Zen Folders batch rollback failures")
        : rollbackFailures[0];
      if (error === RESTORE_TAB_CANCELLED) {
        if (rollbackError) throw rollbackError;
        return false;
      }
      if (rollbackError) throw combineRestoreAndRollbackError(error, rollbackError);
      throw error;
    } finally {
      nativeRemoval?.cancel();
      releasePopulationHolds(populationReleases);
    }
  }

  async restoreTransaction(
    tab,
    record,
    requestedSelection,
    isCancelled = () => this.destroyed,
    originalRestoreValue = "",
  ) {
    let ensured = null;
    let journal = null;
    let collapseSnapshots = [];
    const populationReleases = [];
    try {
      ensured = await ensureFolderPath(record, this.adapters, {
        isCancelled,
        holdPopulation: folder => this.adapters.populationRegistry?.hold(folder),
      });
      populationReleases.push(...ensured.populationReleases);
      if (ensured.cancelled || isCancelled()) {
        const created = ensured.created;
        ensured = null;
        await rollbackCreatedFolders(created, this.adapters);
        return false;
      }
      const leaf = ensured.leaf;
      if (!leaf) return false;
      collapseSnapshots = snapshotRestoreCollapseStates(record, ensured);
      const directItem = this.adapters.getDirectItem?.(tab, record) ?? tab;
      throwIfRestoreTabCancelled(isCancelled);
      const wasPinned = this.adapters.isPinned?.(tab) === true;
      throwIfRestoreTabCancelled(isCancelled);
      const originalPlacement = this.adapters.captureDirectItemPlacement?.(directItem) ?? null;
      throwIfRestoreTabCancelled(isCancelled);
      const originalPresentation = record.presentation
        ? this.adapters.getTabPresentation?.(tab)
        : null;
      throwIfRestoreTabCancelled(isCancelled);
      const originalLiveTabState = captureOriginalLiveTabState(record, tab, this.adapters);
      throwIfRestoreTabCancelled(isCancelled);
      const originalSelectedTab = requestedSelection
        ? this.adapters.getSelectedTab?.()
        : null;
      throwIfRestoreTabCancelled(isCancelled);
      journal = {
        tab,
        record,
        directItem,
        originalRestoreValue,
        originalPlacement,
        originalPresentation,
        originalLiveTabState,
        restoredLiveTabState: resolvedLiveTabState(record, ensured),
        originalSelectedTab,
        pinnedByTransaction: false,
        directItemMoved: false,
        presentationChanged: false,
        liveTabStateChanged: false,
        selectionChanged: false,
        restoreValueWritten: false,
      };

      if (!wasPinned) {
        journal.pinnedByTransaction = true;
        this.adapters.pinTab(tab);
        throwIfRestoreTabCancelled(isCancelled);
      }
      clearLiveTabStateForNativeMovement(journal, this.adapters);
      throwIfRestoreTabCancelled(isCancelled);
      journal.directItemMoved = true;
      leaf.addTabs([directItem]);
      releasePopulationHolds(populationReleases);
      throwIfRestoreTabCancelled(isCancelled);
      const directItems = (this.adapters.getDirectItems(leaf, directItem) ?? [])
        .filter(item => item !== directItem);
      throwIfRestoreTabCancelled(isCancelled);
      const target = resolveDirectInsertion(directItems, record.placement);
      this.adapters.insertDirectItem(leaf, directItem, target);
      throwIfRestoreTabCancelled(isCancelled);
      restoreCollapseStates(collapseSnapshots,this.adapters);
      if (journal.restoredLiveTabState) {
        applyRestoredLiveTabState(journal, this.adapters);
        throwIfRestoreTabCancelled(isCancelled);
      }
      await startRestoredLiveProviders(
        ensured.liveProviders,
        journal.restoredLiveTabState
          ? [{ folder: leaf, liveTab: journal.restoredLiveTabState }]
          : [],
        this.adapters,
      );
      throwIfRestoreTabCancelled(isCancelled);
      if (record.presentation) {
        journal.presentationChanged = true;
        this.adapters.restoreTabPresentation?.(tab, record.presentation);
        throwIfRestoreTabCancelled(isCancelled);
      }
      applyRestoredUrlPin(journal, this.adapters);
      this.adapters.invalidateTabCaches();
      throwIfRestoreTabCancelled(isCancelled);
      if (requestedSelection) {
        journal.selectionChanged = true;
        this.adapters.selectTab(tab);
        throwIfRestoreTabCancelled(isCancelled);
      }

      const refreshed = buildRestoreRecord(tab, this.adapters, { deferProviderValidation: true });
      throwIfRestoreTabCancelled(isCancelled);
      journal.restoreValueWritten = true;
      this.adapters.sessionStore.setCustomTabValue(tab, RESTORE_KEY, JSON.stringify(refreshed));
      throwIfRestoreTabCancelled(isCancelled);
      return true;
    } catch (error) {
      const rollbackFailures = [];
      if (journal) {
        try {
          await rollbackRestoredTabMutations(journal, this.adapters);
        } catch (rollbackError) {
          rollbackFailures.push(rollbackError);
        }
      }
      try {
        restoreCollapseStates(collapseSnapshots,this.adapters);
      } catch (rollbackError) {
        rollbackFailures.push(rollbackError);
      }
      if (ensured) {
        try {
          await rollbackCreatedFolders(ensured.created, this.adapters);
        } catch (rollbackError) {
          rollbackFailures.push(rollbackError);
        }
      }
      const rollbackError = rollbackFailures.length > 1
        ? new AggregateError(rollbackFailures, "Better Zen Folders rollback failures")
        : rollbackFailures[0];
      if (error === RESTORE_TAB_CANCELLED) {
        if (rollbackError) throw rollbackError;
        return false;
      }
      if (rollbackError) throw combineRestoreAndRollbackError(error, rollbackError);
      throw error;
    } finally {
      releasePopulationHolds(populationReleases);
    }
  }
}

export class NativeRestoreArtifactReconciler {
  constructor(restoreManager, adapters) {
    this.restoreManager = restoreManager;
    this.adapters = adapters;
    this.started = false;
    this.destroyed = false;
    this.generation = 0;
    this.promise = null;
    this.activeRemoval = null;
  }

  start(signal) {
    if (this.started || this.destroyed || signal?.aborted) return;
    this.started = true;
    const generation = this.generation;
    this.promise = this.reconcile(generation).catch(error => {
      try { this.adapters.reportError?.(error); } catch {}
      return false;
    });
    signal?.addEventListener?.("abort", () => this.destroy(), { once: true });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.started = false;
    this.generation++;
    const activeRemoval = this.activeRemoval;
    this.activeRemoval = null;
    activeRemoval?.cancel();
  }

  async reconcile(generation) {
    await Promise.all([
      this.adapters.sessionRestoreReady?.() ?? Promise.resolve(),
      this.adapters.workspacesReady?.() ?? Promise.resolve(),
    ]);
    if (
      this.destroyed
      || generation !== this.generation
      || this.restoreManager?.destroyed
    ) return false;

    for (const group of this.adapters.listNativeGroups?.() ?? []) {
      if (
        this.destroyed
        || generation !== this.generation
        || this.restoreManager?.destroyed
      ) return false;
      if (
        group?.isConnected !== true
        || this.adapters.isNativeRestoredGroup?.(group) !== true
        || this.adapters.isExcludedNativeGroup?.(group) === true
      ) continue;

      try {
        const tabs = this.adapters.getNativeGroupTabs?.(group) ?? [];
        if (tabs.length !== 0) {
          await this.restoreManager.restoreNativeGroup(group, {
            retrySettledFailure: true,
          });
          continue;
        }
        const removal = this.adapters.armNativeGroupRemoval?.(group);
        if (
          typeof removal?.cancel !== "function"
          || !removal.promise
          || typeof removal.promise.then !== "function"
        ) throw new Error("native group removal listener is unavailable");
        this.activeRemoval = removal;
        try {
          this.adapters.requestNativeGroupEmptyReconciliation?.(group);
          await removal.promise;
          if (
            this.destroyed
            || generation !== this.generation
            || this.restoreManager?.destroyed
          ) return false;
        } finally {
          if (this.activeRemoval === removal) this.activeRemoval = null;
          removal.cancel();
        }
      } catch (error) {
        try { this.adapters.reportError?.(error); } catch {}
      }
    }
    return true;
  }
}

function snapshotCollapsedPath(folder, ancestors) {
  return [folder, ...ancestors].map(current => ({ current, collapsed: current.collapsed }));
}

function restoreCollapsedPath(snapshot) {
  for (const { current, collapsed } of snapshot) current.collapsed = collapsed;
}

export class NewTabInFolderTransaction {
  constructor(adapters) {
    this.adapters = adapters;
    this.activating = false;
    this.destroyed = false;
    this.handoff = null;
  }

  destroy() {
    this.destroyed = true;
    this.handoff?.cancel();
    this.handoff = null;
  }

  canActivate(folder) {
    return Boolean(
      isRegularFolder(folder)
      && folder.isConnected
      && this.adapters.isFolderInCurrentWindow(folder)
      && this.adapters.isFolderInActiveWorkspace(folder),
    );
  }

  async activate(folder) {
    if (this.destroyed || this.activating || !this.canActivate(folder)) return false;

    const newTabPosition = this.adapters.preferences?.get?.("newTabPosition") ?? "bottom";
    this.activating = true;
    const releasePopulation = this.adapters.populationRegistry?.hold(folder) ?? (() => {});
    let collapseSnapshot = [];
    let tab = null;
    try {
      collapseSnapshot = snapshotCollapsedPath(folder, this.adapters.getFolderAncestors(folder));
      this.handoff = this.adapters.armNextTabOpen();
      if (!this.adapters.handleNewTab(false, false, "tab", true, this.handoff.closeToken)) return false;
      this.handoff.afterOpen?.();

      tab = await this.handoff.promise;
      if (!tab) return false;
      if (this.destroyed) return false;
      if (!this.canActivate(folder)) throw new Error("folder context changed before tab grouping");

      const place = () => { this.adapters.pinTab(tab); folder.addTabs([tab]); };
      if (this.adapters.placeCreatedTab) this.adapters.placeCreatedTab(tab, this.handoff.origin ?? "move", place);
      else place();
      if (newTabPosition === "top") {
        const directItems = (this.adapters.getDirectItems?.(folder, tab) ?? [])
          .filter(item => item !== tab);
        const target = visibleDirectItems(directItems, this.adapters)[0] ?? null;
        this.adapters.insertDirectItem(folder, tab, target);
      }
      this.adapters.selectTab(tab);
      return true;
    } catch (error) {
      if (!tab) return false;
      if (this.adapters.isBlankNewTab(tab)) this.adapters.removeTab(tab);
      this.adapters.reportError(error);
      return false;
    } finally {
      if (tab) restoreCollapsedPath(collapseSnapshot);
      this.handoff?.cancel();
      this.handoff = null;
      this.activating = false;
      releasePopulation();
    }
  }
}

/** Both native folder unload controls call unloadAllTabs. Own that instance
 * method, not the prototype or global pin policy: native's implementation also
 * resets according to pin preferences and collapses the folder afterward. */
export class FolderUnloadManager {
  constructor(host) {
    this.host = host;
    this.owned = new Map();
    this.pending = new Map();
    this.pendingTabs = new Map();
    this.started = false;
    this.reconcile = this.reconcile.bind(this);
    this.destroy = this.destroy.bind(this);
  }

  start(signal) {
    if (this.started || signal?.aborted
        || typeof this.host.gBrowser?.explicitUnloadTabs !== "function") return;
    this.started = true;
    this.signal = signal;
    this.reconcile();
    const root = this.host.gBrowser.tabContainer;
    if (root && this.host.MutationObserver) {
      this.observer = new this.host.MutationObserver(this.reconcile);
      this.observer.observe(root, {childList: true, subtree: true});
    }
    root?.addEventListener?.("TabGroupUpdate", this.reconcile);
    signal?.addEventListener?.("abort", this.destroy, {once: true});
  }

  release(folder, entry) {
    if (folder.unloadAllTabs === entry.wrapper) {
      if (entry.descriptor) Object.defineProperty(folder, "unloadAllTabs", entry.descriptor);
      else delete folder.unloadAllTabs;
    }
    this.owned.delete(folder);
  }

  reconcile() {
    if (!this.started) return;
    const folders = new Set(this.host.document?.querySelectorAll?.("zen-folder") ?? []);
    for (const [folder, entry] of this.owned) {
      if (!folders.has(folder) || !isRegularFolder(folder) || folder.isConnected === false) {
        this.release(folder, entry);
      }
    }
    for (const folder of folders) {
      if (this.owned.has(folder) || !isRegularFolder(folder) || folder.isConnected === false
          || typeof folder.unloadAllTabs !== "function") continue;
      const descriptor = Object.getOwnPropertyDescriptor(folder, "unloadAllTabs");
      if (descriptor && !descriptor.configurable) continue;
      const original = folder.unloadAllTabs;
      const manager = this;
      const wrapper = function (...args) {
        if (!manager.started || !isRegularFolder(this) || this !== folder) {
          return Reflect.apply(original, this, args);
        }
        return manager.unload(folder);
      };
      Object.defineProperty(folder, "unloadAllTabs", {value: wrapper, configurable: true, writable: true});
      this.owned.set(folder, {descriptor, wrapper});
    }
  }

  unload(folder) {
    if (this.pending.has(folder)) return this.pending.get(folder);
    // The native recursive tab collection already expands nested/split members.
    // Keep native before-unload prompts and selection transfer. Never rewrite
    // activeTabs, collapse, metadata, history or a pinned reset baseline here.
    const tabs = [...new Set(Array.from(folder.tabs ?? []))].filter(tab =>
      this.host.gBrowser.isTab(tab) && tab.isConnected !== false && !tab.closing
      && !isEmptyDirectItem(tab) && !tab.hasAttribute?.("zen-essential"));
    if (folder.isConnected === false || tabs.length === 0) return Promise.resolve(false);
    // Parent/child requests overlap. Share in-flight results (including refusal)
    // rather than invoking native before-unload handling twice for those tabs.
    const shared = [...new Set(tabs.map(tab => this.pendingTabs.get(tab)).filter(Boolean))];
    const claimed = tabs.filter(tab => !this.pendingTabs.has(tab));
    const operation = Promise.resolve().then(() => {
      if (!this.started || folder.isConnected === false || !isRegularFolder(folder)) return false;
      const current = new Set(Array.from(folder.tabs ?? []));
      const remaining = claimed.filter(tab => current.has(tab) && tab.isConnected !== false
        && !tab.closing && !tab.hasAttribute?.("zen-essential"));
      const own = remaining.length ? this.host.gBrowser.explicitUnloadTabs(remaining) : false;
      if (!shared.length) return own;
      const results = remaining.length ? [...shared, own] : shared;
      return Promise.all(results).then(values => values.every(value => value === true));
    }).catch(error => {
      this.host.console?.error?.("Better Zen Folders: unable to unload folder tabs", error);
      return false;
    }).finally(() => {
      if (this.pending.get(folder) === operation) this.pending.delete(folder);
      for (const tab of claimed) {
        if (this.pendingTabs.get(tab) === operation) this.pendingTabs.delete(tab);
      }
    });
    this.pending.set(folder, operation);
    for (const tab of claimed) this.pendingTabs.set(tab, operation);
    return operation;
  }

  destroy() {
    if (!this.started) return;
    this.started = false;
    this.observer?.disconnect();
    this.observer = null;
    this.host.gBrowser?.tabContainer?.removeEventListener?.("TabGroupUpdate", this.reconcile);
    this.signal?.removeEventListener?.("abort", this.destroy);
    this.signal = null;
    for (const [folder, entry] of this.owned) this.release(folder, entry);
    this.pending.clear();
    this.pendingTabs.clear();
  }
}

export class FolderButtonManager {
  constructor(adapters) {
    this.adapters = adapters;
    this.newTabTransaction = adapters.newTabTransaction ?? null;
    this.menu = null;
    this.menuItem = null;
    this.menuFolder = null;
    this.onMenuShowing = event => this.showMenu(event);
    this.observer = null;
    this.stopObservingEligibilityChanges = null;
    this.stopObservingVisibility = null;
    this.visibility = "hover";
    this.showUnload = false;
    this.unloadRows = new Set();
    this.stopObservingUnload = null;
    this.visibilityRoot = null;
    this.projectedVisibility = null;
    this.started = false;
  }

  start(signal) {
    if (this.started) return;
    this.started = true;
    this.visibility = this.adapters.preferences?.get?.("newTabButtonVisibility") ?? "hover";
    this.showUnload = this.adapters.preferences?.get?.("showFolderUnloadButton") ?? false;
    this.stopObservingUnload = this.adapters.preferences?.subscribe?.(
      "showFolderUnloadButton", value => {
        this.showUnload = value === true;
        this.reconcileAll();
      },
    ) ?? null;
    this.projectVisibility();
    this.stopObservingVisibility = this.adapters.preferences?.subscribe?.(
      "newTabButtonVisibility",
      visibility => {
        this.visibility = visibility;
        this.projectVisibility();
        this.reconcileAll();
      },
    ) ?? null;
    this.reconcileAll();
    this.stopObservingEligibilityChanges = this.adapters.observeEligibilityChanges?.(
      folder => this.reconcile(folder),
    ) ?? null;

    this.menu = this.adapters.folderMenu?.() ?? null;
    this.menu?.addEventListener("popupshowing", this.onMenuShowing);
    this.stopObservingCommandIcons = this.adapters.preferences?.subscribe?.(
      "commandIconMode", mode => setBzfCommandIcon(this.menuItem,
        "chrome://global/skin/icons/plus.svg", mode),
    ) ?? null;

    const tabContainer = this.adapters.tabContainer();
    if (!tabContainer) return;
    this.observer = this.adapters.createMutationObserver(() => this.reconcileAll());
    this.observer.observe(tabContainer, { childList: true, subtree: true });
    signal?.addEventListener?.("abort", () => this.destroy(), { once: true });
  }

  destroy() {
    if (!this.started) return;
    this.started = false;
    this.observer?.disconnect();
    this.observer = null;
    this.stopObservingEligibilityChanges?.();
    this.stopObservingEligibilityChanges = null;
    this.stopObservingVisibility?.();
    this.stopObservingVisibility = null;
    this.stopObservingUnload?.();
    this.stopObservingUnload = null;
    for (const row of this.unloadRows) row.removeAttribute?.("better-zen-folders-hide-unload");
    this.unloadRows.clear();
    this.menu?.removeEventListener("popupshowing", this.onMenuShowing);
    this.stopObservingCommandIcons?.();
    this.stopObservingCommandIcons = null;
    setBzfCommandIcon(this.menuItem, null, "off");
    this.menuItem?.remove();
    this.menu = this.menuItem = this.menuFolder = null;
    this.newTabTransaction?.destroy?.();
    for (const folder of this.adapters.listFolders()) {
      this.removeOwnedButtons(this.adapters.getFolderRow(folder));
    }
    if (
      this.visibilityRoot?.getAttribute?.("better-zen-folders-new-tab-visibility")
        === this.projectedVisibility
    ) {
      this.visibilityRoot.removeAttribute?.("better-zen-folders-new-tab-visibility");
    }
    this.visibilityRoot = null;
    this.projectedVisibility = null;
  }

  reconcileAll() {
    const folders = [...this.adapters.listFolders()];
    const currentRows = new Set(folders.map(folder => this.adapters.getFolderRow(folder)));
    for (const row of this.unloadRows) {
      if (currentRows.has(row)) continue;
      row.removeAttribute("better-zen-folders-hide-unload");
      this.unloadRows.delete(row);
    }
    for (const folder of folders) this.reconcile(folder);
  }

  showMenu(event) {
    if (event.target !== this.menu) return;
    this.menuFolder = this.adapters.getContextFolder?.(event) ?? null;
    const eligible = isRegularFolder(this.menuFolder) && this.menuFolder.isConnected !== false;
    if (!this.menuItem) {
      const item = this.adapters.createMenuItem();
      item.id = "better-zen-folders-new-tab-menu";
      item.setAttribute("label", "New Tab in Folder");
      item.addEventListener("command", command => {
        command.preventDefault();
        command.stopPropagation();
        const folder = this.menuFolder;
        if (!item.hidden && isRegularFolder(folder) && folder.isConnected !== false) {
          void this.newTabTransaction?.activate(folder);
        }
      });
      this.menu.insertBefore(item, this.adapters.menuInsertionPoint?.(this.menu) ?? null);
      this.menuItem = item;
    }
    this.menuItem.hidden = !eligible;
    setBzfCommandIcon(this.menuItem, "chrome://global/skin/icons/plus.svg",
      this.adapters.preferences?.get?.("commandIconMode") ?? "mod");
  }

  reconcile(folder) {
    const row = this.adapters.getFolderRow(folder);
    if (!row) return;

    // Presentation only: preserve the native command, plus anchor and live actions.
    if (!this.showUnload && isRegularFolder(folder)) {
      if (row.getAttribute("better-zen-folders-hide-unload") !== "true") {
        row.setAttribute("better-zen-folders-hide-unload", "true");
      }
      this.unloadRows.add(row);
    } else {
      row.removeAttribute("better-zen-folders-hide-unload");
      this.unloadRows.delete(row);
    }

    const ownedButtons = this.ownedButtons(row);
    if (this.visibility === "hidden" || !isRegularFolder(folder)) {
      for (const button of ownedButtons) button.remove();
      return;
    }

    const resetButton = row.querySelector(".tab-reset-button");
    if (!resetButton) {
      for (const button of ownedButtons) button.remove();
      return;
    }

    const [button, ...duplicates] = ownedButtons;
    for (const duplicate of duplicates) duplicate.remove();
    if (button) return;

    const newButton = this.adapters.createToolbarButton();
    newButton.setAttribute("class", "better-zen-folders-new-tab-button");
    newButton.setAttribute("data-better-zen-folders-owned", "true");
    newButton.setAttribute("tooltiptext", "New Tab in Folder");
    newButton.setAttribute("aria-label", "New Tab in Folder");
    newButton.addEventListener("pointerdown", event => event.stopPropagation());
    newButton.addEventListener("click", event => event.stopPropagation());
    newButton.addEventListener("command", event => {
      event.preventDefault();
      event.stopPropagation();
      void this.newTabTransaction?.activate(folder);
    });
    row.insertBefore(newButton, resetButton);
  }

  ownedButtons(row) {
    // Other BZF controls share the ownership marker. A Sticky gutter button is
    // not a new-tab button and must survive new-tab reconciliation/cleanup.
    return row ? Array.from(row.querySelectorAll(OWNED_BUTTON_SELECTOR)).filter(
      button => button.classList?.contains("better-zen-folders-new-tab-button"),
    ) : [];
  }

  removeOwnedButtons(row) {
    for (const button of this.ownedButtons(row)) button.remove();
  }

  projectVisibility() {
    const root = this.adapters.root?.();
    if (!root) return;
    root.setAttribute("better-zen-folders-new-tab-visibility", this.visibility);
    this.visibilityRoot = root;
    this.projectedVisibility = this.visibility;
  }
}

export class FolderSpaceColourPreferenceProjection {
  constructor(adapters) { this.adapters=adapters;this.started=false; }
  start(signal) {
    if (this.started || signal?.aborted) return;
    this.root=this.adapters.root?.();
    if (!this.root) return;
    this.started=true;
    this.attribute='better-zen-folders-space-colour';
    this.original=this.root.getAttribute(this.attribute);
    const project=value=>{
      this.projected=String(value !== false);
      this.root.setAttribute(this.attribute,this.projected);
    };
    project(this.adapters.preferences?.get?.('useSpaceColour'));
    this.unsubscribe=this.adapters.preferences?.subscribe?.('useSpaceColour',project);
    signal?.addEventListener?.('abort',()=>this.destroy(),{once:true});
  }
  destroy() {
    if (!this.started) return;
    this.started=false;this.unsubscribe?.();
    if (this.root.getAttribute(this.attribute)===this.projected) {
      if (this.original===null) this.root.removeAttribute(this.attribute);
      else this.root.setAttribute(this.attribute,this.original);
    }
    this.root=null;
  }
}

export class HierarchyGuidePreferenceProjection {
  constructor(adapters) {
    this.adapters = adapters;
    this.started = false;
    this.root = null;
    this.projectedValue = null;
    this.unsubscribe = null;
  }

  start(signal) {
    if (this.started) return;
    this.started = true;
    this.project(this.adapters.preferences?.get?.("showHierarchyGuides") ?? true);
    this.unsubscribe = this.adapters.preferences?.subscribe?.(
      "showHierarchyGuides",
      value => this.project(value),
    ) ?? null;
    signal?.addEventListener?.("abort", () => this.destroy(), { once: true });
  }

  destroy() {
    if (!this.started) return;
    this.started = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (
      this.root?.getAttribute?.("better-zen-folders-show-guides")
        === this.projectedValue
    ) {
      this.root.removeAttribute?.("better-zen-folders-show-guides");
    }
    this.root = null;
    this.projectedValue = null;
  }

  project(value) {
    const root = this.adapters.root?.();
    if (!root) return;
    const projectedValue = value === false ? "false" : "true";
    root.setAttribute("better-zen-folders-show-guides", projectedValue);
    this.root = root;
    this.projectedValue = projectedValue;
  }
}

export class FolderNameSizePreferenceProjection {
  constructor(adapters) {
    this.adapters = adapters;
    this.started = false;
    this.root = null;
    this.projectedValue = null;
    this.unsubscribe = null;
    this.originalSize = null;
    this.sizeProperty = "--better-zen-folders-folder-font-size";
  }

  start(signal) {
    if (this.started) return;
    this.started = true;
    this.project(this.adapters.preferences?.get?.("folderNameSize") ?? "14");
    this.unsubscribe = this.adapters.preferences?.subscribe?.(
      "folderNameSize",
      value => this.project(value),
    ) ?? null;
    signal?.addEventListener?.("abort", () => this.destroy(), { once: true });
  }

  destroy() {
    if (!this.started) return;
    this.started = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.root?.style?.getPropertyValue?.(this.sizeProperty) === `${this.projectedValue}px`) {
      if (this.originalSize?.value) this.root.style.setProperty(this.sizeProperty, this.originalSize.value, this.originalSize.priority);
      else this.root.style.removeProperty(this.sizeProperty);
    }
    if (
      this.root?.getAttribute?.("better-zen-folders-folder-name-size")
        === this.projectedValue
    ) {
      this.root.removeAttribute?.("better-zen-folders-folder-name-size");
    }
    this.root = null;
    this.projectedValue = null;
  }

  project(value) {
    const root = this.adapters.root?.();
    if (!root) return;
    value = String(parseNumericSetting("folderNameSize", value) ?? 14);
    if (!this.root) this.originalSize = {
      value: root.style?.getPropertyValue?.(this.sizeProperty) ?? "",
      priority: root.style?.getPropertyPriority?.(this.sizeProperty) ?? "",
    };
    root.style?.setProperty?.(this.sizeProperty, `${value}px`);
    root.setAttribute("better-zen-folders-folder-name-size", value);
    this.root = root;
    this.projectedValue = value;
  }
}

export class EmptyRegularFolderManager {
  constructor(adapters, populationRegistry) {
    this.adapters = adapters;
    this.populationRegistry = populationRegistry;
    this.candidates = new Set();
    this.deleting = new WeakSet();
    this.reportedDeleteFailures = new WeakSet();
    this.observer = null;
    this.unsubscribeReleased = null;
    this.unsubscribeCleanupPreference = null;
    this.cleanupEnabled = true;
    this.started = false;
    this.destroyed = false;
    this.generation = 0;
    this.reconciliationScheduled = false;
    this.reconciling = false;
    this.reconcileAgain = false;
    this.boundCaptureClose = this.captureClose.bind(this);
    this.boundHandleUngroup = this.handleUngroup.bind(this);
    this.boundHandleFolderUngroup = this.handleFolderUngroup.bind(this);
  }

  start(signal) {
    if (this.started || this.destroyed || signal?.aborted) return;
    this.started = true;
    this.cleanupEnabled = this.adapters.preferences?.get?.("deleteEmptyRegularFolders") ?? true;
    this.unsubscribeCleanupPreference = this.adapters.preferences?.subscribe?.(
      "deleteEmptyRegularFolders",
      enabled => this.setCleanupEnabled(enabled),
    ) ?? null;
    const eventTarget = this.adapters.eventTarget?.();
    eventTarget?.addEventListener("TabClose", this.boundCaptureClose, {
      capture: true,
      signal,
    });
    eventTarget?.addEventListener("TabUngrouped", this.boundHandleUngroup, {
      capture: false,
      signal,
    });
    eventTarget?.addEventListener("FolderUngrouped", this.boundHandleFolderUngroup, {
      capture: false,
      signal,
    });
    const tabContainer = this.adapters.tabContainer?.();
    if (tabContainer) {
      this.observer = this.adapters.createMutationObserver(() => {
        if (this.candidates.size > 0) this.scheduleReconciliation();
      });
      this.observer.observe(tabContainer, { childList: true, subtree: true });
    }
    this.unsubscribeReleased = this.populationRegistry.subscribeReleased(folder => {
      if (this.cleanupEnabled && this.candidates.has(folder)) this.scheduleReconciliation();
    });
    signal?.addEventListener?.("abort", () => this.destroy(), { once: true });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.started = false;
    this.generation++;
    this.reconciliationScheduled = false;
    this.reconcileAgain = false;
    this.candidates.clear();
    this.observer?.disconnect();
    this.observer = null;
    this.unsubscribeReleased?.();
    this.unsubscribeReleased = null;
    this.unsubscribeCleanupPreference?.();
    this.unsubscribeCleanupPreference = null;
  }

  setCleanupEnabled(enabled) {
    this.cleanupEnabled = enabled !== false;
    if (this.cleanupEnabled) return;
    this.candidates.clear();
    this.reconciliationScheduled = false;
    this.reconcileAgain = false;
  }

  captureClose(event) {
    if (
      this.destroyed
      || !this.cleanupEnabled
      || this.adapters.isRealCloseDeparture?.(event) === false
    ) return;
    this.promoteCandidatePath(this.adapters.closeDepartureFolder?.(event));
  }

  handleUngroup(event) {
    if (
      this.destroyed
      || !this.cleanupEnabled
      || this.adapters.isRealUngroupDeparture?.(event) === false
    ) return;
    this.promoteCandidatePath(this.adapters.ungroupDepartureFolder?.(event));
  }

  handleFolderUngroup(event) {
    if (this.destroyed || !this.cleanupEnabled) return;
    this.promoteCandidatePath(
      this.adapters.folderUngroupDepartureFolder?.(event) ?? event.target,
    );
  }

  promoteCandidatePath(folder) {
    if (!this.cleanupEnabled || !isRegularFolder(folder)) return;
    this.candidates.add(folder);
    for (const ancestor of this.adapters.getFolderAncestors?.(folder) ?? []) {
      if (isRegularFolder(ancestor)) this.candidates.add(ancestor);
    }
  }

  scheduleReconciliation() {
    if (this.destroyed || !this.cleanupEnabled || this.reconciliationScheduled) return;
    if (this.reconciling) {
      this.reconcileAgain = true;
      return;
    }
    this.reconciliationScheduled = true;
    const generation = this.generation;
    Promise.resolve().then(() => {
      this.reconciliationScheduled = false;
      if (this.destroyed || !this.cleanupEnabled || generation !== this.generation) return;
      void this.reconcile(generation);
    });
  }

  async reconcile(generation = this.generation) {
    if (this.destroyed || !this.cleanupEnabled || generation !== this.generation) return;
    if (this.reconciling) {
      this.reconcileAgain = true;
      return;
    }
    this.reconciling = true;
    try {
      do {
        this.reconcileAgain = false;
        await this.reconcileOnce(generation);
      } while (
        this.reconcileAgain
        && !this.destroyed
        && this.cleanupEnabled
        && generation === this.generation
      );
    } finally {
      this.reconciling = false;
    }
  }

  async reconcileOnce(generation) {
    if (this.destroyed || !this.cleanupEnabled || generation !== this.generation) return;
    const connected = [];
    for (const folder of this.candidates) {
      if (folder?.isConnected === false) {
        this.candidates.delete(folder);
      } else {
        connected.push(folder);
      }
    }
    connected.sort((left, right) =>
      (this.adapters.getFolderAncestors?.(right)?.length ?? 0)
      - (this.adapters.getFolderAncestors?.(left)?.length ?? 0)
    );
    const blockedAncestors = new Set();
    for (const folder of connected) {
      if (this.destroyed || !this.cleanupEnabled || generation !== this.generation) return;
      if (blockedAncestors.has(folder)) continue;
      if (!isRegularFolder(folder)) {
        this.candidates.delete(folder);
        continue;
      }
      if (
        this.populationRegistry.isHeld(folder)
        || this.deleting.has(folder)
        || (this.adapters.realChildren?.(folder)?.length ?? 0) !== 0
      ) continue;

      this.deleting.add(folder);
      for (const ancestor of this.adapters.getFolderAncestors?.(folder) ?? []) {
        blockedAncestors.add(ancestor);
      }
      try {
        await this.adapters.deleteFolder(folder);
      } catch (error) {
        this.deleting.delete(folder);
        this.candidates.delete(folder);
        if (!this.reportedDeleteFailures.has(folder)) {
          this.reportedDeleteFailures.add(folder);
          try { this.adapters.reportError?.(error); } catch {}
        }
      }
    }
  }
}

const COLLAPSED_FOLDER_DRAG_EVENTS = [
  "dragenter",
  "dragover",
  "dragleave",
  "drop",
  "dragend",
  "TabGroupExpand",
  "TabGroupCollapse",
  "pointerdown",
  "keydown",
  "blur",
];

export class CollapsedFolderDragGuard {
  constructor(adapters) {
    this.adapters = adapters;
    this.started = false;
    this.eventTarget = null;
    this.dragStartTarget = null;
    this.activeDrag = false;
    this.suspended = false;
    this.nativeSession = null;
    this.destinationHover = false;
    this.hoveredFolder = null;
    this.hoverTimer = null;
    this.activeHoverDelayMs = null;
    this.activeRecollapseDelayMs = null;
    this.recollapseTimers = new Map();
    this.draggedItems = [];
    this.pendingDrop = null;
    this.expandingFolder = null;
    this.deferredCleanup = null;
    this.firstHoverCollapsed = new WeakMap();
    this.firstNativeCollapsed = new WeakMap();
    this.guardedFolders = new WeakSet();
    this.intentionalExpansions = new Set();
    this.recollapsing = false;
    this.boundHandleEvent = this.handleEvent.bind(this);
  }

  start(signal) {
    if (this.started) return;
    const eventTarget = this.adapters.eventTarget();
    const dragStartTarget = this.adapters.dragStartTarget();
    if (!eventTarget || !dragStartTarget) return;
    this.started = true;
    this.eventTarget = eventTarget;
    this.dragStartTarget = dragStartTarget;
    dragStartTarget.addEventListener("dragstart", this.boundHandleEvent);
    for (const type of COLLAPSED_FOLDER_DRAG_EVENTS) {
      eventTarget.addEventListener(type, this.boundHandleEvent, true);
    }
    signal?.addEventListener?.("abort", () => this.destroy(), { once: true });
  }

  handleEvent(event) {
    switch (event.type) {
      case "dragstart":
        this.beginDrag(event);
        break;
      case "dragenter":
      case "dragover":
        if (this.activeDrag) {
          if (this.adapters.isDragSessionCurrent?.(this.nativeSession) === false) {
            this.cleanupDrag();
            break;
          }
          if (this.adapters.acceptsDragEvent?.(event, this.nativeSession) === false) {
            this.suspendDrag();
            break;
          }
          this.suspended = false;
          this.trackHoveredFolder(event);
        }
        break;
      case "dragleave":
        if (this.activeDrag) {
          const destination = this.adapters.getDestinationHoverFolder?.({ ...event,
            target: event.relatedTarget, clientX: event.clientX, clientY: event.clientY });
          this.trackFolder(destination ?? this.adapters.getRelatedTargetFolder(event), destination === undefined);
        }
        break;
      case "drop":
        if (this.activeDrag) this.prepareDrop(event);
        break;
      case "TabGroupExpand":
        this.interceptExpansion(event);
        break;
      case "TabGroupCollapse":
        if (this.activeDrag && !this.recollapsing) {
          this.releaseFolder(this.adapters.getTargetFolder(event));
        }
        break;
      case "pointerdown":
        if (this.activeDrag) {
          this.releaseFolder(this.adapters.getTargetFolder(event));
          this.cleanupDrag();
        }
        break;
      case "keydown":
        if (event.key === "Escape") this.cleanupDrag();
        else if (this.activeDrag && ["Enter", " "].includes(event.key)) {
          this.releaseFolder(this.adapters.getTargetFolder(event));
        }
        break;
      case "dragend":
        // A native drop may finish dispatching before our deferred membership check.
        if (this.pendingDrop) break;
        this.cleanupDrag();
        break;
      case "blur":
        if (event.target === this.eventTarget) this.suspendDrag();
        break;
    }
  }

  beginDrag(event) {
    this.cleanupDrag();
    if (!this.adapters.isNativeTabDrag(event)) return;
    this.activeDrag = true;
    this.activeHoverDelayMs = this.validatedHoverDelayMs();
    this.activeRecollapseDelayMs = parseNumericSetting(
      "dragHoverDelayMs", this.adapters.getRecollapseDelayMs?.(),
    ) ?? 500;
    this.draggedItems = Array.from(this.adapters.getDraggedItems?.(event) ?? []);
    this.nativeSession = this.adapters.getDragSession?.(event) ?? null;
    this.firstHoverCollapsed = new WeakMap();
    this.firstNativeCollapsed = new WeakMap();
    this.guardedFolders = new WeakSet();
    this.intentionalExpansions = new Set();
  }

  trackHoveredFolder(event) {
    const destination = event.type === "drop" ? undefined : this.adapters.getDestinationHoverFolder?.(event);
    this.trackFolder(destination ?? this.adapters.getTargetFolder(event), destination === undefined);
  }

  suspendDrag() {
    this.cancelHoverTimer();
    for (const folder of this.recollapseTimers.keys()) this.cancelRecollapseTimer(folder);
    for (const folder of this.intentionalExpansions) this.restoreFolder(folder);
    this.hoveredFolder = null;
    this.suspended = true;
  }

  trackFolder(candidate, allowExpansion = true) {
    const folder = this.adapters.isZenFolder(candidate) ? candidate : null;
    const wasDestinationHover = this.destinationHover;
    this.destinationHover = !allowExpansion;
    for (const opened of this.intentionalExpansions) {
      if (this.isWithinFolder(folder, opened)) this.cancelRecollapseTimer(opened);
      else this.scheduleRecollapse(opened);
    }
    if (!allowExpansion) {
      this.cancelHoverTimer();
      this.hoveredFolder = folder;
      if (folder && !this.firstHoverCollapsed.has(folder)) {
        const nativeCollapsed = this.adapters.isFolderCollapsed(folder);
        const initiallyCollapsed = nativeCollapsed || this.adapters.isPathOnlyFolder?.(folder) === true;
        this.firstNativeCollapsed.set(folder, nativeCollapsed);
        this.firstHoverCollapsed.set(folder, initiallyCollapsed);
        if (initiallyCollapsed) this.guardedFolders.add(folder);
      }
      if (folder && this.shouldGuard(folder)) this.keepCollapsed(folder);
      return;
    }
    if (folder === this.hoveredFolder && !wasDestinationHover) {
      if (folder && this.shouldGuard(folder)) this.keepCollapsed(folder);
      return;
    }

    const previous = this.hoveredFolder;
    this.cancelHoverTimer();
    this.hoveredFolder = folder;
    if (previous && this.shouldGuard(previous)) this.keepCollapsed(previous);
    if (!folder) return;

    if (!this.firstHoverCollapsed.has(folder)) {
      const nativeCollapsed = this.adapters.isFolderCollapsed(folder);
      const initiallyCollapsed = nativeCollapsed || this.adapters.isPathOnlyFolder?.(folder) === true;
      this.firstNativeCollapsed.set(folder, nativeCollapsed);
      this.firstHoverCollapsed.set(folder, initiallyCollapsed);
      if (initiallyCollapsed) this.guardedFolders.add(folder);
    }
    if (!this.shouldGuard(folder)) return;

    this.keepCollapsed(folder);
    const timerFolder = folder;
    this.hoverTimer = this.adapters.setTimer(() => {
      this.hoverTimer = null;
      if (
        !this.activeDrag
        || this.suspended
        || this.adapters.isDragSessionCurrent?.(this.nativeSession) === false
        || this.hoveredFolder !== timerFolder
        || !this.shouldGuard(timerFolder)
      ) return;
      this.intentionalExpansions.add(timerFolder);
      this.expandingFolder = timerFolder;
      try {
        if (!this.adapters.beginDragExpansion?.(timerFolder)) {
          this.adapters.setFolderCollapsed(timerFolder, false);
        }
      } catch {
        this.intentionalExpansions.delete(timerFolder);
      } finally {
        this.expandingFolder = null;
      }
    }, this.activeHoverDelayMs);
  }

  validatedHoverDelayMs() {
    const delay = this.adapters.getHoverDelayMs?.();
    return parseNumericSetting("dragHoverDelayMs", delay) ?? DRAG_HOVER_DELAY_MS;
  }

  isWithinFolder(candidate, folder) {
    const seen = new Set();
    for (let current = candidate; current && !seen.has(current);
      current = this.adapters.getParentFolder?.(current)) {
      if (current === folder) return true;
      seen.add(current);
    }
    return false;
  }

  cancelRecollapseTimer(folder) {
    if (!this.recollapseTimers.has(folder)) return;
    this.adapters.clearTimer(this.recollapseTimers.get(folder));
    this.recollapseTimers.delete(folder);
  }

  scheduleRecollapse(folder) {
    if (this.recollapseTimers.has(folder)) return;
    this.recollapseTimers.set(folder, this.adapters.setTimer(() => {
      this.recollapseTimers.delete(folder);
      if (!this.activeDrag || this.isWithinFolder(this.hoveredFolder, folder)) return;
      this.restoreFolder(folder);
    }, this.activeRecollapseDelayMs));
  }

  restoreFolder(folder) {
    this.cancelRecollapseTimer(folder);
    if (!this.intentionalExpansions.delete(folder)) return;
    this.recollapsing = true;
    try {
      if (!this.adapters.cancelDragExpansion?.(folder)) {
        this.adapters.setFolderCollapsed(folder, this.firstNativeCollapsed.get(folder) ?? true);
      }
    } finally { this.recollapsing = false; }
  }

  releaseFolder(folder) {
    if (!folder) return;
    this.adapters.releaseDragExpansion?.(folder);
    this.cancelRecollapseTimer(folder);
    this.intentionalExpansions.delete(folder);
    this.guardedFolders.delete(folder);
    this.firstHoverCollapsed.set(folder, false);
    if (this.hoveredFolder === folder) this.cancelHoverTimer();
  }

  shouldGuard(folder) {
    return this.guardedFolders.has(folder)
      && !this.intentionalExpansions.has(folder);
  }

  keepCollapsed(folder) {
    const expected = this.firstNativeCollapsed.get(folder) ?? true;
    if (this.adapters.isFolderCollapsed(folder) === expected || this.recollapsing) return;
    this.recollapsing = true;
    try {
      this.adapters.setFolderCollapsed(folder, expected);
    } finally {
      this.recollapsing = false;
    }
  }

  interceptExpansion(event) {
    if (!this.activeDrag || this.suspended || this.recollapsing) return;
    const folder = this.adapters.isZenFolder(event.target)
      ? event.target
      : this.adapters.getTargetFolder(event);
    if (!folder || this.expandingFolder === folder) return;
    if (this.intentionalExpansions.has(folder)) {
      // A subsequent external state change takes ownership away from the drag.
      this.releaseFolder(folder);
      return;
    }
    if (!this.shouldGuard(folder)) return;
    event.stopImmediatePropagation?.();
    this.keepCollapsed(folder);
  }

  prepareDrop(event) {
    this.trackHoveredFolder(event);
    this.cancelHoverTimer();
    if (this.hoveredFolder && this.shouldGuard(this.hoveredFolder)) {
      this.keepCollapsed(this.hoveredFolder);
    }
    this.cancelDeferredCleanup();
    for (const folder of this.recollapseTimers.keys()) this.cancelRecollapseTimer(folder);
    const folder = this.hoveredFolder;
    const effect = event.dataTransfer?.dropEffect;
    this.pendingDrop = {
      folder,
      // Copies/adoptions create a different native object. Do not infer success
      // from an arbitrary new child or from the drop event itself.
      candidates: folder && effect === "move"
        ? this.draggedItems.filter(item => !this.adapters.isItemInFolder?.(item, folder))
        : [],
    };
    this.deferredCleanup = this.adapters.defer(() => {
      this.deferredCleanup = null;
      try {
        this.commitDrop();
      } finally {
        this.cleanupDrag();
      }
    });
  }

  commitDrop() {
    const drop = this.pendingDrop;
    if (!drop?.folder || this.adapters.isFolderCollapsed(drop.folder)) return;
    if (!drop.candidates.some(item => this.adapters.isItemInFolder?.(item, drop.folder))) return;
    const committed = [...this.intentionalExpansions]
      .filter(folder => this.isWithinFolder(drop.folder, folder));
    if (!committed.length) return;
    for (const folder of committed) this.releaseFolder(folder);
    this.adapters.commitDragExpansion?.(drop.folder);
  }

  cancelHoverTimer() {
    if (this.hoverTimer === null) return;
    this.adapters.clearTimer(this.hoverTimer);
    this.hoverTimer = null;
  }

  cancelDeferredCleanup() {
    const cancel = this.deferredCleanup;
    this.deferredCleanup = null;
    cancel?.();
  }

  cleanupDrag() {
    this.cancelHoverTimer();
    this.cancelDeferredCleanup();
    for (const folder of this.recollapseTimers.keys()) this.cancelRecollapseTimer(folder);
    for (const folder of this.intentionalExpansions) this.restoreFolder(folder);
    this.activeDrag = false;
    this.suspended = false;
    this.nativeSession = null;
    this.destinationHover = false;
    this.activeHoverDelayMs = null;
    this.activeRecollapseDelayMs = null;
    this.draggedItems = [];
    this.pendingDrop = null;
    this.hoveredFolder = null;
    this.firstHoverCollapsed = new WeakMap();
    this.firstNativeCollapsed = new WeakMap();
    this.guardedFolders = new WeakSet();
    this.intentionalExpansions = new Set();
    this.recollapsing = false;
  }

  destroy() {
    this.cleanupDrag();
    if (!this.started) return;
    this.started = false;
    this.dragStartTarget.removeEventListener("dragstart", this.boundHandleEvent);
    for (const type of COLLAPSED_FOLDER_DRAG_EVENTS) {
      this.eventTarget.removeEventListener(type, this.boundHandleEvent, true);
    }
    this.dragStartTarget = null;
    this.eventTarget = null;
  }
}

export class BetterZenFoldersController {
  constructor(adapters) {
    this.adapters = adapters;
    this.abortController = null;
    this.started = false;
    this.boundDestroy = this.destroy.bind(this);
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.abortController = this.adapters.createAbortController();
    for (const manager of this.adapters.managers) {
      manager.start(this.abortController.signal);
    }
  }

  destroy() {
    if (!this.started) return;
    this.started = false;
    for (const manager of [...this.adapters.managers].reverse()) {
      manager.destroy();
    }
    this.abortController.abort();
  }
}

function browserFolderAncestors(folder) {
  const ancestors = [];
  const visited = new Set([folder]);
  let current = folder.parentFolder ?? folder.parentNode?.closest?.("zen-folder") ?? null;
  while (current && !visited.has(current)) {
    ancestors.push(current);
    visited.add(current);
    current = current.parentFolder ?? current.parentNode?.closest?.("zen-folder") ?? null;
  }
  return ancestors;
}

function browserContextFolder(host, event) {
  for (const target of [event?.target?.triggerNode, event?.explicitOriginalTarget,
    event?.originalTarget, host.document?.popupNode]) {
    const folder = target?.isZenFolder ? target
      : target?.closest?.('zen-folder') ?? target?.group
      ?? target?.parentElement?.group;
    if (folder?.isZenFolder) return folder;
    const row = target?.classList?.contains?.('tab-group-label-container')
      ? target : target?.closest?.('.tab-group-label-container');
    if (row?.parentElement?.isZenFolder) return row.parentElement;
  }
  return null;
}

function browserWorkspaceId(folder) {
  return folder.workspaceId
    ?? folder.workspace?.id
    ?? folder.getAttribute?.("zen-workspace-id")
    ?? null;
}

function browserSplitWrapper(host, tab) {
  const candidate = tab?.splitview
    ?? (host.gBrowser?.isSplitViewWrapper?.(tab?.group) ? tab.group : null);
  return host.gBrowser?.isSplitViewWrapper?.(candidate) ? candidate : null;
}

function browserDirectItems(host, folder, directItem) {
  const children = folder?.allItems
    ?? Array.from(directItem?.parentElement?.children ?? []);
  return Array.from(children).filter(item =>
    item?.isZenFolder
    || host.gBrowser?.isTab?.(item)
    || host.gBrowser?.isSplitViewWrapper?.(item)
  );
}

function browserGroupTabsForClose(host, folder) {
  const tabs = [];
  const seenItems = new Set();
  const visit = item => {
    if (!item || seenItems.has(item)) return;
    seenItems.add(item);
    if (host.gBrowser?.isTab?.(item) === true) {
      tabs.push(item);
      return;
    }
    if (host.gBrowser?.isSplitViewWrapper?.(item) === true) {
      for (const tab of item.tabs ?? []) visit(tab);
      return;
    }
    if (item.isZenFolder === true) {
      for (const child of item.allItems ?? []) visit(child);
    }
  };
  for (const item of folder?.allItems ?? folder?.tabs ?? []) visit(item);
  return tabs;
}

function browserLiveManager(host) {
  try {
    const importer = host.ChromeUtils ?? globalThis.ChromeUtils;
    return importer?.importESModule?.(
      "resource:///modules/zen/ZenLiveFoldersManager.sys.mjs",
    )?.ZenLiveFoldersManager ?? null;
  } catch {
    return null;
  }
}

function browserSynchronizedWindows(host) {
  const windows = [];
  const seen = new Set();
  const syncOwner = host.gZenWindowSync;
  let candidates = [host];
  try {
    const enumerator = host.Services?.wm?.getEnumerator?.("navigator:browser");
    if (enumerator) candidates = Array.from(enumerator);
  } catch {}
  if (!candidates.includes(host)) candidates.unshift(host);
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate) || candidate.closed === true) continue;
    const isCurrent = candidate === host;
    const isSynchronized = syncOwner && candidate.gZenWindowSync === syncOwner
      && candidate.__SSi && !candidate.gZenWorkspaces?.privateWindowOrDisabled;
    if (!isCurrent && !isSynchronized) continue;
    seen.add(candidate);
    windows.push(candidate);
  }
  return windows;
}

function browserFolderIdOccupied(host, manager, id) {
  for (const browserWindow of browserSynchronizedWindows(host)) {
    if (browserWindow.document?.getElementById?.(id)) return true;
  }
  if (manager?.liveFolders?.has?.(id)) return true;
  if (manager?.dismissedItems) {
    for (const itemId of manager.dismissedItems) {
      if (itemId.startsWith(`${id}:`)) return true;
    }
  }
  return false;
}

function browserProviderValidators(manager) {
  if (typeof manager?.registry?.keys !== "function") return new Map();
  const validators = new Map();
  for (const type of manager.registry.keys()) {
    const validator = trustedBrowserProviderValidator(type);
    if (validator) validators.set(type, validator);
  }
  return validators;
}

function browserLiveState(manager, folder) {
  const provider = manager?.getFolder?.(folder?.id);
  const providerType = provider?.constructor?.type;
  if (!provider || !isNonEmptyString(providerType)) {
    return null;
  }
  const serializedState = JSON.stringify(provider.serialize());
  return trustedBrowserLiveData(providerType, serializedState)
    ? { providerType, serializedState }
    : null;
}

function remapDismissedItems(snapshot, folderId) {
  if (!Array.isArray(snapshot.dismissed)) return [];
  const prefix = `${snapshot.id}:`;
  return snapshot.dismissed.map(itemId => `${folderId}:${itemId.slice(prefix.length)}`);
}

function browserLiveProviderPreflight(manager, snapshot) {
  if (!manager) throw new Error("Zen live-folder manager is unavailable");
  const ProviderClass = manager.registry?.get(snapshot.live.providerType);
  if (typeof ProviderClass !== "function") {
    throw new Error(`registered Zen live-folder provider is unavailable: ${snapshot.live.providerType}`);
  }
  const validator = trustedBrowserProviderValidator(snapshot.live.providerType);
  if (!validator) {
    throw new Error(`registered Zen live-folder provider has no trusted schema: ${snapshot.live.providerType}`);
  }
  const data = trustedBrowserLiveData(
    snapshot.live.providerType,
    snapshot.live.serializedState,
  );
  if (!data) {
    throw new Error(`validated Zen live-folder settings are incompatible: ${snapshot.live.providerType}`);
  }
  return { ProviderClass, data };
}

function restoreBrowserLiveProvider(manager, folder, snapshot, ownedLiveStates) {
  const { ProviderClass, data } = browserLiveProviderPreflight(manager, snapshot);

  if (manager.liveFolders.has(folder.id)) {
    throw new Error(`Zen live-folder ID is already manager-owned: ${folder.id}`);
  }
  const provider = new ProviderClass({ id: folder.id, state: data.state, manager });
  const dismissedItems = remapDismissedItems(snapshot, folder.id)
    .filter(itemId => !manager.dismissedItems.has(itemId));
  manager.liveFolders.set(folder.id, provider);
  ownedLiveStates.set(folder, { provider, dismissedItems });
  for (const itemId of dismissedItems) manager.dismissedItems.add(itemId);
  return provider;
}

function startBrowserRestoredLiveProvider(manager, folder, provider, tabsState, ownedLiveStates) {
  if (
    manager?.liveFolders?.get(folder.id) !== provider
    || ownedLiveStates.get(folder)?.provider !== provider
  ) {
    throw new Error(`Zen live-folder provider ownership changed before start: ${folder.id}`);
  }
  provider.tabsState = tabsState.map(state => ({ ...state }));
  try {
    provider.start();
    manager.saveState();
    return provider;
  } catch (error) {
    try { provider.stop?.(); } catch {}
    throw error;
  }
}

async function rollbackBrowserCreatedFolder(
  host,
  manager,
  folder,
  ownedFolders,
  ownedLiveStates,
  colorManager,
  ownedColorStates,
) {
  if (!ownedFolders.has(folder)) return false;
  const failures = [];
  const liveOwnership = ownedLiveStates.get(folder);
  let managerChanged = false;
  if (liveOwnership) {
    try { liveOwnership.provider.stop?.(); } catch {}
    if (manager?.liveFolders?.get(folder.id) === liveOwnership.provider) {
      manager.liveFolders.delete(folder.id);
      managerChanged = true;
    }
    for (const itemId of liveOwnership.dismissedItems) {
      if (manager.dismissedItems.delete(itemId)) managerChanged = true;
    }
  }
  if (managerChanged) {
    try { manager.saveState?.(); } catch {}
  }
  const colorState = ownedColorStates.get(folder);
  if (colorState) {
    try {
      if (colorManager?.restoreLedgerState?.(folder, colorState) !== true) {
        throw new Error(`folder colour rollback was rejected: ${folder.id}`);
      }
    } catch (cause) {
      failures.push(new Error(`failed to roll back folder colour ${folder.id}`, { cause }));
    }
  }
  try {
    if (host.document?.getElementById?.(folder.id) === folder) await folder.delete();
  } catch (cause) {
    failures.push(new Error(`failed to delete transaction-created folder ${folder.id}`, { cause }));
  }
  ownedLiveStates.delete(folder);
  ownedColorStates.delete(folder);
  ownedFolders.delete(folder);
  if (failures.length) {
    throw new AggregateError(failures, `failed to roll back created folder ${folder.id}`);
  }
  return true;
}

export function createBrowserFolderColorAdapters(host) {
  const prefs = host.Services?.prefs;
  const observers = new Map();
  return {
    readLedger: () => prefs?.getStringPref?.(FOLDER_COLOR_LEDGER_PREF, "") ?? "",
    readBindings: () => prefs?.getStringPref?.(FOLDER_COLOR_BINDINGS_PREF, "") ?? "",
    writeBindings: value => {
      if (typeof prefs?.setStringPref !== 'function') throw Error('Firefox string preference storage is unavailable');
      prefs.setStringPref(FOLDER_COLOR_BINDINGS_PREF, value);
    },
    writeLedger: value => {
      if (typeof prefs?.setStringPref !== "function") {
        throw new Error("Firefox string preference storage is unavailable");
      }
      prefs.setStringPref(FOLDER_COLOR_LEDGER_PREF, value);
    },
    addLedgerObserver: callback => {
      if (typeof prefs?.addObserver !== "function") return;
      const observer = {
        observe: (_subject, topic, property) => {
          if (
            topic === "nsPref:changed"
            && [FOLDER_COLOR_LEDGER_PREF, FOLDER_COLOR_BINDINGS_PREF, "folder-colors.v1", "folder-color-presets.v1"].includes(property)
          ) callback();
        },
      };
      observers.set(callback, observer);
      prefs.addObserver(FOLDER_COLOR_LEDGER_PREF, observer);
      prefs.addObserver(FOLDER_COLOR_BINDINGS_PREF, observer);
    },
    removeLedgerObserver: callback => {
      const observer = observers.get(callback);
      if (!observer) return;
      observers.delete(callback);
      prefs?.removeObserver?.(FOLDER_COLOR_LEDGER_PREF, observer);
      prefs?.removeObserver?.(FOLDER_COLOR_BINDINGS_PREF, observer);
    },
    now: () => Date.now(),
    listFolders: () => Array.from(host.document?.querySelectorAll?.("zen-folder") ?? []),
    tabContainer: () => host.gBrowser?.tabContainer ?? null,
    createMutationObserver: callback => typeof host.MutationObserver === "function"
      ? new host.MutationObserver(callback)
      : null,
    getFolderId: folder => {
      const id = folder?.id;
      return id === null || id === undefined || id === "" ? null : String(id);
    },
    isFolder: folder => folder?.isZenFolder === true,
    projectColor: (folder, color) => {
      folder.setAttribute?.("data-better-zen-folders-color", color);
      folder.style?.setProperty?.("--better-zen-folders-custom-color", color);
      folder.style?.setProperty?.("--better-zen-folders-folder-color", color);
    },
    clearProjectedColor: folder => {
      folder.removeAttribute?.("data-better-zen-folders-color");
      folder.style?.removeProperty?.("--better-zen-folders-custom-color");
      folder.style?.removeProperty?.("--better-zen-folders-folder-color");
    },
    dispatchColorChanged: (folder, color) => {
      if (typeof host.CustomEvent !== "function") return;
      folder.dispatchEvent?.(new host.CustomEvent("BetterZenFolderColorChanged", {
        bubbles: true,
        detail: { color },
      }));
    },
    warn: message => host.console?.warn?.(message),
  };
}

const FOLDER_COLOR_MENU_ITEM_ID = "better-zen-folders-folder-colour";
const FOLDER_COLOR_PANEL_ID = "better-zen-folders-colour-panel";
const OWNED_COLOR_UI_ATTRIBUTE = "data-better-zen-folders-colour-owned";
// Only commands created by BZF are eligible. Native New Subfolder is intercepted,
// not owned; Sticky is a functional checkbox and never enters this icon channel.
const BZF_ICON_COMMANDS = new Set(["better-zen-folders-folder-colour", "better-zen-folders-new-tab-menu", "better-zen-folders-copy-drag-diagnostics", "better-zen-folders-move-folder",
  ...['pin-url','reset-url','edit-url','update-url','url-pin-menu'].map(name => `better-zen-folders-${name}`),
  'context_unpinTab','context_unpinSelectedTabs']);
const BZF_COMMAND_ICON_STATE = new WeakMap();
const BZF_COMMAND_ICON_MODE = "data-better-zen-folders-command-icon-mode";
const BZF_COMMAND_IMAGE = "--better-zen-folders-command-image";

export function setStickyMenuDecoration(item, mode, host = item?.ownerDocument?.defaultView, marker = 'underline') {
  if (!item || !['better-zen-folders-sticky-tab', 'better-zen-folders-sticky-folder'].includes(item.id)) return;
  const selector = ':scope > .better-zen-folders-sticky-menu-mark';
  if (!['mod', 'compatibility'].includes(mode)) {
    item.querySelector?.(selector)?.remove();
    return;
  }
  // Gecko builds these children lazily and clears its initial child content.
  // Render first, then put the decoration between the check slot and labels.
  // The labels flex to fill the row; anything after them lands at the far edge.
  item.render?.();
  const label = item.querySelector?.(':scope > .menu-text, :scope > .menu-highlightable-text');
  if (!label || !host?.document?.createElementNS) return;
  let mark = item.querySelector(selector);
  if (!mark) {
    const svgNamespace = 'http://www.w3.org/2000/svg';
    mark = host.document.createElementNS(svgNamespace, 'svg');
    mark.setAttribute('class', 'better-zen-folders-sticky-menu-mark');
    mark.setAttribute('viewBox', '0 0 100 100');
    mark.setAttribute('width', '12');
    mark.setAttribute('height', '12');
    mark.setAttribute('fill', 'currentColor');
    mark.setAttribute('aria-hidden', 'true');
    mark.setAttribute('focusable', 'false');
    mark.setAttribute('pointer-events', 'none');
  }
  const style = marker === 'corner' ? 'corner' : 'underline';
  if (mark.getAttribute('data-bzf-sticky-marker') !== style) {
    mark.replaceChildren();
    mark.setAttribute('data-bzf-sticky-marker', style);
    const path = host.document.createElementNS('http://www.w3.org/2000/svg', 'path');
    if (style === 'corner') {
      path.setAttribute('d', 'M20 0H76Q100 0 83 17L17 83Q0 100 0 76V20Q0 0 20 0Z');
    } else {
      path.setAttribute('d', item.id.endsWith('-folder')
        ? 'M18 60V18Q18 12 24 12H42L52 24H76Q82 24 82 30V60Q82 66 76 66H24Q18 66 18 60Z M18 88H82'
        : 'M24 12H76Q82 12 82 18V60Q82 66 76 66H24Q18 66 18 60V18Q18 12 24 12Z M18 88H82');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '10');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
    }
    mark.appendChild(path);
  }
  if (mark.nextElementSibling !== label) item.insertBefore(mark, label);
}

export function setBzfCommandIcon(item, image, mode, host = item?.ownerDocument?.defaultView) {
  if (!item || !BZF_ICON_COMMANDS.has(item.id || item.getAttribute?.("id"))
    || ["checkbox", "radio"].includes(item.getAttribute?.("type"))) return;
  const state = BZF_COMMAND_ICON_STATE.get(item);
  const slot = item.querySelector?.(":scope > .menu-icon");
  if (state) {
    const currentImage = item.getAttribute("image");
    const source = slot?.getAttribute?.("srcset") ?? null;
    if (state.mode === "mod" && currentImage === state.image) {
      if (state.previousImage === null) item.removeAttribute("image");
      else item.setAttribute("image", state.previousImage);
      // Attribute inheritance must not erase a later direct-slot writer.
      if (source && source !== state.image) slot.setAttribute("srcset", source);
    }
    if (state.addedClass && (!currentImage || currentImage === state.image)
      && !slot?.getAttribute?.("src")
      && (!source || source === state.image)) item.classList?.remove?.("menuitem-iconic");
    if (item.getAttribute(BZF_COMMAND_ICON_MODE) === state.mode) item.removeAttribute(BZF_COMMAND_ICON_MODE);
    if (state.mode === "compatibility" && item.style?.getPropertyValue?.(BZF_COMMAND_IMAGE) === state.cssImage) {
      if (state.previousCss) item.style.setProperty(BZF_COMMAND_IMAGE, state.previousCss, state.previousPriority);
      else item.style.removeProperty(BZF_COMMAND_IMAGE);
    }
    BZF_COMMAND_ICON_STATE.delete(item);
  }
  if (!["mod", "compatibility"].includes(mode)) return;
  // Preserve existing native images, including direct native-slot writers.
  if (item.getAttribute("image") || slot?.getAttribute?.("src") || slot?.getAttribute?.("srcset")) return;
  // Yield to external slot/pseudo painting. CMI's background is handled by the
  // compatibility CSS cascade, without guessing a pack or copying its spacing.
  if (host?.getComputedStyle) {
    const painted = value => value && !["none", "normal", "auto", "initial", "unset", '""'].includes(value.trim());
    try {
      for (const node of [item, slot].filter(Boolean)) {
        const style = host.getComputedStyle(node);
        const properties = ["list-style-image", "mask-image", "content", "--menuitem-icon"];
        if (node === slot || mode === "mod") properties.push("background-image");
        if (properties.some(key => painted(style.getPropertyValue(key)))) return;
      }
      for (const pseudo of ["::before", "::after"]) {
        const style = host.getComputedStyle(item, pseudo);
        if (["content", "background-image", "mask-image"].some(key => painted(style.getPropertyValue(key)))) return;
      }
    } catch { return; }
  }
  const next = {mode, image, previousImage:item.getAttribute("image"),
    addedClass:mode === "mod" && !item.classList?.contains?.("menuitem-iconic"),
    cssImage:`url("${image}")`, previousCss:item.style?.getPropertyValue?.(BZF_COMMAND_IMAGE) ?? "",
    previousPriority:item.style?.getPropertyPriority?.(BZF_COMMAND_IMAGE) ?? ""};
  BZF_COMMAND_ICON_STATE.set(item, next);
  item.setAttribute(BZF_COMMAND_ICON_MODE, mode);
  if (mode === "mod") {
    item.classList?.add?.("menuitem-iconic");
    item.setAttribute("image", image);
  } else {
    item.style?.setProperty?.(BZF_COMMAND_IMAGE, next.cssImage);
  }
}

export function createBrowserFolderColorMenuAdapters(host, preferences = null) {
  const document = host.document;
  const xhtmlNamespace = "http://www.w3.org/1999/xhtml";
  let commandIconMode = preferences?.get?.("commandIconMode") ?? "mod";
  let panel = null;
  let input = null;
  let customButton = null;
  let resetButton = null;
  let copyDiagnosticButton = null;
  let copyDiagnosticStatus = null;
  let colourPanelContent = null;
  let diagnosticCopyGeneration = 0;
  let swatchButtons = [];
  const paletteSubscriptions = [];
  let activePicker = null;
  let customPickerGeneration = 0;
  let colourDiagnosticSequence = (Array.isArray(host.__betterZenFoldersColourDiagnostics)
    ? host.__betterZenFoldersColourDiagnostics : []).reduce((last, record) =>
    Number.isSafeInteger(record?.diagnosticId) ? Math.max(last, record.diagnosticId) : last, 0);
  let colourDiagnosticLifetime = 0;
  let latestColourDiagnostic = null;
  const colourDiagnosticFrames = new Set();
  const maxColourDiagnosticRecords = 200;
  const diagnosticRecords = () => Array.isArray(host.__betterZenFoldersColourDiagnostics)
    ? host.__betterZenFoldersColourDiagnostics : [];
  const updateSwatches = () => {
    if (!activePicker) return;
    const palette = folderColorSwatches(preferences);
    const color = normalizeFolderColor(typeof activePicker.actions.read === 'function'
      ? activePicker.actions.read() : activePicker.initialColor);
    const preset = activePicker.actions.readPreset?.();
    for (const [index, swatch] of swatchButtons.entries()) {
      const [name, value] = palette[index];
      swatch.setAttribute('aria-label', `${name} folder colour`);
      swatch.setAttribute('title', name);swatch.setAttribute('tooltiptext', name);
      swatch.setAttribute('data-better-zen-folders-colour-swatch', value);
      swatch.style?.setProperty?.('--better-zen-folders-swatch-color', value);
      const selected = typeof activePicker.actions.readPreset === 'function' ? preset === index + 1 : color === value;
      swatch.setAttribute('aria-pressed', String(selected));
      swatch.toggleAttribute('data-better-zen-folders-colour-selected', selected);
    }
    input.value = color ?? '#808080';
    panel?.style?.setProperty?.('--better-zen-folders-picker-color',input.value);
    resetButton.disabled = color === null;
    resetButton.setAttribute('aria-disabled', String(color === null));
  };
  const releaseActivePicker = () => {
    activePicker?.folder?.removeEventListener?.('BetterZenFolderColorChanged', updateSwatches);
    activePicker = null;
  };
  const diagnosticComputed = (node, pseudo = null) => {
    try { return node ? host.getComputedStyle?.(node, pseudo) ?? null : null; }
    catch { return null; }
  };
  const diagnosticFocus = () => {
    try { return typeof document.hasFocus === "function" ? document.hasFocus() : null; }
    catch { return null; }
  };
  const captureColourDiagnostic = picker => {
    const folder = picker.folder;
    const svg = folder?.querySelector?.(DIRECT_FOLDER_ICON_SVG_SELECTOR);
    const resources = new Map();
    const tokens = picker.diagnosticResources;
    const safePaint = value => String(value ?? "").replace(
      /url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^)]*))\s*\)/gi,
      (_match, quoted, single, bare) => {
        const address = (quoted ?? single ?? bare).trim();
        if (!tokens.has(address)) tokens.set(address, `resource-${tokens.size + 1}`);
        const token = tokens.get(address);
        resources.set(token, address);
        return `url(${token})`;
      });
    const styleValues = (node, fields, pseudo = null) => {
      const style = diagnosticComputed(node, pseudo);
      return Object.fromEntries(fields.map(([key, property]) =>
        [key, safePaint(style?.getPropertyValue?.(property))]));
    };
    const effects = [["filter", "filter"], ["opacity", "opacity"], ["transform", "transform"],
      ["backdropFilter", "backdrop-filter"], ["mixBlendMode", "mix-blend-mode"],
      ["backgroundColor", "background-color"], ["backgroundImage", "background-image"]];
    const element = node => /^(?:svg|rect|path|g|image|ellipse|div|hbox|vbox|box|window|html|body|zen-folder|tab-group|zen-workspace|arrowscrollbox|scrollbox|toolbar|toolbox)$/.test(node?.localName)
      ? node.localName : "other";
    const ancestorPaint = [];
    for (let node = svg?.parentElement ?? folder; node; node = node.parentElement) {
      ancestorPaint.push({element: element(node), ...styleValues(node, effects),
        before: styleValues(node, effects, "::before")});
    }
    let rect = null;
    try {
      const bounds = svg?.getBoundingClientRect?.();
      if (bounds) rect = Object.fromEntries(["x", "y", "width", "height"].map(key =>
        [key, Number.isFinite(bounds[key]) ? bounds[key] : null]));
    } catch { /* Detached layout is unknown, not zero geometry. */ }
    const descendantPaint = Array.from(svg?.querySelectorAll?.(
      ".front, .back, .icon, .icon image, .dots, .dots > *") ?? []).map(node => ({
      element: element(node), part: String(node.getAttribute?.("class") ?? "").split(/\s+/)
        .filter(part => /^(?:front|back|icon|dots)$/.test(part)).join(" "),
      ...styleValues(node, [["fill", "fill"], ["fillOpacity", "fill-opacity"],
        ["stroke", "stroke"], ["strokeOpacity", "stroke-opacity"], ["filter", "filter"],
        ["opacity", "opacity"], ["transform", "transform"], ["display", "display"], ["visibility", "visibility"]]),
    }));
    const svgPaint = styleValues(svg, [["iconFilter", "filter"], ["iconOpacity", "opacity"], ["transform", "transform"]]);
    const gradientResources = [];
    for (const [resource, address] of resources) {
      const entry = {resource, resolvedNode: null, resolution: "external-or-unresolved"};
      try {
        const base = new URL(document.documentURI);
        const reference = new URL(address, base);
        const id = decodeURIComponent(reference.hash.slice(1));
        base.hash = ""; reference.hash = "";
        if (id && base.href === reference.href) {
          const target = document.getElementById(id);
          entry.resolution = target ? "local-non-gradient" : "missing";
          if (["linearGradient", "radialGradient"].includes(target?.localName)) {
            if (!picker.diagnosticNodes.has(target)) {
              picker.diagnosticNodes.set(target, `node-${++picker.diagnosticNodeSequence}`);
            }
            Object.assign(entry, {resolution: "local-gradient", type: target.localName,
              resolvedNode: picker.diagnosticNodes.get(target),
              insideSvg: svg?.contains?.(target) === true,
              matches: Array.from(document.querySelectorAll?.("linearGradient[id], radialGradient[id]") ?? [])
                .filter(node => node.id === id).length});
            for (const key of ["x1", "x2", "y1", "y2", "cx", "cy", "r", "fx", "fy"]) {
              const value = target.getAttribute?.(key);
              entry[key] = typeof value === "string" && /^[\d.eE+%\s,-]+$/.test(value) ? value : null;
            }
            entry.gradientUnits = ["userSpaceOnUse", "objectBoundingBox"].includes(target.getAttribute?.("gradientUnits"))
              ? target.getAttribute("gradientUnits") : null;
            const transform = target.getAttribute?.("gradientTransform") ?? "";
            entry.gradientTransform = /^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\([\d.eE+\s,()-]+\)\s*)*$/.test(transform) ? transform : null;
            entry.stops = Array.from(target.querySelectorAll?.("stop") ?? []).map(stop => {
              const offset = stop.getAttribute?.("offset");
              return {offset: typeof offset === "string" && /^[\d.eE+%-]+$/.test(offset) ? offset : null,
                ...styleValues(stop, [["color", "stop-color"], ["opacity", "stop-opacity"]])};
            });
          }
        }
      } catch { /* No resource is fetched or its URL exported. */ }
      gradientResources.push(entry);
    }
    let persistenceReadStatus = "unavailable", persistedColor = null;
    if (typeof host.Services?.prefs?.getStringPref === "function" && folder?.id) {
      try {
        const raw = host.Services.prefs.getStringPref(FOLDER_COLOR_LEDGER_PREF, "");
        const ledger = raw === "" ? {version: FOLDER_COLOR_RECORD_VERSION, entries: []} : JSON.parse(raw);
        if (ledger?.version !== FOLDER_COLOR_RECORD_VERSION || !Array.isArray(ledger.entries)) {
          persistenceReadStatus = "invalid";
        } else {
          const entries = ledger.entries.filter(entry => entry?.id === String(folder.id));
          persistedColor = entries.length ? normalizeFolderColor(entries[0].color) : null;
          persistenceReadStatus = entries.length > 1 || (entries.length && !persistedColor) ? "invalid" : "read";
          if (persistenceReadStatus === "invalid") persistedColor = null;
        }
      } catch { persistenceReadStatus = "error"; }
    }
    const build = String(host.Services?.appinfo?.appBuildID ?? "");
    return {
      time: Date.now(), diagnosticBuild: "0.3.24 / preset-links", browserBuild: /^\d{14}$/.test(build) ? build : null,
      storedColor: picker.actions.read?.() ?? null, persistenceReadStatus, persistedColor,
      linkedPreset: picker.actions.readPreset?.() ?? null,
      projectedColor: normalizeFolderColor(folder?.style?.getPropertyValue?.("--better-zen-folders-custom-color")),
      ...styleValues(folder, [["guideColor", "--better-zen-folders-folder-color"],
        ["frontColor", "--zen-folder-front-bgcolor"], ["backColor", "--zen-folder-behind-bgcolor"], ["strokeColor", "--zen-folder-stroke"]]),
      iconFilter: svgPaint.iconFilter, iconOpacity: svgPaint.iconOpacity, descendantPaint, ancestorPaint, gradientResources,
      outerSvg: {rect, transform: svgPaint.transform,
        state: ["open", "close", "closed"].includes(svg?.getAttribute?.("state")) ? svg.getAttribute("state") : null,
        active: svg?.getAttribute?.("active") === "true"},
      targetConnected: folder?.isConnected !== false, svgReplaced: svg !== picker.diagnosticSvg,
      focused: diagnosticFocus(), frameSampling: typeof host.requestAnimationFrame === "function" ? "available" : "unavailable",
    };
  };
  const diagnosticJson = () => {
    const fields = ["phase", "time", "initial", "returnedColorRaw", "returnedColor",
      "storedColor", "persistenceReadStatus", "persistedColor", "projectedColor", "linkedPreset",
      "guideColor", "frontColor", "backColor", "strokeColor", "iconFilter", "iconOpacity",
      "frameSampling", "frameTime", "applyResult", "diagnosticId", "diagnosticBuild", "browserBuild",
      "targetConnected", "svgReplaced", "focused", "settleStatus"];
    const paintFields = ["element", "part", "fill", "fillOpacity", "stroke", "strokeOpacity",
      "filter", "opacity", "transform", "display", "visibility"];
    const select = (record, keys) => Object.fromEntries(keys.filter(key =>
      Object.hasOwn(record, key)).map(key => {
      const value = record[key];
      if (key === "resolvedNode") return [key, typeof value === "string" && /^node-\d+$/.test(value) ? value : null];
      if (key === "part") return [key, String(value ?? "").split(/\s+/)
        .filter(part => /^(?:front|back|icon|dots)$/.test(part)).join(" ")];
      if (typeof value === "string") {
        if (key === "returnedColorRaw" && !/^\s*(?:#[a-f0-9]{3,8})?\s*$/i.test(value)) {
          return [key, "[non-colour value]"];
        }
        // Computed SVG fill/filter can contain a document URL plus a gradient ID.
        return [key, value.replace(/url\(\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^)]*)\s*\)/gi,
          match => /^url\(resource-\d+\)$/.test(match) ? match : "url([redacted])")
          .replace(/\b[a-z][a-z0-9+.-]*:(?:\/\/)?[^\s)]+/gi, "[redacted]")];
      }
      return [key, typeof value === "number" || typeof value === "boolean" ? value : null];
    }));
    return JSON.stringify(diagnosticRecords().slice(-maxColourDiagnosticRecords).map(record => ({
      ...select(record, fields),
      descendantPaint: Array.isArray(record.descendantPaint)
        ? record.descendantPaint.map(paint => select(paint, paintFields)) : [],
      ancestorPaint: Array.isArray(record.ancestorPaint) ? record.ancestorPaint.map(paint => ({
        ...select(paint, ["element", "filter", "opacity", "transform", "backdropFilter", "mixBlendMode", "backgroundColor", "backgroundImage"]),
        before: select(paint.before ?? {}, ["filter", "opacity", "transform", "backdropFilter", "mixBlendMode", "backgroundColor", "backgroundImage"]),
      })) : [],
      outerSvg: record.outerSvg ? {...select(record.outerSvg, ["state", "active", "transform"]),
        rect: record.outerSvg.rect ? select(record.outerSvg.rect, ["x", "y", "width", "height"]) : null} : null,
      gradientResources: Array.isArray(record.gradientResources) ? record.gradientResources.map(resource => ({
        ...select(resource, ["resource", "resolvedNode", "resolution", "type", "insideSvg", "matches", "gradientUnits", "gradientTransform",
          "x1", "x2", "y1", "y2", "cx", "cy", "r", "fx", "fy"]),
        stops: Array.isArray(resource.stops) ? resource.stops.map(stop => select(stop, ["offset", "color", "opacity"])) : [],
      })) : [],
    })), null, 2);
  };
  const refreshDiagnosticCopy = () => {
    diagnosticCopyGeneration++;
    const hasRecords = diagnosticRecords().length > 0;
    if (hasRecords && !copyDiagnosticButton && colourPanelContent) {
      copyDiagnosticButton = makeCommandButton("Copy Colour Diagnostic", "copy-diagnostic", copyDiagnostic);
      copyDiagnosticStatus = document.createElementNS(xhtmlNamespace, "div");
      copyDiagnosticStatus.setAttribute("data-better-zen-folders-colour-copy-status", "true");
      copyDiagnosticStatus.setAttribute("role", "status");
      copyDiagnosticStatus.setAttribute("aria-live", "polite");
      colourPanelContent.appendChild(copyDiagnosticButton);
      colourPanelContent.appendChild(copyDiagnosticStatus);
    }
    if (!copyDiagnosticButton) return;
    copyDiagnosticButton.hidden = !hasRecords;
    copyDiagnosticButton.disabled = !hasRecords;
    copyDiagnosticButton.setAttribute("aria-disabled", String(!hasRecords));
    // The shared command style has display:flex, which can override HTML hidden.
    if (hasRecords) copyDiagnosticButton.style.removeProperty("display");
    else copyDiagnosticButton.style.setProperty("display", "none", "important");
    if (copyDiagnosticStatus) {
      copyDiagnosticStatus.hidden = true;
      copyDiagnosticStatus.textContent = "";
    }
  };
  const copyDiagnostic = async () => {
    if (!activePicker || !copyDiagnosticButton || !copyDiagnosticStatus || copyDiagnosticButton.hidden
      || copyDiagnosticButton.disabled || host.closed || !diagnosticRecords().length) return;
    const generation = ++diagnosticCopyGeneration;
    const lifetime = colourDiagnosticLifetime;
    const button = copyDiagnosticButton;
    const status = copyDiagnosticStatus;
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
    status.hidden = false;
    status.textContent = "Copying colour diagnostic…";
    let copied = false;
    try {
      latestColourDiagnostic?.trace("copy");
      const text = diagnosticJson();
      const classes = host.Cc ?? host.Components?.classes;
      const interfaces = host.Ci ?? host.Components?.interfaces;
      const factory = classes?.["@mozilla.org/widget/clipboardhelper;1"];
      let result;
      if (factory && interfaces?.nsIClipboardHelper) {
        // Native nsIClipboardHelper.copyString is void; XPCOM failure throws.
        result = await factory.getService(interfaces.nsIClipboardHelper).copyString(text);
      } else if (typeof host.navigator?.clipboard?.writeText === "function") {
        result = await host.navigator.clipboard.writeText(text);
      } else throw new Error("Clipboard unavailable");
      copied = result !== false;
    } catch { /* Report rejection; never retry through a second clipboard writer. */ }
    if (generation !== diagnosticCopyGeneration || lifetime !== colourDiagnosticLifetime
      || button !== copyDiagnosticButton || !panel?.parentElement || host.closed) return;
    button.disabled = false;
    button.setAttribute("aria-disabled", "false");
    status.textContent = copied ? "Colour diagnostic copied." : "Could not copy. Try again.";
  };

  const hidePanel = () => panel?.hidePopup?.();
  const makeCommandButton = (label, action, onCommand, { customPreview = false } = {}) => {
    const button = document.createElementNS(xhtmlNamespace, "button");
    button.setAttribute("type", "button");
    button.setAttribute(
      "class",
      `better-zen-folders-colour-command better-zen-folders-colour-command-${action}`,
    );
    button.setAttribute("data-better-zen-folders-colour-action", action);
    button.textContent = label;
    if (customPreview) {
      const preview = document.createElementNS(xhtmlNamespace, "span");
      preview.setAttribute("class", "better-zen-folders-colour-custom-preview");
      preview.setAttribute("aria-hidden", "true");
      button.appendChild(preview);
    }
    button.addEventListener("click", onCommand);
    return button;
  };
  const ensurePanel = () => {
    if (panel?.parentElement) return panel;
    const existing = document.getElementById?.(FOLDER_COLOR_PANEL_ID);
    if (existing) {
      if (existing.getAttribute?.(OWNED_COLOR_UI_ATTRIBUTE) !== "true") return null;
      panel = existing;
      input = panel.querySelector?.('input[type="color"]') ?? null;
      customButton = panel.querySelector?.(
        '[data-better-zen-folders-colour-action="custom"]',
      ) ?? null;
      resetButton = panel.querySelector?.('[data-better-zen-folders-colour-action="reset"]') ?? null;
      copyDiagnosticButton = panel.querySelector?.('[data-better-zen-folders-colour-action="copy-diagnostic"]') ?? null;
      copyDiagnosticStatus = panel.querySelector?.('[data-better-zen-folders-colour-copy-status="true"]') ?? null;
      colourPanelContent = panel.querySelector?.(".better-zen-folders-colour-panel-content") ?? null;
      swatchButtons = Array.from(panel.querySelectorAll?.(
        "[data-better-zen-folders-colour-swatch]",
      ) ?? []);
      return input && customButton && resetButton && swatchButtons.length ? panel : null;
    }

    panel = document.createXULElement("panel");
    panel.setAttribute("id", FOLDER_COLOR_PANEL_ID);
    panel.setAttribute("class", "better-zen-folders-colour-panel");
    panel.setAttribute(OWNED_COLOR_UI_ATTRIBUTE, "true");
    panel.setAttribute("type", "arrow");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("orient", "vertical");
    panel.setAttribute("aria-label", "Folder Colour");

    const content = document.createXULElement("vbox");
    content.setAttribute("class", "better-zen-folders-colour-panel-content");
    colourPanelContent = content;
    const label = document.createXULElement("label");
    label.setAttribute("class", "better-zen-folders-colour-panel-title");
    label.setAttribute("value", "Folder Colour");
    content.appendChild(label);

    const swatches = document.createXULElement("hbox");
    swatches.setAttribute("class", "better-zen-folders-colour-swatches");
    swatches.setAttribute("role", "group");
    swatches.setAttribute("aria-label", "Folder colour presets");
    swatchButtons = [];
    for (const [index, [name, color]] of DEFAULT_FOLDER_COLOR_SWATCHES.entries()) {
      const swatch = document.createElementNS(
        xhtmlNamespace,
        "button",
      );
      swatch.setAttribute("type", "button");
      swatch.setAttribute("closemenu", "none");
      swatch.addEventListener("click", () => {
        if (!activePicker) return;
        if (typeof activePicker.actions.applyPreset === 'function') activePicker.actions.applyPreset(index + 1);
        else activePicker.actions.apply(swatch.getAttribute("data-better-zen-folders-colour-swatch"));
        hidePanel();
      });
      swatch.setAttribute("class", "better-zen-folders-colour-swatch");
      swatch.setAttribute("aria-label", `${name} folder colour`);
      swatch.setAttribute("aria-pressed", "false");
      swatch.setAttribute("title", name);
      swatch.setAttribute("tooltiptext", name);
      swatch.setAttribute("data-better-zen-folders-colour-swatch", color);
      swatch.style?.setProperty?.("--better-zen-folders-swatch-color", color);
      swatches.appendChild(swatch);
      swatchButtons.push(swatch);
    }
    content.appendChild(swatches);

    input = document.createElementNS(xhtmlNamespace, "input");
    input.setAttribute("type", "color");
    input.setAttribute("aria-label", "Choose folder colour");
    input.setAttribute("class", "better-zen-folders-colour-input");
    input.setAttribute("tabindex", "-1");
    input.setAttribute("aria-hidden", "true");
    input.setAttribute("id", "better-zen-folders-colour-input");
    customButton = makeCommandButton(
      "Custom Colour…",
      "custom",
      () => {
        if (!activePicker) return;
        const picker = activePicker;
        const initial = normalizeFolderColor(input?.value) ?? "#808080";
        // Temporary local evidence for the still-unreproduced native Cancel report.
        // No names, tab data, folder identities, network, or persistent file writes.
        const diagnosticId = ++colourDiagnosticSequence;
        const lifetime = colourDiagnosticLifetime;
        let delayed = null, deadline = null, frame = null;
        const current = () => latestColourDiagnostic?.id === diagnosticId
          && lifetime === colourDiagnosticLifetime && !host.closed;
        const clearDelayed = () => {
          for (const timer of [delayed, deadline]) {
            if (timer) { try { host.clearTimeout?.(timer.id); } catch { /* Cleanup continues. */ } }
          }
          delayed = deadline = null;
          host.removeEventListener?.("focus", onFocus);
        };
        const cancel = () => {
          clearDelayed();
          if (frame !== null) {
            try { host.cancelAnimationFrame?.(frame); } catch { /* Lifetime guard remains. */ }
            colourDiagnosticFrames.delete(frame);
            frame = null;
          }
        };
        const trace = (phase, returnedColor = null, outcome = {}, snapshot = null) => {
          if (!current()) return;
          try {
            const record = {
              ...(snapshot ?? captureColourDiagnostic(picker)), phase, diagnosticId, initial,
              returnedColorRaw: typeof returnedColor === "string" ? returnedColor : null,
              returnedColor: normalizeFolderColor(returnedColor),
              ...outcome,
            };
            const records = (host.__betterZenFoldersColourDiagnostics ??= []);
            records.push(record);
            if (records.length > maxColourDiagnosticRecords) {
              records.splice(0, records.length - maxColourDiagnosticRecords);
            }
            host.console?.debug?.("Better Zen Folders colour diagnostic", JSON.stringify(record));
          } catch { /* Diagnostics must never affect colour acceptance. */ }
        };
        const onFocus = () => {
          if (!deadline || !current() || diagnosticFocus() === false) return;
          if (delayed) host.clearTimeout?.(delayed.id);
          const ticket = {};
          delayed = ticket;
          ticket.id = host.setTimeout(() => {
            if (delayed !== ticket || !current()) return;
            delayed = null;
            const focus = diagnosticFocus();
            if (focus === false) return; // Deadline bounds waiting for another focus event.
            let settleStatus = focus === null ? "focus-unavailable" : "sampled";
            try {
              const svg = picker.folder?.querySelector?.(DIRECT_FOLDER_ICON_SVG_SELECTOR);
              if (focus === true && svg?.getAnimations?.({subtree: true})?.some(animation =>
                animation.playState === "running" || animation.pending === true)) settleStatus = "animations-running";
            } catch { settleStatus = "animations-unavailable"; }
            clearDelayed();
            // A delayed computed-style sample is not proof of compositor pixels.
            trace("settled", null, {settleStatus});
          }, 400);
        };
        const sampleSettled = () => {
          if (typeof host.setTimeout !== "function" || typeof host.clearTimeout !== "function") return;
          try {
            clearDelayed();
            host.addEventListener?.("focus", onFocus);
            const ticket = {};
            deadline = ticket;
            ticket.id = host.setTimeout(() => {
              if (deadline !== ticket) return;
              clearDelayed();
              trace("settled", null, {settleStatus: diagnosticFocus() === false ? "focus-not-returned" : "timeout"});
            }, 2000);
            onFocus();
          } catch { clearDelayed(); }
        };
        latestColourDiagnostic?.cancel();
        latestColourDiagnostic = {id: diagnosticId, trace, cancel};
        const sampleNextFrame = () => {
          sampleSettled();
          if (typeof host.requestAnimationFrame !== "function") return;
          try {
            const id = host.requestAnimationFrame(frameTime => {
              if (frame !== id || !current()) return;
              colourDiagnosticFrames.delete(id);
              frame = null;
              // rAF samples computed style before this frame's paint, not pixels
              // or the settled end of a CSS transition.
              trace("animation-frame", null, { frameTime });
            });
            frame = id;
            colourDiagnosticFrames.add(id);
          } catch { trace("animation-frame-unavailable", null, { frameSampling: "unavailable" }); }
        };
        const applyWithTrace = color => {
          try {
            const result = picker.actions.apply(color);
            trace(result === true ? "applied" : result === false ? "apply-rejected" : "apply-unconfirmed",
              null, { applyResult: typeof result === "boolean" ? result : null });
          } catch (error) {
            trace("apply-threw", null, { applyResult: null });
            throw error;
          }
        };
        if (picker.diagnosticBaseline) trace("pre-panel", null, {}, picker.diagnosticBaseline);
        trace("open");
        const classes = host.Cc ?? host.Components?.classes;
        const interfaces = host.Ci ?? host.Components?.interfaces;
        const factory = classes?.["@mozilla.org/colorpicker;1"];
        const browsingContext = host.browsingContext ?? host.docShell?.browsingContext;
        if (factory && interfaces?.nsIColorPicker && browsingContext) {
          const generation = ++customPickerGeneration;
          try {
            const native = factory.createInstance(interfaces.nsIColorPicker);
            native.init(browsingContext, "Folder Colour", initial, []);
            const callback = {
              // Native Windows previews are sampled from the dialog's colour box.
              // They are not accepted choices; never write them into the ledger.
              update(value) { trace("preview", value); },
              done(value) {
                if (generation !== customPickerGeneration) return;
                customPickerGeneration++;
                trace("completion", value);
                const color = normalizeFolderColor(value);
                if (color !== null && color !== initial && picker.folder?.isConnected !== false) {
                  applyWithTrace(color);
                } else trace("unchanged");
                sampleNextFrame();
              },
            };
            if (host.ChromeUtils?.generateQI) {
              callback.QueryInterface = host.ChromeUtils.generateQI(["nsIColorPickerShownCallback"]);
            }
            hidePanel();
            native.open(callback);
            return;
          } catch (error) {
            customPickerGeneration++;
            host.console?.error?.("Better Zen Folders: unable to open custom colour picker", error);
          }
        }
        // HTML colour inputs can emit change for a sampled Windows preview even
        // on Cancel. Never infer acceptance from that event. A missing native
        // component uses an explicit OK/Cancel hex prompt, not the unsafe path.
        const value = { value: initial };
        const generation = ++customPickerGeneration;
        hidePanel();
        const accepted = host.Services?.prompt?.prompt?.(
          host, "Folder Colour", "Custom Colour (#RRGGBB)", value, null, {value:false},
        );
        trace(accepted === true ? "prompt-accepted" : "prompt-cancelled", value.value);
        const color = normalizeFolderColor(value.value);
        if (accepted === true && color && generation === customPickerGeneration
          && picker.folder?.isConnected !== false) applyWithTrace(color);
        sampleNextFrame();
      },
      { customPreview: true },
    );
    resetButton = makeCommandButton("Reset to Default", "reset", () => {
      activePicker?.actions.reset();
      hidePanel();
    });
    content.appendChild(customButton);
    content.appendChild(resetButton);
    content.appendChild(input);
    panel.appendChild(content);
    panel.addEventListener("popupshown", () => {
      const selected = swatchButtons.find(
        swatch => swatch.getAttribute?.("aria-pressed") === "true",
      );
      (selected ?? swatchButtons[0] ?? customButton)?.focus?.();
    });
    panel.addEventListener("popuphidden", () => {
      releaseActivePicker();
      diagnosticCopyGeneration++;
    });

    const popupSet = document.getElementById?.("mainPopupSet") ?? document.documentElement;
    popupSet?.appendChild?.(panel);
    for (const name of ['customPaletteEnabled', ...Array.from({length:8},(_,i)=>`palette${i+1}`)]) {
      const unsubscribe = preferences?.subscribe?.(name, updateSwatches);
      if (unsubscribe) paletteSubscriptions.push(unsubscribe);
    }
    return panel.parentElement ? panel : null;
  };

  return {
    preferences,
    menuTarget: () => document.getElementById?.("zenFolderActions") ?? null,
    ensureMenuItem: () => {
      const existing = document.getElementById?.(FOLDER_COLOR_MENU_ITEM_ID);
      if (existing) {
        return existing.getAttribute?.(OWNED_COLOR_UI_ATTRIBUTE) === "true" ? existing : null;
      }
      const menu = document.getElementById?.("zenFolderActions");
      if (!menu) return null;
      const item = document.createXULElement("menuitem");
      item.setAttribute("id", FOLDER_COLOR_MENU_ITEM_ID);
      item.setAttribute("label", "Folder Colour…");
      item.setAttribute("aria-label", "Choose a custom folder colour");
      item.setAttribute(OWNED_COLOR_UI_ATTRIBUTE, "true");
      item.setAttribute("class", "better-zen-folders-folder-colour-menuitem");
      setBzfCommandIcon(item, "chrome://browser/skin/zen-icons/selectable/palette.svg", commandIconMode, host);
      item.setAttribute("data-better-zen-folders-colour-marker", "default");
      const anchor = document.getElementById?.("context_zenFolderChangeIcon");
      if (anchor?.parentElement === menu && typeof anchor.after === "function") anchor.after(item);
      else menu.appendChild?.(item);
      return item;
    },
    setMenuItemIconMode: (item, mode) => {
      commandIconMode = mode;
      setBzfCommandIcon(item, "chrome://browser/skin/zen-icons/selectable/palette.svg", mode, host);
    },
    getContextFolder: event => browserContextFolder(host, event),
    setMenuItemState: (item, { folder, color }) => {
      if (!item) return;
      setBzfCommandIcon(item, "chrome://browser/skin/zen-icons/selectable/palette.svg", commandIconMode, host);
      item.hidden = !folder;
      item.disabled = !folder;
      item.setAttribute(
        "data-better-zen-folders-colour-marker",
        color ? "custom" : "default",
      );
      if (color) {
        item.setAttribute("data-better-zen-folders-color", color);
        item.style?.setProperty?.("--better-zen-folders-menu-folder-color", color);
      } else {
        item.removeAttribute?.("data-better-zen-folders-color");
        item.style?.removeProperty?.("--better-zen-folders-menu-folder-color");
      }
    },
    openPicker: (folder, color, actions) => {
      const currentPanel = ensurePanel();
      if (!currentPanel || !input || !resetButton) return false;
      releaseActivePicker();
      activePicker = { folder, actions, initialColor:normalizeFolderColor(color), diagnosticResources: new Map(), diagnosticBaseline: null,
        diagnosticNodes: new WeakMap(), diagnosticNodeSequence: 0 };
      folder?.addEventListener?.('BetterZenFolderColorChanged', updateSwatches);
      refreshDiagnosticCopy();
      const normalizedColor = normalizeFolderColor(color);
      input.value = normalizedColor ?? "#808080";
      resetButton.disabled = normalizedColor === null;
      resetButton.setAttribute("aria-disabled", String(normalizedColor === null));
      updateSwatches();
      currentPanel.style?.setProperty?.(
        "--better-zen-folders-picker-color",
        normalizedColor ?? input.value,
      );
      currentPanel.setAttribute(
        "aria-label",
        `Folder Colour: ${String(folder?.name ?? folder?.label ?? "folder")}`,
      );
      const anchor = folder?.icon ?? folder?.labelElement ?? folder;
      try {
        activePicker.diagnosticSvg = folder?.querySelector?.(DIRECT_FOLDER_ICON_SVG_SELECTOR);
        activePicker.diagnosticBaseline = captureColourDiagnostic(activePicker);
      } catch { /* A missing baseline must not block the normal picker. */ }
      // Leave room for the native panel shadow so it does not shade the anchor's colour.
      currentPanel.openPopup?.(anchor, "after_start", 0, 16, false, false);
      return true;
    },
    removeOwnedUi: item => {
      for (const unsubscribe of paletteSubscriptions.splice(0)) unsubscribe();
      setBzfCommandIcon(item, null, "off", host);
      customPickerGeneration++;
      colourDiagnosticLifetime++;
      latestColourDiagnostic?.cancel();
      latestColourDiagnostic = null;
      for (const id of colourDiagnosticFrames) {
        try { host.cancelAnimationFrame?.(id); } catch { /* Best-effort diagnostic cleanup. */ }
      }
      colourDiagnosticFrames.clear();
      if (item?.getAttribute?.(OWNED_COLOR_UI_ATTRIBUTE) === "true") item.remove?.();
      const currentPanel = panel ?? document.getElementById?.(FOLDER_COLOR_PANEL_ID);
      if (currentPanel?.getAttribute?.(OWNED_COLOR_UI_ATTRIBUTE) === "true") {
        currentPanel.remove?.();
      }
      releaseActivePicker();
      panel = null;
      input = null;
      customButton = null;
      resetButton = null;
      copyDiagnosticButton = null;
      copyDiagnosticStatus = null;
      colourPanelContent = null;
      diagnosticCopyGeneration++;
      swatchButtons = [];
    },
  };
}

const MOVE_TO_FOLDER_ITEM_SELECTOR = ".context-zen-move-to-folder-item";
const MOVE_TO_FOLDER_FALLBACK_ICON = "chrome://browser/skin/zen-icons/folder.svg";
const MOVE_TO_FOLDER_OWNED_CLASS = "better-zen-folders-decorated-folder-item";
const MOVE_TO_FOLDER_LIVE_ICON_CLASS = "better-zen-folders-has-live-folder-icon";
const MOVE_TO_FOLDER_LIVE_SVG_CLASS = "better-zen-folders-menu-live-folder-icon";
const MOVE_TO_FOLDER_COLOR_ATTRIBUTE = "data-better-zen-folders-menu-color";
const MOVE_TO_FOLDER_COLOR_PROPERTY = "--better-zen-folders-menu-folder-color";
const DIRECT_FOLDER_ICON_SVG_SELECTOR =
  ":scope > .tab-group-label-container > .tab-group-folder-icon > svg";
const SNAPSHOT_SVG_PROPERTIES = Object.freeze([
  "display",
  "visibility",
  "opacity",
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-opacity",
  "stroke-width",
  "stop-color",
  "stop-opacity",
  "transform",
  "transform-box",
  "transform-origin",
  "-moz-context-properties",
]);

function resolveFolderMenuIconSource(folder) {
  const hasScopedQueries = typeof folder?.querySelector === "function";
  const directSvg = folder?.querySelector?.(DIRECT_FOLDER_ICON_SVG_SELECTOR);
  // Only use the legacy adapter shape if scoped DOM queries are unavailable.
  // Zen's unscoped icon getter can otherwise return a nested folder's icon.
  const legacyImage = !hasScopedQueries
    ? folder?.icon?.querySelector?.("svg .icon image")
    : null;
  // Zen 1.22's iconURL getter delegates to that same unscoped icon getter.
  // A compatibility writer's own data property remains safe without an SVG.
  const nativeSource = hasScopedQueries && !directSvg
    ? Object.getOwnPropertyDescriptor(folder, "iconURL")?.value
    : folder?.iconURL;
  const sources = [
    directSvg?.querySelector?.(".icon image")?.getAttribute?.("href"),
    folder?.getAttribute?.("data-zen-icons-icon-source"),
    legacyImage?.getAttribute?.("href"),
    nativeSource,
  ];
  for (const source of sources) {
    if (typeof source === "string" && source.trim()) return source.trim();
  }
  return MOVE_TO_FOLDER_FALLBACK_ICON;
}

function snapshotLiveFolderMenuIcon(host, item, folder, sizePercent = "120") {
  const sourceSvg = folder?.querySelector?.(DIRECT_FOLDER_ICON_SVG_SELECTOR) ?? null;
  const nativeImage = item?.querySelector?.(":scope > .menu-icon") ?? null;
  const iconSlot = item?.querySelector?.(":scope > .menu-iconic-left")
    ?? item?.querySelector?.(".menu-iconic-left")
    ?? null;
  if (!sourceSvg || (!nativeImage && !iconSlot) || typeof sourceSvg.cloneNode !== "function") return null;

  const clone = sourceSvg.cloneNode(true);
  clone.classList?.add?.(MOVE_TO_FOLDER_LIVE_SVG_CLASS);
  clone.setAttribute?.("aria-hidden", "true");
  clone.setAttribute?.("focusable", "false");
  const sourceNodes = [sourceSvg, ...Array.from(sourceSvg.querySelectorAll?.("*") ?? [])];
  const cloneNodes = [clone, ...Array.from(clone.querySelectorAll?.("*") ?? [])];
  for (let index = 0; index < Math.min(sourceNodes.length, cloneNodes.length); index++) {
    const computed = host.getComputedStyle?.(sourceNodes[index]);
    if (!computed) continue;
    const transitionTargets = new Map();
    try {
      // A permanent menu snapshot must not freeze a halfway-through fade or
      // skew. Read the native CSS transition's target without finishing,
      // cancelling or otherwise changing any live sidebar animation.
      for (const animation of sourceNodes[index].getAnimations?.() ?? []) {
        const property = animation.transitionProperty;
        if (!SNAPSHOT_SVG_PROPERTIES.includes(property)
          || animation.effect?.target !== sourceNodes[index]) continue;
        const frame = animation.effect.getKeyframes?.().at(-1);
        const value = frame?.[property.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())];
        if (typeof value === 'string' || typeof value === 'number') transitionTargets.set(property,String(value));
      }
    } catch { /* Older animation APIs retain the computed-paint fallback. */ }
    for (const property of SNAPSHOT_SVG_PROPERTIES) {
      const value = transitionTargets.get(property) ?? computed.getPropertyValue?.(property)?.trim?.();
      if (!value) continue;
      const priority = computed.getPropertyPriority?.(property) ?? "";
      cloneNodes[index].style?.setProperty?.(property, value, priority);
    }
  }
  // Native folder SVGs reuse gradient IDs. A menu lives earlier in the document
  // and may be hidden: publishing those IDs can redirect the sidebar's paint
  // into the hidden clone. Isolate only this snapshot, after computed URL values
  // have been copied and before any cloned resource enters the document.
  const resourceIds = new Map();
  let resourceSequence = 0;
  for (const node of cloneNodes) {
    const originalId = node.getAttribute?.("id");
    if (!originalId) continue;
    let id;
    do { id = `better-zen-folders-menu-resource-${++resourceSequence}`; }
    while (host.document?.getElementById?.(id));
    if (!resourceIds.has(originalId)) resourceIds.set(originalId, id);
    node.setAttribute("id", id);
  }
  const localReference = address => {
    const value = address.trim();
    try {
      let fragment;
      if (value.startsWith("#")) fragment = value.slice(1);
      else {
        const documentUrl = new URL(sourceSvg.ownerDocument?.documentURI ?? host.document?.documentURI);
        const reference = new URL(value, sourceSvg.baseURI ?? documentUrl.href);
        fragment = reference.hash.slice(1);
        documentUrl.hash = ""; reference.hash = "";
        if (reference.href !== documentUrl.href) return null;
      }
      const id = resourceIds.get(decodeURIComponent(fragment));
      return id ? `#${id}` : null;
    } catch { return null; }
  };
  for (const node of cloneNodes) {
    for (const attribute of Array.from(node.attributes ?? [])) {
      if (attribute.name === "id") continue;
      const value = attribute.localName === "href"
        ? localReference(attribute.value) ?? attribute.value
        : attribute.value.replace(
          /url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^)]*))\s*\)/gi,
          (match, quoted, single, bare) => {
            const reference = localReference(quoted ?? single ?? bare);
            return reference ? `url("${reference}")` : match;
          });
      if (value !== attribute.value) node.setAttributeNS(attribute.namespaceURI, attribute.name, value);
    }
  }
  // Zen Icons exposes this only for a resolved glyph whose outline is hidden.
  // Individual scale composes with its frozen transform without changing layout.
  if (folder.hasAttribute?.("zen-icons-enlarge-inner-icon")
    && !folder.hasAttribute?.("zen-icons-custom-unavailable")) {
    const glyph = clone.querySelector?.(".icon");
    const scale = (parseNumericSetting("menuIconSizePercent", sizePercent) ?? 120) / 100;
    glyph?.style?.setProperty?.("scale", String(scale));
  }
  if (nativeImage) item.insertBefore(clone, nativeImage);
  else iconSlot.appendChild(clone);
  // Centre the menu snapshot's visible artwork, not the sidebar's root nudge.
  // The opened folder is skewed within its native viewBox. Keep the individual
  // shapes and requested glyph size, and move only their combined menu artwork.
  // The known bare glyph is already centred at (8,8) within 27 units. Its
  // centre-preserving scales need no second, cross-viewport measurement pass.
  if (sourceSvg.getAttribute?.("viewBox") === "0 0 27 27"
    && !(folder.hasAttribute?.("zen-icons-enlarge-inner-icon")
      && !folder.hasAttribute?.("zen-icons-custom-unavailable")
      && clone.querySelector?.('.icon > image[width="11"][height="11"]'))
    && clone.querySelector?.(":scope > .front") && typeof clone.getBBox === "function") {
    const hidden = [];
    const parent = clone.parentNode, next = clone.nextSibling;
    const measuringSvg = host.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    try {
      // A popup may still be display:none. Measure in a non-painting viewport
      // with layout, rather than accepting the hidden subtree's empty bbox.
      measuringSvg.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      measuringSvg.setAttribute("width", sourceSvg.getAttribute("width"));
      measuringSvg.setAttribute("height", sourceSvg.getAttribute("height"));
      measuringSvg.setAttribute("aria-hidden", "true");
      measuringSvg.setAttribute("focusable", "false");
      host.document.documentElement.appendChild(measuringSvg);
      measuringSvg.appendChild(clone);
      // Invisible branches still contribute to getBBox unless excluded.
      for (const node of cloneNodes.slice(1)) {
        if (node.style?.getPropertyValue("opacity") === "0"
          || node.style?.getPropertyValue("visibility") === "hidden") {
          hidden.push([node, node.style.getPropertyValue("display"), node.style.getPropertyPriority("display")]);
          node.style.setProperty("display", "none", "important");
        }
      }
      const bounds = clone.getBBox({fill:true, stroke:true, markers:true});
      const box = sourceSvg.viewBox.baseVal;
      if (bounds.width > 0 && bounds.height > 0) {
        const art = host.document.createElementNS("http://www.w3.org/2000/svg", "g");
        art.setAttribute("transform", `translate(${box.x + box.width / 2 - bounds.x - bounds.width / 2} ${box.y + box.height / 2 - bounds.y - bounds.height / 2})`);
        for (const node of Array.from(clone.children)) {
          if (node.localName !== "defs") art.appendChild(node);
        }
        clone.appendChild(art);
        clone.style.setProperty("transform", "none", "important");
      }
    } catch { /* Preserve the existing snapshot if geometry is unavailable. */ }
    finally {
      for (const [node, display, priority] of hidden) {
        if (display) node.style.setProperty("display", display, priority);
        else node.style.removeProperty("display");
      }
      parent.insertBefore(clone, next);
      measuringSvg.remove();
    }
  }
  // A nested external SVG cannot reliably retain Gecko context paint when moved
  // into a native menu. Freeze paint only for the known local monochrome packs;
  // do not fetch arbitrary URLs, inline active SVG into chrome, or alter originals.
  for (const image of clone.querySelectorAll?.("image") ?? []) {
    const source = image.getAttribute?.("href") ?? "";
    const packagedIcon = /^chrome:\/\/(?:browser\/skin\/zen-icons\/|sine\/content\/zen-icons-local\/lucide\/)[\w/-]+\.svg$/.test(source);
    const localPackIcon = /^file:\/\/\/[^?#]+\/chrome\/sine-mods\/zen-icons-local\/lucide\/[\w-]+\.svg$/i.test(source);
    if (!packagedIcon && !localPackIcon) continue;
    if (typeof host.fetch !== "function") continue;
    const replacements = {
      "context-fill-opacity": image.style.getPropertyValue("fill-opacity") || "1",
      "context-stroke-opacity": image.style.getPropertyValue("stroke-opacity") || "1",
      "context-fill": image.style.getPropertyValue("fill") || "black",
      "context-stroke": image.style.getPropertyValue("stroke") || "black",
    };
    void host.fetch(source).then(async response => {
      if (!response.ok) return;
      const svg = await response.text();
      if (svg.length > 131072 || !/<svg\b/.test(svg)) return;
      const painted = svg.replace(/context-(?:fill-opacity|stroke-opacity|fill|stroke)\b/g,
        token => replacements[token]);
      if (image.isConnected === false || clone.parentElement === null) return;
      image.setAttribute("href", `data:image/svg+xml,${encodeURIComponent(painted)}`);
    }).catch(error => host.console?.warn?.("Better Zen Folders: menu icon paint unavailable", error));
  }
  return clone;
}

export function createBrowserMoveToFolderMenuAdapters(host, preferences = null) {
  const ownership = new WeakMap();
  const menuTarget = () => host.document?.getElementById?.("context_zenMoveToFolder") ?? null;
  const clearItem = item => {
    const state = ownership.get(item);
    if (!state) return;
    if (state.plainOnly) {
      if (!state.hadPlainClass) item.classList?.remove?.("better-zen-folders-plain-folder-item");
      ownership.delete(item);
      return;
    }
    state.liveFolderIcon?.remove?.();
    if (
      !state.hadLiveIconClass
      && state.liveFolderIcon
    ) item.classList?.remove?.(MOVE_TO_FOLDER_LIVE_ICON_CLASS);
    if (state.addedIconic) item.classList?.remove?.("menuitem-iconic");
    if (!state.hadOwnedClass) item.classList?.remove?.(MOVE_TO_FOLDER_OWNED_CLASS);
    if (item.getAttribute?.("image") === state.projectedImage) {
      if (state.hadImage) {
        item.setAttribute?.("image", state.originalImage);
      } else {
        item.removeAttribute?.("image");
      }
    }
    if (state.hadColorAttribute) {
      item.setAttribute?.(MOVE_TO_FOLDER_COLOR_ATTRIBUTE, state.colorAttribute);
    } else {
      item.removeAttribute?.(MOVE_TO_FOLDER_COLOR_ATTRIBUTE);
    }
    if (state.colorProperty) {
      item.style?.setProperty?.(
        MOVE_TO_FOLDER_COLOR_PROPERTY,
        state.colorProperty,
        state.colorPropertyPriority,
      );
    } else {
      item.style?.removeProperty?.(MOVE_TO_FOLDER_COLOR_PROPERTY);
    }
    ownership.delete(item);
  };

  return {
    preferences,
    menuTarget,
    listNativeItems: () => Array.from(
      menuTarget()?.querySelectorAll?.(MOVE_TO_FOLDER_ITEM_SELECTOR) ?? [],
    ),
    getItemFolder: item => item?._group ?? null,
    showPlainItem: item => {
      clearItem(item);
      ownership.set(item, {plainOnly:true, hadPlainClass:item.classList?.contains?.("better-zen-folders-plain-folder-item") === true});
      item.classList?.add?.("better-zen-folders-plain-folder-item");
    },
    getFolderDisplayColor: (folder, customColor) => {
      if (normalizeFolderColor(customColor) !== null) return customColor;
      const computed = host.getComputedStyle?.(folder);
      const value = computed?.getPropertyValue?.("--better-zen-folders-folder-color")?.trim?.()
        || computed?.getPropertyValue?.("--zen-folder-stroke")?.trim?.()
        || null;
      return value;
    },
    decorateItem: (item, folder, color) => {
      clearItem(item);
      const hadIconic = item.classList?.contains?.("menuitem-iconic") === true;
      const hadOwnedClass = item.classList?.contains?.(MOVE_TO_FOLDER_OWNED_CLASS) === true;
      const hadLiveIconClass = item.classList?.contains?.(MOVE_TO_FOLDER_LIVE_ICON_CLASS) === true;
      const hadImage = item.hasAttribute?.("image") === true;
      const projectedImage = resolveFolderMenuIconSource(folder);
      const liveFolderIcon = snapshotLiveFolderMenuIcon(host, item, folder,
        preferences?.get?.("menuIconSizePercent") ?? "120");
      const hadColorAttribute = item.hasAttribute?.(MOVE_TO_FOLDER_COLOR_ATTRIBUTE) === true;
      const state = {
        addedIconic: !hadIconic,
        hadOwnedClass,
        hadLiveIconClass,
        liveFolderIcon,
        hadImage,
        originalImage: item.getAttribute?.("image") ?? "",
        projectedImage,
        hadColorAttribute,
        colorAttribute: item.getAttribute?.(MOVE_TO_FOLDER_COLOR_ATTRIBUTE) ?? "",
        colorProperty: item.style?.getPropertyValue?.(MOVE_TO_FOLDER_COLOR_PROPERTY) ?? "",
        colorPropertyPriority:
          item.style?.getPropertyPriority?.(MOVE_TO_FOLDER_COLOR_PROPERTY) ?? "",
      };
      ownership.set(item, state);
      item.classList?.add?.("menuitem-iconic", MOVE_TO_FOLDER_OWNED_CLASS);
      if (liveFolderIcon) item.classList?.add?.(MOVE_TO_FOLDER_LIVE_ICON_CLASS);
      item.setAttribute?.("image", projectedImage);
      if (typeof color === "string" && color.trim() !== "") {
        const value = color.trim();
        item.setAttribute?.(MOVE_TO_FOLDER_COLOR_ATTRIBUTE, value);
        item.style?.setProperty?.(MOVE_TO_FOLDER_COLOR_PROPERTY, value);
      }
    },
    clearItem,
    reportError: error => host.console?.error?.(
      "Better Zen Folders: unable to decorate Move to Folder menu",
      error,
    ),
  };
}

export function createBrowserFolderIconIntegrityAdapters(host) {
  const directIconContainer = folder => folder?.querySelector?.(
    ":scope > .tab-group-label-container > .tab-group-folder-icon",
  ) ?? null;
  const iconState = folder => {
    const owned = directIconContainer(folder);
    const container = owned ?? folder?.icon ?? folder?.querySelector?.(".tab-group-folder-icon") ?? null;
    const svg = owned
      ? owned.querySelector?.(":scope > svg") ?? null
      : container?.querySelector?.("svg") ?? null;
    return { container, svg };
  };
  return {
    listFolders: () => Array.from(host.document?.querySelectorAll?.("zen-folder") ?? []),
    eventTarget: () => host.gBrowser?.tabContainer ?? host,
    tabContainer: () => host.gBrowser?.tabContainer ?? null,
    createMutationObserver: callback => typeof host.MutationObserver === "function"
      ? new host.MutationObserver(callback)
      : null,
    scheduleAfterFolderCreate: callback => {
      if (typeof host.queueMicrotask === "function") host.queueMicrotask(callback);
      else Promise.resolve().then(callback);
    },
    isFolder: folder => folder?.isZenFolder === true,
    hasNativeIcon: folder => Boolean(iconState(folder).svg),
    repairNativeIcon: folder => {
      const { container, svg } = iconState(folder);
      if (!container || svg) return false;
      const template = folder?.constructor?.rawIcon;
      if (typeof template?.cloneNode !== "function") {
        throw new Error(`Zen's native folder icon template is unavailable: ${folder?.id ?? "unknown"}`);
      }
      container.appendChild?.(template.cloneNode(true));
      host.gZenFolders?.updateFolderIcon?.(folder, "auto");
      if (typeof host.CustomEvent === "function") {
        folder.dispatchEvent?.(new host.CustomEvent("TabGroupUpdate", { bubbles: true }));
      }
      return Boolean(iconState(folder).svg);
    },
    reportError: error => host.console?.error?.(
      "Better Zen Folders: unable to restore a folder's native icon",
      error,
    ),
  };
}

// A projection of native menu nodes, not a second destination or command store.
// Return the nodes before Zen's rebuild/layout passes so those passes continue
// to see the structure they own. Never clone a command or intercept activation.
export function spaceThemeMarker(workspace, css) {
  const entries = workspace?.theme?.gradientColors;
  if (!Array.isArray(entries)) return null;
  const colors = entries.map(entry => {
    const value = entry?.c;
    if (Array.isArray(value) && value.length === 3
      && value.every(n => Number.isFinite(n) && n >= 0 && n <= 255)) return `rgb(${value.join(', ')})`;
    if (typeof value === 'string' && css?.supports?.('color', value)) return value;
    return null;
  });
  if (!colors.length || colors.some(c => !c)) return null;
  return colors.length === 1 ? colors[0] : `linear-gradient(180deg, ${colors.join(', ')})`;
}

export class MovedTabsMenuManager {
  constructor(host, preferences) {
    Object.assign(this, {host, preferences});
    this.pending = new WeakMap();
    this.capture = event => {
      try { this.snapshot(event); }
      catch { this.host.console?.warn?.('Better Zen Folders: moved-tab placement snapshot unavailable'); }
    };
    this.bubble = event => {
      const snapshot = this.pending.get(event);
      this.pending.delete(event);
      if (!snapshot || !this.started || event.defaultPrevented) return;
      try { this.place(snapshot); }
      catch { this.host.console?.warn?.('Better Zen Folders: moved-tab placement unavailable'); }
    };
    this.abort = () => this.destroy();
  }

  start(signal) {
    if (this.started || signal?.aborted) return;
    this.menu = this.host.document?.getElementById?.('context_zenMoveToFolder');
    this.tabMenu = this.host.document?.getElementById?.('tabContextMenu');
    if (!this.menu || !this.tabMenu?.contains?.(this.menu)) return;
    this.started = true;
    this.menu.addEventListener('command', this.capture, true);
    // An ancestor bubbles after Zen's submenu listener regardless of which
    // listener was registered first. Never replace or cancel the native command.
    this.tabMenu.addEventListener('command', this.bubble);
    this.signal = signal;
    signal?.addEventListener('abort', this.abort, {once:true});
  }

  eligible(folder) {
    return folder?.isZenFolder === true && !folder.isLiveFolder && folder.isConnected
      && folder.ownerDocument === this.host.document && Boolean(folder.groupContainer);
  }

  split(item) {
    return this.host.gBrowser?.isSplitViewWrapper?.(item)
      || (this.host.gBrowser?.isTabGroup?.(item) && item.hasAttribute?.('split-view-group'));
  }

  directItem(tab) {
    if (this.split(tab)) return tab;
    if (!this.host.gBrowser?.isTab?.(tab)) return null;
    return tab.splitview ?? (this.split(tab.group) ? tab.group : tab);
  }

  children(folder) {
    return Array.from(folder.groupContainer.children).filter(item =>
      !item.classList?.contains('zen-tab-group-start')
      && !item.classList?.contains('pinned-tabs-container-separator')
      && !item.hasAttribute?.('zen-empty-tab'));
  }

  snapshot(event) {
    this.pending.delete(event);
    const item = event.target, folder = item?._group;
    if (!this.started || !item?.classList?.contains('context-zen-move-to-folder-item')
      || item.closest?.('menu') !== this.menu || !this.eligible(folder)) return;
    const context = this.host.TabContextMenu?.contextTab;
    const tabs = context?.multiselected ? Array.from(this.host.gBrowser.selectedTabs ?? []) : [context];
    const existing = new Set(this.children(folder));
    const items = [...new Set(tabs.filter(tab => tab?.isConnected
      && tab.ownerDocument === this.host.document).map(tab => this.directItem(tab)))].filter(item =>
      item && !existing.has(item) && !item.hasAttribute?.('zen-empty-tab'));
    if (!items.length) return;
    this.pending.set(event, {folder, items, top:this.preferences?.get?.('movedTabPosition') === 'top'});
  }

  place({folder, items, top}) {
    if (!this.eligible(folder)) return;
    const container = folder.groupContainer, browser = this.host.gBrowser;
    const moved = items.filter(item => item.isConnected && item.parentElement === container);
    if (!moved.length) return;
    const children = this.children(folder);
    if (!children.every(item => item.isZenFolder || browser.isTab?.(item) || this.split(item))) return;
    const movedSet = new Set(moved), remaining = children.filter(item => !movedSet.has(item));
    const desired = top ? [...moved, ...remaining] : [...remaining, ...moved];
    if (children.every((item, index) => item === desired[index])) return;
    const boundary = top ? remaining[0] : remaining.at(-1);
    // With only the newly moved block, native addTabs has already placed it.
    // Never use after(empty-tab): Zen interprets that as after the whole folder.
    if (!boundary) return;
    for (const item of top ? moved : [...moved].reverse()) {
      if (!this.started || !this.eligible(folder) || item.parentElement !== container
        || boundary.parentElement !== container) return;
      const current = this.children(folder), at = current.indexOf(item), edge = current.indexOf(boundary);
      if (at === edge + (top ? -1 : 1)) continue;
      if (this.split(item)) {
        // Native moveTabTo promotes a member to its whole split AFTER checking
        // the member's pinned state. Before/after on the wrapper itself can
        // route it out of a pinned folder because wrappers report pinned=false.
        const members = Array.from(item.tabs ?? []);
        const forwards = at < edge;
        // moveTabTo inserts after its index when moving forwards, and before
        // it when moving backwards. Pick the adjacent direct item accordingly.
        const reference = top === forwards ? current[edge + (top ? -1 : 1)] : boundary;
        const anchors = browser.isTab?.(reference) ? [reference] : Array.from(reference?.tabs ?? []);
        const forceUngrouped = reference?.isZenFolder === true;
        // A folder's own first tab (normally its sentinel) plus forceUngrouped
        // makes native movement target that folder, not a nested descendant.
        const anchor = forceUngrouped ? anchors.find(tab => tab.group === reference)
          : forwards ? anchors.at(-1) : anchors[0];
        const member = members[0];
        if (!member?.pinned || member.hasAttribute?.('zen-essential')
          || !anchor?.pinned || typeof browser.moveTabTo !== 'function'
          || !Number.isInteger(member.index) || !Number.isInteger(anchor.index)) return;
        // Legacy split groups are promoted inside the native DOM callback;
        // only splitview wrappers participate in its multi-tab index adjustment.
        const nativeWidth = member.splitview === item ? members.length : 1;
        const tabIndex = anchor.index + (forwards ? 1 - nativeWidth : 0);
        browser.moveTabTo(member, {tabIndex, forceUngrouped});
      } else {
        // Native receivers promote split anchors after checking pinned state.
        const anchor = this.split(boundary) && !boundary.pinned
          ? Array.from(boundary.tabs ?? []).find(tab => tab.pinned) : boundary;
        const method = top ? 'moveTabBefore' : 'moveTabAfter';
        if (!item.pinned || item.hasAttribute?.('zen-essential') || !anchor?.pinned
          || typeof browser[method] !== 'function') return;
        browser[method](item, anchor);
      }
      if (item.parentElement !== container) return;
    }
  }

  destroy() {
    this.started = false;
    this.menu?.removeEventListener('command', this.capture, true);
    this.tabMenu?.removeEventListener('command', this.bubble);
    this.signal?.removeEventListener('abort', this.abort);
    this.pending = new WeakMap();
    this.menu = this.tabMenu = this.signal = null;
  }
}

// Let Zen own drop membership and pinning; apply ordering only to items that
// arrived through a folder-header drop, using the menu's direct-item placement.
export class FolderHeaderDropPlacementManager extends MovedTabsMenuManager {
  start(signal) {
    if (this.started || signal?.aborted) return;
    const native = this.host.gBrowser?.tabContainer?.tabDragAndDrop;
    if (typeof native?.handle_drop !== 'function') return;
    const original = native.handle_drop, manager = this;
    function wrapped(event, ...args) {
      let snapshot = null;
      if (manager.started) {
        try { snapshot = manager.headerSnapshot(event); }
        catch { manager.host.console?.warn?.('Better Zen Folders: header-drop snapshot unavailable'); }
      }
      const result = Reflect.apply(original, this, [event, ...args]);
      // Installed same-window drops are synchronous. Do not relocate later if
      // a future native receiver becomes asynchronous.
      if (manager.started && snapshot && !result?.then) {
        try { manager.place(snapshot); }
        catch { manager.host.console?.warn?.('Better Zen Folders: header-drop placement unavailable'); }
      }
      return result;
    }
    Object.assign(this, {native, original, wrapped, signal, started:true});
    native.handle_drop = wrapped;
    signal?.addEventListener('abort', this.abort, {once:true});
  }

  headerSnapshot(event) {
    const dt = event?.dataTransfer, browser = this.host.gBrowser;
    if (event?.defaultPrevented || dt?.dropEffect !== 'move'
      || !Array.from(dt.types ?? []).includes('application/x-moz-tabbrowser-tab')) return null;
    const source = dt.mozGetDataAt?.('application/x-moz-tabbrowser-tab', 0);
    if (!source?.isConnected || source.documentGlobal !== this.host
      || !(browser.isTab?.(source) || browser.isTabGroupLabel?.(source))) return null;
    const data = source._dragData;
    if (!data || data.fromTabList || data.shouldCreateGroupOnDrop) return null;
    const folder = event.target?.closest?.('zen-folder');
    if (!this.eligible(folder) || !folder.labelContainerElement?.contains(event.target)
      || browserWorkspaceId(folder) !== this.host.gZenWorkspaces?.activeWorkspace) return null;
    const anchor = data.dropElement;
    // Zen translates a label destination to its first (sentinel) tab. An
    // anchor on the folder itself means an explicit outside boundary instead.
    const intoHeader = anchor === folder.labelElement
      || (anchor?.hasAttribute?.('zen-empty-tab') && anchor.group === folder);
    if (!intoHeader) return null;
    const folderMove = browser.isTabGroupLabel?.(source) === true;
    const raw = folderMove ? [source.group] : Array.from(data.movingTabs ?? [source]);
    // Native reverses the drag-time RTL array on release. Mirror that on our
    // copy, never mutate its still-live drag data or reverse the final order.
    if (!folderMove && this.native?._rtlMode) raw.reverse();
    if (raw.some(item => item?.documentGlobal !== this.host || !item.isConnected
      || item.isLiveFolder || item.hasAttribute?.('zen-essential'))) return null;
    const existing = new Set(this.children(folder));
    const items = [...new Set(raw.map(item => folderMove ? item : this.directItem(item)))]
      .filter(item => !existing.has(item));
    if (!items.length || items.some(item => !item
      || item === folder || item.contains?.(folder) || item.hasAttribute?.('zen-empty-tab')
      || (folderMove && !this.eligible(item)))) return null;
    return {folder, items, top:this.preferences?.get?.(
      folderMove ? 'movedFolderPosition' : 'movedTabPosition') === 'top'};
  }

  destroy() {
    this.started = false;
    if (this.native && this.native.handle_drop === this.wrapped) this.native.handle_drop = this.original;
    this.signal?.removeEventListener('abort', this.abort);
    this.native = this.original = this.wrapped = this.signal = null;
  }
}

export class SpaceMoveMenuManager {
  constructor(host, preferences) {
    Object.assign(this, {host, preferences});
    this.rows = []; this.decorations = new Map(); this.labels = new Map();
    this.stops = []; this.wrappers = []; this.active = false;
    this.show = event => {
      if (event.target === this.tabMenu) {
        this.active = true;
        this.host.gZenWorkspaces?.updateWorkspacesChangeContextMenu?.();
        this.project();
      } else if (event.target === this.folderMenu || event.target === this.folderPopup
        || event.target === this.popup) this.decorate();
    };
    this.abort = () => this.destroy();
  }

  wrap(owner, name, before, after, scope = null) {
    const original = owner?.[name];
    if (typeof original !== 'function') return;
    function wrapped(...args) {
      before();
      const call = () => Reflect.apply(original, this, args);
      const result = scope ? scope(call) : call();
      after();
      return result;
    }
    owner[name] = wrapped;
    this.wrappers.push(() => { if (owner[name] === wrapped) owner[name] = original; });
  }

  start(signal) {
    if (this.started || signal?.aborted) return;
    const doc = this.host.document;
    if (typeof doc?.getElementById !== 'function') return;
    this.tabMenu = doc.getElementById('tabContextMenu');
    this.folderMenu = doc.getElementById('zenFolderActions');
    this.nativeMenu = doc.getElementById('context_moveTabOptions');
    this.nativePopup = doc.getElementById('moveTabOptionsMenu');
    this.folderCommand = doc.getElementById('context_zenChangeFolderSpace');
    this.folderPopup = this.folderCommand?.querySelector('menupopup');
    if (!this.tabMenu || !this.nativePopup || !this.nativeMenu) return;
    this.started = true;
    this.command = doc.createXULElement('menu');
    this.command.id = 'better-zen-folders-move-space';
    this.command.setAttribute('label', 'Move to Space');
    this.popup = doc.createXULElement('menupopup');
    this.command.appendChild(this.popup);
    this.wrap(this.host.gZenWorkspaces, 'updateWorkspacesChangeContextMenu',
      () => this.returnRows(), () => { if (this.active) this.project(); });
    this.wrap(this.host.TabContextMenu, '_ensureMenuArranged',
      () => this.restoreLayout(), () => {}, call => {
        const context = this.host.TabContextMenu;
        const original = context.DYNAMIC_MENU_ITEM_SELECTORS;
        if (!Array.isArray(original)) return call();
        // Zen's generated Space destinations are not declared by Firefox's
        // section descriptors. Exempt precisely those native dynamic nodes,
        // while keeping the layout check active for every other child.
        const scoped = [...original, '.zen-workspace-context-menu-item'];
        context.DYNAMIC_MENU_ITEM_SELECTORS = scoped;
        try { return call(); }
        finally { if (context.DYNAMIC_MENU_ITEM_SELECTORS === scoped) context.DYNAMIC_MENU_ITEM_SELECTORS = original; }
      });
    this.tabMenu.addEventListener('popupshowing', this.show);
    this.folderMenu?.addEventListener('popupshowing', this.show);
    for (const name of ['decorateMoveToFolderMenu', 'commandIconMode']) {
      this.stops.push(this.preferences?.subscribe?.(name, () => {
        if (this.active) this.project(); else this.decorate();
      }));
    }
    this.signal = signal; signal?.addEventListener('abort', this.abort, {once:true});
  }

  rename(node, label) {
    if (!node) return;
    if (!this.labels.has(node)) this.labels.set(node,
      ['label', 'data-l10n-id', 'data-l10n-args'].map(name => [name, node.getAttribute(name)]));
    node.removeAttribute('data-l10n-id'); node.removeAttribute('data-l10n-args');
    node.setAttribute('label', label);
  }

  restoreLabels() {
    for (const [node, attributes] of this.labels) for (const [name, value] of attributes) {
      if (value === null) node.removeAttribute(name); else node.setAttribute(name, value);
    }
    this.labels.clear();
  }

  returnRows() {
    this.clearDecoration();
    for (const {node, next} of [...this.rows].reverse()) {
      if (node.parentNode === this.popup || node.parentNode === this.separatorStorage) {
        this.nativePopup.insertBefore(node, next?.parentNode === this.nativePopup ? next : null);
      }
    }
    this.rows = [];
  }

  restoreLayout() {
    this.returnRows(); this.command?.remove(); this.restoreLabels();
    if (this.originalPosition && this.nativeMenu?.parentNode === this.tabMenu) {
      const {parent, next} = this.originalPosition;
      if (parent?.isConnected) parent.insertBefore(this.nativeMenu, next?.parentNode === parent ? next : null);
    }
    this.originalPosition = null;
  }

  project() {
    if (!this.started) return;
    this.returnRows();
    const folderMove = this.host.document.getElementById('context_zenMoveToFolder');
    // Without the native folder anchor, leave the existing move menu intact.
    if (folderMove?.parentNode !== this.tabMenu) return;
    this.originalPosition ??= {parent:this.nativeMenu.parentNode, next:this.nativeMenu.nextSibling};
    folderMove.after(this.command); this.command.after(this.nativeMenu);
    this.rename(this.nativeMenu, 'Move Elsewhere');
    this.separatorStorage ??= this.host.document.createDocumentFragment();
    const nativeRows = [...this.nativePopup.querySelectorAll(':scope > .zen-workspace-context-menu-item')];
    this.rows = nativeRows.map(node => ({node, next:node.nextSibling}));
    for (const {node} of this.rows) {
      (node.hasAttribute('zen-workspace-id') ? this.popup : this.separatorStorage).appendChild(node);
    }
    this.command.hidden = this.host.gZenWorkspaces?.privateWindowOrDisabled === true
      || !this.popup.querySelector('[zen-workspace-id]');
    // Space movement does not depend on having a second tab for a new window.
    // Essentials and hidden context tabs remain ineligible.
    const tab = this.host.TabContextMenu?.contextTab;
    this.command.disabled = Boolean(tab?.hidden || tab?.hasAttribute?.('zen-essential'));
    setBzfCommandIcon(this.command, 'chrome://browser/skin/zen-icons/selectable/globe.svg',
      this.preferences?.get?.('commandIconMode') ?? 'mod', this.host);
    this.decorate();
  }

  clearDecoration() {
    for (const [item, state] of this.decorations) {
      for (const node of state.nodes) node.remove();
      item.classList.remove('better-zen-folders-space-destination', 'better-zen-folders-space-plain');
      if (item.getAttribute('label') === state.projected) item.setAttribute('label', state.label);
      if (state.radio && !item.hasAttribute('image') && state.image !== null) item.setAttribute('image', state.image);
    }
    this.decorations.clear();
  }

  decorate() {
    this.clearDecoration();
    this.rename(this.folderCommand, 'Move to Space');
    const doc = this.host.document;
    const enabled = this.preferences?.get?.('decorateMoveToFolderMenu') !== false;
    const items = [this.popup, this.folderPopup].flatMap(p => [...(p?.querySelectorAll('menuitem[zen-workspace-id]') ?? [])]);
    for (const item of items) {
      const workspace = this.host.gZenWorkspaces?.getWorkspaceFromId?.(item.getAttribute('zen-workspace-id'));
      if (!workspace) continue;
      const state = {label:item.getAttribute('label'), projected:workspace.name, nodes:[],
        radio:item.getAttribute('type') === 'radio' || item.hasAttribute('checked'), image:item.getAttribute('image')};
      this.decorations.set(item, state); item.setAttribute('label', workspace.name);
      // Windows paints native radio checks through .menu-icon. Keep that slot
      // and remove only its competing artwork while our separate glyph is shown.
      if (state.radio) item.removeAttribute('image');
      item.classList.add(enabled ? 'better-zen-folders-space-destination' : 'better-zen-folders-space-plain');
      if (!enabled) continue;
      const element = (name, cls) => {
        const n = doc.createElementNS('http://www.w3.org/1999/xhtml', name);
        n.className = cls; n.setAttribute('aria-hidden', 'true');
        state.nodes.push(n); return n;
      };
      const defaultIcon = () => {
        const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'better-zen-folders-space-default-icon');
        svg.setAttribute('viewBox', '0 0 16 16');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        const circle = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '8'); circle.setAttribute('cy', '8');
        circle.setAttribute('r', '8'); circle.setAttribute('fill', 'gray');
        svg.appendChild(circle); state.nodes.push(svg);
        return svg;
      };
      const glyph = element('span', 'better-zen-folders-space-icon');
      const icon = workspace.icon ?? '';
      if (/^(?:chrome:|resource:|file:|data:image\/|https?:)/i.test(icon)) {
        const image = doc.createElementNS('http://www.w3.org/1999/xhtml', 'img');
        image.alt = ''; image.src = icon;
        image.addEventListener('error', () => {
          image.remove(); glyph.appendChild(defaultIcon());
        }, {once:true});
        glyph.appendChild(image);
      } else if (icon) glyph.textContent = icon;
      else glyph.appendChild(defaultIcon());
      item.insertBefore(glyph, item.firstChild);
      // Preview saved theme colours, not a contrast-adjusted accent. Do not call
      // the native renderer: its exception path can leave private picker state
      // modified. This tiny strip represents the palette, not window texture.
      const background = spaceThemeMarker(workspace, this.host.CSS);
      if (background) {
        const marker = element('span', 'better-zen-folders-space-colour');
        marker.style.background = background; item.insertBefore(marker, item.firstChild);
      }
    }
  }

  destroy() {
    if (!this.started) return;
    this.active = false;
    this.restoreLayout();
    for (const stop of this.stops) stop?.(); this.stops = [];
    for (const stop of this.wrappers.reverse()) stop(); this.wrappers = [];
    this.tabMenu.removeEventListener('popupshowing', this.show);
    this.folderMenu?.removeEventListener('popupshowing', this.show);
    this.signal?.removeEventListener('abort', this.abort);
    setBzfCommandIcon(this.command, null, 'off', this.host);
    this.started = false;
  }
}

export class FolderMoveMenuManager {
  constructor(host, preferences, colorManager, populationRegistry) {
    Object.assign(this, {host, preferences, colorManager});
    this.moves = createBrowserFolderMoveAdapters(host, preferences, populationRegistry);
    this.decoration = createBrowserMoveToFolderMenuAdapters(host, preferences);
    this.items = new Map();
    this.stops = [];
    this.source = null;
    this.show = event => {
      if (event.target === this.menu) {
        this.source = browserContextFolder(host, event);
        this.command.hidden = !this.moves.eligible(this.source);
        this.command.disabled = this.command.hidden || !this.moves.listDestinations(this.source).length;
      } else if (event.target === this.popup) this.populate();
    };
    this.hide = event => {
      if (event.target === this.popup || event.target === this.menu) this.clear();
      if (event.target === this.menu) this.source = null;
    };
    this.activate = event => {
      const destination = this.items.get(event.target);
      if (!destination) return;
      event.preventDefault?.(); event.stopPropagation?.();
      try { this.moves.move(this.source, destination); }
      catch (error) { host.console?.error?.("Better Zen Folders: unable to move folder", error); }
    };
    this.onAbort = () => this.destroy();
  }

  start(signal) {
    if (this.menu || signal?.aborted) return;
    this.menu = this.host.document.getElementById?.("zenFolderActions") ?? null;
    if (!this.menu) return;
    const command = this.host.document.createXULElement("menu");
    command.id = "better-zen-folders-move-folder";
    command.setAttribute("label", "Move to Folder");
    command.hidden = true;
    this.popup = this.host.document.createXULElement("menupopup");
    command.appendChild(this.popup);
    this.command = command;
    this.menu.insertBefore(command, Array.from(this.menu.children).find(item => item.id === "context_zenChangeFolderSpace") ?? null);
    const updateIcon = () => setBzfCommandIcon(command, MOVE_TO_FOLDER_FALLBACK_ICON,
      this.preferences?.get?.("commandIconMode") ?? "mod", this.host);
    updateIcon();
    this.stops = [
      this.preferences?.subscribe?.("commandIconMode", updateIcon),
      this.preferences?.subscribe?.("decorateMoveToFolderMenu", () => this.populate()),
      this.preferences?.subscribe?.("menuIconSizePercent", () => this.populate()),
    ];
    this.menu.addEventListener("popupshowing", this.show);
    this.menu.addEventListener("popuphidden", this.hide);
    this.menu.addEventListener("command", this.activate);
    this.signal = signal;
    signal?.addEventListener("abort", this.onAbort, {once:true});
  }

  clear() {
    for (const item of this.items.keys()) {
      this.decoration.clearItem(item);
      item.remove();
    }
    this.items.clear();
  }

  populate() {
    this.clear();
    if (!this.popup) return;
    for (const folder of this.moves.listDestinations(this.source)) {
      const item = this.host.document.createXULElement("menuitem");
      item.setAttribute("class", "context-zen-move-to-folder-item");
      // Full paths distinguish identical folder names without relying on colour.
      item.setAttribute("label", this.moves.destinationLabel(folder));
      this.popup.appendChild(item);
      item.render?.();
      this.items.set(item, folder);
      if (this.preferences?.get?.("decorateMoveToFolderMenu") === false) this.decoration.showPlainItem(item);
      else {
        const color = this.decoration.getFolderDisplayColor(folder, this.colorManager?.getColor?.(folder));
        try { this.decoration.decorateItem(item, folder, color); }
        catch (error) { this.decoration.reportError(error); }
      }
    }
    this.command.disabled = this.items.size === 0;
  }

  destroy() {
    this.clear();
    for (const stop of this.stops) stop?.();
    this.stops = [];
    this.menu?.removeEventListener("popupshowing", this.show);
    this.menu?.removeEventListener("popuphidden", this.hide);
    this.menu?.removeEventListener("command", this.activate);
    this.signal?.removeEventListener("abort", this.onAbort);
    setBzfCommandIcon(this.command, null, "off", this.host);
    this.command?.remove();
    this.menu = this.popup = this.command = this.source = null;
  }
}

export function createBrowserFolderMoveAdapters(host, preferences, populationRegistry) {
  const browser = host.gBrowser;
  const direct = folder => Array.from(folder?.groupContainer?.children ?? []).filter(item =>
    !item.classList?.contains("zen-tab-group-start")
    && !item.classList?.contains("pinned-tabs-container-separator"));
  const supported = item => item?.isZenFolder || browser?.isTab?.(item)
    || browser?.isSplitViewWrapper?.(item)
    || (browser?.isTabGroup?.(item) && item.hasAttribute?.("split-view-group"));
  const ancestry = folder => {
    const chain = [], seen = new Set();
    for (let node = folder; node?.isZenFolder; node = node.group) {
      if (seen.has(node)) return null;
      seen.add(node); chain.push(node);
    }
    return chain;
  };
  const tree = folder => {
    const entries = [], seen = new Set();
    const visit = (node, depth) => {
      if (seen.has(node)) return false;
      seen.add(node); entries.push({node, depth});
      const children = direct(node);
      return children.every(supported)
        && children.filter(item => item.isZenFolder).every(child => visit(child, depth + 1));
    };
    return visit(folder, 0) ? entries : null;
  };
  const eligible = folder => {
    const chain = ancestry(folder);
    const workspace = host.gZenWorkspaces?.activeWorkspace;
    return Boolean(isRegularFolder(folder) && folder.isConnected && workspace
      && chain?.every(node => isRegularFolder(node) && node.ownerDocument === host.document
        && !node.hasAttribute?.("split-view-group") && browserWorkspaceId(node) === workspace));
  };
  const anchorFor = (source, destination) => {
    const children = direct(destination).filter(item => item !== source);
    if (!children.every(supported)) return {};
    const real = children.filter(item => !item.hasAttribute?.("zen-empty-tab"));
    const top = preferences?.get?.("movedFolderPosition") === "top";
    // Native before(empty-tab) deliberately inserts AFTER that sentinel. Native
    // after(empty-tab) instead targets its parent, so never use it for empties.
    const boundary = real.length ? (top ? real[0] : real.at(-1))
      : children.find(item => item.hasAttribute?.("zen-empty-tab"));
    // Ordinary split tab-groups lack a pinned getter. The native receiver first
    // checks pinned state, then promotes a member tab to its whole split group.
    const item = boundary?.hasAttribute?.("split-view-group") && !boundary.pinned
      ? Array.from(boundary.tabs ?? []).find(tab => tab.group === boundary && tab.pinned)
      : boundary;
    return {item, boundary, before: real.length ? top : true};
  };
  const canMove = (source, destination) => {
    if (!eligible(source) || !eligible(destination) || source === destination
      || source.contains?.(destination)
      || typeof browser?.moveTabBefore !== "function" || typeof browser?.moveTabAfter !== "function") return false;
    const subtree = tree(source), ancestors = ancestry(destination);
    if (!subtree || !ancestors || ancestors.includes(source)) return false;
    const max = host.Services?.prefs?.getIntPref?.("zen.folders.max-subfolders", 5) ?? 5;
    if (!Number.isInteger(max) || max < 1
      || ancestors.length + Math.max(...subtree.map(entry => entry.depth)) >= max) return false;
    const {item, boundary} = anchorFor(source, destination);
    return Boolean(boundary?.parentElement === destination.groupContainer && item?.pinned
      && host.gZenFolders?.canDropElement?.(source, item) === true);
  };
  return {
    eligible, canMove,
    listDestinations: source => Array.from(browser?.tabGroups ?? []).filter(folder => canMove(source, folder)),
    destinationLabel: folder => (ancestry(folder) ?? []).reverse().map(node => node.label || "Folder").join(" / "),
    move: (source, destination) => {
      if (!canMove(source, destination)) return false;
      const {item, before} = anchorFor(source, destination);
      const folders = new Set([...ancestry(source), ...ancestry(destination), ...tree(source).map(entry => entry.node)]);
      const states = new Map([...folders].map(folder => [folder, folder.collapsed]));
      const release = [...folders].map(folder => populationRegistry?.hold?.(folder));
      try {
        // The native receiver supports a group object, unlike addTabs(). It
        // retains all children, emits native movement events and updates caches.
        if (before) browser.moveTabBefore(source, item);
        else browser.moveTabAfter(source, item);
        if (source.group !== destination) throw new Error("native folder move did not reach the selected destination");
        const placed = direct(destination).filter(child => !child.hasAttribute?.("zen-empty-tab"));
        if ((preferences?.get?.("movedFolderPosition") === "top" ? placed[0] : placed.at(-1)) !== source) {
          throw new Error("native folder move did not reach the selected position");
        }
        return true;
      } finally {
        for (const [folder, collapsed] of states) {
          if (folder.isConnected && typeof collapsed === "boolean" && folder.collapsed !== collapsed) folder.collapsed = collapsed;
        }
        for (const done of release.reverse()) done?.();
      }
    },
  };
}

export function createBrowserSubfolderCreationAdapters(
  host,
  preferences = null,
  iconIntegrityManager = null,
) {
  const menu = () => host.document?.getElementById?.("zenFolderActions") ?? null;
  const commandItem = () => host.document?.getElementById?.(
    "context_zenFolderNewSubfolder",
  ) ?? null;
  return {
    preferences,
    menuTarget: menu,
    getContextFolder: event => {
      const target = event?.explicitOriginalTarget ?? null;
      let folder = null;
      if (host.gBrowser?.isTabGroupLabel?.(target)) folder = target.group;
      else if (host.gBrowser?.isTabGroupLabel?.(target?.parentElement)) {
        folder = target.parentElement.group;
      } else {
        const row = target?.classList?.contains?.("tab-group-label-container")
          ? target
          : target?.closest?.(".tab-group-label-container") ?? null;
        folder = row?.parentElement ?? null;
      }
      return folder?.isZenFolder === true ? folder : null;
    },
    isCreateCommand: event => event?.target === commandItem()
      || event?.target?.id === "context_zenFolderNewSubfolder",
    createSubfolder: (parent, position) => {
      if (parent?.isZenFolder !== true) throw new TypeError("subfolder parent is unavailable");
      if (typeof host.gZenFolders?.createFolder !== "function") {
        throw new Error("gZenFolders.createFolder is unavailable");
      }
      let ancestor = parent;
      do {
        ancestor.collapsed = false;
        ancestor = ancestor.group;
      } while (ancestor?.isZenFolder === true);

      const container = parent.groupContainer;
      const start = parent.groupStartElement
        ?? container?.querySelector?.(":scope > .zen-tab-group-start")
        ?? null;
      const insertAfter = position === "top"
        ? start
        : container?.lastElementChild ?? start;
      if (!insertAfter || typeof insertAfter.after !== "function") {
        throw new Error("native subfolder insertion anchor is unavailable");
      }
      const options = {
        renameFolder: !host.gZenUIManager?.testingEnabled,
        label: "Subfolder",
        insertAfter,
      };
      const workspaceId = parent.getAttribute?.("zen-workspace-id") ?? null;
      if (workspaceId) options.workspaceId = workspaceId;
      const folder = host.gZenFolders.createFolder([], options);
      iconIntegrityManager?.reconcileFolder?.(folder);
      return folder;
    },
    reportError: error => host.console?.error?.(
      "Better Zen Folders: unable to create a subfolder",
      error,
    ),
  };
}

export function createBrowserFolderDoubleClickRenameAdapters(host, preferences = null, visibility = null) {
  let renameStates = new WeakMap();
  const renameState = input => {
    if (!renameStates.has(input)) renameStates.set(input, {});
    return renameStates.get(input);
  };
  const activeRenameInput = () => {
    const input = host.document?.getElementById?.("tab-label-input");
    if (input?.localName !== "input" || !input.isConnected
      || !host.document.documentElement?.hasAttribute?.("zen-renaming-tab")
      || !host.gBrowser?.tabContainer?.contains?.(input)) return null;
    // The shared native editor also renames workspaces. Own only a tab editor
    // or the input immediately following the direct label of a Zen folder.
    const tab = input.closest?.(".tabbrowser-tab");
    if (tab && input.parentElement?.classList.contains("tab-editor-container")
      && tab.querySelector?.(".tab-label-container-editing")) return input;
    const label = input.previousElementSibling;
    const folder = label?.parentElement?.parentElement;
    return folder?.isZenFolder === true && folder.labelElement === label
      && label.classList?.contains("tab-label-container-editing") ? input : null;
  };
  const commitRename = input => {
    const state = renameState(input);
    if (state.exiting || state.composing || typeof host.KeyboardEvent !== "function") return false;
    state.exiting = true;
    // Let the native editor normalize, persist, notify, and clean up its target.
    // This event stays on the validated input; it is not a global Enter action.
    input.dispatchEvent(new host.KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: false,
      cancelable: true,
    }));
    return true;
  };
  const resolveLabelFromCandidate = candidate => {
    if (!candidate) return null;
    if (candidate.matches?.(".tab-group-label")) return candidate;
    return candidate.closest?.(".tab-group-label")
      ?? candidate.parentElement?.closest?.(".tab-group-label")
      ?? candidate.parentNode?.closest?.(".tab-group-label")
      ?? null;
  };
  const eventLabel = event => {
    const candidates = [event?.explicitOriginalTarget, event?.originalTarget, event?.target];
    try {
      candidates.push(...(event?.composedPath?.() ?? []));
    } catch {}
    for (const candidate of candidates) {
      const label = resolveLabelFromCandidate(candidate);
      if (label) return label;
    }
    return null;
  };
  const labelTextHit = (event, label) => {
    const x = Number(event?.clientX);
    const y = Number(event?.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
    const rect = label?.getBoundingClientRect?.();
    if (!rect || y < rect.top || y > rect.bottom) return false;
    // XUL text is not guaranteed to be centred in the label's full-height box.
    // Prefer the actual laid-out text (including bidi/zoom) over canvas estimates.
    if (label?.textContent?.trim() && host.document?.createRange) {
      const range = host.document.createRange();
      try {
        range.selectNodeContents(label);
        const rects = Array.from(range.getClientRects()).filter(r => r.width !== 0 && r.height !== 0);
        if (rects.length) return rects.some(r => x >= Math.max(r.left, rect.left)
          && x <= Math.min(r.right, rect.right) && y >= r.top && y <= r.bottom);
      } catch {} finally { range.detach?.(); }
    }
    const rawText = [
      label?.value,
      label?.getAttribute?.("value"),
      label?.textContent,
    ].find(value => value !== null && value !== undefined && String(value).trim());
    const text = String(rawText ?? "");
    if (!text) return false;
    const style = host.getComputedStyle?.(label) ?? {};
    const canvas = host.document?.createElementNS?.(
      "http://www.w3.org/1999/xhtml",
      "canvas",
    );
    const context = canvas?.getContext?.("2d") ?? null;
    if (!context) return x >= rect.left && x <= rect.right;
    context.font = style.font || `${style.fontWeight || "normal"} ${style.fontSize || "16px"} ${style.fontFamily || "sans-serif"}`;
    const metrics = context.measureText(text);
    const startPadding = Number.parseFloat(style.paddingInlineStart) || 0;
    const endPadding = Number.parseFloat(style.paddingInlineEnd) || 0;
    const availableWidth = Math.max(0, rect.right - rect.left - startPadding - endPadding);
    const spacing = (Number.parseFloat(style.letterSpacing) || 0) * Math.max(0, Array.from(text).length - 1);
    const width = Math.min(metrics.width + spacing, availableWidth);
    const glyphHeight = (metrics.actualBoundingBoxAscent ?? 0) + (metrics.actualBoundingBoxDescent ?? 0)
      || Number.parseFloat(style.fontSize) || 16;
    const centerY = (rect.top + rect.bottom) / 2;
    if (Math.abs(y - centerY) > glyphHeight / 2 + 2) return false;
    const left = style.direction === "rtl"
      ? rect.right - endPadding - width
      : rect.left + startPadding;
    return x >= left && x <= left + width;
  };
  return {
    preferences,
    eventTarget: () => host.gBrowser?.tabContainer ?? host,
    renameEventTarget: () => host.document ?? host,
    clearRenameState: () => { renameStates = new WeakMap(); },
    handleRenameExit: event => {
      const input = event.target;
      // Native Enter removes the input before completing an asynchronous folder
      // rename. A reentrant blur must not invoke the native cancel handler.
      if (renameStates.get(input)?.exiting) {
        if (event.type === "blur") event.stopImmediatePropagation();
        return;
      }
      if (input !== activeRenameInput()) return;
      const state = renameState(input);
      if (event.type === "compositionstart") {
        state.composing = true;
      } else if (event.type === "compositionend") {
        state.composing = false;
        if (state.pendingBlur && host.document.activeElement !== input) commitRename(input);
        state.pendingBlur = false;
      } else if (event.type === "blur") {
        if (state.cancelled) return;
        event.stopImmediatePropagation();
        if (state.composing) state.pendingBlur = true;
        else commitRename(input);
      } else if (event.type === "keydown" && (event.key === "Enter" || event.key === "Escape")) {
        if (state.composing || event.isComposing || event.keyCode === 229) {
          // Preserve the IME default action while keeping native rename from
          // treating composition confirmation/cancellation as an editor exit.
          event.stopImmediatePropagation();
        } else if (event.key === "Enter") {
          state.exiting = true;
        } else if (preferences?.get?.("renameEscapeAction") === "cancel") {
          state.cancelled = true;
        } else {
          event.preventDefault();
          event.stopImmediatePropagation();
          commitRename(input);
        }
      }
    },
    getLabelFolder: event => {
      const label = eventLabel(event);
      const folder = label?.parentElement?.parentElement ?? null;
      return folder?.isZenFolder === true
        && folder.labelElement === label
        && labelTextHit(event, label)
        ? folder
        : null;
    },
    setTimeout: (callback, delay) => host.setTimeout(callback, delay),
    clearTimeout: timer => host.clearTimeout(timer),
    toggleFolder: folder => {
      if (visibility?.started) visibility.toggleFolder(folder);
      else folder.collapsed = !folder.collapsed;
    },
    renameFolder: folder => {
      if (typeof folder?.rename !== "function") {
        throw new Error("native Zen folder rename is unavailable");
      }
      folder.rename();
    },
    commitActiveRenameOnOutsidePointer: event => {
      const input = activeRenameInput();
      if (!input || input.contains(event?.target) || event?.composedPath?.().includes(input)) return false;
      return commitRename(input);
    },
    reportError: error => host.console?.error?.(
      "Better Zen Folders: unable to rename folder from double-click",
      error,
    ),
  };
}

export function createBrowserRestoreAdapters(
  host,
  populationRegistry = null,
  preferences = null,
  colorManager = null,
  iconIntegrityManager = null,
  visibility = null,
) {
  const liveManager = browserLiveManager(host);
  // Lazy: ordinary installations without URL-intent records do not acquire
  // policy hooks or require the new pin capability to restore old records.
  let urlPinRecovery;
  const getUrlPinRecoveryManager = () => {
    if (!urlPinRecovery) {
      const adapters = createBrowserFolderPinAdapters(host);
      urlPinRecovery = new FolderPinRecovery(adapters, new FolderPinIntentStore(adapters));
    }
    return urlPinRecovery;
  };
  const ownedFolders = new WeakSet();
  const ownedLiveStates = new WeakMap();
  const ownedColorStates = new WeakMap();
  const ownedStickyStates = new WeakMap();
  const allocateFolderId = () => {
    const generated = host.Services?.uuid?.generateUUID?.().toString?.()
      ?? host.crypto?.randomUUID?.()
      ?? null;
    if (!isNonEmptyString(generated)) {
      throw new Error("Zen-compatible UUID generation is unavailable");
    }
    return generated.replace(/^\{|\}$/g, "");
  };
  const liveState = folder => browserLiveState(liveManager, folder);
  const directItems = (folder, directItem) => browserDirectItems(host, folder, directItem);

  return {
    populationRegistry,
    preferences,
    setFolderCollapsed: (folder, collapsed) => {
      folder.collapsed = collapsed;
      host.gZenFolders?.updateFolderIcon?.(folder);
    },
    getUrlPinRecovery: tab => {
      const raw = host.SessionStore?.getCustomTabValue?.(tab, FOLDER_PIN_INTENT_KEY);
      return raw ? getUrlPinRecoveryManager().capture(tab) : null;
    },
    applyUrlPinRecovery: (tab, value) => getUrlPinRecoveryManager().apply(tab, value),
    getTabSticky: tab => visibility ? visibility.isSticky(tab) : null,
    applyStickyRecovery: (tab, sticky) => {
      if (!visibility?.store) throw new Error('Sticky recovery is not ready');
      const before = host.SessionStore.getCustomTabValue(tab,STICKY_TAB_KEY) ?? '';
      visibility.store.set(tab,sticky);
      const written = host.SessionStore.getCustomTabValue(tab,STICKY_TAB_KEY) ?? '';
      visibility.schedule();
      return () => {
        if ((host.SessionStore.getCustomTabValue(tab,STICKY_TAB_KEY) ?? '') !== written) throw new Error('Sticky recovery rollback no longer owns the value');
        host.SessionStore.setCustomTabValue(tab,STICKY_TAB_KEY,before);
        visibility.schedule();
      };
    },
    isDuplicateTab: tab => folderPinDuplicates.has(tab),
    eventTarget: () => host,
    tabContainer: () => host.gBrowser?.tabContainer ?? null,
    listTabs: () => Array.from(host.gBrowser?.tabs ?? []),
    createMutationObserver: callback => typeof host.MutationObserver === "function"
      ? new host.MutationObserver(callback)
      : null,
    deferMetadataSynchronization: callback => {
      const timer = host.setTimeout(callback, 0);
      return () => host.clearTimeout(timer);
    },
    sessionStore: host.SessionStore,
    nativeGroupRestoreAvailabilityError: () => {
      if (typeof host.gBrowser?.isTabGroup !== "function") {
        return new Error("gBrowser.isTabGroup is unavailable");
      }
      if (typeof host.SessionStore?.isTabRestoring !== "function") {
        return new Error("SessionStore.isTabRestoring is unavailable");
      }
      if (
        typeof host.Services?.uuid?.generateUUID !== "function"
        && typeof host.crypto?.randomUUID !== "function"
      ) return new Error("Zen-compatible UUID generation is unavailable");
      if (typeof host.setTimeout !== "function" || typeof host.clearTimeout !== "function") {
        return new Error("native group restore deferral timers are unavailable");
      }
      return null;
    },
    deferNativeGroupRestore: callback => {
      const timer = host.setTimeout(callback, 0);
      return () => host.clearTimeout(timer);
    },
    isNativeRestoredGroup: group =>
      host.gBrowser?.isTabGroup?.(group) === true && group?.isZenFolder !== true,
    sessionRestoreReady: () => host.SessionStore?.promiseAllWindowsRestored ?? Promise.resolve(),
    workspacesReady: () => host.gZenWorkspaces?.promiseInitialized ?? Promise.resolve(),
    listNativeGroups: () => Array.from(host.gBrowser?.tabGroups ?? []),
    isExcludedNativeGroup: group =>
      group?.id === "zen-workspace-collapsible-pins"
      || group?.isZenFolder === true
      || group?.isSplitView === true
      || host.gBrowser?.isSplitViewWrapper?.(group) === true,
    isSessionRestoreCandidate: tab =>
      host.SessionStore?.isTabRestoring?.(tab) === true
      || tab?.hasAttribute?.("pending") === true,
    getNativeGroupTabs: group => Array.from(group?.tabs ?? []),
    collectPersistedZenFolders: () => {
      if (typeof host.gZenFolders?.storeDataForSessionStore !== "function") {
        throw new Error("Zen folder session-store collector is unavailable");
      }
      return host.gZenFolders.storeDataForSessionStore();
    },
    armNativeGroupRemoval: group => {
      let settled = false;
      let resolve;
      const promise = new Promise(currentResolve => { resolve = currentResolve; });
      const finish = () => {
        if (settled) return;
        settled = true;
        group?.removeEventListener?.("TabGroupRemoved", onRemoved);
        resolve();
      };
      const onRemoved = event => {
        if (event.target === group) finish();
      };
      group?.addEventListener?.("TabGroupRemoved", onRemoved, { once: true });
      return { promise, cancel: finish };
    },
    requestNativeGroupEmptyReconciliation: group => {
      const container = group?.groupContainer;
      const document = container?.ownerDocument ?? host.document;
      if (
        typeof container?.appendChild !== "function"
        || typeof container?.removeChild !== "function"
        || typeof document?.createComment !== "function"
      ) throw new Error("native group empty-state observer container is unavailable");
      const marker = document.createComment("");
      container.appendChild(marker);
      container.removeChild(marker);
    },
    releaseNativeGroupId: group => {
      const original = group.id;
      let finished = false;
      group.id = `better-zen-folders-native-${allocateFolderId()}`;
      return {
        commit: () => { finished = true; },
        rollback: () => {
          if (finished) return;
          finished = true;
          if (group.isConnected) group.id = original;
        },
      };
    },
    clearRestoreValue: tab => {
      if (typeof host.SessionStore.deleteCustomTabValue === "function") {
        try {
          host.SessionStore.deleteCustomTabValue(tab, RESTORE_KEY);
          return;
        } catch {
          // The invalid empty value prevents stale metadata if deletion fails.
        }
      }
      host.SessionStore.setCustomTabValue(tab, RESTORE_KEY, "");
    },
    get providerValidators() { return browserProviderValidators(liveManager); },
    getMaxFolderDepth: () => {
      try {
        return host.Services?.prefs?.getIntPref(
          "zen.folders.max-subfolders",
          DEFAULT_MAX_FOLDER_DEPTH,
        ) ?? DEFAULT_MAX_FOLDER_DEPTH;
      } catch {
        return DEFAULT_MAX_FOLDER_DEPTH;
      }
    },
    isSupportedTab: tab => host.gBrowser?.isTab?.(tab) === true,
    isEssential: tab => tab?.hasAttribute?.("zen-essential") === true,
    isEmptyTab: tab => isEmptyDirectItem(tab),
    isSupportedFolder: folder => Boolean(
      folder?.isZenFolder
      && (!folder.isLiveFolder || liveState(folder) !== null)
    ),
    isSupportedSplitWrapper: item => host.gBrowser?.isSplitViewWrapper?.(item) === true,
    getTabFolder: tab => browserSplitWrapper(host, tab)?.group ?? tab?.group ?? null,
    getDirectItem: tab => browserSplitWrapper(host, tab) ?? tab,
    getDirectItems: directItems,
    getGroupTabsForClose: folder => browserGroupTabsForClose(host, folder),
    getStableId: item => {
      const id = item?.id ?? item?.splitViewId;
      return id === null || id === undefined || id === "" ? null : String(id);
    },
    getFolderAncestors: browserFolderAncestors,
    findZenFolder: id => {
      const folder = host.document.getElementById(id);
      return folder?.isZenFolder === true ? folder : null;
    },
    isIdFree: id => !browserFolderIdOccupied(host, liveManager, id),
    newFolderId: allocateFolderId,
    createFolder: (tabs, options) => {
      if (typeof host.gZenFolders?.createFolder !== "function") {
        throw new Error("gZenFolders.createFolder is unavailable");
      }
      const folder = host.gZenFolders.createFolder(tabs, options);
      if (folder && typeof folder === "object") {
        ownedFolders.add(folder);
        iconIntegrityManager?.reconcileFolder?.(folder);
      }
      return folder;
    },
    setFolderIcon: (folder, iconUrl) => {
      if (typeof host.gZenFolders?.setFolderUserIcon !== "function") {
        throw new Error("gZenFolders.setFolderUserIcon is unavailable");
      }
      iconIntegrityManager?.reconcileFolder?.(folder);
      host.gZenFolders.setFolderUserIcon(folder, iconUrl);
    },
    setFolderSticky: (folder, sticky) => {
      if (!ownedFolders.has(folder) || !visibility?.started) {
        throw new Error("Sticky restoration requires a transaction-created folder and active manager");
      }
      if (!ownedStickyStates.has(folder)) ownedStickyStates.set(folder, visibility.isSticky(folder));
      visibility.setSticky(folder, sticky);
    },
    setFolderColor: (folder, color, originalId = folder.id) => {
      if (!ownedFolders.has(folder)) {
        throw new Error("folder colour may only be restored onto a transaction-created folder");
      }
      if (
        typeof colorManager?.captureLedgerState !== "function"
        || typeof colorManager?.setColor !== "function"
        || typeof colorManager?.getColor !== "function"
      ) throw new Error("Better Zen Folders colour manager is unavailable");
      if (!ownedColorStates.has(folder)) {
        ownedColorStates.set(folder, colorManager.captureLedgerState(folder));
      }
      // The record keeps its backward-compatible hex snapshot. Its original
      // identity can also carry a known, still-valid preset association, even
      // when collision handling allocates a new restored folder ID.
      const preset = colorManager.getPresetIndex?.(originalId) ?? null;
      const changed = preset === null ? colorManager.setColor(folder, color)
        : colorManager.setPresetColor(folder, preset);
      const matches = preset === null ? colorManager.getColor(folder) === color
        : colorManager.getPresetIndex(folder) === preset;
      if (changed !== true && !matches) {
        throw new Error(`unable to restore folder colour: ${folder.id}`);
      }
    },
    placeFolder: (folder, parent, placement) => {
      const container = parent?.groupContainer ?? folder.parentElement;
      if (typeof container?.insertBefore !== "function") {
        throw new Error("Zen folder placement container is unavailable");
      }
      const currentCollapse = parent?.collapsed;
      const items = directItems(parent, folder).filter(item => item !== folder);
      const target = resolveDirectInsertion(items, placement);
      container.insertBefore(folder, target);
      if (parent && typeof currentCollapse === "boolean") parent.collapsed = currentCollapse;
    },
    resolveWorkspace: workspaceId => {
      const workspaces = host.gZenWorkspaces;
      if (workspaces?.getWorkspaceFromId?.(workspaceId)) return workspaceId;
      return typeof workspaces?.activeWorkspace === "string"
        ? workspaces.activeWorkspace
        : workspaces?.getActiveWorkspace?.()?.uuid ?? null;
    },
    reportWarning: warning => host.console.warn(warning),
    validateMissingLiveFolder: snapshot => {
      browserLiveProviderPreflight(liveManager, snapshot);
      return true;
    },
    restoreLiveProvider: (folder, snapshot) =>
      restoreBrowserLiveProvider(liveManager, folder, snapshot, ownedLiveStates),
    startRestoredLiveProvider: (folder, provider, tabsState) =>
      startBrowserRestoredLiveProvider(
        liveManager,
        folder,
        provider,
        tabsState,
        ownedLiveStates,
      ),
    rollbackCreatedFolder: folder => {
      if (ownedStickyStates.has(folder)) {
        visibility.setSticky(folder, ownedStickyStates.get(folder));
        ownedStickyStates.delete(folder);
      }
      return rollbackBrowserCreatedFolder(
      host,
      liveManager,
      folder,
      ownedFolders,
      ownedLiveStates,
      colorManager,
      ownedColorStates,
      );
    },
    getFolderSticky: folder => visibility?.isSticky(folder) === true,
    getFolderColor: folder => normalizeFolderColor(colorManager?.getColor?.(folder)),
    getFolderData: folder => {
      const icon = folder.iconURL
        ?? folder.icon?.querySelector?.("svg .icon image")?.getAttribute?.("href")
        ?? null;
      return {
        id: folder.id ?? null,
        workspaceId: browserWorkspaceId(folder),
        name: String(folder.name ?? folder.label ?? ""),
        iconUrl: icon || null,
        collapsed: folder.collapsed === true,
        saved: folder.saveOnWindowClose === true,
        type: folder.isLiveFolder ? "live" : "regular",
      };
    },
    getLiveFolderState: liveState,
    getDismissed: folder => liveManager
      ? [...liveManager.dismissedItems].filter(itemId => itemId.startsWith(`${folder.id}:`))
      : undefined,
    getTabPresentation: tab => ({
      label: String(tab.zenStaticLabel ?? tab.label ?? ""),
      iconUrl: tab.image ?? null,
      muted: tab.muted === true,
    }),
    getLiveTabState: tab => {
      const itemId = tab.getAttribute?.("zen-live-folder-item-id");
      if (!isNonEmptyString(itemId)) return null;
      return {
        itemId,
        label: tab.getAttribute?.("zen-show-sublabel") ?? null,
      };
    },
    getSplit: tab => {
      const wrapper = browserSplitWrapper(host, tab);
      if (!wrapper) return null;
      const id = wrapper.splitViewId ?? wrapper.id;
      const itemSlot = wrapper.tabs.indexOf(tab);
      return id === null || id === undefined || itemSlot < 0
        ? null
        : { id: String(id), itemSlot };
    },
    resolveFolderPath: snapshots => {
      const folders = snapshots.map(snapshot => host.document.getElementById(snapshot.id));
      return folders.every(folder => folder?.isZenFolder === true) ? folders : null;
    },
    isPinned: tab => tab?.pinned === true,
    pinTab: tab => host.gBrowser.pinTab(tab),
    closeFolderTab: (tab, event) => host.gBrowser.removeTab(tab, {
      animate: true,
      triggeringEvent: event,
    }),
    isCloseTabCommand: event => {
      const command = host.document?.getElementById?.("cmd_close");
      return Boolean(command) && event.target === command;
    },
    getCloseCommandTabs: () => host.gBrowser.multiSelectedTabsCount
      ? Array.from(host.gBrowser.selectedTabs)
      : [host.gBrowser.selectedTab],
    closeFolderTabs: (tabs, event) => host.gBrowser.removeTabs(tabs, {
      animate: true,
      triggeringEvent: event,
    }),
    deleteFolderFromHeader: folder => folder.delete(),
    unpinTab: tab => host.gBrowser.unpinTab(tab),
    captureDirectItemPlacement: item => ({
      parent: item?.parentNode ?? null,
      nextSibling: item?.nextSibling ?? null,
    }),
    restoreDirectItemPlacement: (item, placement) => {
      const parent = placement?.parent;
      if (typeof parent?.insertBefore !== "function") {
        throw new Error("original direct-item placement container is unavailable");
      }
      const target = placement.nextSibling?.parentNode === parent
        ? placement.nextSibling
        : null;
      parent.insertBefore(item, target);
    },
    insertDirectItem: (folder, item, target) => {
      const parent = folder.groupContainer;
      // SSTabRestoring can run between trusted mousedown and dragstart. Even an
      // already-adjacent insertBefore detaches Gecko's pressed drag source.
      if (item.parentNode === parent && (item === target || item.nextSibling === target)) return;
      parent.insertBefore(item, target);
    },
    restoreTabPresentation: (tab, presentation) => {
      tab.zenStaticLabel = presentation.label;
      tab.label = presentation.label;
      host.gBrowser.setIcon?.(tab, presentation.iconUrl);
      if (tab.muted === presentation.muted) return;
      if (typeof tab.toggleMuteAudio !== "function") {
        throw new Error("restored tab mute presentation is incompatible");
      }
      tab.toggleMuteAudio();
    },
    restoreLiveTabState: (tab, state) => {
      const sublabel = tab.querySelector?.(".zen-tab-sublabel") ?? null;
      if (state === null) {
        tab.removeAttribute?.("zen-live-folder-item-id");
        tab.removeAttribute?.("zen-show-sublabel");
        if (sublabel) {
          host.document?.l10n?.setArgs?.(sublabel, {
            tabSubtitle: "zen-default-pinned",
          });
        }
        return;
      }
      tab.setAttribute?.("zen-live-folder-item-id", state.itemId);
      if (state.label === null) {
        tab.removeAttribute?.("zen-show-sublabel");
        if (sublabel) {
          host.document?.l10n?.setArgs?.(sublabel, {
            tabSubtitle: "zen-default-pinned",
          });
        }
        return;
      }
      tab.setAttribute?.("zen-show-sublabel", state.label);
      if (sublabel) {
        host.document?.l10n?.setArgs?.(sublabel, { tabSubtitle: state.label });
      }
    },
    invalidateTabCaches: () => host.gBrowser.tabContainer._invalidateCachedTabs(),
    isSelected: tab => host.gBrowser.selectedTab === tab || tab?.selected === true,
    getSelectedTab: () => host.gBrowser.selectedTab,
    selectTab: tab => { host.gBrowser.selectedTab = tab; },
    restoreSelectedTab: tab => {
      if (tab) host.gBrowser.selectedTab = tab;
    },
    reportError: error => host.console.error("Better Zen Folders: unable to restore tab folder", error),
  };
}

export function createBrowserNewTabTransactionAdapters(
  host,
  tabContainer,
  populationRegistry = null,
  preferences = null,
) {
  let activeHandoff = null;

  return {
    populationRegistry,
    preferences,
    isFolderInCurrentWindow: folder =>
      folder.ownerGlobal === host || folder.ownerDocument?.defaultView === host,
    isFolderInActiveWorkspace: folder => {
      const workspaces = host.gZenWorkspaces;
      const activeWorkspaceId = typeof workspaces?.activeWorkspace === "string"
        ? workspaces.activeWorkspace
        : workspaces?.getActiveWorkspace?.()?.uuid ?? null;
      return activeWorkspaceId !== null && browserWorkspaceId(folder) === activeWorkspaceId;
    },
    getFolderAncestors: browserFolderAncestors,
    getDirectItems: (folder, directItem) => browserDirectItems(host, folder, directItem),
    isEmptyTab: tab => isEmptyDirectItem(tab),
    armNextTabOpen: () => {
      activeHandoff?.cancel();
      const initialTab = host.gBrowser.selectedTab;
      const initialTabWasEmpty = initialTab?.isEmpty === true;
      const initialTabURI = initialTab?.linkedBrowser?.currentURI?.spec ?? initialTab?.url ?? null;
      const openedTabs = new Set();
      const closeToken = {};
      let settled = false;
      let sessionObserver = null;
      let retirementTimer = null;
      let resolvePromise;
      const promise = new Promise(resolve => { resolvePromise = resolve; });
      const isCurrentSession = () => typeof closeToken.id === "number"
        && host.gZenUIManager._isOwner?.(closeToken.id) === true;
      const finish = (tab, origin = "move") => {
        if (settled) return;
        settled = true;
        handoff.origin = origin;
        tabContainer.removeEventListener("TabOpen", onTabOpen);
        host.removeEventListener("ZenURLBarClosed", onZenURLBarClosed);
        sessionObserver?.disconnect();
        sessionObserver = null;
        if (retirementTimer !== null) host.clearTimeout(retirementTimer);
        retirementTimer = null;
        openedTabs.clear();
        if (activeHandoff === handoff) activeHandoff = null;
        resolvePromise(tab);
      };
      const checkSession = () => {
        if (settled || retirementTimer !== null) return;
        if (isCurrentSession() && host.gURLBar?.hasAttribute("zen-newtab")) return;
        // Native Zen can dismiss an unfocused dialogue without a close event.
        // It removes zen-newtab in one task, then dispatches a focused close in
        // another. Mutation delivery occurs after that second task is queued;
        // defer once so a valid confirmation wins, with no polling/time limit.
        retirementTimer = host.setTimeout(() => {
          retirementTimer = null;
          if (!isCurrentSession() || !host.gURLBar?.hasAttribute("zen-newtab")) finish(null);
        }, 0);
      };
      const onTabOpen = event => {
        const tab = event.target;
        const tabWindow = tab?.documentGlobal ?? tab?.ownerDocument?.defaultView;
        if (
          activeHandoff !== handoff
          || !isCurrentSession()
          || tabWindow !== host
          || host.gURLBar?.hasAttribute("zen-newtab") !== true
        ) return;
        openedTabs.add(tab);
      };
      const onZenURLBarClosed = event => {
        if (host.gZenUIManager.matchesCloseToken?.(closeToken, event) !== true) return;
        if (!isCurrentSession()) return finish(null);
        if (event.detail?.onElementPicked !== true) return finish(null);
        const selectedTab = host.gBrowser.selectedTab;
        if (!selectedTab || selectedTab.closing || selectedTab.isConnected === false) return finish(null);
        // Zen dispatches confirmation after its choice has selected/navigated
        // the tab. Unrelated background TabOpen events are not that choice.
        if (openedTabs.has(selectedTab)) return finish(selectedTab, "new");
        const selectedTabURI = selectedTab?.linkedBrowser?.currentURI?.spec ?? selectedTab?.url ?? null;
        const reusedInitialTab = selectedTab === initialTab
          && initialTabWasEmpty
          && (selectedTab?.isEmpty !== true || selectedTabURI !== initialTabURI);
        finish(reusedInitialTab ? initialTab : null);
      };
      const handoff = { promise, closeToken, afterOpen: checkSession, cancel: () => finish(null) };
      activeHandoff = handoff;
      tabContainer.addEventListener("TabOpen", onTabOpen);
      host.addEventListener("ZenURLBarClosed", onZenURLBarClosed);
      sessionObserver = new host.MutationObserver(checkSession);
      sessionObserver.observe(host.gURLBar, { attributes: true, attributeFilter: ["zen-newtab"] });
      return handoff;
    },
    handleNewTab: (...args) => host.gZenUIManager.handleNewTab(...args),
    placeCreatedTab: (tab, origin, operation) => {
      const hooks = host.__betterZenFoldersFolderPins?.origins;
      return hooks?.active ? hooks.placeCreatedTab(tab, origin, operation) : operation();
    },
    pinTab: tab => host.gBrowser.pinTab(tab),
    insertDirectItem: (folder, item, target) => folder.groupContainer.insertBefore(item, target),
    selectTab: tab => { host.gBrowser.selectedTab = tab; },
    isBlankNewTab: tab => {
      const spec = tab.linkedBrowser?.currentURI?.spec ?? tab.url ?? null;
      return spec === "about:newtab" || spec === "about:blank" || spec === "about:home";
    },
    removeTab: tab => host.gBrowser.removeTab(tab),
    reportError: error => host.console.error("Better Zen Folders: unable to place new tab in folder", error),
  };
}

export function createBrowserCollapsedFolderDragGuardAdapters(host, preferences = null, visibility = null) {
  return {
    preferences,
    eventTarget: () => host,
    dragStartTarget: () => host.gBrowser?.tabContainer ?? null,
    isNativeTabDrag: event =>
      Array.from(event.dataTransfer?.types ?? [])
        .includes("application/x-moz-tabbrowser-tab"),
    getDragSession(event) {
      try {
        const source = event.dataTransfer?.mozGetDataAt?.("application/x-moz-tabbrowser-tab", 0)
          ?? event.target?.closest?.("tab, .tab-group-label") ?? event.target;
        if (!(host.gBrowser?.isTab?.(source) || host.gBrowser?.isTabGroupLabel?.(source))
          || source.documentGlobal !== host) return null;
        // Native owns _dragData on the initiating tab or group label, not every moving member.
        return { source, data: source._dragData };
      } catch { return null; }
    },
    isDragSessionCurrent: session => !!(session?.data
      && session.source._dragData === session.data && session.source.isConnected
      && session.source.documentGlobal === host),
    acceptsDragEvent: (event, session) => {
      if (!Array.from(event.dataTransfer?.types ?? []).includes("application/x-moz-tabbrowser-tab")) return false;
      try {
        const source = event.dataTransfer?.mozGetDataAt?.("application/x-moz-tabbrowser-tab", 0);
        return (!source || source === session?.source) && event.dataTransfer?.dropEffect !== "copy";
      } catch { return false; }
    },
    getTargetFolder: event => event.target?.closest?.("zen-folder")
      ?? (event.target?.isZenFolder ? event.target : null),
    getRelatedTargetFolder: event => event.relatedTarget?.closest?.("zen-folder")
      ?? (event.relatedTarget?.isZenFolder ? event.relatedTarget : null),
    isZenFolder: folder => folder?.isZenFolder === true,
    isFolderCollapsed: folder => folder?.collapsed === true,
    isPathOnlyFolder: folder => visibility?.projection?.get(folder)?.pathOnly === true,
    beginDragExpansion: folder => {
      if (!visibility?.started) return false;
      visibility.beginDragExpansion(folder);return true;
    },
    cancelDragExpansion: folder => visibility?.cancelDragExpansion?.(folder) === true,
    releaseDragExpansion: folder => visibility?.releaseDragExpansion?.(folder),
    setFolderCollapsed: (folder, collapsed) => {
      folder.collapsed = collapsed;
      host.gZenFolders?.updateFolderIcon?.(folder);
    },
    getHoverDelayMs: () => preferences?.get?.("dragHoverDelayMs") ?? DRAG_HOVER_DELAY_MS,
    getRecollapseDelayMs: () => preferences?.get?.("dragRecollapseDelayMs") ?? 500,
    getParentFolder: folder => folder?.group ?? folder?.parentFolder
      ?? folder?.parentNode?.closest?.("zen-folder") ?? null,
    getDraggedItems(event) {
      const tab = event.target?.closest?.("tab") ?? event.target;
      if (!host.gBrowser?.isTab?.(tab) || tab.documentGlobal !== host) return [];
      return Array.from(tab._dragData?.movingTabs ?? [tab]).filter(item =>
        host.gBrowser.isTab(item) && item.documentGlobal === host
      );
    },
    isItemInFolder: (item, folder) => item?.documentGlobal === host
      && host.gBrowser?.isTab?.(item) === true && folder?.contains?.(item) === true,
    commitDragExpansion: folder => visibility?.commitDragExpansion?.(folder),
    setTimer: (callback, delay) => host.setTimeout(callback, delay),
    clearTimer: timer => host.clearTimeout(timer),
    defer(callback) {
      const timer = host.setTimeout(callback, 0);
      return () => host.clearTimeout(timer);
    },
  };
}

export function createBrowserFolderEndDropAdapters(host, visibility = null, preferences = null) {
  const tabs = host.gBrowser?.tabContainer;
  const diagnostics = new DragDiagnosticRecorder({preferences, now: () => host.performance?.now?.() ?? globalThis.performance?.now?.() ?? 0});
  const native = () => tabs?.tabDragAndDrop;
  const pins = () => host.gZenWorkspaces?.pinnedTabsContainer ?? host.gBrowser?.pinnedTabsContainer;
  const isTab = item => host.gBrowser?.isTab?.(item) === true;
  const unsupported = item => !item || item.isLiveFolder || item.splitview
    || host.gBrowser?.isSplitViewWrapper?.(item)
    || (host.gBrowser?.isTabGroup?.(item) && !item.isZenFolder)
    || ["zen-essential", "zen-live-folder-item-id", "split-view-group", "zen-glance-tab"]
      .some(name => item.hasAttribute?.(name));
  const safeAncestors = item => {
    for (let node = item; node && node !== tabs; node = node.parentElement) {
      if (unsupported(node)) return false;
    }
    return true;
  };
  const validSource = source => isTab(source) && source.isConnected
    && source.documentGlobal === host
    && tabs?.contains(source) && safeAncestors(source)
    && !source.hasAttribute("zen-empty-tab") && !source.multiselected
    && !source._dragData?.fromTabList
    && source._dragData?.movingTabs?.length === 1
    && source._dragData.movingTabs[0] === source
    && source.getAttribute("zen-workspace-id") === host.gZenWorkspaces?.activeWorkspace;
  const items = container => Array.from(container?.children ?? []).filter(item =>
    item.isZenFolder || isTab(item) || host.gBrowser?.isTabGroup?.(item)
    || host.gBrowser?.isSplitViewWrapper?.(item));
  const rowFor = item => item.isZenFolder ? item.labelContainerElement : item;
  const rendered = item => {
    if (visibility?.projection?.get(item)?.visible === false || item.hidden) return false;
    const row = rowFor(item);
    if (!row?.isConnected || !row.getClientRects().length) return false;
    const style = host.getComputedStyle(row);
    const rect = row.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const folderName = folder => String(folder.label || folder.labelElement?.textContent || "Folder");
  const getLayout = (source, root = null, includeLabels = true) => {
    const section = pins();
    if (!validSource(source) || !section?.isConnected || !host.gZenPinnedTabManager
      || typeof native()?.getDropEffectForTabDrag !== "function") return null;
    const chain = [];
    if (root) {
      if (!isRegularFolder(root) || !section.contains(root) || !rendered(root)) return null;
      // A local branch can end before later siblings in an outer folder. Keep
      // that boundary's identity, but offer every receiving ancestor as well.
      for (let node = root.parentElement; node && node !== section; node = node.parentElement) {
        if (node.isZenFolder) {
          if (!isRegularFolder(node) || !rendered(node)) return null;
          chain.unshift(node);
        }
      }
    }
    let tail = root ?? items(section).filter(item => item !== source && rendered(item)).at(-1);
    while (tail?.isZenFolder) {
      if (!isRegularFolder(tail) || !safeAncestors(tail)) return null;
      chain.push(tail);
      tail = items(tail.groupContainer).filter(item => item !== source && rendered(item)
        && !item.hasAttribute("zen-empty-tab")).at(-1);
    }
    if (!chain.length || (tail && unsupported(tail))) return null;
    const inner = chain.at(-1);
    const direct = items(inner.groupContainer).filter(item => item !== source);
    const anchor = direct.filter(item => !item.hasAttribute("zen-empty-tab")).at(-1)
      ?? direct.find(item => item.hasAttribute("zen-empty-tab"));
    if (!anchor || unsupported(anchor)) return null;
    // Geometry comes from rendered rows, never the full collapsed folder bounds.
    const sectionRect = section.getBoundingClientRect();
    const rtl = host.getComputedStyle(section).direction === "rtl";
    const indent = item => {
      const rect = rowFor(item).getBoundingClientRect();
      return Math.max(0, rtl ? sectionRect.right - rect.right : rect.left - sectionRect.left);
    };
    const intents = [{ anchor, before: anchor.hasAttribute("zen-empty-tab"), folder: inner,
      label: includeLabels ? `End of ${folderName(inner)}` : "", indent: tail ? indent(tail) : indent(inner) + 14 }];
    for (let i = chain.length - 1; i >= 0; i--) {
      const folder = chain[i];
      intents.push({ anchor: folder, before: false, folder: chain[i - 1] ?? null,
        label: includeLabels ? `After ${folderName(folder)} in ${i ? folderName(chain[i - 1]) : "Pinned Tabs"}` : "",
        indent: indent(folder) });
    }
    return { pins: section, root: root ?? chain[0], chain, intents, endRow: rowFor(tail ?? inner) };
  };
  const updateFooter = (footer, layout) => {
    footer.layout = layout;
    const colours = preferences?.get?.("colourCodeDragDestinations") !== false;
    if (footer.element.getAttribute("data-bzf-drop-colours") !== String(colours)) {
      footer.element.setAttribute("data-bzf-drop-colours", String(colours));
    }
    footer.rows.forEach((row, i) => {
      row.intent = layout.intents[i];
      if (row.label.textContent !== row.intent.label) row.label.textContent = row.intent.label;
      const indent = `${row.intent.indent}px`;
      if (row.element.style.getPropertyValue("--bzf-drop-indent") !== indent) {
        row.element.style.setProperty("--bzf-drop-indent", indent);
      }
      const folder = row.intent.folder;
      const colour = folder ? host.getComputedStyle(folder).getPropertyValue("--better-zen-folders-folder-color").trim() : "";
      if (row.element.style.getPropertyValue("--bzf-drop-colour") !== colour) {
        if (colour) row.element.style.setProperty("--bzf-drop-colour", colour);
        else row.element.style.removeProperty("--bzf-drop-colour");
      }
      const svg = folder?.querySelector?.(DIRECT_FOLDER_ICON_SVG_SELECTOR);
      const iconKey = svg?.outerHTML ?? (folder ? resolveFolderMenuIconSource(folder) : "");
      // Updating only changed snapshots avoids triggering our childList watcher
      // on every dragover. Isolated SVG IDs use the existing menu renderer.
      if (row.folder !== folder || row.iconKey !== iconKey || row.colour !== colour) {
        for (const child of Array.from(row.icon.children)) child.remove();
        row.folder = folder; row.iconKey = iconKey; row.colour = colour;
        if (!folder) row.icon.setAttribute("data-bzf-drop-area-icon", "true");
        else {
          row.icon.removeAttribute("data-bzf-drop-area-icon");
          if (!snapshotLiveFolderMenuIcon(host, row.element, folder, "100")) {
            const image = host.document.createElementNS("http://www.w3.org/1999/xhtml", "img");
            image.setAttribute("src", resolveFolderMenuIconSource(folder)); image.setAttribute("alt", "");
            row.icon.appendChild(image);
          }
        }
      }
    });
    if (layout.root === layout.chain[0] || !footer.element.isConnected) return;
    // Internal boundaries may have later siblings. Keep the footer in the
    // native pinned receiver, but overlay it beside this local boundary rather
    // than inserting it into a folder's animated/clipped group container.
    footer.element.setAttribute("data-bzf-drop-floating", "true");
    const viewport = layout.pins.scrollbox?.scrollbox ?? layout.pins.scrollbox ?? layout.pins;
    const clip = viewport.getBoundingClientRect(), section = layout.pins.getBoundingClientRect();
    const top = Math.max(0, clip.top) + 4;
    const bottom = Math.min(host.innerHeight ?? clip.bottom, clip.bottom) - 4;
    const left = Math.max(0, clip.left, section.left);
    const width = Math.max(0, Math.min(host.innerWidth ?? clip.right, clip.right, section.right) - left);
    const initial = footer.element.getBoundingClientRect();
    const local = host.getComputedStyle(footer.element);
    const scaleX = initial.width / parseFloat(local.width) || 1;
    const scaleY = initial.height / parseFloat(local.height) || 1;
    footer.element.style.setProperty("width", `${width / scaleX}px`);
    footer.element.style.setProperty("max-height", `${Math.max(0, bottom - top) / scaleY}px`);
    footer.element.style.setProperty("left", "0px");
    footer.element.style.setProperty("top", "0px");
    const bounds = footer.element.getBoundingClientRect();
    const desiredTop = Math.max(top, Math.min(layout.endRow.getBoundingClientRect().bottom, bottom - bounds.height));
    // A transformed sidebar can establish a scaled fixed containing block.
    // Convert measured viewport offsets and dimensions back to local CSS pixels.
    footer.element.style.setProperty("left", `${(left - bounds.left) / scaleX}px`);
    footer.element.style.setProperty("top", `${(desiredTop - bounds.top) / scaleY}px`);
  };
  const inside = (rect, x, y) => x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
  const onTriggerSurface = (layout, target) => {
    if (!layout || !target) return false;
    if (target === layout.pins || layout.root.contains(target) || target.contains?.(layout.root)) return true;
    // The blank divider is part of the boundary, but its Clear button (and
    // any other actionable descendants) retains its native receiver.
    const separator = layout.pins.separatorElement;
    if (!separator?.contains(target)) return false;
    const element = target.nodeType === 3 ? target.parentElement : target;
    for (let node = element; node && node !== separator.parentElement; node = node.parentElement) {
      if (node.matches?.('button, toolbarbutton, moz-button, input, select, textarea, a, [role="button"], [oncommand], [onclick], [tabindex]')) return false;
    }
    return true;
  };
  const inTrigger = (layout, pointer) => {
    if (!layout || !pointer || layout.pins !== pins() || !layout.root.isConnected
      || !layout.pins.contains(pointer.target)) return false;
    // Use one continuous strip across folder rows, gutter and blank divider.
    // Other rows/roots and actual controls remain independent receivers.
    if (!onTriggerSurface(layout, pointer.target)) return false;
    const viewport = layout.pins.scrollbox?.scrollbox ?? layout.pins.scrollbox ?? layout.pins;
    if (!inside(viewport.getBoundingClientRect(), pointer.clientX, pointer.clientY)) return false;
    const section = layout.pins.getBoundingClientRect(), end = layout.endRow.getBoundingClientRect();
    return pointer.clientX >= section.left && pointer.clientX < section.right
      && pointer.clientY >= end.bottom - Math.min(16, end.height)
      && pointer.clientY < end.bottom + 8;
  };
  // Restore only values that are still ours; never resurrect native's removed
  // indicator or overwrite a replacement/another native update.
  const ownStyle = (element, values) => {
    const saved = Object.keys(values).map(name => [name, element.style.getPropertyValue(name), element.style.getPropertyPriority(name)]);
    for (const [name, value] of Object.entries(values)) {
      if (value === "") element.style.removeProperty(name);
      else element.style.setProperty(name, value);
    }
    return () => {
      for (const [name, value, priority] of saved) {
        if (element.style.getPropertyValue(name) !== values[name]) continue;
        if (value) element.style.setProperty(name, value, priority);
        else element.style.removeProperty(name);
      }
    };
  };
  return {
    diagnostics,
    diagnosticState(source, pointer, layout, footer) {
      // Inspect only the active candidate or the target's root, never every folder.
      // Do not touch DataTransfer: acceptance observations are captured below from
      // reads already required by production, with absent fields meaning unobserved.
      const reasons = [], section = pins(), target = pointer?.target;
      const state = {reasons, inTabs: !!tabs?.contains(target), inPins: !!section?.contains(target)};
      if (!source) reasons.push("source_missing");
      else {
        if (!isTab(source)) reasons.push("source_not_tab");
        if (!source.isConnected) reasons.push("source_disconnected");
        if (source.documentGlobal !== host) reasons.push("source_foreign");
        if (!tabs?.contains(source)) reasons.push("source_outside_tabs");
        if (!safeAncestors(source)) reasons.push("source_unsupported");
        if (source.hasAttribute?.("zen-empty-tab")) reasons.push("source_placeholder");
        if (source.multiselected) reasons.push("source_multiselected");
        if (source._dragData?.fromTabList) reasons.push("source_tab_list");
        if (!source._dragData) reasons.push("session_missing");
        if (source._dragData?.movingTabs?.length !== 1 || source._dragData?.movingTabs?.[0] !== source) reasons.push("moving_items");
        if (source.getAttribute?.("zen-workspace-id") !== host.gZenWorkspaces?.activeWorkspace) reasons.push("source_workspace");
      }
      let candidate = layout;
      if (!candidate && target) {
        let root = target;
        while (root?.parentElement && root.parentElement !== section) root = root.parentElement;
        if (isRegularFolder(root)) candidate = getLayout(source, root, false);
      }
      state.targetKind = !target ? "none" : footer?.element.contains(target) ? "footer"
        : target === source ? "source" : target === section ? "section" : target === tabs ? "tabs"
        : target === section?.separatorElement ? "separator" : target.closest?.("zen-folder") ? "folder" : "other";
      if (!state.inPins) reasons.push("target_outside_pins");
      if (!candidate) reasons.push("layout_missing");
      else {
        state.candidate = diagnostics.token(candidate.root);
        state.inRoot = onTriggerSurface(candidate, target);
        if (!state.inRoot) reasons.push("target_outside_root");
        const rect = candidate.endRow.getBoundingClientRect();
        state.endTop = rect.top; state.endBottom = rect.bottom;
        state.triggerTop = rect.bottom - Math.min(16, rect.height); state.triggerBottom = rect.bottom + 8;
        const sectionRect = section.getBoundingClientRect();
        state.sectionLeft = sectionRect.left; state.sectionRight = sectionRect.right;
        state.inTrigger = !!pointer && pointer.clientX >= sectionRect.left && pointer.clientX < sectionRect.right
          && pointer.clientY >= state.triggerTop && pointer.clientY < state.triggerBottom;
        if (!state.inTrigger) reasons.push("outside_trigger");
      }
      const viewport = section?.scrollbox?.scrollbox ?? section?.scrollbox ?? section;
      if (viewport && pointer) {
        const rect = viewport.getBoundingClientRect(); state.viewportTop = rect.top; state.viewportBottom = rect.bottom;
        state.inViewport = inside(rect, pointer.clientX, pointer.clientY);
        if (!state.inViewport) reasons.push("outside_viewport");
      } else reasons.push("pointer_missing");
      if (footer) {
        const rect = footer.element.getBoundingClientRect(); state.footerTop = rect.top; state.footerBottom = rect.bottom;
      }
      return state;
    },
    eventTarget: () => host,
    dragStartTarget: () => tabs,
    getSource: event => {
      // Like native _getDragTarget, climb from Nodes, not only Elements.
      // Label Text nodes have no closest(); selection is not a safe fallback.
      for (let node = event?.target; node; node = node.parentNode) {
        if (isTab(node)) return node;
      }
      return null;
    },
    isSessionCurrent: (source, data) => Boolean(data && source?._dragData === data
      && source.isConnected && source.documentGlobal === host && tabs?.contains(source)),
    getDestinationDelayMs: () => preferences?.get?.("dragDestinationDelayMs") ?? 300,
    setDestinationTimer: (callback, delay) => {
      const timer = host.setTimeout(callback, delay);
      return () => host.clearTimeout(timer);
    },
    accepts: (source, event, dropping = false, starting = false) => {
      const observation = {nativeChecked: false};
      const result = (accepted, reason = null) => {
        try {
          if (diagnostics.enabled) diagnostics.record("acceptance", {event: diagnostics.token(event),
            source: diagnostics.token(source), accepted, ...observation, reasons: reason ? [reason] : []});
        } catch {}
        return accepted;
      };
      observation.sourceValid = validSource(source);
      if (!observation.sourceValid) return result(false, "source_ineligible");
      if (dropping && event.dataTransfer?.dropEffect !== "move") return result(false, "release_not_move");
      const dt = event.dataTransfer;
      observation.mimePresent = Array.from(dt?.types ?? []).includes("application/x-moz-tabbrowser-tab");
      if (!observation.mimePresent) return result(false, "mime_missing");
      observation.itemCount = dt.mozItemCount;
      if (observation.itemCount > 1) return result(false, "multiple_transfer_items");
      try {
        if (dt.mozGetDataAt) {
          observation.payloadMatches = dt.mozGetDataAt("application/x-moz-tabbrowser-tab", 0) === source;
          if (!observation.payloadMatches) return result(false, "payload_mismatch");
        }
        const effect = native()?.getDropEffectForTabDrag(event);
        observation.nativeChecked = true;
        observation.nativeEffect = ["move", "copy", "none", "link"].includes(effect) ? effect : "other";
        return result(effect === "move" || (starting && effect === "copy"),
          effect === "copy" ? "copy_effect" : effect !== "move" ? "native_rejected" : null);
      } catch { return result(false, "acceptance_exception"); }
    },
    getLayout,
    inTrigger,
    findLayout: (source, pointer) => {
      const visit = container => {
        for (const root of items(container)) {
          if (!isRegularFolder(root) || !rendered(root)) continue;
          const layout = getLayout(source, root);
          if (inTrigger(layout, pointer)) return layout;
          const nested = visit(root.groupContainer);
          if (nested) return nested;
        }
        return null;
      };
      return visit(pins());
    },
    createFooter: layout => {
      const element = host.document.createElementNS("http://www.w3.org/1999/xhtml", "div");
      element.setAttribute("class", "better-zen-folders-drop-footer");
      element.setAttribute("role", "group");
      element.setAttribute("aria-label", "Folder drop destinations");
      const rows = layout.intents.map((intent, index) => {
        const row = host.document.createElementNS("http://www.w3.org/1999/xhtml", "div");
        row.setAttribute("class", "better-zen-folders-drop-row");
        row.setAttribute("data-bzf-folder-end-row", String(index));
        const icon = host.document.createElementNS("http://www.w3.org/1999/xhtml", "span");
        icon.setAttribute("class", "menu-iconic-left"); icon.setAttribute("aria-hidden", "true");
        const label = host.document.createElementNS("http://www.w3.org/1999/xhtml", "span");
        label.setAttribute("class", "better-zen-folders-drop-label");
        row.appendChild(icon); row.appendChild(label);
        element.appendChild(row);
        return { element: row, intent, icon, label };
      });
      const footer = { element, rows, layout };
      const siblings = Array.from(layout.pins.children);
      layout.pins.insertBefore(element, siblings[siblings.indexOf(layout.chain[0]) + 1] ?? null);
      // Connect before snapshots allocate document-unique SVG resource IDs.
      updateFooter(footer, layout);
      return footer;
    },
    updateFooter,
    hitTest: (footer, event) => {
      if (!footer?.element.isConnected || footer.layout.pins !== pins()
        || !footer.element.contains(event.target)) return null;
      const viewport = pins().scrollbox?.scrollbox ?? pins().scrollbox ?? pins();
      if (!inside(viewport.getBoundingClientRect(), event.clientX, event.clientY)) return null;
      const bounds = footer.element.getBoundingClientRect();
      if (!inside(bounds, event.clientX, event.clientY)) return null;
      // The footer owns its indentation gutter and row gaps. Give each labeled
      // destination the full footer width and half of each adjacent gap, while
      // leaving outer margins, native rows and scroll-edge targets untouched.
      const rows = footer.rows.map(row => ({ row, rect: row.element.getBoundingClientRect() }))
        .filter(({ row, rect }) => row.element.isConnected && rect.width > 0 && rect.height > 0);
      return rows.find(({ rect }, index) => {
        const top = index ? (rows[index - 1].rect.bottom + rect.top) / 2 : bounds.top;
        const bottom = index + 1 < rows.length ? (rect.bottom + rows[index + 1].rect.top) / 2 : bounds.bottom;
        return event.clientY >= top && event.clientY < bottom;
      })?.row ?? null;
    },
    showPreview: hit => {
      native()?._clearDragOverSplit?.();
      const manager = host.gZenPinnedTabManager;
      const existing = manager._dragIndicator;
      const indicator = manager.dragIndicator;
      const rect = hit.element.getBoundingClientRect();
      const values = { top: `${Math.round(rect.bottom)}px`, left: "",
        "--indicator-left": `${rect.left}px`, "--indicator-width": `${rect.width}px` };
      const restore = ownStyle(indicator, values);
      const orientation = indicator.getAttribute("orientation");
      indicator.setAttribute("orientation", "horizontal");
      const background = host.document.getElementById("zen-dragover-background");
      const restoreBackground = background ? ownStyle(background, { visibility: "hidden" }) : null;
      hit.element.setAttribute("data-bzf-drop-active", "true");
      return () => {
        hit.element.removeAttribute("data-bzf-drop-active");
        restoreBackground?.();
        if (manager._dragIndicator !== indicator || !indicator.isConnected) return;
        const stillOwned = indicator.getAttribute("orientation") === "horizontal"
          && Object.entries(values).every(([name, value]) => indicator.style.getPropertyValue(name) === value);
        restore();
        if (indicator.getAttribute("orientation") === "horizontal") {
          if (orientation === null) indicator.removeAttribute("orientation");
          else indicator.setAttribute("orientation", orientation);
        }
        if (!existing && stillOwned) { indicator.remove(); manager._dragIndicator = null; }
      };
    },
    prepareNativeDrop: (source, intent) => {
      const data = source._dragData;
      const values = { dropElement: intent.anchor, dropBefore: intent.before,
        shouldCreateGroupOnDrop: undefined, shouldDropIntoCollapsedTabGroup: undefined };
      const saved = Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(data, key)]);
      native()?._clearDragOverSplit?.();
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined) delete data[key];
        else data[key] = value;
      }
      return () => {
        if (source._dragData !== data) return; // Native consumed it successfully.
        for (const [key, descriptor] of saved) {
          if (data[key] !== values[key]) continue;
          if (descriptor) Object.defineProperty(data, key, descriptor);
          else delete data[key];
        }
      };
    },
    defer: callback => {
      const timer = host.setTimeout(callback, 0);
      return () => host.clearTimeout(timer);
    },
    watch: callback => {
      const observer = new host.MutationObserver(callback);
      observer.observe(tabs, { childList: true, subtree: true, attributes: true,
        attributeFilter: ["data-bzf-visibility", "hidden", "collapsed", "zen-workspace-id", "zen-live-folder", "split-view-group"] });
      host.addEventListener("scroll", callback, true);
      host.addEventListener("resize", callback, true);
      host.addEventListener("ZenWorkspacesUIUpdate", callback, true);
      const unsubscribe = preferences?.subscribe?.("colourCodeDragDestinations", callback);
      return () => {
        unsubscribe?.();
        observer.disconnect();
        host.removeEventListener("scroll", callback, true);
        host.removeEventListener("resize", callback, true);
        host.removeEventListener("ZenWorkspacesUIUpdate", callback, true);
      };
    },
  };
}

export function createBrowserEmptyFolderAdapters(host, populationRegistry, preferences = null) {
  // Unknown content is not empty. In particular a native split tab-group is
  // distinct from both a Zen folder and a tab-split-view-wrapper.
  const realChild = item => !isEmptyDirectItem(item)
    && !item.classList?.contains("zen-tab-group-start")
    && !item.classList?.contains("pinned-tabs-container-separator");
  return {
    preferences,
    eventTarget: () => host,
    tabContainer: () => host.gBrowser?.tabContainer ?? null,
    createMutationObserver: callback => new host.MutationObserver(callback),
    isRealCloseDeparture: event =>
      host.gBrowser?.isTab?.(event.target) === true && !isEmptyDirectItem(event.target),
    closeDepartureFolder: event =>
      browserSplitWrapper(host, event.target)?.group ?? event.target?.group ?? null,
    ungroupDepartureFolder: event => event.target,
    folderUngroupDepartureFolder: event => event.target,
    getFolderAncestors: browserFolderAncestors,
    realChildren: folder => Array.from(
      folder?.allItems ?? folder?.groupContainer?.children ?? [],
    ).filter(realChild),
    deleteFolder: folder => {
      if (!isRegularFolder(folder) || folder.isConnected === false) return;
      const items = Array.from(folder.allItems ?? folder.groupContainer?.children ?? []);
      if (items.some(realChild)) return;
      // This is cleanup of an already-closed/moved last child, not another user
      // close. folder.delete() records an empty group, shadowing the real undo.
      for (const item of items) {
        if (isEmptyDirectItem(item) && host.gBrowser?.isTab?.(item) === true) {
          host.gBrowser.removeTab(item, {skipSessionStore:true, animate:false});
        }
      }
      return host.gBrowser.removeTabGroup(folder, {
        skipSessionStore: true,
        // No real tabs remain, and avoiding an await prevents repopulation races.
        skipPermitUnload: true,
      });
    },
    reportError: error => host.console.error(
      "Better Zen Folders: unable to remove empty regular folder",
      error,
    ),
    populationRegistry,
  };
}

function browserFolderButtonAdapters(host, populationRegistry, preferences = null) {
  const tabContainer = host.gBrowser?.tabContainer ?? null;
  const newTabTransaction = tabContainer && host.gZenUIManager
    ? new NewTabInFolderTransaction(createBrowserNewTabTransactionAdapters(
      host,
      tabContainer,
      populationRegistry,
      preferences,
    ))
    : null;

  return {
    preferences,
    folderMenu: () => host.document?.getElementById?.("zenFolderActions") ?? null,
    getContextFolder: event => browserContextFolder(host, event),
    createMenuItem: () => host.document.createXULElement("menuitem"),
    menuInsertionPoint: menu => Array.from(menu.children).find(
      item => item.id === "context_zenFolderNewSubfolder",
    ) ?? null,
    root: () => host.document?.documentElement ?? null,
    listFolders: () => Array.from(host.document.querySelectorAll("zen-folder")),
    getFolderRow: folder =>
      Array.from(folder.children).find(child =>
        child.classList?.contains("tab-group-label-container")
      ) ?? null,
    createToolbarButton: () => host.document.createXULElement("toolbarbutton"),
    newTabTransaction,
    tabContainer: () => tabContainer,
    createMutationObserver: callback => new host.MutationObserver(callback),
    observeEligibilityChanges: callback => {
      if (!tabContainer) return () => {};
      const onTabGroupUpdate = event => {
        if (event.target?.isZenFolder) callback(event.target);
      };
      tabContainer.addEventListener("TabGroupUpdate", onTabGroupUpdate);
      return () => tabContainer.removeEventListener("TabGroupUpdate", onTabGroupUpdate);
    },
  };
}

export function bootstrapBrowserWindow(host) {
  if (host.location?.href !== "chrome://browser/content/browser.xhtml") return;

  host.__betterZenFoldersController?.destroy();
  const populationRegistry = new FolderPopulationRegistry();
  const preferences = new BetterZenFoldersPreferences(createBrowserPreferenceAdapters(host));
  const colorManager = new FolderColorManager(createBrowserFolderColorAdapters(host), preferences);
  const iconIntegrityManager = new FolderIconIntegrityManager(
    createBrowserFolderIconIntegrityAdapters(host),
  );
  const pins = new FolderPinRuntime(host,preferences);
  const managers = [preferences, colorManager, iconIntegrityManager, pins];
  managers.push(new RelatedFolderTabsManager(host));
  const visibility = new StickyFolderVisibilityManager(host, preferences);
  managers.push(visibility);
  managers.push(new FolderNavigationManager(host));
  managers.push(new FolderPreviewAnchorManager(host));
  managers.push(new FolderPreviewHierarchyManager(host, preferences, {
    isSticky: item => visibility.stickyEnabled(item) && visibility.isSticky(item),
    isUrlPinned: tab => pins.policy?.active === true && pins.store?.read(tab)?.explicit === true,
  }));
  managers.push(new FolderColorMenuManager(
    createBrowserFolderColorMenuAdapters(host, preferences),
    colorManager,
  ));
  managers.push(new MoveToFolderMenuDecorator(
    createBrowserMoveToFolderMenuAdapters(host, preferences),
    colorManager,
  ));
  managers.push(new FolderMoveMenuManager(host, preferences, colorManager, populationRegistry));
  managers.push(new SpaceMoveMenuManager(host, preferences));
  managers.push(new MovedTabsMenuManager(host, preferences));
  managers.push(new FolderHeaderDropPlacementManager(host, preferences));
  managers.push(new SubfolderCreationManager(
    createBrowserSubfolderCreationAdapters(host, preferences, iconIntegrityManager),
  ));
  managers.push(new FolderDoubleClickRenameManager(
    createBrowserFolderDoubleClickRenameAdapters(host, preferences, visibility),
  ));
  managers.push(new HierarchyGuidePreferenceProjection({
    preferences,
    root: () => host.document?.documentElement ?? null,
  }));
  managers.push(new FolderSpaceColourPreferenceProjection({
    preferences,
    root: () => host.document?.documentElement ?? null,
  }));
  managers.push(new FolderNameSizePreferenceProjection({
    preferences,
    root: () => host.document?.documentElement ?? null,
  }));
  if (
    typeof host.SessionStore?.getCustomTabValue === "function"
    && typeof host.SessionStore?.setCustomTabValue === "function"
  ) {
    const restoreAdapters = createBrowserRestoreAdapters(
      host,
      populationRegistry,
      preferences,
      colorManager,
      iconIntegrityManager,
      visibility,
    );
    const restoreManager = new FolderRestoreManager(restoreAdapters);
    managers.push(restoreManager);
    managers.push(new NativeRestoreArtifactReconciler(restoreManager, restoreAdapters));
  }
  managers.push(new FolderButtonManager(
    browserFolderButtonAdapters(host, populationRegistry, preferences),
  ));
  managers.push(new FolderUnloadManager(host));
  managers.push(new EmptyRegularFolderManager(
    createBrowserEmptyFolderAdapters(host, populationRegistry, preferences),
    populationRegistry,
  ));
  const folderEndDrops = new FolderEndDropManager(createBrowserFolderEndDropAdapters(host, visibility, preferences));
  managers.push(folderEndDrops);
  managers.push(new DragDiagnosticsMenuManager(host, preferences, folderEndDrops.adapters.diagnostics));
  managers.push(new CollapsedFolderDragGuard(folderEndDrops.composeHoverAdapters(
    createBrowserCollapsedFolderDragGuardAdapters(host, preferences, visibility),
  )));
  const controller = new BetterZenFoldersController({
    createAbortController: () => new host.AbortController(),
    managers,
  });
  host.__betterZenFoldersController = controller;
  controller.start();
  host.addUnloadListener(controller.boundDestroy);
}

export function bootstrapSettingsWindow(host) {
  if (!/^about:(?:preferences|settings)(?:[?#]|$)/.test(host.location?.href ?? "")) return;
  host.__betterZenFoldersSettingsCleanup?.();
  const preferences = new BetterZenFoldersPreferences(createBrowserPreferenceAdapters(host));
  preferences.start();
  const releaseUi = installNumericSettingsUi(host, preferences);
  const releasePalette = installPaletteSettingsUi(host, preferences);
  const cleanup = () => { releasePalette(); releaseUi(); preferences.destroy(); };
  host.__betterZenFoldersSettingsCleanup = cleanup;
  host.addUnloadListener(cleanup);
}

if (typeof window !== "undefined") {
  bootstrapBrowserWindow(window);
  bootstrapSettingsWindow(window);
}
