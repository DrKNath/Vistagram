'use strict';

/* Shared presentation helpers. No account or token is stored in the browser. */
const Vistagram = (() => {
  const icons = {
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="m3 3 18 18M9.9 5.2A12 12 0 0 1 12 5c7 0 10 7 10 7a17 17 0 0 1-3.1 4.2M6.2 6.2A20 20 0 0 0 2 12s3 7 10 7a12 12 0 0 0 5.8-1.5M10 10a3 3 0 0 0 4 4"/>',
    moon: '<path d="M20.7 13A9 9 0 0 1 11 3.3 9 9 0 1 0 20.7 13Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m21 16-5-6L6 21"/>',
    chat: '<path d="M21 11.5a9 9 0 0 1-9.5 9 10 10 0 0 1-4-.9L3 21l1.4-4.5a9 9 0 1 1 16.6-5Z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
    logout: '<path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4m7-14 5 5-5 5m-8-5h13"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    edit: '<path d="m16 3 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15Zm9-15 5 5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18m-13 4h2m4 0h2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };

  function icon(name) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.info}</svg>`;
  }

  function syncTheme() {
    const dark = document.documentElement.dataset.theme === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.innerHTML = icon(dark ? 'sun' : 'moon');
      button.setAttribute('aria-label', dark ? 'Activer le mode clair' : 'Activer le mode sombre');
      button.title = button.getAttribute('aria-label');
    });
    document.querySelectorAll('[data-set-theme]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.setTheme === (dark ? 'dark' : 'light')));
    });
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('vistagram-theme', theme); } catch { /* Optional preference. */ }
    syncTheme();
  }

  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  });
  document.querySelectorAll('[data-set-theme]').forEach(button => {
    button.addEventListener('click', () => setTheme(button.dataset.setTheme));
  });
  document.querySelectorAll('[data-password-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      button.innerHTML = icon(visible ? 'eyeOff' : 'eye');
      button.setAttribute('aria-pressed', String(visible));
      button.setAttribute('aria-label', visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    });
  });
  syncTheme();

  class ApiError extends Error {
    constructor(message, status = 0) {
      super(message);
      this.status = status;
    }
  }

  /** Call the supplied Express API with its existing HttpOnly session cookie. */
  async function api(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(path, {
        ...options,
        credentials: 'include',
        headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errors = Array.isArray(data.errors) ? data.errors.filter(item => typeof item === 'string') : [];
        throw new ApiError(response.status >= 500
          ? 'Le service est momentanément indisponible. Réessaie dans quelques instants.'
          : (errors.join(' ') || 'Cette action n’a pas pu être effectuée.'), response.status);
      }
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('Connexion momentanément indisponible. Réessaie dans quelques instants.');
    } finally {
      clearTimeout(timeout);
    }
  }

  function message(el, text, success = false) {
    el.textContent = text;
    el.classList.toggle('success', success);
    el.hidden = !text;
    if (text && !success) el.focus();
  }

  function busy(button, loading, label = 'Un instant…') {
    if (loading) {
      button.dataset.previousHtml = button.innerHTML;
      button.textContent = label;
    } else if (button.dataset.previousHtml) {
      button.innerHTML = button.dataset.previousHtml;
    }
    button.disabled = loading;
    button.setAttribute('aria-busy', String(loading));
  }

  return { api, icon, message, busy };
})();
