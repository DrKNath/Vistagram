# API modération

Authentification par cookie HttpOnly `token`, comme le reste de Vistagram. Envoi des corps en JSON, y compris pour les suppressions nécessitant un motif. Toute sanction exige un motif de 3 à 1000 caractères. Les identifiants sont des entiers strictement positifs.

## Signalement : USER connecté

`POST /api/moderation/reports`

```json
{ "postId": 42, "reason": "Publication contenant du harcèlement" }
```

Remplacer `postId` par `commentId` ou `targetUserId` pour les autres cibles. **Exactement une cible** par requête. L’auteur du signalement est issu de la session, jamais du corps fourni.

Réponse `201` : `{ "status": "OK", "report": { ... } }`. Le rapport comprend notamment `id`, `targetType`, `targetId`, `targetAuthorId`, `postId`, `commentId`, `targetUserId`, `reason`, `reportedBy`, `status`, `createdAt`, `targetSnapshot`, `resolvedAt`, `resolvedBy`, `resolutionNote`.

Les statuts retournés sont `pending`, `resolved`, `dismissed` ; ils sont stockés en majuscules dans SQLite. Les références de contenu peuvent devenir nulles après suppression ; `targetId` et `targetSnapshot` restent conservés.

## Consultation : MODERATOR et supérieurs

| Méthode | Route | Paramètres |
|---|---|---|
| GET | `/api/moderation/reports` | `status=pending|resolved|dismissed`, `type=POST|COMMENT|USER`, `page`, `limit` |
| GET | `/api/moderation/logs` | `reportId` facultatif, `page`, `limit` |
| PATCH | `/api/moderation/reports/:id/resolve` | Corps `{ "reason": "..." }` |
| PATCH | `/api/moderation/reports/:id/dismiss` | Corps `{ "reason": "..." }` |

Les listes renvoient `total`, `page`, `limit`, `pages` et `reports` ou `logs`. Pagination : page 1 par défaut, 20 éléments par défaut, 100 maximum. Les rapports incluent l’identité publique du déclarant et la cible actuelle lorsqu’elle existe, sans hash de mot de passe.

## Décision liée à un signalement

`POST /api/moderation/reports/:id/actions`

```json
{ "action": "DELETE_COMMENT", "reason": "Commentaire contenant des insultes ciblées" }
```

- MODERATOR : `RESOLVE_REPORT`, `DISMISS_REPORT`.
- ADMIN et SUPER_ADMIN : également `HIDE_POST`, `DELETE_POST`, `DELETE_COMMENT`, `BAN_USER`.
- `BAN_USER` cible le compte signalé ou l’auteur du contenu signalé. Le serveur retrouve cet auteur ; l’interface n’impose pas son propre identifiant.
- Une décision exige un signalement encore en attente. Les transitions répétées renvoient `409`.
- La sanction, la clôture et l’entrée du journal sont dans une seule transaction.

Réponse `200` : `{ "status": "OK", "report": { ... }, "logId": 123 }`, avec éventuellement `post` ou `user` selon l’action.

## Sanctions directes : ADMIN et supérieurs

| Méthode | Route | Effet |
|---|---|---|
| GET | `/api/moderation/users?q=nom&banned=true&page=1&limit=20` | Recherche des comptes ; filtres facultatifs |
| PATCH | `/api/moderation/users/:id/ban` | Bannit le compte et révoque ses sessions |
| PATCH | `/api/moderation/users/:id/unban` | Lève le bannissement ; une reconnexion reste nécessaire |
| PATCH | `/api/moderation/posts/:id/hide` | Masque le post dans le fil et les lectures de contenu |
| PATCH | `/api/moderation/posts/:id/unhide` | Réaffiche le post |
| DELETE | `/api/moderation/posts/:id` | Supprime le post et ses commentaires |
| DELETE | `/api/moderation/comments/:id` | Supprime le commentaire |

Toutes les mutations de ce tableau attendent `{ "reason": "Motif détaillé" }`. Les suppressions directes clôturent les signalements ouverts concernés. Un masquage ou bannissement direct n’interprète pas automatiquement tous les autres signalements ; l’équipe peut les traiter séparément.

Le bannissement incrémente `User.authVersion`. Chaque requête authentifiée compare cette version à celle du JWT et vérifie `isBanned`. Un cookie émis avant bannissement ne redevient pas valide après levée.

## Journal

Chaque décision enregistre l’acteur (`actorId`, `actorName`), l’action, le type et l’identifiant stables de la cible, un aperçu, le motif, la date et le signalement associé le cas échéant. Aucune route n’expose de modification ou suppression du journal. Ses identifiants scalaires ne sont pas soumis aux suppressions en cascade des contenus.

## Erreurs

Format : `{ "status": "ERROR", "errors": ["Message lisible"] }`.

- `400` : requête/filtre/identifiant/motif invalide, action incompatible, signalement de soi-même.
- `401` : absence de session, session expirée/révoquée, compte inexistant.
- `403` : compte banni, permissions insuffisantes, contenu privé non accessible, sanction contre rôle protégé.
- `404` : cible introuvable ou publication masquée pour les lectures ordinaires.
- `409` : doublon ouvert, signalement déjà traité, cible déjà dans l’état demandé, certains conflits concurrents.

## Commentaires ajoutés pour permettre le parcours complet

- `GET /api/posts/:postId/comments` : commentaires d’un post accessible.
- `POST /api/posts/:postId/comments`, corps `{ "content": "Texte" }` : crée un commentaire (1 à 2000 caractères).

Ces routes nécessitent une session active et la visibilité du post. Elles sont à coordonner avec le module interactions lors de sa future intégration.
