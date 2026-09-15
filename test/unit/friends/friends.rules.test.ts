import { describe, it, expect } from 'vitest';
import {
    assertCanAccept,
    assertCanBlock,
    assertCanRejectOrRemove,
    assertCanUnblock,
    assertNotSelf,
    otherPartyId,
    planRequest,
    toPublicStatus,
    toRelationStatus,
} from '../../../src/modules/friends/friends.rules';
import { FriendsError } from '../../../src/modules/friends/friends.rules';
import type { RelationView } from '../../../src/modules/friends/friends.types';

const ALICE = 1;
const BOB = 2;
const CAROL = 3;

/** Construit une relation de test avec des valeurs par défaut surchargeables. */
function relation(over: Partial<RelationView> = {}): RelationView {
    return {
        id: 10,
        requesterId: ALICE,
        addresseeId: BOB,
        status: 'PENDING',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        ...over,
    };
}

/** Exécute une fonction et renvoie le statut HTTP de l'erreur levée. */
function statusOf(run: () => unknown): number {
    try {
        run();
        return 0;
    } catch (error) {
        return error instanceof FriendsError ? error.status : -1;
    }
}

describe('assertNotSelf', () => {
    it('laisse passer deux identifiants différents', () => {
        expect(() => assertNotSelf(ALICE, BOB)).not.toThrow();
    });

    it('refuse une relation avec soi-même, en 400', () => {
        expect(statusOf(() => assertNotSelf(ALICE, ALICE))).toBe(400);
    });
});

describe('otherPartyId', () => {
    it('renvoie le destinataire quand le lecteur est le demandeur', () => {
        expect(otherPartyId(relation(), ALICE)).toBe(BOB);
    });

    it('renvoie le demandeur quand le lecteur est le destinataire', () => {
        expect(otherPartyId(relation(), BOB)).toBe(ALICE);
    });

    it('refuse un lecteur étranger à la relation', () => {
        expect(() => otherPartyId(relation(), CAROL)).toThrow(FriendsError);
    });
});

describe('planRequest', () => {
    it('crée une demande quand aucune relation n existe', () => {
        expect(planRequest(null, ALICE, BOB)).toEqual({ action: 'create' });
    });

    it('accepte automatiquement une demande croisée', () => {
        // Bob avait déjà sollicité Alice : la demande d'Alice vaut acceptation.
        const existing = relation({ requesterId: BOB, addresseeId: ALICE });
        expect(planRequest(existing, ALICE, BOB)).toEqual({
            action: 'accept',
            friendshipId: 10,
        });
    });

    it('refuse une seconde demande vers la même personne, en 409', () => {
        expect(statusOf(() => planRequest(relation(), ALICE, BOB))).toBe(409);
    });

    it('refuse une demande entre amis déjà confirmés, en 409', () => {
        const accepted = relation({ status: 'ACCEPTED' });
        expect(statusOf(() => planRequest(accepted, ALICE, BOB))).toBe(409);
    });

    it('refuse une demande sur une relation bloquée, en 403', () => {
        const blocked = relation({ status: 'BLOCKED', requesterId: BOB, addresseeId: ALICE });
        expect(statusOf(() => planRequest(blocked, ALICE, BOB))).toBe(403);
    });

    it('ne révèle pas qui a bloqué qui', () => {
        // Le message ne doit pas permettre de déduire que la cible a bloqué :
        // c'est une information privée.
        const blocked = relation({ status: 'BLOCKED', requesterId: BOB, addresseeId: ALICE });
        try {
            planRequest(blocked, ALICE, BOB);
            expect.unreachable('aurait dû lever');
        } catch (error) {
            expect((error as FriendsError).message.toLowerCase()).not.toContain('bloqué par');
        }
    });

    it('refuse une demande vers soi-même', () => {
        expect(() => planRequest(null, ALICE, ALICE)).toThrow(FriendsError);
    });
});

describe('assertCanAccept', () => {
    it('autorise le destinataire de la demande', () => {
        expect(() => assertCanAccept(relation(), BOB)).not.toThrow();
    });

    it('interdit au demandeur d accepter sa propre demande, en 403', () => {
        expect(statusOf(() => assertCanAccept(relation(), ALICE))).toBe(403);
    });

    it('refuse une relation inexistante, en 404', () => {
        expect(statusOf(() => assertCanAccept(null, BOB))).toBe(404);
    });

    it('refuse d accepter une relation déjà acceptée, en 409', () => {
        const accepted = relation({ status: 'ACCEPTED' });
        expect(statusOf(() => assertCanAccept(accepted, BOB))).toBe(409);
    });

    it('refuse d accepter une relation bloquée', () => {
        const blocked = relation({ status: 'BLOCKED' });
        expect(() => assertCanAccept(blocked, BOB)).toThrow(FriendsError);
    });
});

describe('assertCanRejectOrRemove', () => {
    it('autorise le destinataire à refuser une demande', () => {
        expect(() => assertCanRejectOrRemove(relation(), BOB)).not.toThrow();
    });

    it('autorise chacun des deux amis à rompre une amitié', () => {
        const accepted = relation({ status: 'ACCEPTED' });
        expect(() => assertCanRejectOrRemove(accepted, ALICE)).not.toThrow();
        expect(() => assertCanRejectOrRemove(accepted, BOB)).not.toThrow();
    });

    it('autorise le demandeur à annuler sa demande', () => {
        expect(() => assertCanRejectOrRemove(relation(), ALICE)).not.toThrow();
    });

    it('interdit à un tiers de rompre la relation', () => {
        const accepted = relation({ status: 'ACCEPTED' });
        expect(() => assertCanRejectOrRemove(accepted, CAROL)).toThrow(FriendsError);
    });

    it('refuse de supprimer une relation bloquée', () => {
        // Sans cette règle, la personne bloquée lèverait son propre blocage.
        const blocked = relation({ status: 'BLOCKED' });
        expect(() => assertCanRejectOrRemove(blocked, BOB)).toThrow(FriendsError);
    });

    it('refuse une relation inexistante, en 404', () => {
        expect(statusOf(() => assertCanRejectOrRemove(null, ALICE))).toBe(404);
    });
});

describe('assertCanBlock', () => {
    it('autorise le blocage sans relation préalable', () => {
        expect(() => assertCanBlock(null, ALICE, BOB)).not.toThrow();
    });

    it('autorise le blocage d une demande en attente', () => {
        expect(() => assertCanBlock(relation(), BOB, ALICE)).not.toThrow();
    });

    it('autorise le blocage d un ami confirmé', () => {
        const accepted = relation({ status: 'ACCEPTED' });
        expect(() => assertCanBlock(accepted, ALICE, BOB)).not.toThrow();
    });

    it('refuse de se bloquer soi-même', () => {
        expect(() => assertCanBlock(null, ALICE, ALICE)).toThrow(FriendsError);
    });

    it('refuse un blocage déjà en place, en 409', () => {
        const blocked = relation({ status: 'BLOCKED' });
        expect(statusOf(() => assertCanBlock(blocked, ALICE, BOB))).toBe(409);
    });
});

describe('assertCanUnblock', () => {
    it('autorise l auteur du blocage à le lever', () => {
        const blocked = relation({ status: 'BLOCKED' });
        expect(() => assertCanUnblock(blocked, ALICE)).not.toThrow();
    });

    it('interdit au compte bloqué de lever son propre blocage, en 403', () => {
        const blocked = relation({ status: 'BLOCKED' });
        expect(statusOf(() => assertCanUnblock(blocked, BOB))).toBe(403);
    });

    it('refuse de débloquer une relation non bloquée, en 409', () => {
        expect(statusOf(() => assertCanUnblock(relation(), ALICE))).toBe(409);
    });

    it('refuse une relation inexistante, en 404', () => {
        expect(statusOf(() => assertCanUnblock(null, ALICE))).toBe(404);
    });
});

describe('toPublicStatus', () => {
    it('passe le statut en minuscules', () => {
        expect(toPublicStatus('PENDING')).toBe('pending');
        expect(toPublicStatus('ACCEPTED')).toBe('accepted');
        expect(toPublicStatus('BLOCKED')).toBe('blocked');
    });
});

describe('toRelationStatus', () => {
    it('renvoie none sans relation', () => {
        expect(toRelationStatus(null, ALICE)).toEqual({ status: 'none', direction: null });
    });

    it('indique une demande envoyée par le lecteur', () => {
        expect(toRelationStatus(relation(), ALICE)).toEqual({
            status: 'pending',
            direction: 'sent',
        });
    });

    it('indique une demande reçue par le lecteur', () => {
        expect(toRelationStatus(relation(), BOB)).toEqual({
            status: 'pending',
            direction: 'received',
        });
    });

    it('ne donne pas de direction pour une amitié acceptée', () => {
        const accepted = relation({ status: 'ACCEPTED' });
        expect(toRelationStatus(accepted, ALICE).direction).toBeNull();
    });

    it('masque le blocage subi en none pour ne rien révéler', () => {
        // Alice est bloquée par Bob : elle ne doit pas pouvoir le déduire.
        const blocked = relation({ status: 'BLOCKED', requesterId: BOB, addresseeId: ALICE });
        expect(toRelationStatus(blocked, ALICE)).toEqual({ status: 'none', direction: null });
    });

    it('expose le blocage à son auteur', () => {
        const blocked = relation({ status: 'BLOCKED', requesterId: ALICE, addresseeId: BOB });
        expect(toRelationStatus(blocked, ALICE)).toEqual({
            status: 'blocked',
            direction: 'sent',
        });
    });
});
