import type { Request, Response } from 'express';
import { validateCreatePostInput } from './posts.validation.js';
import { PostsService, PostsError } from './posts.service.js';
import type { CreatePostInput } from './posts.types.js';

export async function createPost(req: Request, res: Response) {
    const errors = validateCreatePostInput(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ status: 'ERROR', errors });
    }

    const { content, mediaUrl, visibility } = req.body as CreatePostInput;

    try {
        const post = await PostsService.create(req.userId as number, { content, mediaUrl, visibility });
        return res.status(201).json({ status: 'OK', post });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: 'ERROR', errors: ['Erreur lors de la création du post.'] });
    }
}

export async function getFeed(req: Request, res: Response) {
    try {
        const posts = await PostsService.getFeed(req.userId as number);
        return res.json({ status: 'OK', posts });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: 'ERROR', errors: ['Erreur lors de la récupération du fil.'] });
    }
}

export async function getPost(req: Request, res: Response) {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
        return res.status(400).json({ status: 'ERROR', errors: ['Identifiant de post invalide.'] });
    }

    try {
        const post = await PostsService.getById(id, req.userId as number);
        return res.json({ status: 'OK', post });
    } catch (err) {
        if (err instanceof PostsError) {
            return res.status(err.status).json({ status: 'ERROR', errors: [err.message] });
        }
        console.error(err);
        return res.status(500).json({ status: 'ERROR', errors: ['Erreur serveur.'] });
    }
}

export async function deletePost(req: Request, res: Response) {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
        return res.status(400).json({ status: 'ERROR', errors: ['Identifiant de post invalide.'] });
    }

    try {
        await PostsService.remove(id, req.userId as number);
        return res.json({ status: 'OK', message: 'Post supprimé.' });
    } catch (err) {
        if (err instanceof PostsError) {
            return res.status(err.status).json({ status: 'ERROR', errors: [err.message] });
        }
        console.error(err);
        return res.status(500).json({ status: 'ERROR', errors: ['Erreur serveur.'] });
    }
}
