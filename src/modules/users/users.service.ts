import { prisma } from '../../config/db.js';

export class UsersService {
    static async getById(id: number) {
        return prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                username: true,
                email: true,
                createdAt: true,
            },
        });
    }

    static async search(query: string, excludeId: number) {
        return prisma.user.findMany({
            where: {
                username: { contains: query },
                id: { not: excludeId },
            },
            select: { id: true, username: true, avatar: true },
            orderBy: { username: 'asc' },
            take: 10,
        });
    }

    static async updateProfile(id: number, data: { username?: string; bio?: string; avatar?: string }) {
        return prisma.user.update({
            where: { id },
            data,
            select: {
                id: true,
                username: true,
                bio: true,
                avatar: true,
            },
        });
    }
}