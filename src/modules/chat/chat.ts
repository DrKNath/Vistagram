import { prisma } from '../../config/db.js';
import { areFriends } from '../friends/friends.js';
import { getIO } from '../../sockets/io.js';
import type {
    ConversationDetail,
    ConversationMember,
    ConversationSummary,
    MessageResponse,
    ReadReceipt,
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
    content: string | null;
    mediaUrl: string | null;
    createdAt: Date;
    sender: UserSummary;
}

interface ParticipantRow {
    id: number;
    conversationId: number;
    userId: number;
    role: string;
    joinedAt: Date;
    lastReadMessageId: number | null;
    lastReadAt: Date | null;
}

/** Convertit une ligne Prisma en message exposé au front. */
function toMessageResponse(row: MessageRow): MessageResponse {
    return {
        id: row.id,
        conversationId: row.conversationId,
        content: row.content,
        mediaUrl: row.mediaUrl,
        createdAt: row.createdAt,
        sender: row.sender,
    };
}

/** Diffuse un évènement aux clients connectés à une conversation. N'a d'effet que si le serveur temps réel est démarré. */
function broadcast(conversationId: number, event: string, payload: unknown): void {
    const io = getIO();
    if (io) {
        io.to(`conversation:${conversationId}`).emit(event, payload);
    }
}

/** Vérifie qu'un compte existe. */
async function assertUserExists(userId: number): Promise<void> {
    const found = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (found === null) {
        throw new ChatError('Utilisateur introuvable.', 404);
    }
}

/** Charge la participation d'un utilisateur à une conversation, ou `null`. */
async function getMembership(conversationId: number, userId: number): Promise<ParticipantRow | null> {
    return prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
    });
}

/**
 * Vérifie qu'un utilisateur appartient à une conversation.
 *
 * @param conversationId Conversation visée.
 * @param userId Utilisateur qui agit.
 * @return Sa participation.
 * @throws {ChatError} 404 si la conversation n'existe pas, 403 s'il n'en fait pas partie.
 */
export async function assertMembership(conversationId: number, userId: number): Promise<ParticipantRow> {
    const membership = await getMembership(conversationId, userId);

    if (membership) {
        return membership;
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

/** Charge un groupe et vérifie que l'appelant en est administrateur. */
async function assertIsGroupAdmin(conversationId: number, userId: number): Promise<void> {
    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true, isGroup: true },
    });

    if (!conversation) {
        throw new ChatError('Conversation introuvable.', 404);
    }
    if (!conversation.isGroup) {
        throw new ChatError('Cette action est réservée aux groupes.', 400);
    }

    const membership = await getMembership(conversationId, userId);
    if (!membership) {
        throw new ChatError('Vous ne faites pas partie de ce groupe.', 403);
    }
    if (membership.role !== 'ADMIN') {
        throw new ChatError('Seul un administrateur du groupe peut effectuer cette action.', 403);
    }
}

/**
 * Démarre (ou retrouve) une conversation privée à deux avec un ami.
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
 * Crée un groupe de discussion.
 *
 * Comme pour les conversations à deux, chaque membre invité doit être un ami
 * du créateur : la messagerie de groupe n'est pas un moyen de contourner le
 * graphe d'amitié. Le créateur devient administrateur du groupe.
 *
 * @param actorId Créateur du groupe.
 * @param title Nom du groupe.
 * @param participantIds Membres à inviter, en plus du créateur.
 * @return L'identifiant du groupe créé.
 * @throws {ChatError} Si un membre invité n'existe pas ou n'est pas un ami, ou si le groupe est trop petit.
 */
export async function createGroup(
    actorId: number,
    title: string,
    participantIds: number[],
): Promise<{ id: number }> {
    const uniqueIds = Array.from(new Set(participantIds)).filter(id => id !== actorId);

    if (uniqueIds.length < 2) {
        throw new ChatError(
            'Un groupe doit compter au moins deux autres membres (sinon utilisez une conversation à deux).',
            400,
        );
    }

    const friendChecks = await Promise.all(
        uniqueIds.map(async id => {
            await assertUserExists(id);
            return { id, isFriend: await areFriends(actorId, id) };
        }),
    );

    const nonFriends = friendChecks.filter(check => !check.isFriend);
    if (nonFriends.length > 0) {
        throw new ChatError('Vous ne pouvez ajouter à un groupe que des comptes qui sont vos amis.', 403);
    }

    const conversation = await prisma.conversation.create({
        data: {
            isGroup: true,
            title: title.trim(),
            participants: {
                create: [
                    { userId: actorId, role: 'ADMIN' },
                    ...uniqueIds.map(id => ({ userId: id, role: 'MEMBER' })),
                ],
            },
        },
        select: { id: true },
    });

    return conversation;
}

/**
 * Ajoute un membre à un groupe existant.
 *
 * @param actorId Administrateur qui ajoute.
 * @param conversationId Groupe visé.
 * @param targetId Compte à ajouter.
 * @throws {ChatError} Si l'appelant n'est pas administrateur, si la cible n'est pas une amie, ou si elle est déjà membre.
 */
export async function addParticipant(actorId: number, conversationId: number, targetId: number): Promise<void> {
    await assertIsGroupAdmin(conversationId, actorId);
    await assertUserExists(targetId);

    const areTheyFriends = await areFriends(actorId, targetId);
    if (!areTheyFriends) {
        throw new ChatError('Vous ne pouvez ajouter que des comptes qui sont vos amis.', 403);
    }

    const existing = await getMembership(conversationId, targetId);
    if (existing) {
        throw new ChatError('Ce compte fait déjà partie du groupe.', 409);
    }

    await prisma.conversationParticipant.create({
        data: { conversationId, userId: targetId, role: 'MEMBER' },
    });
}

/**
 * Retire un membre d'un groupe, ou permet à un membre de le quitter lui-même.
 *
 * Si le seul administrateur restant part, l'administration est transférée au
 * membre présent depuis le plus longtemps, afin qu'un groupe ne se retrouve
 * jamais sans administrateur tant qu'il compte encore des membres. Si le
 * dernier membre part, le groupe (et ses messages) est supprimé.
 *
 * @param actorId Utilisateur qui agit.
 * @param conversationId Groupe visé.
 * @param targetId Membre à retirer (peut être l'appelant lui-même).
 * @throws {ChatError} Si l'appelant n'est ni administrateur ni la personne visée.
 */
export async function removeParticipant(actorId: number, conversationId: number, targetId: number): Promise<void> {
    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true, isGroup: true },
    });

    if (!conversation) {
        throw new ChatError('Conversation introuvable.', 404);
    }
    if (!conversation.isGroup) {
        throw new ChatError('Cette action est réservée aux groupes.', 400);
    }

    const isSelf = actorId === targetId;

    if (!isSelf) {
        await assertIsGroupAdmin(conversationId, actorId);
    } else {
        const membership = await getMembership(conversationId, actorId);
        if (!membership) {
            throw new ChatError('Vous ne faites pas partie de ce groupe.', 403);
        }
    }

    const removed = await getMembership(conversationId, targetId);
    if (!removed) {
        throw new ChatError('Ce compte ne fait pas partie du groupe.', 404);
    }

    await prisma.conversationParticipant.delete({
        where: { conversationId_userId: { conversationId, userId: targetId } },
    });

    const remaining = await prisma.conversationParticipant.findMany({
        where: { conversationId },
        orderBy: { joinedAt: 'asc' },
    });

    if (remaining.length === 0) {
        await prisma.conversation.delete({ where: { id: conversationId } });
        return;
    }

    const stillHasAdmin = remaining.some(p => p.role === 'ADMIN');
    if (!stillHasAdmin) {
        await prisma.conversationParticipant.update({
            where: { id: remaining[0].id },
            data: { role: 'ADMIN' },
        });
    }
}

/**
 * Liste les conversations d'un utilisateur, triées par activité récente.
 *
 * @param userId Compte concerné.
 * @return Les conversations, avec les autres membres, le dernier message et le nombre de messages non lus.
 */
export async function listConversations(userId: number): Promise<ConversationSummary[]> {
    const own = await prisma.conversationParticipant.findMany({
        where: { userId },
        select: { conversationId: true, lastReadMessageId: true },
    });

    if (own.length === 0) {
        return [];
    }

    const lastReadByConversation = new Map(own.map(p => [p.conversationId, p.lastReadMessageId ?? 0]));

    const rows = await prisma.conversation.findMany({
        where: { id: { in: own.map(p => p.conversationId) } },
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

    return Promise.all(
        (rows as Row[]).map(async row => {
            const lastReadId = lastReadByConversation.get(row.id) ?? 0;
            const unreadCount = await prisma.message.count({
                where: {
                    conversationId: row.id,
                    id: { gt: lastReadId },
                    senderId: { not: userId },
                },
            });

            return {
                id: row.id,
                title: row.title,
                isGroup: row.isGroup,
                participants: row.participants.map(p => p.user as UserSummary),
                lastMessage: row.messages[0] ? toMessageResponse(row.messages[0] as unknown as MessageRow) : null,
                unreadCount,
                updatedAt: row.updatedAt,
            };
        }),
    );
}

/**
 * Détail d'une conversation, avec la liste complète de ses membres.
 *
 * @param userId Utilisateur qui consulte (doit faire partie de la conversation).
 * @param conversationId Conversation visée.
 * @return Le détail de la conversation.
 * @throws {ChatError} Si l'utilisateur ne fait pas partie de la conversation.
 */
export async function getConversationDetail(userId: number, conversationId: number): Promise<ConversationDetail> {
    await assertMembership(conversationId, userId);

    const conversation = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversationId },
        include: {
            participants: {
                orderBy: { joinedAt: 'asc' },
                include: { user: { select: USER_SUMMARY_SELECT } },
            },
        },
    });

    const members: ConversationMember[] = conversation.participants.map(p => ({
        user: p.user as UserSummary,
        role: p.role === 'ADMIN' ? 'admin' : 'member',
    }));

    return {
        id: conversation.id,
        title: conversation.title,
        isGroup: conversation.isGroup,
        members,
    };
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
 * Envoie un message dans une conversation (texte, média, ou les deux).
 *
 * Point d'entrée unique pour l'envoi, utilisé aussi bien par la route REST
 * que par l'évènement Socket.io `send_message` : la persistance et la
 * diffusion temps réel restent ainsi centralisées au même endroit. L'auteur
 * du message est considéré avoir lu la conversation jusqu'à ce message.
 *
 * @param userId Auteur du message (doit faire partie de la conversation).
 * @param conversationId Conversation ciblée.
 * @param content Texte du message, déjà validé par l'appelant (optionnel si un média est joint).
 * @param mediaUrl URL du média joint, généré par `POST /api/media/uploads` (optionnel).
 * @return Le message créé.
 * @throws {ChatError} Si l'utilisateur ne fait pas partie de la conversation.
 */
export async function sendMessage(
    userId: number,
    conversationId: number,
    content?: string,
    mediaUrl?: string,
): Promise<MessageResponse> {
    await assertMembership(conversationId, userId);

    const trimmedContent = content?.trim();

    const row = await prisma.message.create({
        data: {
            conversationId,
            senderId: userId,
            content: trimmedContent && trimmedContent.length > 0 ? trimmedContent : null,
            mediaUrl: mediaUrl && mediaUrl.trim().length > 0 ? mediaUrl.trim() : null,
        },
        include: { sender: { select: USER_SUMMARY_SELECT } },
    });

    const message = toMessageResponse(row as unknown as MessageRow);

    // Deux mises à jour secondaires : faire remonter la conversation en tête
    // de liste, et considérer que l'auteur a lu jusqu'à son propre message.
    // Leur échec ne doit pas faire échouer l'envoi.
    await Promise.all([
        prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
        }).catch(() => undefined),
        prisma.conversationParticipant.update({
            where: { conversationId_userId: { conversationId, userId } },
            data: { lastReadMessageId: row.id, lastReadAt: new Date() },
        }).catch(() => undefined),
    ]);

    broadcast(conversationId, 'new_message', message);
    return message;
}

/**
 * Marque une conversation comme lue par un utilisateur.
 *
 * @param userId Utilisateur qui marque la lecture.
 * @param conversationId Conversation concernée.
 * @param messageId Dernier message lu ; si absent, marque jusqu'au tout dernier message de la conversation.
 * @return Le nouvel identifiant de dernier message lu, `null` si la conversation est vide.
 * @throws {ChatError} Si l'utilisateur ne fait pas partie de la conversation, ou si `messageId` n'appartient pas à cette conversation.
 */
export async function markRead(
    userId: number,
    conversationId: number,
    messageId?: number,
): Promise<number | null> {
    await assertMembership(conversationId, userId);

    let targetMessageId: number | null;

    if (messageId !== undefined) {
        const message = await prisma.message.findUnique({
            where: { id: messageId },
            select: { id: true, conversationId: true },
        });
        if (!message || message.conversationId !== conversationId) {
            throw new ChatError('Ce message n\'appartient pas à cette conversation.', 400);
        }
        targetMessageId = message.id;
    } else {
        const latest = await prisma.message.findFirst({
            where: { conversationId },
            orderBy: { id: 'desc' },
            select: { id: true },
        });
        targetMessageId = latest?.id ?? null;
    }

    if (targetMessageId === null) {
        return null;
    }

    await prisma.conversationParticipant.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { lastReadMessageId: targetMessageId, lastReadAt: new Date() },
    });

    broadcast(conversationId, 'conversation_read', {
        conversationId,
        userId,
        lastReadMessageId: targetMessageId,
    });

    return targetMessageId;
}

/**
 * Liste les indicateurs de lecture de tous les membres d'une conversation.
 *
 * @param userId Utilisateur qui consulte (doit faire partie de la conversation).
 * @param conversationId Conversation visée.
 * @return Les indicateurs de lecture, un par membre.
 * @throws {ChatError} Si l'utilisateur ne fait pas partie de la conversation.
 */
export async function listReadReceipts(userId: number, conversationId: number): Promise<ReadReceipt[]> {
    await assertMembership(conversationId, userId);

    const rows = await prisma.conversationParticipant.findMany({
        where: { conversationId },
        include: { user: { select: USER_SUMMARY_SELECT } },
        orderBy: { joinedAt: 'asc' },
    });

    type Row = (typeof rows)[number];

    return (rows as Row[]).map(row => ({
        user: row.user as UserSummary,
        lastReadMessageId: row.lastReadMessageId,
        lastReadAt: row.lastReadAt,
    }));
}
