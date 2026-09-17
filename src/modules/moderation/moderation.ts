import { Prisma } from '@prisma/client';
import type { Report } from '@prisma/client';
import { prisma } from '../../config/db.js';
import { PostsService, PostsError } from '../posts/posts.service.js';
import { ROLE_RANK } from './moderation.types.js';
import type { Action, CreateReportInput, TargetType } from './moderation.types.js';

export class ModerationError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

export function toReportResponse(report: Report) {
    return { ...report, status: report.status.toLowerCase(), reportedBy: report.userId };
}

export async function createReport(reporterId: number, input: CreateReportInput) {
    let targetType: TargetType, targetId: number, targetAuthorId: number, snapshot: string;
    try {
        if (input.postId !== undefined) {
            const post = await PostsService.getById(input.postId, reporterId);
            targetType = 'POST'; targetId = post.id; targetAuthorId = post.author.id;
            snapshot = JSON.stringify(post);
        } else if (input.commentId !== undefined) {
            const comment = await prisma.comment.findUnique({ where: { id: input.commentId }, include: { user: { select: { username: true } } } });
            if (!comment) throw new ModerationError('Commentaire introuvable.', 404);
            await PostsService.getById(comment.postId, reporterId);
            targetType = 'COMMENT'; targetId = comment.id; targetAuthorId = comment.userId;
            snapshot = JSON.stringify({ id: comment.id, content: comment.content, postId: comment.postId, author: comment.user.username });
        } else {
            const user = await prisma.user.findUnique({ where: { id: input.targetUserId }, select: { id: true, username: true, bio: true } });
            if (!user) throw new ModerationError('Utilisateur introuvable.', 404);
            if (user.id === reporterId) throw new ModerationError('Tu ne peux pas signaler ton propre compte.');
            targetType = 'USER'; targetId = user.id; targetAuthorId = user.id;
            snapshot = JSON.stringify(user);
        }
        return await prisma.report.create({ data: {
            userId: reporterId, postId: input.postId, commentId: input.commentId, targetUserId: input.targetUserId,
            targetType, targetId, targetAuthorId, targetSnapshot: snapshot,
            reason: input.reason.trim(), openKey: `${reporterId}:${targetType}:${targetId}`,
        } });
    } catch (error) {
        if (error instanceof PostsError) throw new ModerationError(error.message, error.status);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ModerationError('Tu as déjà un signalement en attente pour cette cible.', 409);
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
            throw new ModerationError('Cette cible vient d’être supprimée. Recharge la page.', 409);
        }
        throw error;
    }
}

export const reportInclude = {
    reporter: { select: { id: true, username: true } },
    post: { select: { id: true, content: true, mediaUrl: true, isHidden: true, userId: true } },
    comment: { select: { id: true, content: true, userId: true, postId: true } },
    targetUser: { select: { id: true, username: true, isBanned: true } },
} as const;

// Sanction, report resolution and audit entry commit together or all roll back.
export async function performAction(actorId: number, action: Action, reason: string, targetId?: number, reportId?: number) {
    return prisma.$transaction(async tx => {
        const actor = await tx.user.findUnique({ where: { id: actorId } });
        const review = action === 'RESOLVE_REPORT' || action === 'DISMISS_REPORT';
        if (!actor || actor.isBanned || (ROLE_RANK[actor.role] ?? 0) < (review ? 1 : 2)) {
            throw new ModerationError('Droits insuffisants.', 403);
        }
        const report = reportId ? await tx.report.findUnique({ where: { id: reportId } }) : null;
        if (reportId && !report) throw new ModerationError('Signalement introuvable.', 404);
        if (report && report.status !== 'PENDING') throw new ModerationError('Ce signalement a déjà été traité. Recharge la liste.', 409);
        if (review && !report) throw new ModerationError('Signalement requis.');
        let type: string = action.includes('POST') ? 'POST' : action.includes('COMMENT') ? 'COMMENT' : 'USER';
        if (review) { type = report!.targetType; targetId = report!.targetId ?? report!.postId ?? report!.id; }
        else if (report) {
            if (type !== 'USER' && type !== report.targetType) throw new ModerationError('Action incompatible avec cette cible.');
            targetId = type === 'USER' ? report.targetAuthorId ?? undefined : report.targetId ?? report.postId ?? undefined;
        }
        if (!targetId) throw new ModerationError('La cible de ce signalement n’est plus disponible.', 404);
        let snapshot = report?.targetSnapshot ?? '';
        let result: Record<string, unknown> = {};
        const resolution = { status: 'RESOLVED', openKey: null, resolvedAt: new Date(), resolvedBy: actorId, resolutionNote: reason };

        if (!review && type === 'POST') {
            const post = await tx.post.findUnique({ where: { id: targetId } });
            if (!post) throw new ModerationError('Publication introuvable.', 404);
            snapshot = JSON.stringify(post);
            if (action === 'DELETE_POST') {
                // Also close reports for comments that will disappear by cascade.
                const comments = await tx.comment.findMany({ where: { postId: targetId }, select: { id: true } });
                await tx.report.updateMany({ where: { status: 'PENDING', OR: [
                    { postId: targetId }, { commentId: { in: comments.map(c => c.id) } },
                ] }, data: resolution });
                await tx.post.delete({ where: { id: targetId } });
            } else {
                const isHidden = action === 'HIDE_POST';
                if (post.isHidden === isHidden) throw new ModerationError('La publication est déjà dans cet état.', 409);
                const updated = await tx.post.update({ where: { id: targetId }, data: { isHidden } });
                result = { post: { id: updated.id, isHidden: updated.isHidden } };
            }
        } else if (!review && type === 'COMMENT') {
            const comment = await tx.comment.findUnique({ where: { id: targetId } });
            if (!comment) throw new ModerationError('Commentaire introuvable.', 404);
            snapshot = JSON.stringify(comment);
            await tx.report.updateMany({ where: { commentId: targetId, status: 'PENDING' }, data: resolution });
            await tx.comment.delete({ where: { id: targetId } });
        } else if (!review && type === 'USER') {
            const user = await tx.user.findUnique({ where: { id: targetId } });
            if (!user) throw new ModerationError('Utilisateur introuvable.', 404);
            if (user.id === actorId || (ROLE_RANK[user.role] ?? 0) >= (ROLE_RANK[actor.role] ?? 0)) {
                throw new ModerationError('Action interdite sur toi-même ou un rôle égal ou supérieur.', 403);
            }
            const isBanned = action === 'BAN_USER';
            if (user.isBanned === isBanned) throw new ModerationError('Ce compte est déjà dans cet état.', 409);
            snapshot = JSON.stringify({ id: user.id, username: user.username, role: user.role, isBanned: user.isBanned });
            const updated = await tx.user.update({ where: { id: targetId }, data: {
                isBanned, bannedAt: isBanned ? new Date() : null, banReason: isBanned ? reason : null,
                authVersion: { increment: 1 },
            } });
            result = { user: { id: updated.id, username: updated.username, isBanned: updated.isBanned } };
        }
        if (report) {
            const updated = await tx.report.update({ where: { id: report.id }, data: {
                ...resolution, status: action === 'DISMISS_REPORT' ? 'DISMISSED' : 'RESOLVED',
            } });
            result.report = toReportResponse(updated);
        }
        const log = await tx.moderationLog.create({ data: {
            actorId, actorName: actor.username, action, targetType: type, targetId,
            targetSnapshot: snapshot, reason, reportId: report?.id,
        } });
        return { ...result, logId: log.id };
    });
}
