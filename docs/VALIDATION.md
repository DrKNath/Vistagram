# Validation de la livraison

- Base : branche `moderation`, commit `5f2c8242a84a96e6d90eded38afe1213f534d72f`.
- Environnement : Node.js 24.19.0, Prisma 5.22.0, SQLite.
- `npm test` : **143 tests réussis, 17 fichiers de tests**, dont les nouveaux parcours de modération et de sécurité.
- `npm run build` : compilation TypeScript réussie.
- Syntaxe JavaScript vérifiée pour les scripts de modération/signalement et les scripts intégrés au fil, au tableau de bord et au profil.
- Mise à niveau vérifiée sur une base créée à partir du schéma original : publication et deux anciens signalements conservés ; cibles et aperçus complétés ; doublon historique regroupé.
- Serveur Express démarré localement.

La vérification interactive et visuelle dans un navigateur n’a pas pu être exécutée : aucun navigateur n’était préinstallé et son téléchargement n’a pas abouti dans cet environnement. Le guide fournit le parcours de recette à effectuer sur ta machine. Les tests API ne prouvent pas à eux seuls le rendu de l’interface.

Le sujet scolaire intégral n’était pas disponible. La livraison couvre les quatre fonctionnalités énumérées dans la demande ; les autres exigences éventuelles du sujet restent à rapprocher du document original.

Envoi distant : refusé par GitHub (403, Resource not accessible by integration). Aucun commit de cette livraison n’a été envoyé à GitHub. Le ZIP contient le projet et un patch à appliquer depuis un clone sur `moderation`.
