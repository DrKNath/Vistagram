import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/db';
import { registerUser } from '../../src/modules/auth/auth';

const alice = {
    email: 'test.friends.alice@vistagram.local',
    username: 'test_friends_alice',
    password: 'motdepasse123',
};

const bob = {
    email: 'test.friends.bob@vistagram.local',
    username: 'test_friends_bob',
    password: 'motdepasse123',
};

const carol = {
    email: 'test.friends.carol@vistagram.local',
    username: 'test_friends_carol',
    password: 'motdepasse123',
};

const EMAILS = [alice.email, bob.email, carol.email];

let aliceId: number;
let bobId: number;
let carolId: number;

/** Supprime les comptes de test et leurs relations. */
async function cleanup() {
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

beforeAll(async () => {
    await cleanup();
    aliceId = (await registerUser(alice.email, alice.username, alice.password)).id;
    bobId = (await registerUser(bob.email, bob.username, bob.password)).id;
    carolId = (await registerUser(carol.email, carol.username, carol.password)).id;
});

beforeEach(async () => {
    // Chaque test repart d'un graphe vierge entre les trois comptes.
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
    it('refuse toute route amis sans session', async () => {
        const response = await request(app).get('/api/friends');
        expect(response.status).toBe(401);
    });
});

describe('POST /api/friends', () => {
    it('crée une demande en attente', async () => {
        const agent = await loginAs(alice);
        const response = await agent.post('/api/friends').send({ targetUserId: bobId });

        expect(response.status).toBe(201);
        expect(response.body.status).toBe('OK');
        expect(response.body.friendship.status).toBe('pending');
        expect(response.body.friendship.userId).toBe(aliceId);
        expect(response.body.friendship.friendId).toBe(bobId);
    });

    it('refuse un corps sans targetUserId', async () => {
        const agent = await loginAs(alice);
        const response = await agent.post('/api/friends').send({});

        expect(response.status).toBe(400);
        expect(response.body.errors.length).toBeGreaterThan(0);
    });

    it('refuse un targetUserId en chaîne de caractères', async () => {
        const agent = await loginAs(alice);
        const response = await agent.post('/api/friends').send({ targetUserId: '2' });
        expect(response.status).toBe(400);
    });

    it('refuse une demande vers soi-même', async () => {
        const agent = await loginAs(alice);
        const response = await agent.post('/api/friends').send({ targetUserId: aliceId });
        expect(response.status).toBe(400);
    });

    it('refuse une demande vers un compte inexistant', async () => {
        const agent = await loginAs(alice);
        const response = await agent.post('/api/friends').send({ targetUserId: 999999 });
        expect(response.status).toBe(404);
    });

    it('refuse une demande en double', async () => {
        const agent = await loginAs(alice);
        await agent.post('/api/friends').send({ targetUserId: bobId });
        const response = await agent.post('/api/friends').send({ targetUserId: bobId });

        expect(response.status).toBe(409);
    });

    it('accepte automatiquement une demande croisée', async () => {
        const bobAgent = await loginAs(bob);
        await bobAgent.post('/api/friends').send({ targetUserId: aliceId });

        const aliceAgent = await loginAs(alice);
        const response = await aliceAgent.post('/api/friends').send({ targetUserId: bobId });

        expect(response.body.friendship.status).toBe('accepted');
        // Une seule ligne : la demande croisée ne doit pas en créer une seconde.
        const rows = await prisma.friendship.findMany({
            where: {
                OR: [
                    { userId: aliceId, friendId: bobId },
                    { userId: bobId, friendId: aliceId },
                ],
            },
        });
        expect(rows).toHaveLength(1);
    });
});

describe('PATCH /api/friends/:id', () => {
    /** Crée une demande d'Alice vers Bob et renvoie son identifiant. */
    async function pendingAliceToBob(): Promise<number> {
        const agent = await loginAs(alice);
        const response = await agent.post('/api/friends').send({ targetUserId: bobId });
        return response.body.friendship.id as number;
    }

    it('accepte une demande reçue', async () => {
        const id = await pendingAliceToBob();
        const agent = await loginAs(bob);
        const response = await agent.patch(`/api/friends/${id}`).send({ status: 'accepted' });

        expect(response.status).toBe(200);
        expect(response.body.friendship.status).toBe('accepted');
    });

    it('refuse une demande et supprime la ligne', async () => {
        const id = await pendingAliceToBob();
        const agent = await loginAs(bob);
        const response = await agent.patch(`/api/friends/${id}`).send({ status: 'rejected' });

        expect(response.status).toBe(200);
        expect(await prisma.friendship.findUnique({ where: { id } })).toBeNull();
    });

    it('permet de redemander après un refus', async () => {
        const id = await pendingAliceToBob();
        const bobAgent = await loginAs(bob);
        await bobAgent.patch(`/api/friends/${id}`).send({ status: 'rejected' });

        const aliceAgent = await loginAs(alice);
        const retry = await aliceAgent.post('/api/friends').send({ targetUserId: bobId });
        expect(retry.status).toBe(201);
    });

    it('refuse un status hors contrat', async () => {
        const id = await pendingAliceToBob();
        const agent = await loginAs(bob);
        const response = await agent.patch(`/api/friends/${id}`).send({ status: 'blocked' });
        expect(response.status).toBe(400);
    });

    it('interdit au demandeur d accepter sa propre demande', async () => {
        const id = await pendingAliceToBob();
        const agent = await loginAs(alice);
        const response = await agent.patch(`/api/friends/${id}`).send({ status: 'accepted' });
        expect(response.status).toBe(403);
    });

    it('renvoie 404 à un tiers, sans révéler la demande', async () => {
        // Un 403 confirmerait l'existence de la relation et permettrait de
        // cartographier le graphe social en énumérant les identifiants.
        const id = await pendingAliceToBob();
        const agent = await loginAs(carol);
        const response = await agent.patch(`/api/friends/${id}`).send({ status: 'accepted' });
        expect(response.status).toBe(404);
    });
});

describe('GET /api/friends', () => {
    it('renvoie une liste vide au départ', async () => {
        const agent = await loginAs(alice);
        const response = await agent.get('/api/friends');

        expect(response.status).toBe(200);
        expect(response.body.friends).toEqual([]);
    });

    it('renvoie l ami des deux côtés après acceptation', async () => {
        const aliceAgent = await loginAs(alice);
        const created = await aliceAgent.post('/api/friends').send({ targetUserId: bobId });

        const bobAgent = await loginAs(bob);
        await bobAgent
            .patch(`/api/friends/${created.body.friendship.id}`)
            .send({ status: 'accepted' });

        const fromAlice = await aliceAgent.get('/api/friends');
        const fromBob = await bobAgent.get('/api/friends');

        expect(fromAlice.body.friends.map((u: { id: number }) => u.id)).toEqual([bobId]);
        expect(fromBob.body.friends.map((u: { id: number }) => u.id)).toEqual([aliceId]);
    });

    it('ne renvoie jamais le mot de passe ni l email', async () => {
        await prisma.friendship.create({
            data: { userId: aliceId, friendId: bobId, status: 'ACCEPTED' },
        });
        const agent = await loginAs(alice);
        const response = await agent.get('/api/friends');

        const body = JSON.stringify(response.body);
        expect(body).not.toContain('password');
        expect(body).not.toContain('@vistagram.local');
    });
});

describe('GET /api/friends/requests', () => {
    it('sépare les demandes reçues et envoyées', async () => {
        const bobAgent = await loginAs(bob);
        await bobAgent.post('/api/friends').send({ targetUserId: aliceId });

        const aliceAgent = await loginAs(alice);
        await aliceAgent.post('/api/friends').send({ targetUserId: carolId });

        const response = await aliceAgent.get('/api/friends/requests');

        expect(response.body.incoming.map((r: { user: { id: number } }) => r.user.id)).toEqual([bobId]);
        expect(response.body.outgoing.map((r: { user: { id: number } }) => r.user.id)).toEqual([carolId]);
    });
});

describe('DELETE /api/friends/:userId', () => {
    it('rompt une amitié', async () => {
        await prisma.friendship.create({
            data: { userId: aliceId, friendId: bobId, status: 'ACCEPTED' },
        });

        const agent = await loginAs(alice);
        const response = await agent.delete(`/api/friends/${bobId}`);

        expect(response.status).toBe(200);
        const bobAgent = await loginAs(bob);
        expect((await bobAgent.get('/api/friends')).body.friends).toEqual([]);
    });

    it('renvoie 404 sans relation existante', async () => {
        const agent = await loginAs(alice);
        const response = await agent.delete(`/api/friends/${carolId}`);
        expect(response.status).toBe(404);
    });
});

describe('blocage', () => {
    it('bloque un compte et le liste', async () => {
        const agent = await loginAs(alice);
        const response = await agent.post(`/api/friends/block/${bobId}`);

        expect(response.status).toBe(201);
        const blocked = await agent.get('/api/friends/blocked');
        expect(blocked.body.blocked.map((u: { id: number }) => u.id)).toEqual([bobId]);
    });

    it('rompt l amitié existante en bloquant', async () => {
        await prisma.friendship.create({
            data: { userId: aliceId, friendId: bobId, status: 'ACCEPTED' },
        });

        const aliceAgent = await loginAs(alice);
        await aliceAgent.post(`/api/friends/block/${bobId}`);

        const bobAgent = await loginAs(bob);
        expect((await bobAgent.get('/api/friends')).body.friends).toEqual([]);
    });

    it('empêche le compte bloqué de redemander en ami', async () => {
        const aliceAgent = await loginAs(alice);
        await aliceAgent.post(`/api/friends/block/${bobId}`);

        const bobAgent = await loginAs(bob);
        const response = await bobAgent.post('/api/friends').send({ targetUserId: aliceId });
        expect(response.status).toBe(403);
    });

    it('ne révèle pas le blocage à la personne bloquée', async () => {
        const aliceAgent = await loginAs(alice);
        await aliceAgent.post(`/api/friends/block/${bobId}`);

        const bobAgent = await loginAs(bob);
        const response = await bobAgent.get(`/api/friends/status/${aliceId}`);
        expect(response.body.relation).toEqual({ status: 'none', direction: null });
    });

    it('interdit au compte bloqué de se débloquer', async () => {
        const aliceAgent = await loginAs(alice);
        await aliceAgent.post(`/api/friends/block/${bobId}`);

        const bobAgent = await loginAs(bob);
        const response = await bobAgent.delete(`/api/friends/block/${aliceId}`);
        expect(response.status).toBe(403);
    });

    it('lève le blocage et permet de redemander', async () => {
        const aliceAgent = await loginAs(alice);
        await aliceAgent.post(`/api/friends/block/${bobId}`);
        expect((await aliceAgent.delete(`/api/friends/block/${bobId}`)).status).toBe(200);

        const bobAgent = await loginAs(bob);
        expect((await bobAgent.post('/api/friends').send({ targetUserId: aliceId })).status).toBe(201);
    });
});

describe('GET /api/friends/status/:userId', () => {
    it('renvoie none sans relation', async () => {
        const agent = await loginAs(alice);
        const response = await agent.get(`/api/friends/status/${bobId}`);
        expect(response.body.relation).toEqual({ status: 'none', direction: null });
    });

    it('indique le sens de la demande en attente', async () => {
        const aliceAgent = await loginAs(alice);
        await aliceAgent.post('/api/friends').send({ targetUserId: bobId });

        const bobAgent = await loginAs(bob);

        expect((await aliceAgent.get(`/api/friends/status/${bobId}`)).body.relation.direction).toBe('sent');
        expect((await bobAgent.get(`/api/friends/status/${aliceId}`)).body.relation.direction).toBe('received');
    });
});
