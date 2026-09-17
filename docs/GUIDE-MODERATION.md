# Modération Vistagram — guide VSCodium, lancement et Git

Cette version part du ZIP de la branche `moderation`, commit `5f2c8242a84a96e6d90eded38afe1213f534d72f`, du dépôt https://github.com/DrKNath/Vistagram.
Elle couvre les quatre fonctionnalités demandées : signalements de publications/commentaires/utilisateurs, interface d’administration, sanctions et journal. Le sujet scolaire complet n’était pas joint au ZIP : la conformité à d’autres clauses du sujet reste à vérifier avec ce document.

## 1. Ouvrir la bonne branche dans VSCodium

Un ZIP GitHub contient les fichiers, **pas l’historique Git ni la liaison avec la branche**. Le nom du dossier ne sélectionne pas une branche. Travaille dans un clone du dépôt pour commit/push.

### Si tu n’as pas encore le dépôt sur Debian

Dans VSCodium, menu **Terminal → Nouveau terminal**. Tape les commandes une par une :

```bash
mkdir -p ~/Projets
cd ~/Projets
git clone --branch moderation --single-branch https://github.com/DrKNath/Vistagram.git Vistagram-moderation
cd Vistagram-moderation
codium .
```

Si `codium` n’est pas reconnu, utilise **Fichier → Ouvrir un dossier**, puis sélectionne `Projets/Vistagram-moderation`. Si ce dossier existe déjà, utilise la procédure suivante ou choisis un autre dossier vide.

### Si tu as déjà un clone du dépôt

Ouvre son dossier dans VSCodium, puis son terminal :

```bash
git status
git remote -v
```

`origin` doit correspondre à `DrKNath/Vistagram`. Si Git affiche des fichiers modifiés, préserve ton travail avant de changer de branche : fais un commit sur la branche de cette fonctionnalité, ou ouvre un nouveau clone dans un autre dossier. Ne supprime pas tes modifications pour suivre le guide.

Quand le dossier est propre :

```bash
git fetch origin
git switch moderation
git pull --ff-only origin moderation
```

Si Git dit que la branche locale `moderation` n’existe pas, mais que `origin/moderation` existe :

```bash
git switch --track origin/moderation
```

Si `git pull --ff-only` refuse parce que les historiques divergent, garde ce message et examine tes commits avant de continuer ; ne force pas le push.

### Vérification avant toute modification

```bash
git branch --show-current
git status -sb
```

La première commande doit afficher exactement `moderation`. La seconde doit indiquer `moderation...origin/moderation`. Dans VSCodium, en bas à gauche, tu dois également voir `moderation`. Si c’est `main`, change de branche avant de coder.

## 1 bis. Appliquer le code livré dans le ZIP

**L’envoi direct vers GitHub a été refusé (403 : accès en écriture non accordé au connecteur).** Le code de cette livraison n’a donc pas encore été poussé sur la branche distante. Tu dois l’appliquer dans ton clone avant les étapes d’installation suivantes.

Télécharge le **ZIP de livraison fourni dans la réponse**, puis extrais-le avec le gestionnaire de fichiers. Il contient :

- `Vistagram-moderation/` : le projet complet modifié, à consulter si besoin ;
- `moderation.patch` : les changements à appliquer à ton vrai clone Git ;
- `GUIDE-MODERATION.md` : ce guide.

Dans le terminal de **ton clone**, toujours sur `moderation`, applique le patch. Exemple si tu as extrait le ZIP dans `~/Téléchargements/livraison-moderation` :

```bash
git branch --show-current
git status --short
git apply --check ~/Téléchargements/livraison-moderation/moderation.patch
git apply ~/Téléchargements/livraison-moderation/moderation.patch
git status --short
```

Adapte seulement le chemin au dossier d’extraction. La commande `--check` vérifie que les changements peuvent être appliqués et ne modifie rien. **Si elle affiche une erreur, n’exécute pas la commande suivante** : le patch peut déjà être appliqué ou ton code peut différer de la base fournie. Le contrôle réussi n’affiche généralement aucun message. Après `git apply`, les fichiers apparaissent comme modifiés/ajoutés dans VSCodium ; c’est normal, ils ne sont pas encore commités.

Cette méthode conserve le dossier `.git`, les données locales et le lien vers `origin/moderation`.

## 2. Installer et préparer la base

Dans le terminal ouvert à la racine du projet (là où se trouve `package.json`) :

```bash
node --version
npm --version
npm ci
```

Utilise une version moderne de Node.js compatible avec les dépendances ; cette livraison a été vérifiée avec Node.js 24.19.0. Les dépendances sont celles du ZIP, sans nouveau framework.

Pour un nouveau clone, copie `.env.example` en `.env`. Dans VSCodium, tu peux faire clic droit sur `.env.example` → Copier → Coller, puis renommer la copie en `.env`. En terminal Debian :

```bash
cp .env.example .env
```

**Si `.env` existe déjà, conserve-le et complète-le ; ne l’écrase pas.** Il doit contenir notamment :

```dotenv
DATABASE_URL="file:./dev.db"
JWT_SECRET="une-valeur-aleatoire-longue-propre-a-ton-installation"
PORT=3000
```

Pour générer ta valeur de `JWT_SECRET` :

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Copie le résultat dans `.env`. Ce fichier est ignoré par Git. Sur une installation existante, garde ton secret actuel si tu veux conserver les sessions compatibles ; changer ce secret déconnecte les comptes.

La base reste SQLite : `file:./dev.db` désigne `prisma/dev.db`. Aucun serveur MySQL/PostgreSQL n’est nécessaire.

Si tu as déjà une base avec des données, arrête le serveur (`Ctrl+C`) avant de la sauvegarder. Par exemple, copie `prisma/dev.db` vers un emplacement de sauvegarde. Ensuite :

```bash
npm run db:push
```

Cette commande crée/actualise les tables, génère le client Prisma puis complète les anciens signalements de publications. Elle n’utilise ni `migrate reset` ni `--accept-data-loss`. Les doublons historiques en attente sont regroupés : un reste ouvert, les autres sont marqués rejetés avec une note de reprise. Les lignes ne sont pas supprimées.

Le projet d’origine n’avait pas d’historique de migrations Prisma ; ce guide conserve son workflow `db push`. Si Prisma signale un risque de perte de données sur ta propre base, arrête-toi et examine le message avec ta sauvegarde disponible.

## 3. Lancer l’application

```bash
npm run dev
```

Laisse ce terminal ouvert et ouvre http://localhost:3000/login.html. **N’utilise pas Live Server ni un double-clic sur les fichiers HTML** : les pages doivent être servies par Express pour que les cookies et l’API fonctionnent.

Si Node tourne sur ta machine Debian et le navigateur sur ton PC, remplace `localhost` par l’adresse de Debian et utilise le même hôte pour toutes les pages.

Pour vérifier la compilation ou lancer la version compilée :

```bash
npm run build
npm start
```

Arrête le serveur de développement avant `npm start` pour éviter d’occuper deux fois le même port.

## 4. Créer les comptes de test et donner un rôle

Crée les comptes depuis la page **Inscription** : un auteur, un utilisateur qui signale, et un administrateur. Les nouveaux comptes ont toujours le rôle `USER`.

Ouvre un **deuxième terminal** dans VSCodium en laissant le serveur tourner. Pour promouvoir le compte que tu as réellement créé :

```bash
npm run user:role -- ton-adresse@example.com ADMIN
```

Remplace l’adresse par celle de ton compte. Pour un compte de modération :

```bash
npm run user:role -- adresse-moderateur@example.com MODERATOR
```

La commande exige l’accès local au projet et à la base ; aucune route publique ne permet de s’attribuer un rôle. Après un changement de rôle, reconnecte le compte.

| Rôle | Signaler | Lire / clore / rejeter les signalements | Lire le journal | Masquer / supprimer / bannir / débannir |
|---|---|---|---|---|
| USER | Oui | Non | Non | Non |
| MODERATOR | Oui | Oui | Oui | Non |
| ADMIN | Oui | Oui | Oui | Oui |
| SUPER_ADMIN | Oui | Oui | Oui | Oui |

`SUPER_ADMIN` est conservé pour compatibilité avec le ZIP. Un administrateur ne peut pas se bannir ni bannir un compte de rôle égal ou supérieur.

## 5. Vérifier les quatre fonctionnalités dans le navigateur

Utilise des navigateurs ou profils séparés, ou déconnecte/reconnecte les comptes entre les étapes. Deux onglets d’un même profil partagent la même session.

1. **Auteur :** connecte-toi, ouvre le fil et crée une publication. Ouvre « Commentaires » pour ajouter un commentaire.
2. **Utilisateur qui signale :** ouvre le fil. Clique sur « Signaler la publication », saisis un motif et envoie. Le message de succès confirme l’enregistrement en base.
3. Clique sur « Signaler le commentaire » sous un commentaire et envoie un autre signalement.
4. Clique sur « Signaler cet utilisateur » sous une publication, ou sur le nom de l’auteur puis « Signaler cet utilisateur » dans son profil.
5. **Administrateur :** reconnecte-toi. Le tableau de bord affiche « Modération & signalements ». Ouvre ce lien ou http://localhost:3000/moderation.html.
6. Dans **Signalements**, filtre par statut ou cible. Les cartes affichent l’auteur du signalement, le motif, la date et un aperçu conservé du contenu.
7. Clique sur **Examiner et décider**, choisis une décision et renseigne le motif. Une sanction appliquée depuis un signalement le classe automatiquement comme traité.
8. Teste le **masquage** : la publication disparaît du fil, de l’accès direct et de la lecture des commentaires. Pour la restaurer, retrouve son signalement dans « Traités » ou « Tous », puis « Réafficher la publication ».
9. Teste la **suppression** d’un commentaire ou d’une publication : le contenu disparaît réellement de la base, tandis que le signalement et la trace de modération restent consultables. Supprimer une publication supprime aussi ses commentaires et clôt leurs signalements ouverts.
10. Dans **Utilisateurs**, recherche un compte puis bannis-le avec un motif. Sa session déjà ouverte ne doit plus accéder à l’API, et sa connexion doit être refusée. Après levée du bannissement, il doit se reconnecter : l’ancien cookie reste révoqué.
11. Dans **Journal des actions**, retrouve chaque décision avec son auteur, sa date, sa cible, son motif et son aperçu conservé. Le journal est consultable, sans route de modification/suppression.
12. Connecté avec un simple `USER`, ouvre `/moderation.html` : l’accès est refusé. L’API refuse également l’accès même si quelqu’un contourne les boutons de la page.

Un compte ne peut avoir qu’un signalement ouvert par cible. Un deuxième envoi est refusé avec un message explicite. Après traitement, un nouveau signalement est possible. On ne peut pas signaler son propre compte, ni un contenu privé auquel on n’a pas accès.

## 6. Lancer les tests sans toucher à tes données

```bash
npm test
npm run test:moderation
npm run build
```

`npm test` crée une base temporaire différente à chaque exécution, lance les tests puis la supprime. Il ne réinitialise jamais `prisma/dev.db`. Utilise les commandes npm du projet : lancer `npx vitest` directement est volontairement bloqué pour éviter des écritures dans la mauvaise base.

Les tests vérifient les permissions, les trois cibles, les doublons concurrents, les contenus privés, le masquage effectif, la conservation des preuves après suppression, les bannissements, la révocation des cookies, les motifs obligatoires et l’impossibilité de s’attribuer un rôle via le profil.

## 7. Enregistrer tes modifications et pousser uniquement vers moderation

Après tes propres modifications, vérifie d’abord :

```bash
git branch --show-current
git status
git diff
```

La branche doit être `moderation`. Dans VSCodium, l’onglet **Contrôle de code source** à gauche montre les fichiers modifiés. Clique sur chaque fichier pour relire les changements, puis sur **+** pour préparer ceux que tu veux inclure au commit. Vérifie qu’aucun secret ou fichier de base n’est préparé.

En terminal, si tous les changements affichés sont ceux que tu souhaites enregistrer :

```bash
git add .
git diff --cached --stat
git commit -m "feat: amélioration de la modération et des signalements"
npm run push:moderation
```

La dernière commande vérifie que la branche courante est exactement `moderation`, puis exécute :

```bash
git push origin HEAD:refs/heads/moderation
```

La destination est explicite ; ce script ne pousse jamais vers `main` et ne force jamais l’historique. Utilise-le plutôt qu’un bouton de synchronisation si tu veux garder cette vérification.

Un **commit** enregistre les modifications localement. Un **push** envoie les commits sur GitHub, ici sur `moderation`. Une **pull request** propose ensuite de les intégrer à une autre branche ; le merge vers `main` est une étape distincte à faire avec ton équipe.

Si le push est refusé parce que quelqu’un a avancé sur `moderation`, fais `git fetch origin`, examine `git status` et les commits ; ne lance pas de `push --force`. Si une authentification GitHub est demandée, utilise ton moyen d’authentification habituel ; ne mets jamais ton jeton dans les fichiers du projet.

## 8. Si tu dois récupérer la livraison depuis le ZIP

Utilise la procédure par patch de la section 1 bis. Le ZIP exclut `.git`, `.env`, la base, les uploads et `node_modules`. Une fois que tu auras poussé cette livraison sur `moderation`, les autres membres pourront simplement récupérer la branche via Git.

## 9. Fichiers utiles et intégration avec les autres branches

- `src/modules/moderation/` : validation, routes, contrôleurs, traitement transactionnel et journal.
- `prisma/schema.prisma` : cibles de signalement, état de bannissement, version d’authentification et journal.
- `src/middlewares/auth.middleware.ts` : comptes bannis et cookies révoqués.
- `src/modules/posts/posts.service.ts` : exclusion des publications masquées.
- `src/modules/users/users.service.ts` : liste explicite des champs du profil modifiables.
- `public/moderation.html`, `public/assets/js/moderation.js`, `public/assets/css/moderation.css` : interface de modération.
- `public/assets/js/reporting.js` : boîte de dialogue réutilisable de signalement.
- `src/modules/comments/comments.routes.ts` : ajout/lecture minimal de commentaires, car `interactions` était vide dans le ZIP. À coordonner avec le membre qui développe les interactions pour éviter des routes en double.
- `scripts/` : reprise des signalements, attribution locale d’un rôle, tests isolés et push sécurisé vers la branche.

Pour brancher le signalement sur une future interface, charge `common.js` puis `reporting.js` et ajoute par exemple :

```html
<button data-report-type="POST" data-report-id="42">Signaler</button>
<button data-report-type="COMMENT" data-report-id="15">Signaler</button>
<button data-report-type="USER" data-report-id="7">Signaler</button>
```

Les identifiants doivent venir des vrais objets retournés par l’API.

Les décisions passent par `POST /api/moderation/reports/:id/actions` avec `{ "action": "DELETE_POST", "reason": "Motif détaillé" }`. Les routes de sanction directe restent disponibles et exigent également `reason`. Consulte `docs/API-MODERATION.md` pour le contrat.

Limites explicites de ce périmètre : le bannissement est permanent jusqu’à levée manuelle ; il n’efface pas automatiquement les publications du compte. Les fichiers médias sont encore servis par le module public d’origine : supprimer ou masquer un post ne garantit pas l’effacement du fichier ni l’inaccessibilité d’une ancienne URL `/uploads/...`. Le module de messagerie du ZIP est vide ; ses futurs événements WebSocket devront vérifier l’état du compte et la version de session. Le journal est protégé par l’API, mais une personne disposant d’un accès direct en écriture à SQLite peut le modifier.
