type UnknownRecord = Record<string, unknown>;

/** Longueur maximale d'un message, pour éviter les abus. */
export const MAX_MESSAGE_LENGTH = 2000;

/**
 * Valide le corps d'une demande de démarrage de conversation.
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
 * Valide le corps d'un envoi de message.
 *
 * @param data Corps brut de la requête.
 * @return Les messages d'erreur, vide si valide.
 */
export function validateSendMessageInput(data: UnknownRecord | undefined): string[] {
    const errors: string[] = [];
    const content = data?.content;

    if (typeof content !== 'string' || content.trim().length === 0) {
        errors.push('content est requis.');
    } else if (content.length > MAX_MESSAGE_LENGTH) {
        errors.push(`content ne doit pas dépasser ${MAX_MESSAGE_LENGTH} caractères.`);
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
