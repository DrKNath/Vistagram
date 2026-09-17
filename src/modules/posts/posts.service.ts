import { prisma } from '../../config/db.js';
import type { CreatePostInput, PostResponse } from './posts.types.js';

export class PostsError extends Error {
    status: number;

    constructor(message: string, status = 400) {
        super(message);
        this.status = status;
    }
}

const AUTHOR_SELECT = {
    id: true,
    username: true,
    avatar: true,
} as const;

type PostWithAuthor = {
    id: number;
    content: string | null;
    mediaUrl: string | null;
    visibility: string;
    createdAt: Date;
    userId: number;
    user: { id: number; username: string; avatar: string | null };
};

function toPostResponse(post: PostWithAuthor): PostResponse {
    return {
        id: post.id,
        content: post.content ?? '',
        mediaUrl: post.mediaUrl,
        visibility: post.visibility,
        createdAt: post.createdAt,
        author: post.user,
    };
}

export class PostsService {
    // Crée un post pour l'utilisateur authentifié
    static async create(userId: number, input: CreatePostInput): Promise<PostResponse> {
        const post = await prisma.post.create({
            data: {
                content: input.content.trim(),
                mediaUrl: input.mediaUrl ?? null,
                visibility: input.visibility.toUpperCase(),
                userId,
            },
            include: { user: { select: AUTHOR_SELECT } },
        });

        return toPostResponse(post);
    }

    // Renvoie les IDs des amis "acceptés" d'un utilisateur (relation symétrique :
    // une amitié peut avoir été initiée dans un sens ou dans l'autre)
    static async getFriendIds(userId: number): Promise<number[]> {
        const friendships = await prisma.friendship.findMany({
            where: {
                status: 'ACCEPTED',
                OR: [{ userId }, { friendId: userId }],
            },
            select: { userId: true, friendId: true },
        });

        return friendships.map((f) => (f.userId === userId ? f.friendId : f.userId));
    }

    // Fil d'actualité : posts publics + posts "amis" des amis du viewer + ses propres posts
    static async getFeed(viewerId: number): Promise<PostResponse[]> {
        const friendIds = await PostsService.getFriendIds(viewerId);

        const posts = await prisma.post.findMany({
            where: {
                isHidden: false,
                OR: [
                    { visibility: 'PUBLIC' },
                    { userId: viewerId },
                    { visibility: 'FRIENDS', userId: { in: friendIds } },
                ],
            },
            orderBy: { createdAt: 'desc' },
            include: { user: { select: AUTHOR_SELECT } },
        });

        return posts.map(toPostResponse);
    }

    // Lecture d'un post précis, avec vérification de la visibilité
    static async getById(postId: number, viewerId: number): Promise<PostResponse> {
        const post = await prisma.post.findUnique({
            where: { id: postId },
            include: { user: { select: AUTHOR_SELECT } },
        });

        if (!post || post.isHidden) {
            throw new PostsError('Post introuvable.', 404);
        }

        if (post.visibility === 'FRIENDS' && post.userId !== viewerId) {
            const friendIds = await PostsService.getFriendIds(viewerId);

            if (!friendIds.includes(post.userId)) {
                throw new PostsError("Ce post est réservé aux amis de l'auteur.", 403);
            }
        }

        return toPostResponse(post);
    }

    // Suppression : uniquement par l'auteur du post
    static async remove(postId: number, userId: number): Promise<void> {
        const post = await prisma.post.findUnique({ where: { id: postId } });

        if (!post) {
            throw new PostsError('Post introuvable.', 404);
        }

        if (post.userId !== userId) {
            throw new PostsError('Vous ne pouvez supprimer que vos propres posts.', 403);
        }

        await prisma.post.delete({ where: { id: postId } });
    }
}
