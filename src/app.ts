import 'dotenv/config';
import path from 'path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { commentsRouter } from './modules/comments/comments.routes.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './modules/auth/auth.routes.js';
import { moderationRouter } from './modules/moderation/moderation.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { mediaRouter } from './modules/media/media.routes.js';
import { postsRouter } from './modules/posts/posts.routes.js';
import { friendsRouter } from './modules/friends/friends.routes.js';



export const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));
app.use(express.static(path.join(process.cwd(), 'public')));

// Route de test
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'API Vistagram fonctionnelle' });
});

app.use('/api/auth', authRouter);
app.use('/api/moderation', moderationRouter);
app.use('/api/users', usersRouter);
app.use('/api/media', mediaRouter);
app.use('/api/posts', postsRouter);
app.use('/api/friends', friendsRouter);


app.use('/api/posts/:postId/comments', commentsRouter);

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof SyntaxError) return res.status(400).json({ status: 'ERROR', errors: ['JSON invalide.'] });
    console.error(error);
    res.status(500).json({ status: 'ERROR', errors: ['Erreur serveur.'] });
});
