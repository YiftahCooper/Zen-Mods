export function createSelectionBridge(originalOpen, panel) {
  let active = null;

  function settle(context, method, value) {
    if (context.settled) {
      return;
    }
    context.settled = true;
    context[method](value);
  }

  return {
    open(anchor, options = {}) {
      if (active) {
        return null;
      }

      let resolveOuter;
      let rejectOuter;
      const outerPromise = new Promise((resolve, reject) => {
        resolveOuter = resolve;
        rejectOuter = reject;
      });
      const callerOnSelect = options.onSelect;
      const context = {
        callerOnSelect,
        resolve: resolveOuter,
        reject: rejectOuter,
        settled: false,
        customSelected: false,
        hasSelection: false,
        lastValue: null,
        closeOnSelect: options.closeOnSelect !== false,
      };
      const nativePromise = originalOpen(anchor, {
        ...options,
        onSelect(value) {
          callerOnSelect?.(value);
          context.hasSelection = true;
          context.lastValue = value;
          if (context.closeOnSelect) settle(context, "resolve", value);
        },
      });

      if (nativePromise === null) {
        return null;
      }

      active = context;
      // Keep Zen's window-realm Promise in its own realm. Wrapping it with the
      // privileged module realm's Promise can treat the cross-compartment
      // object as an already-resolved value and clear the active selection.
      nativePromise
        .then(
          (value) =>
            settle(
              context,
              "resolve",
              context.hasSelection ? context.lastValue : value,
            ),
          (error) => {
            if (context.hasSelection) {
              settle(context, "resolve", context.lastValue);
            } else {
              settle(context, "reject", error);
            }
          },
        )
        .finally(() => {
          if (active === context) {
            active = null;
          }
        });
      return outerPromise;
    },

    selectCustom(value, { onSelect = null, afterSelect = null } = {}) {
      const context = active;
      (onSelect ?? context?.callerOnSelect)?.(value);
      afterSelect?.(value);
      if (!context) {
        panel.hidePopup();
        return false;
      }
      context.customSelected = true;
      context.hasSelection = true;
      context.lastValue = value;
      if (context.closeOnSelect) {
        settle(context, "resolve", value);
        panel.hidePopup();
      }
      return true;
    },
  };
}
