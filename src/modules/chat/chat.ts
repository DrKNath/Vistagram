import { prisma } from '../../config/db.js';
import { areFriends } from '../friends/friends.js';
import { getIO } from '../../sockets/io.js';
import type {
    ConversationSummary,
    MessageResponse,
    UserSummary,
} from './chat.types.js';

/** Champs de profil exposés dans les listes. */
const USER_SUMMARY_SELECT = { id: true, username: true, avatar: true } as const;

export class ChatError extends Error {
    status: number;

    constructor(message: string, status = 400) {
        super(message);
        this.status = status;
    }
}

interface MessageRow {
    id: number;
    conversationId: number;
    content: string;
    createdAt: Date;
    sender: UserSummary;
}

/** Convertit une ligne Prisma en message exposé au front. */
function toMessageResponse(row: MessageRow): MessageResponse {
    return {
        id: row.id,
        conversationId: row.conversationId,
        content: row.content,
        createdAt: row.createdAt,
        sender: row.sender,
    };
}

/**
 * Diffuse un message aux clients connectés à la conversation.
 *
 * N'a d'effet que si le serveur temps réel est démarré (voir `sockets/io.ts`) ;
 * en test, où seul `app.ts` est chargé, cette fonction ne fait rien.
 */
function broadcastMessage(message: MessageResponse): void {
    const io = getIO();
    if (io) {
        io.to(`conversation:${message.conversationId}`).emit('new_message', message);
    }
}

/** Vérifie qu'un compte existe. */
async function assertUserExists(userId: number): Promise<void> {
    const found = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (found === null) {
        throw new ChatError('Utilisateur introuvable.', 404);
    }
}

/**
 * Vérifie qu'un utilisateur appartient à une conversation.
 *
 * @param conversationId Conversation visée.
 * @param userId Utilisateur qui agit.
 * @throws {ChatError} 404 si la conversation n'existe pas, 403 s'il n'en fait pas partie.
 */
export async function assertMembership(conversationId: number, userId: number): Promise<void> {
    const membership = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
    });

    if (membership) {
        return;
    }

    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true },
    });

    if (!conversation) {
        throw new ChatError('Conversation introuvable.', 404);
    }

    throw new ChatError('Vous ne faites pas partie de cette conversation.', 403);
}

/**
 * Démarre (ou retrouve) une conversation privée avec un ami.
 *
 * La messagerie est réservée aux amis confirmés : c'est le graphe d'amitié
 * (module friends) qui fait autorité, voir `areFriends`. Si une conversation
 * à deux existe déjà entre les deux comptes, elle est réutilisée plutôt que
 * dupliquée.
 *
 * @param actorId Utilisateur qui démarre la conversation.
 * @param targetId Compte avec qui discuter.
 * @return L'identifiant de la conversation (nouvelle ou existante).
 * @throws {ChatError} Si la cible n'existe pas, est soi-même, ou n'est pas une amie.
 */
export async function startConversation(actorId: number, targetId: number): Promise<{ id: number }> {
    if (actorId === targetId) {
        throw new ChatError('Vous ne pouvez pas démarrer une conversation avec vous-même.', 400);
    }

    await assertUserExists(targetId);

    const areTheyFriends = await areFriends(actorId, targetId);
    if (!areTheyFriends) {
        throw new ChatError('Vous devez être amis pour démarrer une conversation.', 403);
    }

    const existing = await prisma.conversation.findFirst({
        where: {
            isGroup: false,
            AND: [
                { participants: { some: { userId: actorId } } },
                { participants: { some: { userId: targetId } } },
            ],
        },
        select: { id: true },
    });

    if (existing) {
        return existing;
    }

    const conversation = await prisma.conversation.create({
        data: {
            isGroup: false,
            participants: {
                create: [{ userId: actorId }, { userId: targetId }],
            },
        },
        select: { id: true },
    });

    return conversation;
}

/**
 * Liste les conversations d'un utilisateur, triées par activité récente.
 *
 * @param userId Compte concerné.
 * @return Les conversations, avec les autres participants et le dernier message.
 */
export async function listConversations(userId: number): Promise<ConversationSummary[]> {
    const rows = await prisma.conversation.findMany({
        where: { participants: { some: { userId } } },
        include: {
            participants: {
                where: { userId: { not: userId } },
                include: { user: { select: USER_SUMMARY_SELECT } },
            },
            messages: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                include: { sender: { select: USER_SUMMARY_SELECT } },
            },
        },
        orderBy: { updatedAt: 'desc' },
    });

    type Row = (typeof rows)[number];

    return (rows as Row[]).map(row => ({
        id: row.id,
        title: row.title,
        isGroup: row.isGroup,
        participants: row.participants.map(p => p.user as UserSummary),
        lastMessage: row.messages[0] ? toMessageResponse(row.messages[0] as unknown as MessageRow) : null,
        updatedAt: row.updatedAt,
    }));
}

/**
 * Liste les messages d'une conversation, du plus ancien au plus récent.
 *
 * @param userId Utilisateur qui consulte (doit faire partie de la conversation).
 * @param conversationId Conversation visée.
 * @param options Pagination : `limit` (défaut 30, max 100) et `before` (identifiant du message le plus ancien déjà chargé).
 * @return Les messages de la page demandée.
 * @throws {ChatError} Si l'utilisateur ne fait pas partie de la conversation.
 */
export async function listMessages(
    userId: number,
    conversationId: number,
    options: { limit?: number; before?: number } = {},
): Promise<MessageResponse[]> {
    await assertMembership(conversationId, userId);

    const limit = Math.min(options.limit ?? 30, 100);

    const rows = await prisma.message.findMany({
        where: {
            conversationId,
            ...(options.before ? { id: { lt: options.before } } : {}),
        },
        include: { sender: { select: USER_SUMMARY_SELECT } },
        orderBy: { createdAt: 'desc' },
        take: limit,
    });

    return (rows as unknown as MessageRow[]).map(toMessageResponse).reverse();
}

/**
 * Envoie un message dans une conversation.
 *
 * Point d'entrée unique pour l'envoi, utilisé aussi bien par la route REST
 * que par l'évènement Socket.io `send_message` : la persistance et la
 * diffusion temps réel restent ainsi centralisées au même endroit.
 *
 * @param userId Auteur du message (doit faire partie de la conversation).
 * @param conversationId Conversation ciblée.
 * @param content Texte du message, déjà validé par l'appelant.
 * @return Le message créé.
 * @throws {ChatError} Si l'utilisateur ne fait pas partie de la conversation.
 */
export async function sendMessage(
    userId: number,
    conversationId: number,
    content: string,
): Promise<MessageResponse> {
    await assertMembership(conversationId, userId);

    const row = await prisma.message.create({
        data: { conversationId, senderId: userId, content: content.trim() },
        include: { sender: { select: USER_SUMMARY_SELECT } },
    });

    // Fait remonter la conversation en tête de liste ; l'échec de cette mise
    // à jour secondaire ne doit pas faire échouer l'envoi du message.
    await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
    }).catch(() => undefined);

    const message = toMessageResponse(row as unknown as MessageRow);
    broadcastMessage(message);
    return message;
}
