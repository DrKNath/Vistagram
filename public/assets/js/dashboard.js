'use strict';

(() => {
  // An explicit visual preview. It never bypasses API authentication or creates an account.
  const demo = new URLSearchParams(location.search).get('demo') === '1';
  const content = document.getElementById('dashboard-content');
  const loading = document.getElementById('loading-state');
  const errorState = document.getElementById('error-state');
  const form = document.getElementById('profile-form');
  const accountData = document.getElementById('account-data');
  const editButton = document.getElementById('edit-profile-btn');
  const cancelButton = document.getElementById('cancel-edit-btn');
  const profileMessage = document.getElementById('profile-message');
  const submitButton = form.querySelector('[type="submit"]');
  const logoutButton = document.getElementById('logout-btn');
  let user;
  let saving = false;
  let loggingOut = false;

  function renderUser() {
    document.querySelectorAll('[data-username]').forEach(el => { el.textContent = user.username; });
    document.querySelector('[data-handle]').textContent = `@${user.username}`;
    document.querySelectorAll('[data-avatar]').forEach(el => {
      el.textContent = Array.from(user.username)[0]?.toLocaleUpperCase('fr') || 'V';
      // Only display uploaded profile images from this app's own uploads directory.
      if (typeof user.avatar === 'string' && user.avatar.startsWith('/uploads/')) {
        const img = document.createElement('img');
        img.alt = '';
        img.src = user.avatar;
        img.addEventListener('error', () => { img.remove(); }, { once: true });
        el.append(img);
      }
    });
    document.getElementById('account-email').textContent = user.email || 'Non renseignée';
    document.getElementById('account-bio').textContent = user.bio || 'Quelques mots sur toi ? Ajoute ta bio.';
    const date = new Date(user.createdAt);
    document.getElementById('account-created').textContent = Number.isNaN(date.getTime()) ? 'Non renseigné' : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(date);
    const roles = { USER: 'Personnel', ADMIN: 'Administrateur', SUPER_ADMIN: 'Super administrateur' };
    document.getElementById('account-role').textContent = roles[user.role] || 'Non renseigné';
    document.getElementById('account-id').textContent = user.id == null ? 'Non renseigné' : `#${user.id}`;
  }

  function setEditing(editing) {
    form.hidden = !editing;
    accountData.hidden = editing;
    editButton.hidden = editing;
    if (editing) {
      document.getElementById('edit-username').value = user.username;
      document.getElementById('edit-bio').value = user.bio || '';
      document.getElementById('mes-informations').scrollIntoView({ block: 'nearest' });
      document.getElementById('edit-username').focus({ preventScroll: true });
    }
  }

  async function loadUser() {
    loading.hidden = false;
    errorState.hidden = true;
    try {
      if (demo) {
        user = { id: 12, username: 'alex.moments', email: 'alex@example.com', bio: 'Les petits détails font les plus beaux souvenirs.\nPhoto, nature et escapades improvisées.', role: 'USER', createdAt: '2026-09-01T12:00:00Z' };
        document.getElementById('demo-banner').hidden = false;
        document.getElementById('session-label').textContent = 'Profil de démonstration';
        logoutButton.innerHTML = Vistagram.icon('logout') + 'Quitter l’aperçu';
        document.querySelector('[data-dashboard-link]').href = 'dashboard.html?demo=1';
      } else {
        const data = await Vistagram.api('/api/auth/me');
        if (!data.user || typeof data.user.username !== 'string') throw new Error('Les informations du compte ne sont pas disponibles.');
        user = data.user;
        document.getElementById('session-status').hidden = false;
      }
      renderUser();
      content.hidden = false;
    } catch (error) {
      if ([401, 403, 404].includes(error.status)) {
        location.replace('login.html');
        return;
      }
      document.getElementById('dashboard-error').textContent = error.message;
      errorState.hidden = false;
    } finally {
      loading.hidden = true;
    }
  }

  document.getElementById('retry-btn').addEventListener('click', loadUser);
  editButton.addEventListener('click', () => {
    Vistagram.message(profileMessage, '');
    setEditing(true);
  });
  cancelButton.addEventListener('click', () => {
    Vistagram.message(profileMessage, '');
    setEditing(false);
    editButton.focus();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || !form.reportValidity()) return;
    const payload = {
      username: document.getElementById('edit-username').value.trim(),
      bio: document.getElementById('edit-bio').value.trim(),
    };
    if (payload.username.length < 3) {
      Vistagram.message(profileMessage, 'Ton nom d’utilisateur doit contenir au moins 3 caractères.');
      return;
    }
    saving = true;
    cancelButton.disabled = true;
    Vistagram.message(profileMessage, '');
    Vistagram.busy(submitButton, true, 'Enregistrement…');
    try {
      if (demo) {
        user = { ...user, ...payload };
      } else {
        const data = await Vistagram.api('/api/users/me', { method: 'PATCH', body: JSON.stringify(payload) });
        if (!data.user || typeof data.user.username !== 'string') throw new Error('La modification n’a pas pu être confirmée. Recharge la page pour vérifier ton profil.');
        user = { ...user, ...data.user };
      }
      renderUser();
      setEditing(false);
      Vistagram.message(profileMessage, demo ? 'Aperçu modifié. Ces changements ne sont pas enregistrés.' : 'Ton profil a bien été mis à jour.', true);
      editButton.focus();
    } catch (error) {
      if (error.status === 401) {
        location.replace('login.html');
        return;
      }
      Vistagram.message(profileMessage, error.status === 400 ? 'Modification impossible. Ce nom est peut-être déjà utilisé ; essaie un autre nom.' : error.message);
    } finally {
      saving = false;
      cancelButton.disabled = false;
      Vistagram.busy(submitButton, false);
    }
  });

  logoutButton.addEventListener('click', async () => {
    if (loggingOut) return;
    loggingOut = true;
    const messageEl = document.getElementById('logout-message');
    Vistagram.message(messageEl, '');
    Vistagram.busy(logoutButton, true, 'Déconnexion…');
    try {
      if (!demo) await Vistagram.api('/api/auth/logout', { method: 'POST' });
      location.href = 'login.html';
    } catch (error) {
      Vistagram.message(messageEl, error.message);
    } finally {
      loggingOut = false;
      Vistagram.busy(logoutButton, false);
    }
  });

  if (location.protocol === 'file:' && !demo) {
    loading.hidden = true;
    document.getElementById('file-state').hidden = false;
  } else {
    loadUser();
  }
})();
