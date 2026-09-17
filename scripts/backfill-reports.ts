import 'dotenv/config';
import { prisma } from '../src/config/db.js';
// Upgrade reports created by the original moderation branch without deleting data.
try {
    const reports = await prisma.report.findMany({ where: { targetId: null }, include: { post: true }, orderBy: { id: 'asc' } });
    for (const report of reports) {
        const targetId = report.postId;
        if (!targetId) continue;
        const openKey = `${report.userId}:POST:${targetId}`;
        const duplicate = report.status === 'PENDING' ? await prisma.report.findUnique({ where: { openKey } }) : null;
        await prisma.report.update({ where: { id: report.id }, data: {
            targetType: 'POST', targetId, targetAuthorId: report.post?.userId,
            targetSnapshot: JSON.stringify(report.post ?? { id: targetId }),
            openKey: report.status === 'PENDING' && !duplicate ? openKey : null,
            ...(duplicate ? { status: 'DISMISSED', resolvedAt: new Date(), resolutionNote: 'Doublon historique regroupé lors de la mise à niveau.' } : {}),
        } });
    }
    console.log(`${reports.length} ancien(s) signalement(s) examiné(s).`);
} finally { await prisma.$disconnect(); }
