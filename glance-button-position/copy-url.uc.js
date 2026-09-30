(() => {
  const selector = '.glance-position-copy-url';
  const timers = new Map();
  const template = document.getElementById('zen-glance-sidebar-template');
  const groups = new Set();
  const resizeObserver = new ResizeObserver(entries => {
    for (const { target, borderBoxSize } of entries) {
      const halfHeight = borderBoxSize[0].blockSize / 2;
      target.style.setProperty('--glance-half-height', `${halfHeight}px`);
      target.setAttribute('glance-position-measured', '');
    }
  });

  function watchGroups() {
    for (const group of groups) {
      if (!group.isConnected) {
        resizeObserver.unobserve(group);
        groups.delete(group);
      }
    }
    document.querySelectorAll('.zen-glance-sidebar-container').forEach(group => {
      if (groups.has(group)) return;
      groups.add(group);
      resizeObserver.observe(group);
    });
  }

  function addButton(container) {
    if (!container || container.querySelector(selector)) return;
    const button = document.createXULElement('toolbarbutton');
    button.className = 'no-squircles toolbarbutton-1 glance-position-copy-url';
    button.setAttribute('label', 'Copy URL');
    button.setAttribute('aria-label', 'Copy URL');
    button.setAttribute('tooltiptext', 'Copy URL');
    container.append(button);
  }

  function resetFeedback(button) {
    button.setAttribute('tooltiptext', 'Copy URL');
    button.setAttribute('aria-label', 'Copy URL');
    timers.delete(button);
  }

  function onCommand(event) {
    const button = event.target.closest?.(selector);
    if (!button) return;
    // Resolve the browser beside this button, not the parent tab or an address
    // captured when Glance opened. This follows navigation inside the Glance.
    const browser = button.closest('.browserContainer')?.querySelector('browser');
    const url = browser?.currentURI?.spec;
    if (!url) return;
    try {
      Cc['@mozilla.org/widget/clipboardhelper;1']
        .getService(Ci.nsIClipboardHelper).copyString(url);
      clearTimeout(timers.get(button));
      button.setAttribute('tooltiptext', 'Copied');
      button.setAttribute('aria-label', 'Copied');
      timers.set(button, setTimeout(() => resetFeedback(button), 1500));
    } catch {
      clearTimeout(timers.get(button));
      button.setAttribute('tooltiptext', 'Could not copy URL');
      button.setAttribute('aria-label', 'Could not copy URL');
      timers.set(button, setTimeout(() => resetFeedback(button), 1500));
    }
  }

  addButton(template?.content.querySelector('.zen-glance-sidebar-container'));
  document.querySelectorAll('.zen-glance-sidebar-container').forEach(addButton);
  document.addEventListener('command', onCommand);
  watchGroups();
  // Glance clones the template when opening a new panel. Watch only browser
  // chrome child changes, never page content or attribute/animation updates.
  const mutationObserver = new MutationObserver(watchGroups);
  mutationObserver.observe(document.getElementById('tabbrowser-tabpanels'), {
    childList: true, subtree: true
  });

  window.addUnloadListener(() => {
    mutationObserver.disconnect();
    resizeObserver.disconnect();
    for (const group of groups) {
      group.style.removeProperty('--glance-half-height');
      group.removeAttribute('glance-position-measured');
    }
    groups.clear();
    document.removeEventListener('command', onCommand);
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    template?.content.querySelectorAll(selector).forEach(button => button.remove());
    document.querySelectorAll(selector).forEach(button => button.remove());
  });
})();
