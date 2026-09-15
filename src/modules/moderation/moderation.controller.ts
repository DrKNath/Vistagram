import type { Request, Response } from 'express';
import { validateCreateReportInput } from './moderation.validation.js';
import {
    createReport,
    listReports,
    resolveReport,
    hidePost,
    unhidePost,
    deletePost,
    toReportResponse,
    ModerationError,
} from './moderation.js';
import type { CreateReportInput, ReportStatus } from './moderation.types.js';

export async function reportContent(req: Request, res: Response) {
    const errors = validateCreateReportInput(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ status: 'ERROR', errors });
    }

    const { postId, reason } = req.body as CreateReportInput;

    try {
        const report = await createReport(req.userId as number, postId, reason.trim());
        return res.status(201).json({ status: 'OK', report: toReportResponse(report) });
    } catch (err) {
        if (err instanceof ModerationError) {
            return res.status(err.status).json({ status: 'ERROR', errors: [err.message] });
        }
        console.error(err);
        return res.status(500).json({ status: 'ERROR', errors: ['Erreur serveur.'] });
    }
}

export async function getReports(req: Request, res: Response) {
    const statusParam = req.query.status as ReportStatus | undefined;
    const reports = await listReports(statusParam);
    return res.json({ status: 'OK', reports: reports.map(toReportResponse) });
}

export async function resolveReportHandler(req: Request, res: Response) {
    const reportId = Number(req.params.id);

    if (!Number.isInteger(reportId)) {
        return res.status(400).json({ status: 'ERROR', errors: ['Identifiant de signalement invalide.'] });
    }

    try {
        const report = await resolveReport(reportId);
        return res.json({ status: 'OK', report: toReportResponse(report) });
    } catch (err) {
        if (err instanceof ModerationError) {
            return res.status(err.status).json({ status: 'ERROR', errors: [err.message] });
        }
        console.error(err);
        return res.status(500).json({ status: 'ERROR', errors: ['Erreur serveur.'] });
    }
}

export async function hidePostHandler(req: Request, res: Response) {
    const postId = Number(req.params.id);

    if (!Number.isInteger(postId)) {
        return res.status(400).json({ status: 'ERROR', errors: ['Identifiant de post invalide.'] });
    }

    try {
        const post = await hidePost(postId);
        return res.json({ status: 'OK', post: { id: post.id, isHidden: post.isHidden } });
    } catch (err) {
        if (err instanceof ModerationError) {
            return res.status(err.status).json({ status: 'ERROR', errors: [err.message] });
        }
        console.error(err);
        return res.status(500).json({ status: 'ERROR', errors: ['Erreur serveur.'] });
    }
}

export async function unhidePostHandler(req: Request, res: Response) {
    const postId = Number(req.params.id);

    if (!Number.isInteger(postId)) {
        return res.status(400).json({ status: 'ERROR', errors: ['Identifiant de post invalide.'] });
    }

    try {
        const post = await unhidePost(postId);
        return res.json({ status: 'OK', post: { id: post.id, isHidden: post.isHidden } });
    } catch (err) {
        if (err instanceof ModerationError) {
            return res.status(err.status).json({ status: 'ERROR', errors: [err.message] });
        }
        console.error(err);
        return res.status(500).json({ status: 'ERROR', errors: ['Erreur serveur.'] });
    }
}

export async function deletePostHandler(req: Request, res: Response) {
    const postId = Number(req.params.id);

    if (!Number.isInteger(postId)) {
        return res.status(400).json({ status: 'ERROR', errors: ['Identifiant de post invalide.'] });
    }

    try {
        await deletePost(postId);
        return res.json({ status: 'OK', message: 'Post supprimé.' });
    } catch (err) {
        if (err instanceof ModerationError) {
            return res.status(err.status).json({ status: 'ERROR', errors: [err.message] });
        }
        console.error(err);
        return res.status(500).json({ status: 'ERROR', errors: ['Erreur serveur.'] });
    }
}
