'use strict';
// Reusable binding: <button data-report-type="POST|COMMENT|USER" data-report-id="42">.
(() => {
  const dialog = document.createElement('dialog');
  dialog.className = 'mod-dialog';
  dialog.innerHTML = `<form id="report-form"><h2>Signaler</h2><p id="report-target"></p>
    <label for="report-reason">Pourquoi souhaites-tu signaler cet élément ?</label>
    <textarea id="report-reason" minlength="3" maxlength="1000" rows="4" required placeholder="Décris le problème : harcèlement, spam, contenu inapproprié…"></textarea>
    <p id="report-feedback" role="status" tabindex="-1"></p>
    <div class="mod-actions"><button type="button" id="report-cancel">Annuler</button><button type="submit" class="primary">Envoyer le signalement</button></div></form>`;
  document.body.append(dialog);
  let target, pending = false;
  const form = dialog.querySelector('form');
  const feedback = dialog.querySelector('#report-feedback');
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-report-type]');
    if (!button) return;
    const key = { POST: 'postId', COMMENT: 'commentId', USER: 'targetUserId' }[button.dataset.reportType];
    const id = Number(button.dataset.reportId);
    if (!key || !Number.isSafeInteger(id) || id <= 0) return;
    target = { [key]: id };
    form.reset(); feedback.textContent = '';
    dialog.querySelector('#report-target').textContent = `${{ POST: 'Publication', COMMENT: 'Commentaire', USER: 'Utilisateur' }[button.dataset.reportType]} #${id}`;
    dialog.querySelector('[type="submit"]').hidden = false;
    dialog.querySelector('#report-cancel').textContent = 'Annuler';
    dialog.showModal();
  });
  dialog.querySelector('#report-cancel').onclick = () => { if (!pending) dialog.close(); };
  dialog.addEventListener('cancel', event => { if (pending) event.preventDefault(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || !form.reportValidity()) return;
    pending = true;
    const submit = dialog.querySelector('[type="submit"]');
    submit.disabled = true; feedback.textContent = 'Envoi…';
    try {
      await Vistagram.api('/api/moderation/reports', { method: 'POST', body: JSON.stringify({ ...target, reason: dialog.querySelector('textarea').value.trim() }) });
      feedback.textContent = 'Signalement envoyé. L’équipe de modération pourra l’examiner.';
      submit.hidden = true;
      dialog.querySelector('#report-cancel').textContent = 'Fermer';
    } catch (error) { feedback.textContent = error.message; }
    finally { pending = false; submit.disabled = false; }
  });
})();
