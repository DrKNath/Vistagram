import { Router } from 'express';
import { createPost, getFeed, getPost, deletePost } from './posts.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';

export const postsRouter = Router();

postsRouter.post('/', requireAuth, createPost);
postsRouter.get('/', requireAuth, getFeed);
postsRouter.get('/:id', requireAuth, getPost);
postsRouter.delete('/:id', requireAuth, deletePost);
