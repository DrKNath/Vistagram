/** Profil public minimal renvoyé dans les listes. */
export interface UserSummary {
    /** Identifiant du compte. */
    id: number;
    /** Nom d'utilisateur. */
    username: string;
    /** URL de l'avatar, `null` si non renseignée. */
    avatar: string | null;
}

/** Corps attendu pour démarrer une conversation privée. */
export interface StartConversationInput {
    /** Identifiant du compte avec qui démarrer la conversation. */
    targetUserId: number;
}

/** Corps attendu pour l'envoi d'un message (via Socket ou API REST). */
export interface SendMessageInput {
    /** Conversation ciblée. */
    conversationId: number;
    /** Texte du message. */
    content: string;
}

/** Message tel qu'exposé au front. */
export interface MessageResponse {
    /** Identifiant du message. */
    id: number;
    /** Conversation à laquelle il appartient. */
    conversationId: number;
    /** Texte du message. */
    content: string;
    /** Date d'envoi. */
    createdAt: Date;
    /** Auteur du message. */
    sender: UserSummary;
}

/** Conversation telle qu'exposée dans une liste. */
export interface ConversationSummary {
    /** Identifiant de la conversation. */
    id: number;
    /** Nom du groupe, `null` pour une conversation privée. */
    title: string | null;
    /** `true` pour un groupe, `false` pour une conversation à deux. */
    isGroup: boolean;
    /** Les autres participants (tout le monde sauf le lecteur). */
    participants: UserSummary[];
    /** Dernier message envoyé, `null` si la conversation est vide. */
    lastMessage: MessageResponse | null;
    /** Date de dernière activité (dernier message ou création). */
    updatedAt: Date;
}
