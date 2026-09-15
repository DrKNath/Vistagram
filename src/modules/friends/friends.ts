import { prisma } from '../../config/db.js';
import {
    FriendsError,
    assertCanAccept,
    assertCanBlock,
    assertCanRejectOrRemove,
    assertCanUnblock,
    assertNotSelf,
    planRequest,
    toPublicStatus,
    toRelationStatus,
} from './friends.rules.js';
import type {
    FriendSummary,
    FriendshipResponse,
    PendingRequest,
    RelationStatusResponse,
    RelationView,
} from './friends.types.js';

export { FriendsError };

/** Champs de profil exposés dans les listes. */
const USER_SUMMARY_SELECT = { id: true, username: true, avatar: true } as const;

/** Ligne Friendship telle que renvoyée par Prisma. */
interface FriendshipRow {
    id: number;
    userId: number;
    friendId: number;
    status: string;
    createdAt: Date;
}

/** Convertit une ligne Prisma en vue métier. */
function toRelation(row: FriendshipRow): RelationView {
    return {
        id: row.id,
        requesterId: row.userId,
        addresseeId: row.friendId,
        status: row.status as RelationView['status'],
        createdAt: row.createdAt,
    };
}

/**
 * Projette une relation vers le format renvoyé au front.
 *
 * @param relation Relation interne.
 * @return La relation au format public.
 */
export function toFriendshipResponse(relation: RelationView): FriendshipResponse {
    return {
        id: relation.id,
        userId: relation.requesterId,
        friendId: relation.addresseeId,
        status: toPublicStatus(relation.status),
        createdAt: relation.createdAt,
    };
}

/**
 * Recherche la relation entre deux comptes, dans les deux sens.
 *
 * @param a Premier compte.
 * @param b Second compte.
 * @return La relation, ou `null` si aucune n'existe.
 */
export async function findRelation(a: number, b: number): Promise<RelationView | null> {
    const row = await prisma.friendship.findFirst({
        where: {
            OR: [
                { userId: a, friendId: b },
                { userId: b, friendId: a },
            ],
        },
    });
    return row === null ? null : toRelation(row);
}

/**
 * Charge une relation par identifiant, en s'assurant qu'elle concerne l'acteur.
 *
 * Le filtre sur l'acteur est appliqué en base : sans lui, énumérer les
 * identifiants permettrait de sonder les relations d'autrui.
 *
 * @param friendshipId Relation recherchée.
 * @param actorId Utilisateur qui agit.
 * @return La relation, ou `null` si elle n'existe pas ou ne le concerne pas.
 */
async function findOwnRelation(
    friendshipId: number,
    actorId: number,
): Promise<RelationView | null> {
    const row = await prisma.friendship.findFirst({
        where: {
            id: friendshipId,
            OR: [{ userId: actorId }, { friendId: actorId }],
        },
    });
    return row === null ? null : toRelation(row);
}

/** Vérifie l'existence d'un compte cible. */
async function assertUserExists(userId: number): Promise<void> {
    const found = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (found === null) {
        throw new FriendsError('Utilisateur introuvable.', 404);
    }
}

/**
 * Envoie une demande d'amitié.
 *
 * Si la cible avait déjà sollicité l'auteur, la demande vaut acceptation.
 *
 * @param actorId Auteur de la demande.
 * @param targetId Destinataire.
 * @return La relation résultante.
 * @throws {FriendsError} Si la cible n'existe pas ou si les règles refusent.
 */
export async function sendRequest(actorId: number, targetId: number): Promise<RelationView> {
    assertNotSelf(actorId, targetId);
    await assertUserExists(targetId);

    const existing = await findRelation(actorId, targetId);
    const plan = planRequest(existing, actorId, targetId);

    if (plan.action === 'accept') {
        const row = await prisma.friendship.update({
            where: { id: plan.friendshipId },
            data: { status: 'ACCEPTED' },
        });
        return toRelation(row);
    }

    const row = await prisma.friendship.create({
        data: { userId: actorId, friendId: targetId, status: 'PENDING' },
    });
    return toRelation(row);
}

/**
 * Accepte une demande reçue.
 *
 * @param actorId Utilisateur qui accepte.
 * @param friendshipId Demande visée.
 * @return La relation acceptée.
 * @throws {FriendsError} Si l'acteur n'est pas le destinataire.
 */
export async function acceptRequest(
    actorId: number,
    friendshipId: number,
): Promise<RelationView> {
    const relation = await findOwnRelation(friendshipId, actorId);
    assertCanAccept(relation, actorId);

    const row = await prisma.friendship.update({
        where: { id: friendshipId },
        data: { status: 'ACCEPTED' },
    });
    return toRelation(row);
}

/**
 * Refuse une demande reçue, ou annule une demande envoyée.
 *
 * La ligne est supprimée plutôt que marquée : cela permet de retenter plus
 * tard et évite d'accumuler des demandes mortes en base.
 *
 * @param actorId Utilisateur qui agit.
 * @param friendshipId Demande visée.
 * @throws {FriendsError} Si l'acteur n'appartient pas à la relation.
 */
export async function dropRequest(actorId: number, friendshipId: number): Promise<void> {
    const relation = await findOwnRelation(friendshipId, actorId);
    assertCanRejectOrRemove(relation, actorId);
    await prisma.friendship.delete({ where: { id: friendshipId } });
}

/**
 * Rompt une amitié existante.
 *
 * @param actorId Utilisateur qui rompt.
 * @param targetId L'ancien ami.
 * @throws {FriendsError} Si aucune relation n'existe, ou si elle est bloquée.
 */
export async function removeFriend(actorId: number, targetId: number): Promise<void> {
    const relation = await findRelation(actorId, targetId);
    assertCanRejectOrRemove(relation, actorId);
    await prisma.friendship.delete({ where: { id: (relation as RelationView).id } });
}

/**
 * Bloque un compte.
 *
 * Le blocage remplace toute relation existante : une amitié est rompue et une
 * demande en attente disparaît. La suppression et la recréation sont groupées
 * dans une transaction, sinon un incident laisse le couple sans relation.
 *
 * @param actorId Auteur du blocage.
 * @param targetId Compte bloqué.
 * @return La relation bloquée.
 * @throws {FriendsError} Si la cible n'existe pas ou si un blocage est en place.
 */
export async function blockUser(actorId: number, targetId: number): Promise<RelationView> {
    assertNotSelf(actorId, targetId);
    await assertUserExists(targetId);

    const existing = await findRelation(actorId, targetId);
    assertCanBlock(existing, actorId, targetId);

    const [, row] = await prisma.$transaction([
        prisma.friendship.deleteMany({
            where: {
                OR: [
                    { userId: actorId, friendId: targetId },
                    { userId: targetId, friendId: actorId },
                ],
            },
        }),
        prisma.friendship.create({
            data: { userId: actorId, friendId: targetId, status: 'BLOCKED' },
        }),
    ]);
    return toRelation(row as FriendshipRow);
}

/**
 * Lève un blocage posé par l'utilisateur.
 *
 * @param actorId Auteur du blocage.
 * @param targetId Compte bloqué.
 * @throws {FriendsError} Si l'acteur n'est pas l'auteur du blocage.
 */
export async function unblockUser(actorId: number, targetId: number): Promise<void> {
    const relation = await findRelation(actorId, targetId);
    assertCanUnblock(relation, actorId);
    await prisma.friendship.delete({ where: { id: (relation as RelationView).id } });
}

/**
 * Liste les amis confirmés d'un utilisateur.
 *
 * @param userId Compte concerné.
 * @return Les profils publics, triés par nom d'utilisateur.
 */
export async function listFriends(userId: number): Promise<FriendSummary[]> {
    const rows = await prisma.friendship.findMany({
        where: { status: 'ACCEPTED', OR: [{ userId }, { friendId: userId }] },
        include: {
            user: { select: USER_SUMMARY_SELECT },
            friend: { select: USER_SUMMARY_SELECT },
        },
    });

    // Selon le sens de stockage, l'ami est dans `user` ou dans `friend`.
    const joined = rows as Array<{ userId: number; user: FriendSummary; friend: FriendSummary }>;
    return joined
        .map(row => (row.userId === userId ? row.friend : row.user))
        .sort((a, b) => a.username.localeCompare(b.username));
}

/**
 * Liste les demandes reçues et non traitées.
 *
 * @param userId Destinataire des demandes.
 * @return Les demandes, de la plus récente à la plus ancienne.
 */
export async function listIncomingRequests(userId: number): Promise<PendingRequest[]> {
    const rows = await prisma.friendship.findMany({
        where: { friendId: userId, status: 'PENDING' },
        include: { user: { select: USER_SUMMARY_SELECT } },
        orderBy: { createdAt: 'desc' },
    });
    const joined = rows as Array<{ id: number; user: FriendSummary; createdAt: Date }>;
    return joined.map(row => ({
        friendshipId: row.id,
        user: row.user,
        createdAt: row.createdAt,
    }));
}

/**
 * Liste les demandes envoyées et non traitées.
 *
 * @param userId Auteur des demandes.
 * @return Les demandes, de la plus récente à la plus ancienne.
 */
export async function listOutgoingRequests(userId: number): Promise<PendingRequest[]> {
    const rows = await prisma.friendship.findMany({
        where: { userId, status: 'PENDING' },
        include: { friend: { select: USER_SUMMARY_SELECT } },
        orderBy: { createdAt: 'desc' },
    });
    const joined = rows as Array<{ id: number; friend: FriendSummary; createdAt: Date }>;
    return joined.map(row => ({
        friendshipId: row.id,
        user: row.friend,
        createdAt: row.createdAt,
    }));
}

/**
 * Liste les comptes bloqués par un utilisateur.
 *
 * @param userId Auteur des blocages.
 * @return Les profils publics des comptes bloqués.
 */
export async function listBlocked(userId: number): Promise<FriendSummary[]> {
    const rows = await prisma.friendship.findMany({
        where: { userId, status: 'BLOCKED' },
        include: { friend: { select: USER_SUMMARY_SELECT } },
    });
    return (rows as Array<{ friend: FriendSummary }>).map(row => row.friend);
}

/**
 * Donne l'état de la relation entre le lecteur et un autre compte.
 *
 * Un blocage subi est présenté comme une absence de relation.
 *
 * @param viewerId Lecteur courant.
 * @param otherId Autre compte.
 * @return Le statut affichable.
 */
export async function getRelationStatus(
    viewerId: number,
    otherId: number,
): Promise<RelationStatusResponse> {
    const relation = await findRelation(viewerId, otherId);
    return toRelationStatus(relation, viewerId);
}

/**
 * Indique si deux comptes sont amis.
 *
 * Point d'entrée pour les autres modules : le filtrage du fil (E3) et l'accès
 * aux conversations (E6) en dépendent. N'interrogez pas `prisma.friendship`
 * directement ailleurs, la logique de direction et de blocage divergerait.
 *
 * @param a Premier compte.
 * @param b Second compte.
 * @return `true` si l'amitié est acceptée.
 */
export async function areFriends(a: number, b: number): Promise<boolean> {
    const relation = await findRelation(a, b);
    return relation?.status === 'ACCEPTED';
}
