'use strict';

(() => {
  const form = document.querySelector('[data-auth-form]');
  if (!form) return;
  const register = form.dataset.authForm === 'register';
  const messageEl = document.getElementById('message');
  const submit = form.querySelector('button[type="submit"]');
  const confirmation = document.getElementById('confirm-password');
  const password = document.getElementById('password');
  let pending = false;

  function validateConfirmation() {
    if (confirmation) confirmation.setCustomValidity(
      confirmation.value && confirmation.value !== password.value ? 'Les mots de passe ne correspondent pas.' : ''
    );
  }
  password.addEventListener('input', validateConfirmation);
  confirmation?.addEventListener('input', validateConfirmation);

  // Previewing the HTML directly is allowed; authentication requires the app server.
  if (location.protocol === 'file:') {
    const note = document.getElementById('local-preview');
    note.hidden = false;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending) return;
    Vistagram.message(messageEl, '');
    validateConfirmation();
    if (!form.reportValidity()) return;

    const payload = {
      email: document.getElementById('email').value.trim(),
      password: password.value,
    };
    if (register) {
      payload.username = document.getElementById('username').value.trim();
      if (payload.username.length < 3) {
        Vistagram.message(messageEl, 'Ton nom d’utilisateur doit contenir au moins 3 caractères.');
        return;
      }
    }
    pending = true;
    Vistagram.busy(submit, true, register ? 'Création du compte…' : 'Connexion…');
    try {
      await Vistagram.api(`/api/auth/${register ? 'register' : 'login'}`, {
        method: 'POST', body: JSON.stringify(payload),
      });
      location.href = 'dashboard.html';
    } catch (error) {
      Vistagram.message(messageEl, !register && error.status === 401
        ? 'Adresse e-mail ou mot de passe incorrect.' : error.message);
    } finally {
      pending = false;
      Vistagram.busy(submit, false);
    }
  });
})();
