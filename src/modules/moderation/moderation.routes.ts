import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';
import { reportContent, getReports, getLogs, getUsers, actionHandler, reportAction } from './moderation.controller.js';

export const moderationRouter = Router();
moderationRouter.use(requireAuth);
moderationRouter.post('/reports', reportContent);
moderationRouter.use(requireRole('MODERATOR'));
moderationRouter.get('/reports', getReports);
moderationRouter.get('/logs', getLogs);
moderationRouter.patch('/reports/:id/resolve', actionHandler('RESOLVE_REPORT'));
moderationRouter.patch('/reports/:id/dismiss', actionHandler('DISMISS_REPORT'));
// performAction enforces ADMIN for sanctions, including this shared endpoint.
moderationRouter.post('/reports/:id/actions', reportAction);
moderationRouter.use(requireRole('ADMIN'));
moderationRouter.get('/users', getUsers);
moderationRouter.patch('/users/:id/ban', actionHandler('BAN_USER'));
moderationRouter.patch('/users/:id/unban', actionHandler('UNBAN_USER'));
moderationRouter.patch('/posts/:id/hide', actionHandler('HIDE_POST'));
moderationRouter.patch('/posts/:id/unhide', actionHandler('UNHIDE_POST'));
moderationRouter.delete('/posts/:id', actionHandler('DELETE_POST'));
moderationRouter.delete('/comments/:id', actionHandler('DELETE_COMMENT'));
