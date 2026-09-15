type UnknownRecord = Record<string, unknown>;

/**
 * Valide le corps d'une demande d'amitié.
 *
 * @param data Corps brut de la requête.
 * @return Les messages d'erreur, vide si valide.
 */
export function validateFriendRequestInput(data: UnknownRecord | undefined): string[] {
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
 * Valide le corps d'une réponse à une demande.
 *
 * @param data Corps brut de la requête.
 * @return Les messages d'erreur, vide si valide.
 */
export function validateFriendResponseInput(data: UnknownRecord | undefined): string[] {
    const errors: string[] = [];
    const status = data?.status;

    if (status !== 'accepted' && status !== 'rejected') {
        errors.push('status doit valoir « accepted » ou « rejected ».');
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
