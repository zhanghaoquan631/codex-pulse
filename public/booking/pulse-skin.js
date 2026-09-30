/* Only synchronize the visual theme; the booking script remains independent. */
(function () {
  const root = document.documentElement;
  const storageKey = "codex-pulse:theme:v1";
  let parentRoot = null;
  try {
    if (window.parent !== window) parentRoot = window.parent.document.documentElement;
  } catch { /* A standalone or cross-origin frame uses its local theme. */ }

  function syncTheme() {
    let theme = parentRoot ? parentRoot.dataset.pulseTheme : null;
    if (!theme) {
      try { theme = localStorage.getItem(storageKey); } catch { /* Default to light. */ }
    }
    const next = theme === "dark" || theme === "eink" ? theme : "light";
    if (root.dataset.pulseTheme !== next) root.dataset.pulseTheme = next;
  }

  syncTheme();
  if (parentRoot) {
    new MutationObserver(syncTheme).observe(parentRoot, {
      attributes: true,
      attributeFilter: ["data-pulse-theme"]
    });
  }
  window.addEventListener("storage", function (event) {
    if (event.key === storageKey || event.key === null) syncTheme();
  });
})();
