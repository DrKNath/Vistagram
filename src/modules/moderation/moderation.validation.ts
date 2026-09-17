import { ModerationError } from './moderation.js';

export function validateCreateReportInput(data: Record<string, unknown> | undefined) {
    const errors: string[] = [];
    const targets = ['postId', 'commentId', 'targetUserId'].filter(key => data?.[key] !== undefined);
    if (targets.length !== 1) errors.push('Indique une seule cible : postId, commentId ou targetUserId.');
    for (const key of targets) {
        const id = data?.[key];
        if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) errors.push(`${key} doit être un identifiant valide.`);
    }
    if (typeof data?.reason !== 'string' || data.reason.trim().length < 3 || data.reason.trim().length > 1000) {
        errors.push('Le motif doit contenir entre 3 et 1000 caractères.');
    }
    return errors;
}

export function positiveId(value: unknown): number {
    if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+$/.test(String(value))) {
        throw new ModerationError('Identifiant invalide.');
    }
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ModerationError('Identifiant invalide.');
    return id;
}

export function reasonInput(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length < 3 || value.trim().length > 1000) {
        throw new ModerationError('Le motif doit contenir entre 3 et 1000 caractères.');
    }
    return value.trim();
}

export function pagination(query: Record<string, unknown>) {
    const page = query.page === undefined ? 1 : positiveId(query.page);
    const limit = query.limit === undefined ? 20 : positiveId(query.limit);
    if (limit > 100 || page > 100000) throw new ModerationError('Pagination hors limites.');
    return { page, limit, skip: (page - 1) * limit };
}
