type UnknownRecord = Record<string, unknown>;

export function validateCreateReportInput(data: UnknownRecord | undefined) {
    const errors: string[] = [];
    const postId = data?.postId;
    const reason = data?.reason;

    if (typeof postId !== 'number' || !Number.isInteger(postId) || postId <= 0) {
        errors.push('postId doit être un identifiant valide.');
    }

    if (typeof reason !== 'string' || reason.trim().length < 3) {
        errors.push('La raison du signalement doit contenir au moins 3 caractères.');
    }

    return errors;
}
