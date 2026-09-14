/**
 * Console de développement — À SUPPRIMER AVANT LE RENDU.
 *
 * Sert une page HTML autonome permettant de tester le module amis sans front :
 * changer de compte à la volée, envoyer des demandes, les accepter, bloquer.
 *
 * Tout est contenu dans ce seul fichier. Pour la retirer :
 *   1. supprimer `src/dev/`
 *   2. supprimer la ligne `app.use('/dev', ...)` dans `src/app.ts`
 *
 * La page appelle la vraie API (`/api/friends`) en passant l'en-tête
 * `x-user-id` que lit le middleware d'authentification provisoire. Quand le
 * module auth (E1) sera en place, cette console cessera de fonctionner — et
 * c'est très bien : ce sera le signal qu'il faut la supprimer.
 */

import { Router } from 'express';
import { prisma } from '../config/db.js';

/** Comptes créés par le bouton « Créer des comptes de test ». */
const SEED_USERS = [
    { username: 'alice', email: 'alice@test.local' },
    { username: 'bob', email: 'bob@test.local' },
    { username: 'carol', email: 'carol@test.local' },
    { username: 'dan', email: 'dan@test.local' },
    { username: 'erin', email: 'erin@test.local' },
];

/**
 * Construit le routeur de la console de développement.
 *
 * @return Le routeur à monter sur `/dev`.
 */
export function createDevConsoleRouter(): Router {
    const router = Router();

    router.get('/', (_req, res) => {
        res.type('html').send(PAGE);
    });

    /** Liste tous les comptes, pour peupler le sélecteur et le tableau. */
    router.get('/api/users', (_req, res, next) => {
        prisma.user
            .findMany({
                select: { id: true, username: true, avatar: true },
                orderBy: { id: 'asc' },
            })
            .then((users: Array<{ id: number; username: string; avatar: string | null }>) =>
                res.json({ users }),
            )
            .catch(next);
    });

    /** Crée les comptes de test manquants. Idempotent. */
    router.post('/api/seed', (_req, res, next) => {
        Promise.all(
            SEED_USERS.map(user =>
                prisma.user.upsert({
                    where: { email: user.email },
                    update: {},
                    // Mot de passe factice : ces comptes ne servent qu'ici.
                    create: { ...user, password: 'dev-only-not-a-real-hash' },
                }),
            ),
        )
            .then(() => res.json({ created: SEED_USERS.length }))
            .catch(next);
    });

    return router;
}

/** Page HTML de la console, servie telle quelle. */
const PAGE = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Console amis — Vistagram (dev)</title>
<style>
  :root {
    --bg: #16161a;
    --panel: #1e1e24;
    --line: #2e2e37;
    --ink: #e4e3e0;
    --muted: #8d8c96;
    --accent: #6f7ae8;
    --ok: #3fa37a;
    --warn: #c98a2b;
    --danger: #c4564f;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  header {
    display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
    padding: 14px 20px; border-bottom: 1px solid var(--line); background: var(--panel);
    position: sticky; top: 0; z-index: 5;
  }
  header h1 { font-size: 15px; font-weight: 600; margin: 0; }
  header h1 span { color: var(--muted); font-weight: 400; }
  .spacer { flex: 1; }
  label { color: var(--muted); font-size: 13px; }
  select, button {
    font: inherit; color: var(--ink); background: #26262e;
    border: 1px solid var(--line); border-radius: 6px; padding: 6px 11px; cursor: pointer;
  }
  select:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  button:hover { border-color: #43434f; }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  button.ghost { background: transparent; color: var(--muted); }
  button.danger { color: var(--danger); }
  button:disabled { opacity: .4; cursor: default; }

  main { display: grid; grid-template-columns: minmax(0,1.6fr) minmax(0,1fr); gap: 0; }
  @media (max-width: 900px) { main { grid-template-columns: 1fr; } }

  section { padding: 20px; }
  section + section { border-left: 1px solid var(--line); }
  @media (max-width: 900px) { section + section { border-left: 0; border-top: 1px solid var(--line); } }
  h2 { font-size: 13px; font-weight: 600; margin: 0 0 12px; color: var(--muted); }
  h2 + h2 { margin-top: 28px; }

  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-weight: 500; color: var(--muted); font-size: 12px;
       padding: 6px 10px; border-bottom: 1px solid var(--line); }
  td { padding: 9px 10px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  tr:last-child td { border-bottom: 0; }
  .id { font-family: var(--mono); font-size: 12px; color: var(--muted); }
  .me td { background: #21212a; }
  .actions { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }

  .tag { display: inline-block; white-space: nowrap; font-size: 11px; padding: 2px 8px;
         border-radius: 20px; border: 1px solid var(--line); color: var(--muted); }
  .tag.friend { color: var(--ok); border-color: #2c5c48; }
  .tag.sent, .tag.received { color: var(--accent); border-color: #3f4480; }
  .tag.blocked { color: var(--warn); border-color: #6a4d1c; }

  .empty { color: var(--muted); padding: 10px; }

  #log { font-family: var(--mono); font-size: 12px; max-height: 70vh; overflow-y: auto;
         border: 1px solid var(--line); border-radius: 8px; }
  #log div { padding: 7px 10px; border-bottom: 1px solid var(--line); }
  #log div:last-child { border-bottom: 0; }
  #log .s2 { color: var(--ok); } #log .s4, #log .s5 { color: var(--danger); }
  #log .path { color: var(--ink); } #log .body { color: var(--muted); }
  .banner { padding: 10px 20px; background: #3a2a12; color: #e0c184;
            border-bottom: 1px solid var(--line); font-size: 13px; }
</style>
</head>
<body>
<div class="banner">Console de développement. L'authentification n'est pas vérifiée : à supprimer avant le rendu.</div>

<header>
  <h1>Console amis <span>Vistagram</span></h1>
  <label for="who">Connecté en tant que</label>
  <select id="who"></select>
  <div class="spacer"></div>
  <button id="seed">Créer des comptes de test</button>
  <button id="refresh" class="ghost">Actualiser</button>
</header>

<main>
  <section>
    <h2>Tous les comptes</h2>
    <table><thead><tr>
      <th style="width:52px">id</th><th>Compte</th><th style="width:150px">Relation</th><th></th>
    </tr></thead><tbody id="users"></tbody></table>

    <h2>Demandes reçues</h2>
    <table><tbody id="incoming"></tbody></table>

    <h2>Demandes envoyées</h2>
    <table><tbody id="outgoing"></tbody></table>

    <h2>Mes amis</h2>
    <table><tbody id="friends"></tbody></table>

    <h2>Comptes bloqués</h2>
    <table><tbody id="blocked"></tbody></table>
  </section>

  <section>
    <h2>Requêtes</h2>
    <div id="log"></div>
  </section>
</main>

<script>
const $ = id => document.getElementById(id);
let me = Number(localStorage.getItem('devUserId')) || 0;
let users = [];

/** Appelle l'API en tant que l'utilisateur courant et journalise l'échange. */
async function call(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-user-id': String(me) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  if (res.status !== 204) { try { payload = await res.json(); } catch {} }
  log(method, path, res.status, payload);
  if (!res.ok) throw new Error(payload && payload.message ? payload.message : 'Erreur ' + res.status);
  return payload;
}

function log(method, path, status, payload) {
  const row = document.createElement('div');
  const cls = 's' + String(status)[0];
  const short = payload ? JSON.stringify(payload).slice(0, 90) : '';
  row.innerHTML = '<span class="' + cls + '">' + status + '</span> ' +
    method + ' <span class="path">' + path + '</span>' +
    (short ? '<br><span class="body">' + short.replace(/</g, '&lt;') + '</span>' : '');
  $('log').prepend(row);
}

function nameOf(id) {
  const found = users.find(u => u.id === id);
  return found ? found.username : '#' + id;
}

function button(label, kind, handler) {
  const el = document.createElement('button');
  el.textContent = label;
  if (kind) el.className = kind;
  el.onclick = () => handler().then(refresh).catch(err => alert(err.message));
  return el;
}

function row(cells) {
  const tr = document.createElement('tr');
  cells.forEach(cell => {
    const td = document.createElement('td');
    if (typeof cell === 'string') td.innerHTML = cell; else td.append(cell);
    tr.append(td);
  });
  return tr;
}

function fill(tbody, rows, emptyText) {
  tbody.replaceChildren();
  if (rows.length === 0) {
    tbody.append(row(['<span class="empty">' + emptyText + '</span>']));
    return;
  }
  rows.forEach(r => tbody.append(r));
}

async function refresh() {
  const list = await fetch('/dev/api/users').then(r => r.json());
  users = list.users;

  $('who').replaceChildren();
  users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id; opt.textContent = u.username + '  (id ' + u.id + ')';
    $('who').append(opt);
  });
  if (!users.some(u => u.id === me)) me = users.length ? users[0].id : 0;
  $('who').value = String(me);
  localStorage.setItem('devUserId', String(me));

  if (!me) {
    fill($('users'), [], 'Aucun compte. Cliquez sur « Créer des comptes de test ».');
    return;
  }

  const [friends, requests, blocked] = await Promise.all([
    call('GET', '/api/friends'),
    call('GET', '/api/friends/requests'),
    call('GET', '/api/friends/blocked'),
  ]);

  // Construit un index id -> état, pour éviter un appel par utilisateur.
  const state = new Map();
  friends.friends.forEach(u => state.set(u.id, { kind: 'friend' }));
  requests.incoming.forEach(r => state.set(r.user.id, { kind: 'received', id: r.friendshipId }));
  requests.outgoing.forEach(r => state.set(r.user.id, { kind: 'sent', id: r.friendshipId }));
  blocked.blocked.forEach(u => state.set(u.id, { kind: 'blocked' }));

  const LABEL = { friend: 'Amis', received: 'Demande reçue', sent: 'Demande envoyée', blocked: 'Bloqué' };

  fill($('users'), users.map(u => {
    const s = state.get(u.id) || { kind: 'none' };
    const actions = document.createElement('div');
    actions.className = 'actions';

    if (u.id === me) {
      actions.innerHTML = '<span class="empty">vous</span>';
    } else if (s.kind === 'none') {
      actions.append(button('Ajouter', 'primary', () => call('POST', '/api/friends', { targetUserId: u.id })));
      actions.append(button('Bloquer', 'ghost', () => call('POST', '/api/friends/block/' + u.id)));
    } else if (s.kind === 'sent') {
      actions.append(button('Annuler', 'ghost', () => call('DELETE', '/api/friends/requests/' + s.id)));
    } else if (s.kind === 'received') {
      actions.append(button('Accepter', 'primary', () => call('PATCH', '/api/friends/' + s.id, { status: 'accepted' })));
      actions.append(button('Refuser', 'ghost', () => call('PATCH', '/api/friends/' + s.id, { status: 'rejected' })));
    } else if (s.kind === 'friend') {
      actions.append(button('Retirer', 'danger', () => call('DELETE', '/api/friends/' + u.id)));
      actions.append(button('Bloquer', 'ghost', () => call('POST', '/api/friends/block/' + u.id)));
    } else if (s.kind === 'blocked') {
      actions.append(button('Débloquer', 'ghost', () => call('DELETE', '/api/friends/block/' + u.id)));
    }

    const tr = row([
      '<span class="id">' + u.id + '</span>',
      u.username,
      s.kind === 'none' ? '<span class="empty">—</span>'
                        : '<span class="tag ' + s.kind + '">' + LABEL[s.kind] + '</span>',
      actions,
    ]);
    if (u.id === me) tr.className = 'me';
    return tr;
  }), 'Aucun compte.');

  fill($('incoming'), requests.incoming.map(r => {
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(button('Accepter', 'primary', () => call('PATCH', '/api/friends/' + r.friendshipId, { status: 'accepted' })));
    actions.append(button('Refuser', 'ghost', () => call('PATCH', '/api/friends/' + r.friendshipId, { status: 'rejected' })));
    return row([r.user.username, actions]);
  }), 'Aucune demande reçue.');

  fill($('outgoing'), requests.outgoing.map(r => {
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(button('Annuler', 'ghost', () => call('DELETE', '/api/friends/requests/' + r.friendshipId)));
    return row([r.user.username, actions]);
  }), 'Aucune demande envoyée.');

  fill($('friends'), friends.friends.map(u => {
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(button('Retirer', 'danger', () => call('DELETE', '/api/friends/' + u.id)));
    return row([u.username, actions]);
  }), 'Aucun ami.');

  fill($('blocked'), blocked.blocked.map(u => {
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(button('Débloquer', 'ghost', () => call('DELETE', '/api/friends/block/' + u.id)));
    return row([u.username, actions]);
  }), 'Aucun compte bloqué.');
}

$('who').onchange = e => {
  me = Number(e.target.value);
  localStorage.setItem('devUserId', String(me));
  refresh();
};
$('refresh').onclick = () => refresh();
$('seed').onclick = async () => {
  await fetch('/dev/api/seed', { method: 'POST' });
  refresh();
};

refresh().catch(err => alert(err.message));
</script>
</body>
</html>`;
