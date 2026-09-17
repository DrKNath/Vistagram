import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db.js';
import { createReport, reportInclude, performAction, toReportResponse, ModerationError } from './moderation.js';
import { pagination, positiveId, reasonInput, validateCreateReportInput } from './moderation.validation.js';
import type { Action } from './moderation.types.js';

export const handle = (fn: (req: Request, res: Response) => Promise<unknown>) =>
    async (req: Request, res: Response, next: NextFunction) => {
        try { await fn(req, res); } catch (error) {
            if (error instanceof ModerationError) return res.status(error.status).json({ status: 'ERROR', errors: [error.message] });
            if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2025', 'P2034', 'P1008'].includes(error.code)) {
                return res.status(409).json({ status: 'ERROR', errors: ['Modification concurrente. Recharge la page et réessaie.'] });
            }
            next(error);
        }
    };

export const reportContent = handle(async (req, res) => {
    const errors = validateCreateReportInput(req.body);
    if (errors.length) throw new ModerationError(errors.join(' '));
    const report = await createReport(req.userId!, req.body);
    res.status(201).json({ status: 'OK', report: toReportResponse(report) });
});

export const getReports = handle(async (req, res) => {
    const { page, limit, skip } = pagination(req.query);
    const status = req.query.status;
    const type = req.query.type;
    if (status !== undefined && !['pending', 'resolved', 'dismissed'].includes(String(status))) throw new ModerationError('Statut invalide.');
    if (type !== undefined && !['POST', 'COMMENT', 'USER'].includes(String(type))) throw new ModerationError('Type de cible invalide.');
    const where = { ...(status ? { status: String(status).toUpperCase() } : {}), ...(type ? { targetType: String(type) } : {}) };
    const [total, reports] = await prisma.$transaction([
        prisma.report.count({ where }),
        prisma.report.findMany({ where, include: reportInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take: limit }),
    ]);
    res.json({ status: 'OK', reports: reports.map(toReportResponse), page, limit, total, pages: Math.ceil(total / limit) });
});

export const getLogs = handle(async (req, res) => {
    const { page, limit, skip } = pagination(req.query);
    const where = req.query.reportId === undefined ? {} : { reportId: positiveId(req.query.reportId) };
    const [total, logs] = await prisma.$transaction([
        prisma.moderationLog.count({ where }),
        prisma.moderationLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take: limit }),
    ]);
    res.json({ status: 'OK', logs, page, limit, total, pages: Math.ceil(total / limit) });
});

export const getUsers = handle(async (req, res) => {
    const { page, limit, skip } = pagination(req.query);
    if (req.query.q !== undefined && (typeof req.query.q !== 'string' || req.query.q.length > 100)) throw new ModerationError('Recherche invalide.');
    if (req.query.banned !== undefined && !['true', 'false'].includes(String(req.query.banned))) throw new ModerationError('Filtre invalide.');
    const q = String(req.query.q ?? '').trim();
    const where = { ...(q ? { username: { contains: q } } : {}), ...(req.query.banned !== undefined ? { isBanned: req.query.banned === 'true' } : {}) };
    const [total, users] = await prisma.$transaction([
        prisma.user.count({ where }),
        prisma.user.findMany({ where, select: { id: true, username: true, role: true, isBanned: true, bannedAt: true, banReason: true }, orderBy: { id: 'desc' }, skip, take: limit }),
    ]);
    res.json({ status: 'OK', users, total, page, limit, pages: Math.ceil(total / limit) });
});

export const actionHandler = (action: Action) => handle(async (req, res) => {
    const id = positiveId(req.params.id);
    const reason = reasonInput(req.body?.reason);
    const review = action === 'RESOLVE_REPORT' || action === 'DISMISS_REPORT';
    const result = await performAction(req.userId!, action, reason, review ? undefined : id, review ? id : undefined);
    res.json({ status: 'OK', ...result });
});

export const reportAction = handle(async (req, res) => {
    const allowed: Action[] = ['RESOLVE_REPORT', 'DISMISS_REPORT', 'HIDE_POST', 'DELETE_POST', 'DELETE_COMMENT', 'BAN_USER'];
    const action = req.body?.action;
    if (!allowed.includes(action)) throw new ModerationError('Action invalide.');
    const result = await performAction(req.userId!, action, reasonInput(req.body?.reason), undefined, positiveId(req.params.id));
    res.json({ status: 'OK', ...result });
});
