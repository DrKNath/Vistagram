'use strict';
(async () => {
  const $ = id => document.getElementById(id);
  const labels = { RESOLVE_REPORT: 'Clore sans sanction', DISMISS_REPORT: 'Rejeter le signalement', HIDE_POST: 'Masquer la publication', UNHIDE_POST: 'Réafficher la publication', DELETE_POST: 'Supprimer définitivement la publication', DELETE_COMMENT: 'Supprimer définitivement le commentaire', BAN_USER: 'Bannir le compte', UNBAN_USER: 'Lever le bannissement' };
  const typeNames = { POST: 'Publication', COMMENT: 'Commentaire', USER: 'Utilisateur' };
  const statusNames = { pending: 'En attente', resolved: 'Traité', dismissed: 'Rejeté' };
  const rank = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };
  let user, view = 'reports', page = 1, pages = 1, selected, busy = false, requestVersion = 0;
  const date = value => new Date(value).toLocaleString('fr-FR');
  function el(tag, text, className) {
    const node = document.createElement(tag); node.textContent = text ?? '';
    if (className) node.className = className;
    return node;
  }
  function button(text, click) { const b = el('button', text); b.type = 'button'; b.onclick = click; return b; }
  function evidence(snapshot) {
    try {
      const data = JSON.parse(snapshot);
      return data.content ?? [data.username, data.bio].filter(Boolean).join('\n');
    } catch { return snapshot || 'Aperçu non disponible (ancien signalement).'; }
  }
  function openAction(config, actions) {
    selected = config;
    $('action-form').reset(); $('action-feedback').textContent = '';
    $('action-title').textContent = config.title;
    $('action-choice').replaceChildren(...actions.map(action => { const option = el('option', labels[action]); option.value = action; return option; }));
    updateHint(); $('action-dialog').showModal();
  }
  function updateHint() {
    const action = $('action-choice').value;
    $('action-hint').textContent = action.startsWith('DELETE') ? 'La suppression est définitive. Le signalement et le journal seront conservés.' : action === 'BAN_USER' ? 'Le compte ne pourra plus se connecter ni utiliser sa session actuelle.' : 'Le motif et ton identité seront enregistrés dans le journal.';
  }
  $('action-choice').onchange = updateHint;
  $('action-cancel').onclick = () => { if (!busy) $('action-dialog').close(); };
  $('action-dialog').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  $('action-form').onsubmit = async event => {
    event.preventDefault(); if (busy || !$('action-form').reportValidity()) return;
    busy = true; const submit = $('action-form').querySelector('[type="submit"]'); submit.disabled = true;
    const action = $('action-choice').value;
    try {
      const url = selected.reportId ? `/api/moderation/reports/${selected.reportId}/actions` : selected.url;
      await Vistagram.api(url, { method: selected.reportId ? 'POST' : 'PATCH', body: JSON.stringify({ action, reason: $('action-reason').value.trim() }) });
      $('action-dialog').close(); $('page-message').textContent = 'Décision enregistrée dans le journal.';
      await load();
    } catch (error) { $('action-feedback').textContent = error.message; }
    finally { busy = false; submit.disabled = false; }
  };
  function reportCard(report) {
    const card = el('article', '', 'mod-card');
    card.append(el('span', statusNames[report.status], `mod-tag ${report.status}`));
    card.append(el('h2', `${typeNames[report.targetType] || 'Contenu'} #${report.targetId ?? report.postId ?? '?'} · Signalement #${report.id}`));
    card.append(el('p', `Signalé par ${report.reporter.username} · ${date(report.createdAt)}`, 'mod-meta'));
    card.append(el('p', report.reason));
    const details = el('details'); details.append(el('summary', 'Voir le contenu au moment du signalement'), el('div', evidence(report.targetSnapshot), 'mod-evidence')); card.append(details);
    if (report.resolvedAt) card.append(el('p', `Décision du ${date(report.resolvedAt)} · ${report.resolutionNote || 'Sans précision'}`, 'mod-meta'));
    const actions = el('div', '', 'mod-actions');
    if (report.status === 'pending') {
      const choices = ['RESOLVE_REPORT', 'DISMISS_REPORT'];
      if (rank[user.role] >= 2) {
        if (report.post) { if (!report.post.isHidden) choices.push('HIDE_POST'); choices.push('DELETE_POST'); }
        if (report.comment) choices.push('DELETE_COMMENT');
        if (report.targetAuthorId && report.targetAuthorId !== user.id && !report.targetUser?.isBanned) choices.push('BAN_USER');
      }
      actions.append(button('Examiner et décider', () => openAction({ reportId: report.id, title: `Traiter le signalement #${report.id}` }, choices)));
    }
    if (report.post?.isHidden && rank[user.role] >= 2) actions.append(button('Réafficher la publication', () => openAction({ title: `Publication #${report.post.id}`, url: `/api/moderation/posts/${report.post.id}/unhide` }, ['UNHIDE_POST'])));
    card.append(actions); return card;
  }
  function userCard(target) {
    const card = el('article', '', 'mod-card');
    card.append(el('span', target.isBanned ? 'Banni' : 'Actif', 'mod-tag'), el('h2', `${target.username} · #${target.id}`), el('p', target.role, 'mod-meta'));
    if (target.isBanned) card.append(el('p', `Depuis le ${date(target.bannedAt)} · ${target.banReason}`));
    if (target.id !== user.id && rank[target.role] < rank[user.role]) {
      const action = target.isBanned ? 'UNBAN_USER' : 'BAN_USER';
      card.append(button(labels[action], () => openAction({ title: `${labels[action]} : ${target.username}`, url: `/api/moderation/users/${target.id}/${target.isBanned ? 'unban' : 'ban'}` }, [action])));
    }
    return card;
  }
  function logCard(log) {
    const card = el('article', '', 'mod-card');
    card.append(el('p', `Action #${log.id} · ${date(log.createdAt)}`, 'mod-meta'), el('h2', labels[log.action] || log.action));
    card.append(el('p', `${log.actorName} (#${log.actorId}) · ${typeNames[log.targetType]} #${log.targetId}${log.reportId ? ` · Signalement #${log.reportId}` : ''}`));
    card.append(el('p', log.reason));
    const details = el('details'); details.append(el('summary', 'Aperçu conservé'), el('div', evidence(log.targetSnapshot), 'mod-evidence')); card.append(details);
    return card;
  }
  async function load() {
    const version = ++requestVersion;
    const params = new URLSearchParams({ page, limit: 20 });
    if (view === 'reports') { if ($('status').value) params.set('status', $('status').value); if ($('type').value) params.set('type', $('type').value); }
    if (view === 'users') { params.set('q', $('search-user').value); if ($('banned').value) params.set('banned', $('banned').value); }
    $('results').replaceChildren(el('p', 'Chargement…')); $('previous').disabled = $('next').disabled = true;
    try {
      const data = await Vistagram.api(`/api/moderation/${view}?${params}`);
      if (version !== requestVersion) return;
      pages = data.pages;
      if (page > Math.max(1, pages)) { page = Math.max(1, pages); return load(); }
      $('result-count').textContent = `${data.total} résultat(s)`;
      $('results').replaceChildren(...data[view].map(view === 'reports' ? reportCard : view === 'users' ? userCard : logCard));
      if (!data.total) $('results').append(el('p', 'Aucun résultat pour ces filtres.', 'mod-card'));
      $('page-number').textContent = `Page ${page} / ${Math.max(1, pages)}`;
      $('previous').disabled = page <= 1; $('next').disabled = page >= pages;
    } catch (error) { if (version === requestVersion) { $('results').replaceChildren(el('p', error.message, 'notice')); $('result-count').textContent = ''; } }
  }
  document.querySelectorAll('[data-view]').forEach(tab => tab.onclick = () => {
    view = tab.dataset.view; page = 1;
    document.querySelectorAll('[data-view]').forEach(t => t.setAttribute('aria-selected', String(t === tab)));
    document.querySelectorAll('[data-filter]').forEach(f => { f.hidden = f.dataset.filter !== view; }); load();
  });
  $('filters').onsubmit = event => { event.preventDefault(); page = 1; load(); };
  $('previous').onclick = () => { if (page > 1) { page--; load(); } };
  $('next').onclick = () => { if (page < pages) { page++; load(); } };
  try {
    ({ user } = await Vistagram.api('/api/auth/me'));
    if (!(rank[user.role] >= 1)) { $('page-message').textContent = 'Cet espace est réservé à l’équipe de modération.'; return; }
    $('identity').textContent = `${user.username} · ${user.role}`;
    $('users-tab').hidden = rank[user.role] < 2;
    $('page-message').textContent = ''; $('workspace').hidden = false; await load();
  } catch (error) { if (error.status === 401) location.replace('/login.html'); else $('page-message').textContent = error.message; }
})();
