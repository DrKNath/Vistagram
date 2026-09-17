# Vistagram

Réseau social — projet SCRUM, IUT R&T Colmar.

## Branche moderation

- Signalements de publications, commentaires et utilisateurs.
- Interface `/moderation.html` avec filtres, pagination et décisions motivées.
- Masquage, suppression, bannissement et levée du bannissement.
- Journal persistant et révocation des sessions des comptes bannis.

**[Guide pas à pas VSCodium / Git / tests](docs/GUIDE-MODERATION.md)** · **[Contrat API](docs/API-MODERATION.md)**

Installation : `npm ci`, configurer `.env` à partir de `.env.example`, puis `npm run db:push` et `npm run dev`.

Tests : `npm test` (base temporaire isolée). Compilation : `npm run build`.

Attribution locale d’un rôle à un compte inscrit : `npm run user:role -- email@example.com ADMIN`.

Envoi de tes commits uniquement vers la branche prévue : `npm run push:moderation`.
