import { Router } from 'express';
import { prisma } from '../../config/db.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { PostsService, PostsError } from '../posts/posts.service.js';
import { positiveId } from '../moderation/moderation.validation.js';
import { handle } from '../moderation/moderation.controller.js';
import { ModerationError } from '../moderation/moderation.js';

// Minimal comments integration for the current branch (interactions was empty).
export const commentsRouter = Router({ mergeParams: true });
commentsRouter.use(requireAuth);
commentsRouter.use(async (req, res, next) => {
    try { await PostsService.getById(positiveId(req.params.postId), req.userId!); next(); }
    catch (error) {
        if (error instanceof PostsError || error instanceof ModerationError) return res.status(error.status).json({ status: 'ERROR', errors: [error.message] });
        next(error);
    }
});
const include = { user: { select: { id: true, username: true } } } as const;
commentsRouter.get('/', handle(async (req, res) => {
    const comments = await prisma.comment.findMany({ where: { postId: positiveId(req.params.postId) }, include, orderBy: { id: 'asc' } });
    res.json({ status: 'OK', comments });
}));
commentsRouter.post('/', handle(async (req, res) => {
    const content = req.body?.content;
    if (typeof content !== 'string' || !content.trim() || content.trim().length > 2000) throw new ModerationError('Le commentaire doit contenir entre 1 et 2000 caractères.');
    const comment = await prisma.comment.create({ data: { content: content.trim(), postId: positiveId(req.params.postId), userId: req.userId! }, include });
    res.status(201).json({ status: 'OK', comment });
}));
