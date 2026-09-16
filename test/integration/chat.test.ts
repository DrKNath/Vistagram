import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/db';
import { registerUser } from '../../src/modules/auth/auth';

const alice = {
    email: 'test.chat.alice@vistagram.local',
    username: 'test_chat_alice',
    password: 'motdepasse123',
};

const bob = {
    email: 'test.chat.bob@vistagram.local',
    username: 'test_chat_bob',
    password: 'motdepasse123',
};

const carol = {
    email: 'test.chat.carol@vistagram.local',
    username: 'test_chat_carol',
    password: 'motdepasse123',
};

const EMAILS = [alice.email, bob.email, carol.email];

let aliceId: number;
let bobId: number;
let carolId: number;

/** Supprime les comptes de test, leurs relations et leurs conversations. */
async function cleanup() {
    const users = await prisma.user.findMany({
        where: { email: { in: EMAILS } },
        select: { id: true },
    });
    const ids = users.map(u => u.id);

    await prisma.message.deleteMany({ where: { senderId: { in: ids } } });
    await prisma.conversationParticipant.deleteMany({ where: { userId: { in: ids } } });
    await prisma.conversation.deleteMany({ where: { participants: { none: {} } } });
    await prisma.friendship.deleteMany({
        where: {
            OR: [
                { user: { email: { in: EMAILS } } },
                { friend: { email: { in: EMAILS } } },
            ],
        },
    });
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
}

/** Ouvre une session authentifiée et conserve le cookie. */
async function loginAs(credentials: { email: string; password: string }) {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send(credentials);
    return agent;
}

/** Rend deux comptes amis, directement en base (le module friends est testé ailleurs). */
async function makeFriends(a: number, b: number) {
    await prisma.friendship.create({ data: { userId: a, friendId: b, status: 'ACCEPTED' } });
}

beforeAll(async () => {
    await cleanup();
    aliceId = (await registerUser(alice.email, alice.username, alice.password)).id;
    bobId = (await registerUser(bob.email, bob.username, bob.password)).id;
    carolId = (await registerUser(carol.email, carol.username, carol.password)).id;
});

beforeEach(async () => {
    // Chaque test repart sans conversation ni amitié entre les trois comptes.
    const ids = [aliceId, bobId, carolId];
    await prisma.message.deleteMany({ where: { senderId: { in: ids } } });
    await prisma.conversationParticipant.deleteMany({ where: { userId: { in: ids } } });
    await prisma.conversation.deleteMany({ where: { participants: { none: {} } } });
    await prisma.friendship.deleteMany({
        where: {
            OR: [
                { user: { email: { in: EMAILS } } },
                { friend: { email: { in: EMAILS } } },
            ],
        },
    });
});

afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
});

describe('authentification', () => {
    it('refuse toute route de messagerie sans session', async () => {
        const responses = await Promise.all([
            request(app).get('/api/chat/conversations'),
            request(app).post('/api/chat/conversations').send({ targetUserId: bobId }),
            request(app).get('/api/chat/conversations/1/messages'),
            request(app).post('/api/chat/conversations/1/messages').send({ content: 'salut' }),
        ]);
        responses.forEach(response => expect(response.status).toBe(401));
    });
});

describe('POST /api/chat/conversations', () => {
    it('refuse de démarrer une conversation avec un compte qui n\'est pas ami', async () => {
        const agent = await loginAs(alice);
        const response = await agent.post('/api/chat/conversations').send({ targetUserId: bobId });

        expect(response.status).toBe(403);
    });

    it('refuse de démarrer une conversation avec soi-même', async () => {
        const agent = await loginAs(alice);
        const response = await agent.post('/api/chat/conversations').send({ targetUserId: aliceId });

        expect(response.status).toBe(400);
    });

    it('refuse un identifiant de cible invalide', async () => {
        const agent = await loginAs(alice);
        const response = await agent.post('/api/chat/conversations').send({ targetUserId: 'abc' });

        expect(response.status).toBe(400);
    });

    it('refuse une cible inexistante', async () => {
        await makeFriends(aliceId, bobId);
        const agent = await loginAs(alice);
        const response = await agent.post('/api/chat/conversations').send({ targetUserId: 999999 });

        expect(response.status).toBe(404);
    });

    it('crée une conversation entre deux amis', async () => {
        await makeFriends(aliceId, bobId);
        const agent = await loginAs(alice);
        const response = await agent.post('/api/chat/conversations').send({ targetUserId: bobId });

        expect(response.status).toBe(201);
        expect(response.body.status).toBe('OK');
        expect(response.body.conversation.id).toBeTypeOf('number');
    });

    it('réutilise la conversation existante plutôt que d\'en créer une nouvelle', async () => {
        await makeFriends(aliceId, bobId);
        const agent = await loginAs(alice);

        const first = await agent.post('/api/chat/conversations').send({ targetUserId: bobId });
        const second = await agent.post('/api/chat/conversations').send({ targetUserId: bobId });

        expect(second.body.conversation.id).toBe(first.body.conversation.id);

        const total = await prisma.conversation.count({
            where: { participants: { some: { userId: aliceId } } },
        });
        expect(total).toBe(1);
    });
});

describe('GET /api/chat/conversations', () => {
    it('liste les conversations avec l\'autre participant et le dernier message', async () => {
        await makeFriends(aliceId, bobId);
        const aliceAgent = await loginAs(alice);
        const created = await aliceAgent.post('/api/chat/conversations').send({ targetUserId: bobId });
        const conversationId = created.body.conversation.id;

        await aliceAgent.post(`/api/chat/conversations/${conversationId}/messages`).send({ content: 'Salut Bob !' });

        const response = await aliceAgent.get('/api/chat/conversations');

        expect(response.status).toBe(200);
        expect(response.body.conversations).toHaveLength(1);
        const conversation = response.body.conversations[0];
        expect(conversation.participants).toHaveLength(1);
        expect(conversation.participants[0].id).toBe(bobId);
        expect(conversation.lastMessage.content).toBe('Salut Bob !');
    });

    it('ne montre pas les conversations des autres', async () => {
        await makeFriends(aliceId, bobId);
        const aliceAgent = await loginAs(alice);
        await aliceAgent.post('/api/chat/conversations').send({ targetUserId: bobId });

        const carolAgent = await loginAs(carol);
        const response = await carolAgent.get('/api/chat/conversations');

        expect(response.status).toBe(200);
        expect(response.body.conversations).toHaveLength(0);
    });
});

describe('messages', () => {
    it('refuse d\'envoyer un message à qui ne fait pas partie de la conversation', async () => {
        await makeFriends(aliceId, bobId);
        const aliceAgent = await loginAs(alice);
        const created = await aliceAgent.post('/api/chat/conversations').send({ targetUserId: bobId });
        const conversationId = created.body.conversation.id;

        const carolAgent = await loginAs(carol);
        const response = await carolAgent
            .post(`/api/chat/conversations/${conversationId}/messages`)
            .send({ content: 'Je ne devrais pas pouvoir écrire ici.' });

        expect(response.status).toBe(403);
    });

    it('refuse de lire les messages à qui ne fait pas partie de la conversation', async () => {
        await makeFriends(aliceId, bobId);
        const aliceAgent = await loginAs(alice);
        const created = await aliceAgent.post('/api/chat/conversations').send({ targetUserId: bobId });
        const conversationId = created.body.conversation.id;

        const carolAgent = await loginAs(carol);
        const response = await carolAgent.get(`/api/chat/conversations/${conversationId}/messages`);

        expect(response.status).toBe(403);
    });

    it('renvoie 404 pour une conversation inexistante', async () => {
        const agent = await loginAs(alice);
        const response = await agent.get('/api/chat/conversations/999999/messages');

        expect(response.status).toBe(404);
    });

    it('refuse un message vide ou trop long', async () => {
        await makeFriends(aliceId, bobId);
        const aliceAgent = await loginAs(alice);
        const created = await aliceAgent.post('/api/chat/conversations').send({ targetUserId: bobId });
        const conversationId = created.body.conversation.id;

        const empty = await aliceAgent.post(`/api/chat/conversations/${conversationId}/messages`).send({ content: '   ' });
        expect(empty.status).toBe(400);

        const tooLong = await aliceAgent
            .post(`/api/chat/conversations/${conversationId}/messages`)
            .send({ content: 'a'.repeat(2001) });
        expect(tooLong.status).toBe(400);
    });

    it('envoie et relit les messages dans l\'ordre chronologique', async () => {
        await makeFriends(aliceId, bobId);
        const aliceAgent = await loginAs(alice);
        const bobAgent = await loginAs(bob);

        const created = await aliceAgent.post('/api/chat/conversations').send({ targetUserId: bobId });
        const conversationId = created.body.conversation.id;

        await aliceAgent.post(`/api/chat/conversations/${conversationId}/messages`).send({ content: 'Premier message' });
        const second = await bobAgent
            .post(`/api/chat/conversations/${conversationId}/messages`)
            .send({ content: 'Deuxième message' });

        expect(second.status).toBe(201);
        expect(second.body.message.sender.id).toBe(bobId);

        const history = await aliceAgent.get(`/api/chat/conversations/${conversationId}/messages`);

        expect(history.status).toBe(200);
        expect(history.body.messages).toHaveLength(2);
        expect(history.body.messages[0].content).toBe('Premier message');
        expect(history.body.messages[1].content).toBe('Deuxième message');
    });
});
