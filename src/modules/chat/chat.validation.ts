type UnknownRecord = Record<string, unknown>;

/** Longueur maximale d'un message, pour éviter les abus. */
export const MAX_MESSAGE_LENGTH = 2000;

/** Longueur maximale du nom d'un groupe. */
export const MAX_TITLE_LENGTH = 80;

/** Nombre minimum de membres à inviter à la création d'un groupe (en plus du créateur). */
export const MIN_GROUP_INVITEES = 2;

/**
 * Valide le corps d'une demande de démarrage de conversation à deux.
 *
 * @param data Corps brut de la requête.
 * @return Les messages d'erreur, vide si valide.
 */
export function validateStartConversationInput(data: UnknownRecord | undefined): string[] {
    const errors: string[] = [];
    const targetUserId = data?.targetUserId;

    if (
        typeof targetUserId !== 'number' ||
        !Number.isInteger(targetUserId) ||
        targetUserId <= 0
    ) {
        errors.push('targetUserId doit être un identifiant valide.');
    }

    return errors;
}

/**
 * Valide le corps d'une création de groupe.
 *
 * @param data Corps brut de la requête.
 * @return Les messages d'erreur, vide si valide.
 */
export function validateCreateGroupInput(data: UnknownRecord | undefined): string[] {
    const errors: string[] = [];
    const title = data?.title;
    const participantIds = data?.participantIds;

    if (typeof title !== 'string' || title.trim().length === 0) {
        errors.push('title est requis.');
    } else if (title.length > MAX_TITLE_LENGTH) {
        errors.push(`title ne doit pas dépasser ${MAX_TITLE_LENGTH} caractères.`);
    }

    if (!Array.isArray(participantIds) || participantIds.length < MIN_GROUP_INVITEES) {
        errors.push(`participantIds doit contenir au moins ${MIN_GROUP_INVITEES} identifiants (sinon utilisez une conversation à deux).`);
    } else if (!participantIds.every(id => typeof id === 'number' && Number.isInteger(id) && id > 0)) {
        errors.push('participantIds doit être une liste d\'identifiants valides.');
    }

    return errors;
}

/**
 * Valide le corps d'un ajout de membre.
 *
 * @param data Corps brut de la requête.
 * @return Les messages d'erreur, vide si valide.
 */
export function validateAddParticipantInput(data: UnknownRecord | undefined): string[] {
    const errors: string[] = [];
    const userId = data?.userId;

    if (typeof userId !== 'number' || !Number.isInteger(userId) || userId <= 0) {
        errors.push('userId doit être un identifiant valide.');
    }

    return errors;
}

/**
 * Valide le corps d'un envoi de message.
 *
 * Au moins l'un de `content` ou `mediaUrl` doit être fourni.
 *
 * @param data Corps brut de la requête.
 * @return Les messages d'erreur, vide si valide.
 */
export function validateSendMessageInput(data: UnknownRecord | undefined): string[] {
    const errors: string[] = [];
    const content = data?.content;
    const mediaUrl = data?.mediaUrl;

    const hasContent = typeof content === 'string' && content.trim().length > 0;
    const hasMedia = typeof mediaUrl === 'string' && mediaUrl.trim().length > 0;

    if (content !== undefined && typeof content !== 'string') {
        errors.push('content doit être une chaîne de caractères.');
    } else if (typeof content === 'string' && content.length > MAX_MESSAGE_LENGTH) {
        errors.push(`content ne doit pas dépasser ${MAX_MESSAGE_LENGTH} caractères.`);
    }

    if (mediaUrl !== undefined && typeof mediaUrl !== 'string') {
        errors.push('mediaUrl doit être une chaîne de caractères.');
    }

    if (!hasContent && !hasMedia) {
        errors.push('Un message doit contenir du texte ou un média.');
    }

    return errors;
}

/**
 * Valide le corps d'un marquage de lecture.
 *
 * @param data Corps brut de la requête.
 * @return Les messages d'erreur, vide si valide.
 */
export function validateMarkReadInput(data: UnknownRecord | undefined): string[] {
    const errors: string[] = [];
    const messageId = data?.messageId;

    if (messageId !== undefined && (typeof messageId !== 'number' || !Number.isInteger(messageId) || messageId <= 0)) {
        errors.push('messageId doit être un identifiant valide.');
    }

    return errors;
}

/**
 * Valide un identifiant reçu dans l'URL.
 *
 * @param raw Valeur brute du paramètre.
 * @return L'entier validé, ou `null` si la valeur est invalide.
 */
export function parseRouteId(raw: unknown): number | null {
    if (typeof raw !== 'string') {
        return null;
    }
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Valide un paramètre de pagination optionnel (`limit`, `before`).
 *
 * @param raw Valeur brute du paramètre de requête.
 * @return L'entier validé, ou `null` si absent ou invalide.
 */
export function parseOptionalIntParam(raw: unknown): number | null {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
        return null;
    }
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : null;
}
