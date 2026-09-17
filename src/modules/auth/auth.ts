import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/db.js';
import type { User } from '@prisma/client';
import type { JwtPayload, PublicUser } from './auth.types.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_EXPIRES_IN = '7d';

export class AuthError extends Error {
    status: number;

    constructor(message: string, status = 400) {
        super(message);
        this.status = status;
    }
}

export function signToken(userId: number, authVersion = 0) {
    const payload: JwtPayload = { userId, authVersion };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function toPublicUser(user: User): PublicUser {
    const { password, ...publicUser } = user;
    return publicUser;
}

export async function registerUser(email: string, username: string, password: string): Promise<User> {
    const existing = await prisma.user.findFirst({
        where: { OR: [{ email }, { username }] },
    });

    if (existing) {
        throw new AuthError('Un compte existe déjà avec cet email ou ce nom d\'utilisateur.', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    return prisma.user.create({
        data: { email, username, password: hashedPassword },
    });
}

export async function loginUser(email: string, password: string): Promise<User> {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        throw new AuthError('Email ou mot de passe incorrect.', 401);
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
        throw new AuthError('Email ou mot de passe incorrect.', 401);
    }

    if (user.isBanned) throw new AuthError('Ce compte est banni.', 403);
    return user;
}

export async function getUserById(id: number) {
    return prisma.user.findUnique({ where: { id } });
}
