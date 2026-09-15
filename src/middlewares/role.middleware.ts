import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import type { Role } from '../modules/moderation/moderation.types.js';

declare global {
    namespace Express {
        interface Request {
            userRole?: Role;
        }
    }
}

const ROLE_RANK: Record<Role, number> = {
    USER: 0,
    ADMIN: 1,
    SUPER_ADMIN: 2,
};

function toRole(value: string): Role {
    return value === 'ADMIN' || value === 'SUPER_ADMIN' ? value : 'USER';
}

/**
 * Vérifie que l'utilisateur connecté a au moins le rôle demandé.
 * Doit être placé APRÈS requireAuth (il a besoin de req.userId).
 */
export function requireRole(minimumRole: Role) {
    return async function (req: Request, res: Response, next: NextFunction) {
        if (!req.userId) {
            return res.status(401).json({ status: 'ERROR', errors: ['Non authentifié.'] });
        }

        const user = await prisma.user.findUnique({ where: { id: req.userId } });

        if (!user) {
            return res.status(401).json({ status: 'ERROR', errors: ['Non authentifié.'] });
        }

        const userRole = toRole(user.role);

        if (ROLE_RANK[userRole] < ROLE_RANK[minimumRole]) {
            return res.status(403).json({ status: 'ERROR', errors: ['Droits administrateur requis.'] });
        }

        req.userRole = userRole;
        next();
    };
}
