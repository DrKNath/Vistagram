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

const dave = {
    email: 'test.chat.dave@vistagram.local',
    username: 'test_chat_dave',
    password: 'motdepasse123',
};

const EMAILS = [alice.email, bob.email, carol.email, dave.email];

let aliceId: number;
let bobId: number;
let carolId: number;
let daveId: number;

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
    daveId = (await registerUser(dave.email, dave.username, dave.password)).id;
});

beforeEach(async () => {
    // Chaque test repart sans conversation ni amitié entre les quatre comptes.
    const ids = [aliceId, bobId, carolId, daveId];
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

describe('POST /api/chat/conversations/group', () => {
    it('refuse de créer un groupe avec moins de deux invités', async () => {
        await makeFriends(aliceId, bobId);
        const agent = await loginAs(alice);
        const response = await agent
            .post('/api/chat/conversations/group')
            .send({ title: 'Trop petit', participantIds: [bobId] });

        expect(response.status).toBe(400);
    });

    it('refuse d\'inviter un compte qui n\'est pas un ami', async () => {
        await makeFriends(aliceId, bobId);
        // carol n'est pas amie avec alice.
        const agent = await loginAs(alice);
        const response = await agent
            .post('/api/chat/conversations/group')
            .send({ title: 'Groupe test', participantIds: [bobId, carolId] });

        expect(response.status).toBe(403);
    });

    it('crée un groupe avec le créateur comme administrateur', async () => {
        await makeFriends(aliceId, bobId);
        await makeFriends(aliceId, carolId);
        const agent = await loginAs(alice);

        const response = await agent
            .post('/api/chat/conversations/group')
            .send({ title: 'Projet SCRUM', participantIds: [bobId, carolId] });

        expect(response.status).toBe(201);
        const conversationId = response.body.conversation.id;

        const detail = await agent.get(`/api/chat/conversations/${conversationId}`);
        expect(detail.status).toBe(200);
        expect(detail.body.conversation.isGroup).toBe(true);
        expect(detail.body.conversation.title).toBe('Projet SCRUM');
        expect(detail.body.conversation.members).toHaveLength(3);

        const aliceMember = detail.body.conversation.members.find((m: { user: { id: number } }) => m.user.id === aliceId);
        expect(aliceMember.role).toBe('admin');
    });
});

describe('gestion des membres d\'un groupe', () => {
    async function createTestGroup() {
        await makeFriends(aliceId, bobId);
        await makeFriends(aliceId, carolId);
        await makeFriends(aliceId, daveId);
        const aliceAgent = await loginAs(alice);
        const response = await aliceAgent
            .post('/api/chat/conversations/group')
            .send({ title: 'Groupe de test', participantIds: [bobId, carolId] });
        return response.body.conversation.id as number;
    }

    it('permet à un administrateur d\'ajouter un ami au groupe', async () => {
        const conversationId = await createTestGroup();
        const aliceAgent = await loginAs(alice);

        const response = await aliceAgent
            .post(`/api/chat/conversations/${conversationId}/participants`)
            .send({ userId: daveId });

        expect(response.status).toBe(201);

        const detail = await aliceAgent.get(`/api/chat/conversations/${conversationId}`);
        expect(detail.body.conversation.members).toHaveLength(4);
    });

    it('refuse à un membre non-administrateur d\'ajouter quelqu\'un', async () => {
        const conversationId = await createTestGroup();
        await makeFriends(bobId, daveId);
        const bobAgent = await loginAs(bob);

        const response = await bobAgent
            .post(`/api/chat/conversations/${conversationId}/participants`)
            .send({ userId: daveId });

        expect(response.status).toBe(403);
    });

    it('refuse d\'ajouter un compte qui n\'est pas ami de celui qui ajoute', async () => {
        const conversationId = await createTestGroup();
        // dave n'est pas ami avec alice.
        const aliceAgent = await loginAs(alice);

        const response = await aliceAgent
            .post(`/api/chat/conversations/${conversationId}/participants`)
            .send({ userId: daveId });

        expect(response.status).toBe(403);
    });

    it('permet à un membre de quitter le groupe de lui-même', async () => {
        const conversationId = await createTestGroup();
        const bobAgent = await loginAs(bob);

        const response = await bobAgent.delete(`/api/chat/conversations/${conversationId}/participants/${bobId}`);
        expect(response.status).toBe(200);

        const aliceAgent = await loginAs(alice);
        const detail = await aliceAgent.get(`/api/chat/conversations/${conversationId}`);
        expect(detail.body.conversation.members).toHaveLength(2);
    });

    it('transfère l\'administration quand l\'administrateur part, et supprime le groupe quand il se vide', async () => {
        const conversationId = await createTestGroup();
        const aliceAgent = await loginAs(alice);

        // alice (admin) part : bob, arrivé juste après elle, devient admin.
        await aliceAgent.delete(`/api/chat/conversations/${conversationId}/participants/${aliceId}`);

        const bobAgent = await loginAs(bob);
        const detailAfterAliceLeaves = await bobAgent.get(`/api/chat/conversations/${conversationId}`);
        const bobMember = detailAfterAliceLeaves.body.conversation.members.find(
            (m: { user: { id: number } }) => m.user.id === bobId,
        );
        expect(bobMember.role).toBe('admin');

        // bob part à son tour.
        await bobAgent.delete(`/api/chat/conversations/${conversationId}/participants/${bobId}`);

        // carol, seule restante, part : le groupe doit disparaître.
        const carolAgent = await loginAs(carol);
        await carolAgent.delete(`/api/chat/conversations/${conversationId}/participants/${carolId}`);

        const check = await carolAgent.get(`/api/chat/conversations/${conversationId}`);
        expect(check.status).toBe(404);
    });
});

describe('indicateur de lecture', () => {
    it('marque automatiquement l\'expéditeur comme ayant lu son propre message', async () => {
        await makeFriends(aliceId, bobId);
        const aliceAgent = await loginAs(alice);
        const created = await aliceAgent.post('/api/chat/conversations').send({ targetUserId: bobId });
        const conversationId = created.body.conversation.id;

        const sent = await aliceAgent
            .post(`/api/chat/conversations/${conversationId}/messages`)
            .send({ content: 'Salut' });

        const receipts = await aliceAgent.get(`/api/chat/conversations/${conversationId}/read-receipts`);
        const aliceReceipt = receipts.body.receipts.find((r: { user: { id: number } }) => r.user.id === aliceId);

        expect(aliceReceipt.lastReadMessageId).toBe(sent.body.message.id);
    });

    it('compte les messages non lus et les remet à zéro après lecture', async () => {
        await makeFriends(aliceId, bobId);
        const aliceAgent = await loginAs(alice);
        const bobAgent = await loginAs(bob);

        const created = await aliceAgent.post('/api/chat/conversations').send({ targetUserId: bobId });
        const conversationId = created.body.conversation.id;

        await bobAgent.post(`/api/chat/conversations/${conversationId}/messages`).send({ content: 'Un' });
        await bobAgent.post(`/api/chat/conversations/${conversationId}/messages`).send({ content: 'Deux' });

        const beforeRead = await aliceAgent.get('/api/chat/conversations');
        const conversationBefore = beforeRead.body.conversations.find((c: { id: number }) => c.id === conversationId);
        expect(conversationBefore.unreadCount).toBe(2);

        const markResponse = await aliceAgent.post(`/api/chat/conversations/${conversationId}/read`).send({});
        expect(markResponse.status).toBe(200);

        const afterRead = await aliceAgent.get('/api/chat/conversations');
        const conversationAfter = afterRead.body.conversations.find((c: { id: number }) => c.id === conversationId);
        expect(conversationAfter.unreadCount).toBe(0);
    });

    it('refuse de marquer comme lu un message d\'une autre conversation', async () => {
        await makeFriends(aliceId, bobId);
        await makeFriends(aliceId, carolId);
        const aliceAgent = await loginAs(alice);

        const withBob = await aliceAgent.post('/api/chat/conversations').send({ targetUserId: bobId });
        const withCarol = await aliceAgent.post('/api/chat/conversations').send({ targetUserId: carolId });

        const carolAgent = await loginAs(carol);
        const messageInCarolConv = await carolAgent
            .post(`/api/chat/conversations/${withCarol.body.conversation.id}/messages`)
            .send({ content: 'Message dans la mauvaise conversation' });

        const response = await aliceAgent
            .post(`/api/chat/conversations/${withBob.body.conversation.id}/read`)
            .send({ messageId: messageInCarolConv.body.message.id });

        expect(response.status).toBe(400);
    });
});

describe('messages avec média', () => {
    it('accepte un message ne contenant qu\'un média', async () => {
        await makeFriends(aliceId, bobId);
        const agent = await loginAs(alice);
        const created = await agent.post('/api/chat/conversations').send({ targetUserId: bobId });
        const conversationId = created.body.conversation.id;

        const response = await agent
            .post(`/api/chat/conversations/${conversationId}/messages`)
            .send({ mediaUrl: 'uploads/media-123.jpg' });

        expect(response.status).toBe(201);
        expect(response.body.message.content).toBeNull();
        expect(response.body.message.mediaUrl).toBe('uploads/media-123.jpg');
    });

    it('refuse un message sans texte ni média', async () => {
        await makeFriends(aliceId, bobId);
        const agent = await loginAs(alice);
        const created = await agent.post('/api/chat/conversations').send({ targetUserId: bobId });
        const conversationId = created.body.conversation.id;

        const response = await agent.post(`/api/chat/conversations/${conversationId}/messages`).send({});

        expect(response.status).toBe(400);
    });
});
