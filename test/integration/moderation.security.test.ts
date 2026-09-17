import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/db.js';
import { registerUser, signToken } from '../../src/modules/auth/auth.js';

let author: number, reporter: number, mod: number, admin: number, superAdmin: number;
let postId: number, commentId: number;
let ids: number[] = [];
const prefix = 'moderation-security-';
const cookie = (id: number, version = 0) => `token=${signToken(id, version)}`;
const report = (input: object) => request(app).post('/api/moderation/reports').set('Cookie', cookie(reporter)).send({ reason: 'Contenu à examiner', ...input });
const action = (path: string, actor = admin, method: 'patch' | 'delete' | 'post' = 'patch', extra = {}) =>
    request(app)[method]('/api/moderation/' + path).set('Cookie', cookie(actor)).send({ reason: 'Décision motivée du test', ...extra });

beforeAll(async () => {
    for (const role of ['author', 'reporter', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN']) {
        const user = await registerUser(`${prefix}${role}@test.local`, `${prefix}${role}`, 'password1234');
        if (role === role.toUpperCase()) await prisma.user.update({ where: { id: user.id }, data: { role } });
        ids.push(user.id);
    }
    [author, reporter, mod, admin, superAdmin] = ids;
});
beforeEach(async () => {
    await prisma.report.deleteMany({ where: { userId: { in: ids } } });
    await prisma.moderationLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.post.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.updateMany({ where: { id: { in: ids } }, data: { isBanned: false, authVersion: 0 } });
    const post = await prisma.post.create({ data: { userId: author, content: '<script>Un contenu signalé</script>' } });
    postId = post.id;
    const comment = await prisma.comment.create({ data: { postId, userId: author, content: 'Commentaire signalé' } });
    commentId = comment.id;
});
afterAll(async () => {
    await prisma.moderationLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
});

describe('Signalements et contrôle d’accès', () => {
    it('signale les trois types de cibles avec un aperçu sans mot de passe', async () => {
        for (const [input, type] of [[{ postId }, 'POST'], [{ commentId }, 'COMMENT'], [{ targetUserId: author }, 'USER']] as const) {
            const res = await report(input);
            expect(res.status).toBe(201);
            expect(res.body.report.targetType).toBe(type);
            expect(res.body.report.targetSnapshot).not.toContain('password');
        }
    });
    it('refuse les doublons ouverts, y compris les requêtes concurrentes', async () => {
        const results = await Promise.all([report({ postId }), report({ postId })]);
        expect(results.map(r => r.status).sort()).toEqual([201, 409]);
        expect(await prisma.report.count({ where: { postId } })).toBe(1);
    });
    it('refuse cible multiple, manquante, identifiant invalide et motif excessif', async () => {
        for (const input of [{}, { postId, commentId }, { postId: -1 }, { targetUserId: '2' }, { commentId: 1.5 }, { postId, reason: 'x'.repeat(1001) }, { postId, reason: '  ' }]) {
            expect((await report(input)).status).toBe(400);
        }
    });
    it('refuse les cibles inexistantes et le signalement de soi-même', async () => {
        expect((await report({ targetUserId: reporter })).status).toBe(400);
        expect((await report({ commentId: 9999999 })).status).toBe(404);
        expect((await report({ targetUserId: 9999999 })).status).toBe(404);
    });
    it('ne révèle pas un post privé ni ses commentaires à un non-ami', async () => {
        await prisma.post.update({ where: { id: postId }, data: { visibility: 'FRIENDS' } });
        expect((await report({ postId })).status).toBe(403);
        expect((await report({ commentId })).status).toBe(403);
        expect((await request(app).get(`/api/posts/${postId}/comments`).set('Cookie', cookie(reporter))).status).toBe(403);
    });
    it('autorise le signalement privé pour un ami accepté', async () => {
        await prisma.post.update({ where: { id: postId }, data: { visibility: 'FRIENDS' } });
        await prisma.friendship.create({ data: { userId: reporter, friendId: author, status: 'ACCEPTED' } });
        expect((await report({ postId })).status).toBe(201);
        await prisma.friendship.deleteMany({ where: { userId: reporter } });
    });
    it('interdit les données admin à USER et aux visiteurs', async () => {
        for (const path of ['reports', 'logs', 'users']) {
            expect((await request(app).get('/api/moderation/' + path)).status).toBe(401);
            expect((await request(app).get('/api/moderation/' + path).set('Cookie', cookie(reporter))).status).toBe(403);
        }
    });
    it('permet au modérateur de consulter et rejeter avec une trace', async () => {
        const created = await report({ postId });
        expect((await request(app).get('/api/moderation/reports').set('Cookie', cookie(mod))).status).toBe(200);
        expect((await action(`reports/${created.body.report.id}/dismiss`, mod)).body.report.status).toBe('dismissed');
        const log = await prisma.moderationLog.findFirst({ where: { actorId: mod } });
        expect(log?.action).toBe('DISMISS_REPORT');
        expect(log?.reason).toBe('Décision motivée du test');
    });
    it('interdit une sanction au modérateur, même via le traitement groupé', async () => {
        const created = await report({ postId });
        expect((await action(`reports/${created.body.report.id}/actions`, mod, 'post', { action: 'DELETE_POST' })).status).toBe(403);
        expect((await action(`users/${author}/ban`, mod)).status).toBe(403);
        expect(await prisma.moderationLog.count({ where: { actorId: mod } })).toBe(0);
    });
    it('valide filtres et pagination ; ne retourne pas les mots de passe', async () => {
        await report({ postId }); await report({ commentId });
        const filtered = await request(app).get('/api/moderation/reports?type=COMMENT&status=pending&limit=1').set('Cookie', cookie(admin));
        expect(filtered.body.total).toBe(1); expect(filtered.body.reports[0].targetType).toBe('COMMENT');
        expect(JSON.stringify(filtered.body)).not.toContain('password');
        for (const query of ['status=bad', 'type=bad', 'page=-1', 'limit=101', 'page=abc']) {
            expect((await request(app).get('/api/moderation/reports?' + query).set('Cookie', cookie(admin))).status).toBe(400);
        }
    });
    it('empêche l’élévation de privilèges via la modification du profil', async () => {
        await request(app).patch('/api/users/me').set('Cookie', cookie(reporter)).send({ role: 'SUPER_ADMIN', isBanned: false, authVersion: 99 });
        const user = await prisma.user.findUniqueOrThrow({ where: { id: reporter } });
        expect(user.role).toBe('USER'); expect(user.authVersion).toBe(0);
    });
});

describe('Sanctions effectives et journal durable', () => {
    it('masque réellement le post, son accès direct et ses commentaires puis le restaure', async () => {
        expect((await action(`posts/${postId}/hide`)).status).toBe(200);
        const feed = await request(app).get('/api/posts').set('Cookie', cookie(reporter));
        expect(feed.body.posts.some((p: { id: number }) => p.id === postId)).toBe(false);
        expect((await request(app).get(`/api/posts/${postId}`).set('Cookie', cookie(author))).status).toBe(404);
        expect((await request(app).get(`/api/posts/${postId}/comments`).set('Cookie', cookie(author))).status).toBe(404);
        expect((await report({ postId })).status).toBe(404);
        expect((await action(`posts/${postId}/unhide`)).status).toBe(200);
        expect((await request(app).get(`/api/posts/${postId}`).set('Cookie', cookie(reporter))).status).toBe(200);
        expect(await prisma.moderationLog.count({ where: { targetId: postId } })).toBe(2);
    });
    it('supprime un commentaire, résout le signalement et conserve la preuve', async () => {
        const created = await report({ commentId });
        const res = await action(`reports/${created.body.report.id}/actions`, admin, 'post', { action: 'DELETE_COMMENT' });
        expect(res.status).toBe(200);
        expect(await prisma.comment.findUnique({ where: { id: commentId } })).toBeNull();
        const saved = await prisma.report.findUniqueOrThrow({ where: { id: created.body.report.id } });
        expect(saved.status).toBe('RESOLVED'); expect(saved.commentId).toBeNull(); expect(saved.targetId).toBe(commentId);
        expect(saved.targetSnapshot).toContain('Commentaire signalé');
        expect(await prisma.moderationLog.count({ where: { reportId: saved.id } })).toBe(1);
    });
    it('supprime un post et ferme aussi les signalements de ses commentaires', async () => {
        const a = await report({ postId }), b = await report({ commentId });
        expect((await action(`reports/${a.body.report.id}/actions`, admin, 'post', { action: 'DELETE_POST' })).status).toBe(200);
        expect(await prisma.post.findUnique({ where: { id: postId } })).toBeNull();
        for (const id of [a.body.report.id, b.body.report.id]) {
            const saved = await prisma.report.findUniqueOrThrow({ where: { id } });
            expect(saved.status).toBe('RESOLVED'); expect(saved.targetSnapshot).not.toBe('');
        }
        const log = await prisma.moderationLog.findFirstOrThrow({ where: { action: 'DELETE_POST' } });
        expect(log.targetId).toBe(postId); expect(log.targetSnapshot).toContain('Un contenu signalé');
    });
    it('conserve le signalement même si l’auteur supprime lui-même sa publication', async () => {
        const created = await report({ postId });
        await request(app).delete(`/api/posts/${postId}`).set('Cookie', cookie(author));
        const saved = await prisma.report.findUniqueOrThrow({ where: { id: created.body.report.id } });
        expect(saved.targetSnapshot).toContain('Un contenu signalé'); expect(saved.postId).toBeNull();
        expect((await action(`reports/${saved.id}/resolve`, mod)).status).toBe(200);
    });
    it('refuse un second traitement sans ajouter une seconde trace', async () => {
        const created = await report({ postId });
        expect((await action(`reports/${created.body.report.id}/resolve`, mod)).status).toBe(200);
        expect((await action(`reports/${created.body.report.id}/dismiss`, admin)).status).toBe(409);
        expect(await prisma.moderationLog.count({ where: { reportId: created.body.report.id } })).toBe(1);
        expect((await report({ postId })).status).toBe(201);
    });
    it('refuse une action incompatible sans modifier ni journaliser', async () => {
        const created = await report({ targetUserId: author });
        expect((await action(`reports/${created.body.report.id}/actions`, admin, 'post', { action: 'DELETE_POST' })).status).toBe(400);
        expect(await prisma.moderationLog.count({ where: { actorId: admin } })).toBe(0);
        expect((await prisma.report.findUniqueOrThrow({ where: { id: created.body.report.id } })).status).toBe('PENDING');
    });
    it('bannit l’auteur d’un commentaire via son signalement', async () => {
        const created = await report({ commentId });
        expect((await action(`reports/${created.body.report.id}/actions`, admin, 'post', { action: 'BAN_USER' })).status).toBe(200);
        expect((await prisma.user.findUniqueOrThrow({ where: { id: author } })).isBanned).toBe(true);
        expect((await prisma.user.findUniqueOrThrow({ where: { id: reporter } })).isBanned).toBe(false);
    });
    it('bloque la connexion et les sessions ouvertes ; la levée exige une nouvelle connexion', async () => {
        expect((await action(`users/${author}/ban`)).status).toBe(200);
        for (const path of ['/api/auth/me', '/api/posts']) {
            expect((await request(app).get(path).set('Cookie', cookie(author))).status).toBe(403);
        }
        expect((await request(app).post('/api/posts').set('Cookie', cookie(author)).send({ content: 'Test', visibility: 'public' })).status).toBe(403);
        const credentials = { email: `${prefix}author@test.local`, password: 'password1234' };
        expect((await request(app).post('/api/auth/login').send(credentials)).status).toBe(403);
        expect((await action(`users/${author}/unban`)).status).toBe(200);
        expect((await request(app).get('/api/auth/me').set('Cookie', cookie(author))).status).toBe(401);
        const login = await request(app).post('/api/auth/login').send(credentials);
        expect(login.status).toBe(200);
        expect((await request(app).get('/api/auth/me').set('Cookie', login.headers['set-cookie'])).status).toBe(200);
    });
    it('protège soi-même et les rôles égaux/supérieurs', async () => {
        for (const target of [admin, superAdmin]) expect((await action(`users/${target}/ban`)).status).toBe(403);
        expect((await action(`users/${admin}/ban`, superAdmin)).status).toBe(200);
    });
    it('exige un motif pour toute sanction et refuse les identifiants invalides', async () => {
        expect((await request(app).patch(`/api/moderation/users/${author}/ban`).set('Cookie', cookie(admin))).status).toBe(400);
        expect((await action('posts/1.5/hide')).status).toBe(400);
        expect(await prisma.moderationLog.count({ where: { actorId: admin } })).toBe(0);
    });
    it('ne permet pas de modifier ou effacer le journal par l’API', async () => {
        await action(`posts/${postId}/hide`);
        const log = await prisma.moderationLog.findFirstOrThrow({ where: { actorId: admin } });
        expect((await action(`logs/${log.id}`, admin, 'delete')).status).toBe(404);
        expect((await action(`logs/${log.id}`, admin, 'patch')).status).toBe(404);
        expect(await prisma.moderationLog.findUnique({ where: { id: log.id } })).not.toBeNull();
    });
    it('permet l’ajout et la lecture de commentaires depuis le fil', async () => {
        const created = await request(app).post(`/api/posts/${postId}/comments`).set('Cookie', cookie(reporter)).send({ content: 'Nouveau commentaire' });
        expect(created.status).toBe(201);
        const list = await request(app).get(`/api/posts/${postId}/comments`).set('Cookie', cookie(reporter));
        expect(list.body.comments).toHaveLength(2);
    });
});
