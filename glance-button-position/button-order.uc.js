(() => {
  const keys = ['close', 'expand', 'split', 'copy'];
  const labels = { close: 'Close', expand: 'Expand', split: 'Split', copy: 'Copy URL' };
  const selectors = {
    close: '[command="cmd_zenGlanceClose"]',
    expand: '[command="cmd_zenGlanceExpand"]',
    split: '[command="cmd_zenGlanceSplit"]',
    copy: '.glance-position-copy-url'
  };
  const preference = 'glance.position.order';
  const readOrder = () => [...new Set([
    ...Services.prefs.getStringPref(preference, '').split(',').filter(key => keys.includes(key)),
    ...keys
  ])];

  if (window.gBrowser) {
    function arrange(container, order) {
      if (!container) return;
      const buttons = order.map(key => container.querySelector(selectors[key])).filter(Boolean);
      buttons.forEach((button, i) => {
        if (container.children[i] !== button) container.insertBefore(button, container.children[i] || null);
      });
    }
    const template = document.getElementById('zen-glance-sidebar-template');
    function update(order = readOrder()) {
      arrange(template?.content.querySelector('.zen-glance-sidebar-container'), order);
      document.querySelectorAll('.zen-glance-sidebar-container').forEach(group => arrange(group, order));
    }
    const preferenceObserver = { observe: () => update() };
    const domObserver = new MutationObserver(() => update());
    domObserver.observe(document.getElementById('tabbrowser-tabpanels'), { childList: true, subtree: true });
    Services.prefs.addObserver(preference, preferenceObserver);
    update();
    window.addUnloadListener(() => {
      domObserver.disconnect();
      Services.prefs.removeObserver(preference, preferenceObserver);
      update(keys);
    });
    return;
  }

  // Enhance only our own preference IDs. Reuse Sine's checkbox elements and
  // their existing handlers; no dependency on its dialog classes or methods.
  let mounted;
  function refreshRows() {
    if (!mounted?.list.isConnected) return;
    const order = readOrder();
    order.forEach((key, i) => {
      const row = mounted.rows.get(key);
      if (mounted.list.children[i] !== row) mounted.list.insertBefore(row, mounted.list.children[i] || null);
      row.querySelector('[data-direction="-1"]').disabled = i === 0;
      row.querySelector('[data-direction="1"]').disabled = i === order.length - 1;
    });
  }

  function mount() {
    if (mounted?.list.isConnected) return;
    const marker = document.getElementById('glance-button-controls');
    const controls = keys.map(key => document.getElementById(`glance-position-show-${key}`));
    if (!marker || controls.some(control => !control)) return;
    const list = document.createElement('div');
    list.id = 'glance-button-order-list';
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', 'Buttons, top to bottom');
    list.style.cssText = 'display:grid;gap:4px;width:100%;';
    const rows = new Map();
    keys.forEach((key, i) => {
      const row = document.createElement('div');
      row.dataset.button = key;
      row.style.cssText = 'display:flex;align-items:center;gap:6px;';
      const checkbox = document.createElement('div');
      checkbox.style.cssText = 'flex:1;min-width:0;';
      checkbox.append(controls[i]);
      row.append(checkbox);
      for (const direction of [-1, 1]) {
        const button = document.createElement('button');
        const action = direction === -1 ? 'up' : 'down';
        button.type = 'button';
        button.dataset.direction = direction;
        button.textContent = direction === -1 ? '↑' : '↓';
        button.setAttribute('aria-label', `Move ${labels[key]} ${action}`);
        button.title = `Move ${labels[key]} ${action}`;
        button.style.cssText = 'min-width:32px;margin:0;padding:4px 8px;';
        button.addEventListener('click', () => {
          const order = readOrder();
          const index = order.indexOf(key), next = index + direction;
          if (next < 0 || next >= order.length) return;
          [order[index], order[next]] = [order[next], order[index]];
          Services.prefs.setStringPref(preference, order.join(','));
          // Keep keyboard focus on the moved row, including at either end.
          (button.disabled ? row.querySelector('button:not(:disabled)') : button)?.focus();
        });
        row.append(button);
      }
      rows.set(key, row);
      list.append(row);
    });
    marker.after(list);
    mounted = { marker, list, controls, rows };
    refreshRows();
  }
  const domObserver = new MutationObserver(mount);
  domObserver.observe(document.documentElement, { childList: true, subtree: true });
  const preferenceObserver = { observe: refreshRows };
  Services.prefs.addObserver(preference, preferenceObserver);
  mount();
  window.addUnloadListener(() => {
    domObserver.disconnect();
    Services.prefs.removeObserver(preference, preferenceObserver);
    if (mounted?.list.isConnected) {
      // Restore Sine's plain checkbox layout if this enhancement unloads.
      mounted.marker.after(...mounted.controls);
      mounted.list.remove();
    }
    mounted = null;
  });
})();
