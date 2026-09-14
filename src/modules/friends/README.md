# Module Amis (E2)

Réécrit pour les conventions actuelles du projet : enveloppe `{ status, errors }`,
`req.userId` via `requireAuth`, service en fonctions libres, validation qui
renvoie `string[]`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `friends.types.ts` | types publics et internes |
| `friends.validation.ts` | validation des entrées → `string[]` |
| `friends.rules.ts` | **règles métier pures** + `FriendsError` |
| `friends.ts` | service Prisma |
| `friends.controller.ts` | handlers HTTP |
| `friends.routes.ts` | `friendsRouter` |

Tests :
- `test/unit/friends/friends.rules.test.ts` — 39 tests, **sans base de données**
- `test/integration/friends.test.ts` — 26 tests, base réelle + cookie de session

Les règles vivent dans `friends.rules.ts`, en fonctions pures. `friends.ts` lit
l'état, appelle la règle, écrit le résultat. Aucune règle métier dans une
requête Prisma, aucune requête Prisma dans les règles. C'est ce qui permet aux
39 tests unitaires de tourner en 13 ms.

## Routes

Toutes exigent `requireAuth`. Montées sur `/api/friends`.

| Méthode | Chemin | Corps | Réponse |
|---|---|---|---|
| `POST` | `/` | `{ targetUserId }` | 201 `{ status:'OK', friendship }` |
| `PATCH` | `/:id` | `{ status:'accepted'\|'rejected' }` | 200 `{ status:'OK', friendship? }` |
| `GET` | `/` | — | 200 `{ status:'OK', friends }` |
| `GET` | `/requests` | — | 200 `{ status:'OK', incoming, outgoing }` |
| `GET` | `/blocked` | — | 200 `{ status:'OK', blocked }` |
| `GET` | `/status/:userId` | — | 200 `{ status:'OK', relation }` |
| `DELETE` | `/requests/:id` | — | 200 `{ status:'OK' }` |
| `DELETE` | `/:userId` | — | 200 `{ status:'OK' }` |
| `POST` | `/block/:userId` | — | 201 `{ status:'OK', friendship }` |
| `DELETE` | `/block/:userId` | — | 200 `{ status:'OK' }` |

Codes d'erreur : 400 (entrée invalide, relation avec soi-même), 401 (non
authentifié), 403 (pas le bon rôle dans la relation, relation bloquée),
404 (compte ou relation introuvable), 409 (déjà amis, demande en double,
déjà bloqué).

## Décisions

| Sujet | Choix | Raison |
|---|---|---|
| Demande croisée | acceptation automatique | sinon deux personnes qui se sollicitent restent bloquées |
| Refus | suppression de la ligne | permet de retenter, évite les demandes mortes |
| Blocage | remplace toute relation, en transaction | rompt l'amitié et efface la demande en attente |
| Blocage subi | présenté comme `none` | la personne bloquée ne doit pas pouvoir le déduire |
| Tiers sur une relation | **404**, pas 403 | un 403 confirmerait l'existence de la relation |
| Casse des statuts | `PENDING` en base, `pending` en API | la base garde le défaut du schéma, la traduction est dans `toPublicStatus` |
| Statut `BLOCKED` | ajouté sans migration | le champ Prisma est un `String` libre |

## Limitation connue

`Friendship` ne stocke **qu'une ligne par couple**, avec un seul `status`. Le
blocage mutuel (A bloque B *et* B bloque A) n'est donc pas représentable : le
second blocage est refusé en 409.

Corriger cela demande un modèle `Block` distinct :

```prisma
model Block {
  id        Int      @id @default(autoincrement())
  blockerId Int
  blockedId Int
  createdAt DateTime @default(now())

  blocker User @relation("Blocker", fields: [blockerId], references: [id], onDelete: Cascade)
  blocked User @relation("Blocked", fields: [blockedId], references: [id], onDelete: Cascade)

  @@unique([blockerId, blockedId])
}
```

C'est une migration : elle touche tout le monde et passe par une PR dédiée,
annoncée au daily.

## Pour les autres modules

`areFriends(a, b)` est le point d'entrée pour ce qui dépend du graphe social :

- **E3** — filtrer le fil sur les publications en visibilité `FRIENDS`
- **E6** — autoriser l'ouverture d'une conversation
- **E9** — décider qui reçoit une notification

N'interrogez pas `prisma.friendship` directement depuis un autre module : la
logique de direction et de blocage serait dupliquée, et divergerait.

## Lancer les tests

```bash
npx vitest run test/unit/            # 39 tests, aucune base requise
npx vitest run test/integration/friends.test.ts   # 26 tests, base réelle
```
