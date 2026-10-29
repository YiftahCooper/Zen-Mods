import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const modulePath = process.env.BZF_PLAYWRIGHT_MODULE;
const skip = modulePath ? false : 'set BZF_PLAYWRIGHT_MODULE for isolated footer geometry';
const source = await readFile(new URL('../scripts/better-zen-folders.uc.mjs', import.meta.url), 'utf8');
const css = await readFile(new URL('../chrome.css', import.meta.url), 'utf8');

// Real HTML event dispatch and layout, with only the native drag/UI services
// stubbed. Native movement bodies have a separate version-pinned replay test.
// This is not a real Zen/XUL-profile or OS drag acceptance test.
for (const direction of ['ltr', 'rtl']) {
 for (const entry of ['tab-element', 'tab-text-via-divider']) {
  test(`footer XHTML rows have disjoint measured hit areas and preserve original rows (${direction}, ${entry})`, { skip }, async () => {
    const { chromium } = createRequire(import.meta.url)(modulePath);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      const previewRoot = new URL('../artifacts/render-checks/', import.meta.url);
      await mkdir(previewRoot, { recursive: true });
      const previewDir = await mkdtemp(fileURLToPath(new URL('folder-end-drop-', previewRoot)));
      await page.exposeFunction('captureFooterPreview', () => page.screenshot({
        path: `${previewDir}/${direction}.png`,
      }));
      await page.setContent(`<style>
        body{margin:12px;font:14px sans-serif}#clip{width:300px;height:320px;overflow:auto}
        #tabs,section,zen-folder,.tab-group-container{display:flex;flex-direction:column;flex-shrink:0}
        .tab-group-label-container,tab{display:flex;align-items:center;min-height:36px;flex-shrink:0}
        .tab-group-container>zen-folder,.tab-group-container>tab{margin-inline-start:14px}
        [data-bzf-visibility="hidden"]{display:none!important}.pinned-tabs-container-separator{height:8px;flex-shrink:0}
        #zen-drag-indicator{position:fixed;height:2px;left:var(--indicator-left);width:var(--indicator-width);pointer-events:none}
        ${css}
      </style><div id="clip"><div id="tabs"><section id="pins" class="zen-workspace-pinned-tabs-section">
        <zen-folder id="parent"><div class="tab-group-label-container"><label>Parent</label></div><div class="tab-group-container">
          <zen-folder id="child"><div class="tab-group-label-container"><label>Child</label></div><div class="tab-group-container"><tab id="last" pinned="true">Last</tab></div></zen-folder>
          <zen-folder id="hidden" data-bzf-visibility="hidden" style="height:9000px"><div class="tab-group-label-container">Hidden</div><div class="tab-group-container"></div></zen-folder>
        </div></zen-folder><div class="pinned-tabs-container-separator"></div></section>
        <section><tab id="source" zen-workspace-id="active">Source</tab></section>
      </div></div>`);
      const result = await page.evaluate(async ({ source, direction, entry }) => {
        document.documentElement.dir = direction;
        document.documentElement.setAttribute('zen-sidebar-expanded', 'true');
        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        const api = await import(url); URL.revokeObjectURL(url);
        const tabs = document.getElementById('tabs'), pins = document.getElementById('pins');
        tabs.tabIndex = -1;
        const clip = document.getElementById('clip'), dragged = document.getElementById('source');
        const last = document.getElementById('last'), projection = new Map();
        for (const item of document.querySelectorAll('tab,zen-folder')) {
          item.documentGlobal = window;
          Object.defineProperty(item, 'group', { get: () => item.parentElement.closest('zen-folder') });
          if (item.localName === 'zen-folder') {
            item.isZenFolder = true; item.label = item.id === 'parent' ? 'Parent' : 'Child';
            item.groupContainer = item.querySelector(':scope > .tab-group-container');
            item.labelContainerElement = item.querySelector(':scope > .tab-group-label-container');
          }
          projection.set(item, { visible: item.id !== 'hidden' });
        }
        document.getElementById('parent').collapsed = true;
        pins.scrollbox = clip; pins.separatorElement = pins.lastElementChild;
        window.gBrowser = { tabContainer: tabs, pinnedTabsContainer: pins, isTab: item => item?.localName === 'tab', isSplitViewWrapper: () => false };
        window.gZenWorkspaces = { activeWorkspace: 'active', pinnedTabsContainer: pins };
        window.gZenPinnedTabManager = { _dragIndicator: null, get dragIndicator() {
          if (!this._dragIndicator) { this._dragIndicator = document.createElement('div'); this._dragIndicator.id = 'zen-drag-indicator'; document.body.appendChild(this._dragIndicator); }
          return this._dragIndicator;
        } };
        tabs.tabDragAndDrop = { getDropEffectForTabDrag: event => event.dataTransfer.dropEffect === 'copy' ? 'copy' : 'move', _clearDragOverSplit() {} };
        tabs.addEventListener('dragstart', event => {
          dragged._dragData = { movingTabs: [dragged], dropElement: last, dropBefore: false }; event.stopPropagation();
        });
        let nativeOvers = 0;
        tabs.addEventListener('dragover', event => {
          nativeOvers++; event.preventDefault(); event.stopPropagation();
          gZenPinnedTabManager.dragIndicator.style.top = `${last.getBoundingClientRect().bottom}px`;
        });
        const rect = node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height, width: r.width }; };
        const existingRows = [...document.querySelectorAll('#parent > .tab-group-label-container,#child > .tab-group-label-container,#last')];
        const before = existingRows.map(rect);
        const adapters = api.createBrowserFolderEndDropAdapters(window, { projection }, {get: () => 0});
        const manager = new api.FolderEndDropManager(adapters);
        const guard = new api.CollapsedFolderDragGuard(manager.composeHoverAdapters(api.createBrowserCollapsedFolderDragGuardAdapters(window)));
        const controller = new api.BetterZenFoldersController({managers:[manager,guard], createAbortController:()=>new AbortController()});
        controller.start();
        const dt = new DataTransfer(); dt.setData('application/x-moz-tabbrowser-tab', 'fixture'); dt.dropEffect = 'move';
        dt.mozItemCount = 1; dt.mozGetDataAt = () => dragged;
        const emit = (type, target, point = {}) => target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, ...point }));
        emit('dragstart', entry === 'tab-element' ? dragged : dragged.firstChild);
        const startRows = document.querySelectorAll('[data-bzf-folder-end-row]').length;
        const point = {clientX: rect(pins).left + 1, clientY: rect(last).bottom + (entry === 'tab-element' ? -5 : 1)};
        const entryTarget = entry === 'tab-element' ? last : document.elementFromPoint(point.clientX, point.clientY);
        const hitBlankDivider = entryTarget === pins.separatorElement;
        emit('dragover', entryTarget, point);
        const rows = [...document.querySelectorAll('[data-bzf-folder-end-row]')];
        const measured = rows.map(row => {
          const r = rect(row), point = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
          emit('dragover', row, point);
          return { ...r, label: row.textContent, namespace: row.namespaceURI,
            hit: document.elementFromPoint(point.clientX, point.clientY) === row,
            active: row.hasAttribute('data-bzf-drop-active') };
        });
        const after = existingRows.map(rect);
        // Use real hit targets across the indentation gutter and inter-row gaps,
        // not only synthetic events addressed directly to each row's center.
        const footerRect = rect(manager.footer.element);
        const expanded = [];
        for (let index = 0; index < rows.length; index++) {
          const r = rect(rows[index]);
          const ys = [r.top, (r.top + r.bottom) / 2, r.bottom - 0.25];
          if (index < rows.length - 1) {
            const midpoint = (r.bottom + rect(rows[index + 1]).top) / 2;
            ys.push(midpoint - 0.25);
          }
          if (index > 0) ys.push((rect(rows[index - 1]).bottom + r.top) / 2);
          for (const x of [footerRect.left + 0.25, (footerRect.left + footerRect.right) / 2, footerRect.right - 0.25]) {
            for (const y of ys) {
              const target = document.elementFromPoint(x, y);
              emit('dragover', target, { clientX: x, clientY: y });
              expanded.push({ index, x, y, active: rows[index].hasAttribute('data-bzf-drop-active'),
                hit: adapters.hitTest(manager.footer, { target, clientX: x, clientY: y })?.element === rows[index] });
            }
          }
        }
        const outside = [
          [footerRect.left - 0.25, measured[0].top], [footerRect.right, measured[0].top],
          [footerRect.left + 1, footerRect.top - 0.25], [footerRect.left + 1, footerRect.bottom],
        ].map(([clientX, clientY]) => Boolean(adapters.hitTest(manager.footer, {
          target: manager.footer.element, clientX, clientY,
        })));
        await window.captureFooterPreview();
        // Actual DOM focus-generated blur must not end either production manager.
        const focusA=document.body.appendChild(document.createElement('input'));
        const focusB=document.body.appendChild(document.createElement('input'));
        const blurs=[];
        const noteBlur=event=>blurs.push({target:event.target===focusA, trusted:event.isTrusted, phase:event.eventPhase});
        window.addEventListener('blur',noteBlur,true);
        focusA.focus(); focusB.focus();
        const internalFocus={rows:document.querySelectorAll('[data-bzf-folder-end-row]').length,
          active:guard.activeDrag, focused:document.hasFocus(), blurs};
        window.removeEventListener('blur',noteBlur,true); focusA.remove();focusB.remove();
        const nativeData=dragged._dragData;
        window.dispatchEvent(new Event('blur'));
        const suspended={rows:document.querySelectorAll('[data-bzf-folder-end-row]').length,
          active:guard.activeDrag, sameData:dragged._dragData===nativeData};
        emit('dragover',last,{clientX:rect(pins).left+1,clientY:rect(last).bottom-5});
        const resumed=document.querySelectorAll('[data-bzf-folder-end-row]').length;
        clip.style.height = '80px'; clip.scrollTop = 120;
        const clippedRow=manager.footer.rows[0].element;
        const clipped = rect(clippedRow);
        const clippedHit = adapters.hitTest(manager.footer, { target: clippedRow, clientX: clipped.left + 50, clientY: clipped.top + 1 });
        controller.destroy(); clip.style.height = '320px'; clip.scrollTop = 0;
        return { before, after, startRows, hitBlankDivider, measured, expanded, outside, internalFocus, suspended, resumed, nativeOvers, clippedHit: Boolean(clippedHit), clipped,
          clipTop: clip.getBoundingClientRect().top, cleaned: !document.querySelector('[data-bzf-folder-end-row]'),
          restored: existingRows.map(rect), childCount: document.getElementById('child').groupContainer.children.length };
      }, { source, direction, entry });
      if (entry === 'tab-text-via-divider') assert.equal(result.hitBlankDivider, true);
      assert.equal(result.measured.length, 3);
      assert.equal(result.startRows, 0);
      assert.equal(result.internalFocus.rows,3); assert.equal(result.internalFocus.active,true); assert.equal(result.internalFocus.focused,true);
      assert.ok(result.internalFocus.blurs.some(event=>event.target&&event.trusted&&event.phase===1));
      assert.deepEqual(result.suspended,{rows:0,active:true,sameData:true});assert.equal(result.resumed,3);
      assert.deepEqual(result.measured.map(row => row.label), ['End of Child', 'After Child in Parent', 'After Parent in Pinned Tabs']);
      for (const row of result.measured) {
        assert.equal(row.namespace, 'http://www.w3.org/1999/xhtml');
        assert.ok(row.height >= 28 && row.width > 100); assert.equal(row.hit, true); assert.equal(row.active, true);
      }
      assert.ok(result.measured[0].bottom < result.measured[1].top);
      assert.ok(result.measured[1].bottom < result.measured[2].top);
      assert.deepEqual(result.after, result.before); assert.deepEqual(result.restored, result.before);
      assert.equal(result.childCount, 1); assert.equal(result.nativeOvers, 5 + result.expanded.length);
      for (const point of result.expanded) {
        assert.equal(point.hit, true, `expanded geometry ${JSON.stringify(point)}`);
        assert.equal(point.active, true, `expanded preview ${JSON.stringify(point)}`);
      }
      assert.deepEqual(result.outside, [false, false, false, false]);
      assert.ok(result.clipped.top < result.clipTop); assert.equal(result.clippedHit, false); assert.equal(result.cleaned, true);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
 }
}
