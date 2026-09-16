import type { Request, Response } from 'express';
import { UsersService } from './users.service.js';

export async function getUserProfile(req: Request, res: Response) {
    const id = Number(req.params.id);
    const user = await UsersService.getById(id);

    if (!user) {
        return res.status(404).json({ status: 'ERROR', errors: ['Utilisateur introuvable.'] });
    }

    return res.json({ status: 'OK', user });
}

export async function searchUsers(req: Request, res: Response) {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    if (query.length < 2) {
        return res.status(400).json({ status: 'ERROR', errors: ['Recherche trop courte (2 caractères minimum).'] });
    }

    const users = await UsersService.search(query, req.userId as number);
    return res.json({ status: 'OK', users });
}

export async function updateMyProfile(req: Request, res: Response) {
    const userId = req.userId;

    if (!userId) {
        return res.status(401).json({ status: 'ERROR', errors: ['Non authentifié.'] });
    }

    try {
        const updated = await UsersService.updateProfile(userId, req.body);
        return res.json({ status: 'OK', user: updated });
    } catch {
        return res.status(400).json({ status: 'ERROR', errors: ['Mise à jour impossible.'] });
    }
}