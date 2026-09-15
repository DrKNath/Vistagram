/* Executed before paint, so the saved theme does not flash on navigation. */
(() => {
  let theme = 'dark';
  try {
    if (localStorage.getItem('vistagram-theme') === 'light') theme = 'light';
  } catch { /* Storage can be unavailable in private browsing. */ }
  document.documentElement.dataset.theme = theme;
})();
