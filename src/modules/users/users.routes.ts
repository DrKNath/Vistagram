import { Router } from 'express';
import { getUserProfile, searchUsers, updateMyProfile } from './users.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';

export const usersRouter = Router();

usersRouter.get('/me', requireAuth, async (req, res) => {
    req.params.id = String(req.userId);
    return getUserProfile(req, res);
});
usersRouter.patch('/me', requireAuth, updateMyProfile);
usersRouter.get('/search', requireAuth, searchUsers);
usersRouter.get('/:id', requireAuth, getUserProfile);