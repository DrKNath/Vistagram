import type { RelationStatusResponse, RelationView, FriendshipStatus, PublicFriendshipStatus } from './friends.types.js';

/**
 * Erreur métier du module amis.
 *
 * Porte le statut HTTP à renvoyer, sur le même principe que `ModerationError`.
 */
export class FriendsError extends Error {
    status: number;

    constructor(message: string, status = 400) {
        super(message);
        this.name = 'FriendsError';
        this.status = status;
    }
}

/** Décision prise face à une demande d'amitié. */
export type RequestPlan =
    /** Aucune relation : créer une ligne `PENDING`. */
    | { action: 'create' }
    /** Demande croisée : accepter la ligne existante. */
    | { action: 'accept'; friendshipId: number };

/**
 * Convertit un statut interne vers la casse exposée au front.
 *
 * @param status Statut stocké en base.
 * @return Le statut en minuscules.
 */
export function toPublicStatus(status: FriendshipStatus): PublicFriendshipStatus {
    return status.toLowerCase() as PublicFriendshipStatus;
}

/**
 * Vérifie qu'un utilisateur n'agit pas sur lui-même.
 *
 * @param actorId Utilisateur à l'origine de l'action.
 * @param targetId Utilisateur ciblé.
 * @throws {FriendsError} 400 si les deux identifiants sont identiques.
 */
export function assertNotSelf(actorId: number, targetId: number): void {
    if (actorId === targetId) {
        throw new FriendsError('Impossible de créer une relation avec soi-même.', 400);
    }
}

/**
 * Renvoie l'identifiant de l'autre partie d'une relation.
 *
 * @param relation Relation concernée.
 * @param viewerId Utilisateur courant, nécessairement l'une des deux parties.
 * @return L'identifiant de l'autre partie.
 * @throws {FriendsError} 404 si le lecteur n'appartient pas à la relation.
 */
export function otherPartyId(relation: RelationView, viewerId: number): number {
    if (relation.requesterId === viewerId) {
        return relation.addresseeId;
    }
    if (relation.addresseeId === viewerId) {
        return relation.requesterId;
    }
    // 404 plutôt que 403 : un 403 confirmerait l'existence de la relation et
    // permettrait de cartographier le graphe social en énumérant les id.
    throw new FriendsError('Relation introuvable.', 404);
}

/**
 * Détermine ce qu'il faut faire d'une demande d'amitié.
 *
 * Cas particulier : si la cible avait déjà sollicité l'acteur, la nouvelle
 * demande vaut acceptation. Sans cela, deux personnes qui se sollicitent
 * mutuellement resteraient bloquées avec deux demandes en attente.
 *
 * @param existing Relation déjà en base entre les deux comptes, ou `null`.
 * @param actorId Auteur de la demande.
 * @param targetId Destinataire de la demande.
 * @return L'opération à effectuer.
 * @throws {FriendsError} Si une relation empêche la demande.
 */
export function planRequest(
    existing: RelationView | null,
    actorId: number,
    targetId: number,
): RequestPlan {
    assertNotSelf(actorId, targetId);

    if (existing === null) {
        return { action: 'create' };
    }

    switch (existing.status) {
        case 'ACCEPTED':
            throw new FriendsError('Vous êtes déjà amis.', 409);

        case 'BLOCKED':
            // Message volontairement neutre : révéler qui a bloqué qui
            // renseignerait l'émetteur sur un choix privé de la cible.
            throw new FriendsError('Cette demande ne peut pas aboutir.', 403);

        case 'PENDING':
            if (existing.requesterId === actorId) {
                throw new FriendsError('Une demande est déjà en attente.', 409);
            }
            return { action: 'accept', friendshipId: existing.id };

        default: {
            // Garde d'exhaustivité : échoue à la compilation si un statut est ajouté.
            const exhaustive: never = existing.status;
            throw new FriendsError(`Statut inconnu : ${String(exhaustive)}`, 400);
        }
    }
}

/**
 * Vérifie qu'un utilisateur peut accepter une demande.
 *
 * Seul le destinataire peut accepter : c'est ce qui empêche un demandeur de
 * s'auto-ajouter comme ami.
 *
 * @param relation Relation visée, ou `null` si elle n'existe pas.
 * @param actorId Utilisateur qui accepte.
 * @throws {FriendsError} 404, 409 ou 403 selon le cas.
 */
export function assertCanAccept(relation: RelationView | null, actorId: number): void {
    if (relation === null) {
        throw new FriendsError('Aucune demande à traiter.', 404);
    }
    if (relation.status !== 'PENDING') {
        throw new FriendsError('Cette demande n’est plus en attente.', 409);
    }
    if (relation.addresseeId !== actorId) {
        throw new FriendsError('Seul le destinataire peut accepter cette demande.', 403);
    }
}

/**
 * Vérifie qu'un utilisateur peut refuser une demande, l'annuler, ou rompre
 * une amitié.
 *
 * Les trois actions partagent la même règle : appartenir à la relation, et que
 * celle-ci ne soit pas bloquée — une relation bloquée se lève par déblocage.
 *
 * @param relation Relation visée, ou `null` si elle n'existe pas.
 * @param actorId Utilisateur qui agit.
 * @throws {FriendsError} 404 ou 409 selon le cas.
 */
export function assertCanRejectOrRemove(
    relation: RelationView | null,
    actorId: number,
): void {
    if (relation === null) {
        throw new FriendsError('Aucune relation à supprimer.', 404);
    }
    if (relation.status === 'BLOCKED') {
        throw new FriendsError('Relation bloquée : utilisez le déblocage.', 409);
    }
    otherPartyId(relation, actorId);
}

/**
 * Vérifie qu'un utilisateur peut en bloquer un autre.
 *
 * Le blocage est possible depuis n'importe quel état, sauf si un blocage est
 * déjà en place — le modèle à une seule ligne ne sait pas représenter un
 * blocage mutuel.
 *
 * @param relation Relation existante, ou `null`.
 * @param actorId Utilisateur qui bloque.
 * @param targetId Utilisateur bloqué.
 * @throws {FriendsError} 400 sur soi-même, 409 si déjà bloqué.
 */
export function assertCanBlock(
    relation: RelationView | null,
    actorId: number,
    targetId: number,
): void {
    assertNotSelf(actorId, targetId);

    if (relation !== null && relation.status === 'BLOCKED') {
        throw new FriendsError('Un blocage est déjà en place sur cette relation.', 409);
    }
}

/**
 * Vérifie qu'un utilisateur peut lever un blocage.
 *
 * Seul l'auteur du blocage peut le lever, sinon la personne bloquée pourrait
 * se débloquer elle-même et la fonctionnalité n'aurait aucun effet.
 *
 * @param relation Relation visée, ou `null` si elle n'existe pas.
 * @param actorId Utilisateur qui débloque.
 * @throws {FriendsError} 404, 409 ou 403 selon le cas.
 */
export function assertCanUnblock(relation: RelationView | null, actorId: number): void {
    if (relation === null) {
        throw new FriendsError('Aucune relation à débloquer.', 404);
    }
    if (relation.status !== 'BLOCKED') {
        throw new FriendsError('Cette relation n’est pas bloquée.', 409);
    }
    if (relation.requesterId !== actorId) {
        throw new FriendsError('Seul l’auteur du blocage peut le lever.', 403);
    }
}

/**
 * Projette une relation en statut affichable pour un lecteur donné.
 *
 * Un blocage subi est présenté comme une absence de relation : la personne
 * bloquée ne doit pas pouvoir déduire qu'elle l'a été.
 *
 * @param relation Relation existante, ou `null`.
 * @param viewerId Lecteur courant.
 * @return Le statut et, le cas échéant, le sens de la demande.
 */
export function toRelationStatus(
    relation: RelationView | null,
    viewerId: number,
): RelationStatusResponse {
    const none: RelationStatusResponse = { status: 'none', direction: null };

    if (relation === null) {
        return none;
    }

    if (relation.status === 'BLOCKED') {
        return relation.requesterId === viewerId
            ? { status: 'blocked', direction: 'sent' }
            : none;
    }

    if (relation.status === 'ACCEPTED') {
        return { status: 'accepted', direction: null };
    }

    return {
        status: 'pending',
        direction: relation.requesterId === viewerId ? 'sent' : 'received',
    };
}
