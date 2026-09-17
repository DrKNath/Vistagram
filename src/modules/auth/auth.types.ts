import type { User } from '@prisma/client';

export interface JwtPayload {
    userId: number;
    authVersion?: number;
}

export type PublicUser = Omit<User, 'password'>;

export interface RegisterInput {
    email: string;
    username: string;
    password: string;
}

export interface LoginInput {
    email: string;
    password: string;
}
