export type FriendshipStatus = 'PENDING' | 'ACCEPTED' | 'BLOCKED';

/** Statut exposé au front, en minuscules. */
export type PublicFriendshipStatus = 'pending' | 'accepted' | 'blocked';

/** Corps attendu sur l'envoi d'une demande. */
export interface FriendRequestInput {
    /** Identifiant du compte à ajouter. */
    targetUserId: number;
}

/** Corps attendu sur la réponse à une demande. */
export interface FriendResponseInput {
    /** Réponse donnée à la demande reçue. */
    status: 'accepted' | 'rejected';
}

/** Relation telle qu'exposée au front. */
export interface FriendshipResponse {
    /** Identifiant de la relation. */
    id: number;
    /** Auteur de la demande. */
    userId: number;
    /** Destinataire de la demande. */
    friendId: number;
    /** Statut courant, en minuscules. */
    status: PublicFriendshipStatus;
    /** Date de création. */
    createdAt: Date;
}

/** Profil public minimal renvoyé dans les listes. */
export interface FriendSummary {
    /** Identifiant du compte. */
    id: number;
    /** Nom d'utilisateur. */
    username: string;
    /** URL de l'avatar, `null` si non renseignée. */
    avatar: string | null;
}

/** Demande en attente, vue depuis l'un des deux côtés. */
export interface PendingRequest {
    /** Identifiant de la relation, utilisé pour accepter ou refuser. */
    friendshipId: number;
    /** L'autre partie : demandeur si reçue, cible si envoyée. */
    user: FriendSummary;
    /** Date de création de la demande. */
    createdAt: Date;
}

/** Suggestion d'ami, classée par nombre d'amis en commun. */
export interface FriendSuggestion {
    /** Profil public du compte suggéré. */
    user: FriendSummary;
    /** Nombre d'amis en commun avec le lecteur. */
    mutualFriends: number;
}

/** État de la relation entre le lecteur courant et un autre compte. */
export interface RelationStatusResponse {
    /** Statut, ou `none` si aucune relation n'existe. */
    status: PublicFriendshipStatus | 'none';
    /** Position du lecteur, `null` quand elle n'a pas de sens. */
    direction: 'sent' | 'received' | null;
}

/**
 * Vue neutre d'une relation, indépendante du sens de stockage.
 *
 * `requesterId` correspond au `userId` de la ligne, `addresseeId` au
 * `friendId`. Pour un statut `BLOCKED`, `requesterId` est l'auteur du blocage.
 */
export interface RelationView {
    /** Identifiant de la ligne Friendship. */
    id: number;
    /** Auteur de la demande, ou du blocage. */
    requesterId: number;
    /** Destinataire de la demande, ou compte bloqué. */
    addresseeId: number;
    /** Statut courant. */
    status: FriendshipStatus;
    /** Date de création. */
    createdAt: Date;
}
