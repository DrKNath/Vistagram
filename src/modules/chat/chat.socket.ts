import type { Server, Socket } from 'socket.io';
import { verifyToken } from '../auth/auth.js';
import { prisma } from '../../config/db.js';
import { sendMessage } from './chat.js';

/** Lit le cookie `token` depuis l'en-tête brut d'une connexion Socket.io. */
function extractToken(socket: Socket): string | null {
    const cookieHeader = socket.handshake.headers.cookie;
    if (!cookieHeader) {
        return null;
    }

    const raw = cookieHeader
        .split(';')
        .map(part => part.trim())
        .find(part => part.startsWith('token='));

    if (!raw) {
        return null;
    }

    return decodeURIComponent(raw.slice('token='.length));
}

/** Vérifie que l'utilisateur fait partie de la conversation, sans lever d'exception. */
async function isMember(conversationId: number, userId: number): Promise<boolean> {
    const membership = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
    });
    return membership !== null;
}

/**
 * Branche la messagerie temps réel sur un serveur Socket.io.
 *
 * L'authentification se fait via le même cookie `token` que l'API REST
 * (posé par le module auth au login). La persistance et la diffusion des
 * messages passent toujours par `sendMessage` (chat.ts) : ce fichier ne fait
 * que relayer les évènements, il ne duplique aucune règle métier.
 *
 * @param io Serveur Socket.io, créé dans `server.ts`.
 */
export function registerChatSocket(io: Server): void {
    io.use((socket, next) => {
        const token = extractToken(socket);
        if (!token) {
            return next(new Error('Non authentifié.'));
        }
        try {
            const payload = verifyToken(token);
            socket.data.userId = payload.userId;
            next();
        } catch {
            next(new Error('Session invalide ou expirée.'));
        }
    });

    io.on('connection', socket => {
        const userId = socket.data.userId as number;

        // Room personnelle : utile pour des notifications hors conversation
        // (ex. futur module notifications) sans devoir connaître ses rooms.
        socket.join(`user:${userId}`);

        socket.on('join_conversation', async (conversationId: unknown, ack?: (ok: boolean) => void) => {
            const id = Number(conversationId);
            const allowed = Number.isInteger(id) && id > 0 && (await isMember(id, userId));

            if (allowed) {
                socket.join(`conversation:${id}`);
            }

            ack?.(allowed);
        });

        socket.on('leave_conversation', (conversationId: unknown) => {
            const id = Number(conversationId);
            if (Number.isInteger(id) && id > 0) {
                socket.leave(`conversation:${id}`);
            }
        });

        socket.on(
            'send_message',
            async (
                payload: { conversationId?: unknown; content?: unknown },
                ack?: (res: { status: 'OK' | 'ERROR'; message?: unknown; error?: string }) => void,
            ) => {
                const conversationId = Number(payload?.conversationId);
                const content = typeof payload?.content === 'string' ? payload.content.trim() : '';

                if (!Number.isInteger(conversationId) || conversationId <= 0 || content.length === 0) {
                    ack?.({ status: 'ERROR', error: 'Message invalide.' });
                    return;
                }

                try {
                    const message = await sendMessage(userId, conversationId, content);
                    ack?.({ status: 'OK', message });
                } catch (err) {
                    ack?.({ status: 'ERROR', error: err instanceof Error ? err.message : 'Erreur serveur.' });
                }
            },
        );
    });
}
