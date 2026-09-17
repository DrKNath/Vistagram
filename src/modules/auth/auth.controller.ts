import type { Request, Response } from 'express';
import { validateRegisterInput, validateLoginInput } from './auth.validation.js';
import {
    registerUser,
    loginUser,
    getUserById,
    signToken,
    toPublicUser,
    AuthError,
} from './auth.js';
import type { RegisterInput, LoginInput } from './auth.types.js';

const COOKIE_NAME = 'token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 jours

function setAuthCookie(res: Response, token: string) {
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: COOKIE_MAX_AGE,
    });
}

export async function register(req: Request, res: Response) {
    const errors = validateRegisterInput(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ status: 'ERROR', errors });
    }

    const { email, username, password } = req.body as RegisterInput;

    try {
        const user = await registerUser(email.trim().toLowerCase(), username.trim(), password);
        const token = signToken(user.id, user.authVersion);
        setAuthCookie(res, token);
        return res.status(201).json({ status: 'OK', user: toPublicUser(user) });
    } catch (err) {
        if (err instanceof AuthError) {
            return res.status(err.status).json({ status: 'ERROR', errors: [err.message] });
        }
        console.error(err);
        return res.status(500).json({ status: 'ERROR', errors: ['Erreur serveur.'] });
    }
}

export async function login(req: Request, res: Response) {
    const errors = validateLoginInput(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ status: 'ERROR', errors });
    }

    const { email, password } = req.body as LoginInput;

    try {
        const user = await loginUser(email.trim().toLowerCase(), password);
        const token = signToken(user.id, user.authVersion);
        setAuthCookie(res, token);
        return res.json({ status: 'OK', user: toPublicUser(user) });
    } catch (err) {
        if (err instanceof AuthError) {
            return res.status(err.status).json({ status: 'ERROR', errors: [err.message] });
        }
        console.error(err);
        return res.status(500).json({ status: 'ERROR', errors: ['Erreur serveur.'] });
    }
}

export function logout(_req: Request, res: Response) {
    res.clearCookie(COOKIE_NAME);
    return res.json({ status: 'OK', message: 'Déconnecté.' });
}

export async function me(req: Request, res: Response) {
    const user = await getUserById(req.userId as number);

    if (!user) {
        return res.status(404).json({ status: 'ERROR', errors: ['Utilisateur introuvable.'] });
    }

    return res.json({ status: 'OK', user: toPublicUser(user) });
}
