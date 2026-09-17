import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { verifyToken } from '../modules/auth/auth.js';

declare global {
    namespace Express {
        interface Request {
            userId?: number;
        }
    }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
    const token = req.cookies?.token;

    if (!token) {
        return res.status(401).json({ status: 'ERROR', errors: ['Non authentifié.'] });
    }

    let payload;
    try {
        payload = verifyToken(token);
        if (!Number.isSafeInteger(payload.userId) || payload.userId <= 0) throw new Error();
    } catch {
        return res.status(401).json({ status: 'ERROR', errors: ['Session invalide ou expirée.'] });
    }
    try {
        const user = await prisma.user.findUnique({ where: { id: payload.userId } });
        if (!user) return res.status(401).json({ status: 'ERROR', errors: ['Non authentifié.'] });
        if (user.isBanned) return res.status(403).json({ status: 'ERROR', errors: ['Ce compte est banni.'] });
        if ((payload.authVersion ?? 0) !== user.authVersion) {
            return res.status(401).json({ status: 'ERROR', errors: ['Session révoquée. Reconnecte-toi.'] });
        }
        req.userId = user.id;
        next();
    } catch (error) { next(error); }
}
