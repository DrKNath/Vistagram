import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/db';

const author = { email: 'post.author@vistagram.local', username: 'post_author', password: 'motdepasse123' };
const friend = { email: 'post.friend@vistagram.local', username: 'post_friend', password: 'motdepasse123' };
const stranger = { email: 'post.stranger@vistagram.local', username: 'post_stranger', password: 'motdepasse123' };
const emails = [author.email, friend.email, stranger.email];

let authorAgent: ReturnType<typeof request.agent>;
let friendAgent: ReturnType<typeof request.agent>;
let strangerAgent: ReturnType<typeof request.agent>;
let authorId: number;
let friendId: number;

async function cleanup() {
    const users = await prisma.user.findMany({ where: { email: { in: emails } } });
    const userIds = users.map((u) => u.id);

    await prisma.post.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.friendship.deleteMany({
        where: { OR: [{ userId: { in: userIds } }, { friendId: { in: userIds } }] },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
}

beforeAll(async () => {
    await cleanup();

    authorAgent = request.agent(app);
    friendAgent = request.agent(app);
    strangerAgent = request.agent(app);

    const authorRes = await authorAgent.post('/api/auth/register').send(author);
    const friendRes = await friendAgent.post('/api/auth/register').send(friend);
    await strangerAgent.post('/api/auth/register').send(stranger);

    authorId = authorRes.body.user.id;
    friendId = friendRes.body.user.id;

    // Le module "friends" n'existe pas encore : on crée l'amitié acceptée directement en base
    await prisma.friendship.create({
        data: { userId: authorId, friendId, status: 'ACCEPTED' },
    });
});

afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
});

describe('POST /api/posts', () => {
    it('refuse la création sans authentification', async () => {
        const response = await request(app).post('/api/posts').send({ content: 'Salut', visibility: 'public' });
        expect(response.status).toBe(401);
    });

    it('refuse un post sans contenu', async () => {
        const response = await authorAgent.post('/api/posts').send({ visibility: 'public' });
        expect(response.status).toBe(400);
        expect(response.body.status).toBe('ERROR');
    });

    it('refuse une visibilité invalide', async () => {
        const response = await authorAgent.post('/api/posts').send({ content: 'Test', visibility: 'secret' });
        expect(response.status).toBe(400);
    });

    it('crée un post public avec son auteur fusionné dans la réponse', async () => {
        const response = await authorAgent
            .post('/api/posts')
            .send({ content: 'Mon premier post public', visibility: 'public' });

        expect(response.status).toBe(201);
        expect(response.body.status).toBe('OK');
        expect(response.body.post.visibility).toBe('PUBLIC');
        expect(response.body.post.author.username).toBe(author.username);
    });

    it("crée un post réservé aux amis", async () => {
        const response = await authorAgent
            .post('/api/posts')
            .send({ content: 'Photo entre amis', visibility: 'friends' });

        expect(response.status).toBe(201);
        expect(response.body.post.visibility).toBe('FRIENDS');
    });
});

describe('Gestion de la visibilité du fil (GET /api/posts)', () => {
    it("un inconnu voit le post public mais pas le post réservé aux amis", async () => {
        const response = await strangerAgent.get('/api/posts');
        expect(response.status).toBe(200);

        const contents = response.body.posts.map((p: { content: string }) => p.content);
        expect(contents).toContain('Mon premier post public');
        expect(contents).not.toContain('Photo entre amis');
    });

    it("un ami voit le post public ET le post réservé aux amis", async () => {
        const response = await friendAgent.get('/api/posts');
        expect(response.status).toBe(200);

        const contents = response.body.posts.map((p: { content: string }) => p.content);
        expect(contents).toContain('Mon premier post public');
        expect(contents).toContain('Photo entre amis');
    });

    it("l'auteur voit toujours ses propres posts, peu importe la visibilité", async () => {
        const response = await authorAgent.get('/api/posts');
        const contents = response.body.posts.map((p: { content: string }) => p.content);
        expect(contents).toContain('Mon premier post public');
        expect(contents).toContain('Photo entre amis');
    });
});

describe('GET /api/posts/:id', () => {
    it("refuse à un inconnu l'accès direct à un post réservé aux amis", async () => {
        const feed = await authorAgent.get('/api/posts');
        const friendsPost = feed.body.posts.find((p: { visibility: string }) => p.visibility === 'FRIENDS');

        const response = await strangerAgent.get(`/api/posts/${friendsPost.id}`);
        expect(response.status).toBe(403);
    });

    it('renvoie 404 sur un post inexistant', async () => {
        const response = await authorAgent.get('/api/posts/999999999');
        expect(response.status).toBe(404);
    });
});

describe('DELETE /api/posts/:id', () => {
    it("refuse la suppression d'un post par quelqu'un d'autre que l'auteur", async () => {
        const feed = await authorAgent.get('/api/posts');
        const publicPost = feed.body.posts.find((p: { visibility: string }) => p.visibility === 'PUBLIC');

        const response = await strangerAgent.delete(`/api/posts/${publicPost.id}`);
        expect(response.status).toBe(403);
    });

    it("permet à l'auteur de supprimer son propre post", async () => {
        const feed = await authorAgent.get('/api/posts');
        const publicPost = feed.body.posts.find((p: { visibility: string }) => p.visibility === 'PUBLIC');

        const response = await authorAgent.delete(`/api/posts/${publicPost.id}`);
        expect(response.status).toBe(200);
    });
});
