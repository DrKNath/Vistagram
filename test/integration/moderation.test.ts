import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/db';
import { registerUser } from '../../src/modules/auth/auth';

const normalUser = {
    email: 'test.moderation.user@vistagram.local',
    username: 'test_mod_user',
    password: 'motdepasse123',
};

const adminUser = {
    email: 'test.moderation.admin@vistagram.local',
    username: 'test_mod_admin',
    password: 'motdepasse123',
};

let postId: number;

async function cleanup() {
    await prisma.report.deleteMany({
        where: { post: { user: { email: { in: [normalUser.email, adminUser.email] } } } },
    });
    await prisma.post.deleteMany({ where: { user: { email: { in: [normalUser.email, adminUser.email] } } } });
    await prisma.user.deleteMany({ where: { email: { in: [normalUser.email, adminUser.email] } } });
}

async function loginAs(credentials: { email: string; password: string }) {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send(credentials);
    return agent;
}

beforeAll(async () => {
    await cleanup();

    const user = await registerUser(normalUser.email, normalUser.username, normalUser.password);
    const admin = await registerUser(adminUser.email, adminUser.username, adminUser.password);
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });

    const post = await prisma.post.create({
        data: {
            content: 'Post de test pour la modération',
            userId: user.id,
            visibility: 'PUBLIC',
        },
    });
    postId = post.id;
});

afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
});

describe('POST /api/moderation/reports (signalement)', () => {
    it('refuse de signaler sans être authentifié', async () => {
        const response = await request(app).post('/api/moderation/reports').send({
            postId,
            reason: 'Contenu offensant',
        });
        expect(response.status).toBe(401);
    });

    it('refuse un signalement avec des données invalides', async () => {
        const agent = await loginAs(normalUser);
        const response = await agent
            .post('/api/moderation/reports')
            .send({ postId: 'pas-un-nombre', reason: '' });
        expect(response.status).toBe(400);
    });

    it("refuse de signaler un post qui n'existe pas", async () => {
        const agent = await loginAs(normalUser);
        const response = await agent.post('/api/moderation/reports').send({
            postId: 999999,
            reason: 'Contenu offensant',
        });
        expect(response.status).toBe(404);
    });

    it('permet à un utilisateur connecté de signaler un post', async () => {
        const agent = await loginAs(normalUser);
        const response = await agent.post('/api/moderation/reports').send({
            postId,
            reason: 'Contenu offensant',
        });

        expect(response.status).toBe(201);
        expect(response.body.status).toBe('OK');
        expect(response.body.report.postId).toBe(postId);
        expect(response.body.report.status).toBe('pending');
        expect(response.body.report.reportedBy).toBeTypeOf('number');
    });
});

describe('Vérification des droits administrateur', () => {
    it('refuse à un utilisateur normal de lister les signalements (403)', async () => {
        const agent = await loginAs(normalUser);
        const response = await agent.get('/api/moderation/reports');
        expect(response.status).toBe(403);
    });

    it('refuse à un utilisateur normal de résoudre un signalement (403)', async () => {
        const agent = await loginAs(normalUser);
        const response = await agent.patch('/api/moderation/reports/1/resolve');
        expect(response.status).toBe(403);
    });

    it('refuse à un utilisateur normal de masquer un post (403)', async () => {
        const agent = await loginAs(normalUser);
        const response = await agent.patch(`/api/moderation/posts/${postId}/hide`);
        expect(response.status).toBe(403);
    });

    it('refuse à un utilisateur normal de supprimer un post (403)', async () => {
        const agent = await loginAs(normalUser);
        const response = await agent.delete(`/api/moderation/posts/${postId}`);
        expect(response.status).toBe(403);
    });

    it('refuse l\'accès sans authentification (401, avant même la vérification du rôle)', async () => {
        const response = await request(app).get('/api/moderation/reports');
        expect(response.status).toBe(401);
    });

    it('autorise un administrateur à lister les signalements', async () => {
        const agent = await loginAs(adminUser);
        const response = await agent.get('/api/moderation/reports');
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.reports)).toBe(true);
        expect(response.body.reports.length).toBeGreaterThan(0);
    });
});

describe('Masquage / suppression de contenu (admin)', () => {
    it('permet à un administrateur de masquer un post', async () => {
        const agent = await loginAs(adminUser);
        const response = await agent.patch(`/api/moderation/posts/${postId}/hide`);

        expect(response.status).toBe(200);
        expect(response.body.post.isHidden).toBe(true);
    });

    it('permet à un administrateur de réafficher un post masqué', async () => {
        const agent = await loginAs(adminUser);
        const response = await agent.patch(`/api/moderation/posts/${postId}/unhide`);

        expect(response.status).toBe(200);
        expect(response.body.post.isHidden).toBe(false);
    });

    it('permet à un administrateur de résoudre un signalement', async () => {
        const agent = await loginAs(adminUser);
        const list = await agent.get('/api/moderation/reports?status=pending');
        const reportId = list.body.reports[0].id;

        const response = await agent.patch(`/api/moderation/reports/${reportId}/resolve`);
        expect(response.status).toBe(200);
        expect(response.body.report.status).toBe('resolved');
    });

    it('permet à un administrateur de supprimer définitivement un post', async () => {
        const agent = await loginAs(adminUser);
        const response = await agent.delete(`/api/moderation/posts/${postId}`);

        expect(response.status).toBe(200);

        const deleted = await prisma.post.findUnique({ where: { id: postId } });
        expect(deleted).toBeNull();
    });

    it('renvoie 404 si on essaie de masquer un post déjà supprimé', async () => {
        const agent = await loginAs(adminUser);
        const response = await agent.patch(`/api/moderation/posts/${postId}/hide`);
        expect(response.status).toBe(404);
    });
});
