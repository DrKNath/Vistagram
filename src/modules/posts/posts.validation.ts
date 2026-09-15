type UnknownRecord = Record<string, unknown>;

const ALLOWED_VISIBILITIES = ['public', 'friends'];
const MAX_CONTENT_LENGTH = 2000;

export function validateCreatePostInput(data: UnknownRecord | undefined) {
    const errors: string[] = [];
    const content = data?.content;
    const mediaUrl = data?.mediaUrl;
    const visibility = data?.visibility;

    if (typeof content !== 'string' || content.trim().length === 0) {
        errors.push('Le contenu du post est requis.');
    } else if (content.trim().length > MAX_CONTENT_LENGTH) {
        errors.push(`Le contenu du post ne peut pas dépasser ${MAX_CONTENT_LENGTH} caractères.`);
    }

    if (mediaUrl !== undefined && typeof mediaUrl !== 'string') {
        errors.push('mediaUrl doit être une chaîne de caractères.');
    }

    if (typeof visibility !== 'string' || !ALLOWED_VISIBILITIES.includes(visibility)) {
        errors.push("La visibilité doit être 'public' ou 'friends'.");
    }

    return errors;
}
