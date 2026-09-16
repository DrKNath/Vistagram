/** Profil public minimal renvoyé dans les listes. */
export interface UserSummary {
    /** Identifiant du compte. */
    id: number;
    /** Nom d'utilisateur. */
    username: string;
    /** URL de l'avatar, `null` si non renseignée. */
    avatar: string | null;
}

/** Corps attendu pour démarrer une conversation privée à deux. */
export interface StartConversationInput {
    /** Identifiant du compte avec qui démarrer la conversation. */
    targetUserId: number;
}

/** Corps attendu pour créer un groupe. */
export interface CreateGroupInput {
    /** Nom du groupe. */
    title: string;
    /** Membres à ajouter en plus du créateur (au moins deux, pour distinguer un groupe d'une conversation à deux). */
    participantIds: number[];
}

/** Corps attendu pour ajouter un membre à un groupe. */
export interface AddParticipantInput {
    /** Compte à ajouter. */
    userId: number;
}

/**
 * Corps attendu pour l'envoi d'un message (via Socket ou API REST).
 *
 * Au moins l'un de `content` ou `mediaUrl` doit être fourni.
 */
export interface SendMessageInput {
    /** Conversation ciblée. */
    conversationId: number;
    /** Texte du message, optionnel si un média est joint. */
    content?: string;
    /** URL du média joint (générée au préalable par `POST /api/media/uploads`). */
    mediaUrl?: string;
}

/** Corps attendu pour marquer une conversation comme lue. */
export interface MarkReadInput {
    /** Dernier message lu ; si absent, marque jusqu'au tout dernier message de la conversation. */
    messageId?: number;
}

/** Message tel qu'exposé au front. */
export interface MessageResponse {
    /** Identifiant du message. */
    id: number;
    /** Conversation à laquelle il appartient. */
    conversationId: number;
    /** Texte du message, `null` si le message ne contient qu'un média. */
    content: string | null;
    /** URL du média joint, `null` si aucun. */
    mediaUrl: string | null;
    /** Date d'envoi. */
    createdAt: Date;
    /** Auteur du message. */
    sender: UserSummary;
}

/** Conversation telle qu'exposée dans une liste. */
export interface ConversationSummary {
    /** Identifiant de la conversation. */
    id: number;
    /** Nom du groupe, `null` pour une conversation privée à deux. */
    title: string | null;
    /** `true` pour un groupe, `false` pour une conversation à deux. */
    isGroup: boolean;
    /** Les autres participants (tout le monde sauf le lecteur). */
    participants: UserSummary[];
    /** Dernier message envoyé, `null` si la conversation est vide. */
    lastMessage: MessageResponse | null;
    /** Nombre de messages non lus par le lecteur courant. */
    unreadCount: number;
    /** Date de dernière activité (dernier message ou création). */
    updatedAt: Date;
}

/** Détail d'une conversation, avec la liste complète des membres. */
export interface ConversationDetail {
    /** Identifiant de la conversation. */
    id: number;
    /** Nom du groupe, `null` pour une conversation privée à deux. */
    title: string | null;
    /** `true` pour un groupe, `false` pour une conversation à deux. */
    isGroup: boolean;
    /** Tous les membres, le lecteur inclus. */
    members: ConversationMember[];
}

/** Membre d'une conversation, avec son rôle. */
export interface ConversationMember {
    /** Compte membre. */
    user: UserSummary;
    /** Rôle dans la conversation ("member" ou "admin"). */
    role: 'member' | 'admin';
}

/** Indicateur de lecture d'un membre. */
export interface ReadReceipt {
    /** Compte concerné. */
    user: UserSummary;
    /** Dernier message lu par ce compte, `null` si aucun. */
    lastReadMessageId: number | null;
    /** Date de dernière lecture, `null` si aucune. */
    lastReadAt: Date | null;
}
