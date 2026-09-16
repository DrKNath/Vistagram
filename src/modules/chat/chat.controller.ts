import type { Request, Response } from 'express';
import {
    ChatError,
    addParticipant,
    createGroup,
    getConversationDetail,
    listConversations,
    listMessages,
    listReadReceipts,
    markRead,
    removeParticipant,
    sendMessage,
    startConversation,
} from './chat.js';
import {
    parseOptionalIntParam,
    parseRouteId,
    validateAddParticipantInput,
    validateCreateGroupInput,
    validateMarkReadInput,
    validateSendMessageInput,
    validateStartConversationInput,
} from './chat.validation.js';
import type {
    AddParticipantInput,
    CreateGroupInput,
    MarkReadInput,
    SendMessageInput,
    StartConversationInput,
} from './chat.types.js';

/** Traduit une exception en réponse d'erreur. */
function fail(res: Response, err: unknown): Response {
    if (err instanceof ChatError) {
        return res.status(err.status).json({ status: 'ERROR', errors: [err.message] });
    }
    // Une erreur non prévue ne doit jamais fuiter sa trace au client.
    console.error(err);
    return res.status(500).json({ status: 'ERROR', errors: ['Erreur serveur.'] });
}

/** `POST /api/chat/conversations` — démarrer (ou retrouver) une conversation privée à deux. */
export async function startConversationHandler(req: Request, res: Response) {
    const errors = validateStartConversationInput(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ status: 'ERROR', errors });
    }

    const { targetUserId } = req.body as StartConversationInput;

    try {
        const conversation = await startConversation(req.userId as number, targetUserId);
        return res.status(201).json({ status: 'OK', conversation });
    } catch (err) {
        return fail(res, err);
    }
}

/** `POST /api/chat/conversations/group` — créer un groupe. */
export async function createGroupHandler(req: Request, res: Response) {
    const errors = validateCreateGroupInput(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ status: 'ERROR', errors });
    }

    const { title, participantIds } = req.body as CreateGroupInput;

    try {
        const conversation = await createGroup(req.userId as number, title, participantIds);
        return res.status(201).json({ status: 'OK', conversation });
    } catch (err) {
        return fail(res, err);
    }
}

/** `GET /api/chat/conversations` — liste des conversations de l'utilisateur. */
export async function getConversationsHandler(req: Request, res: Response) {
    const conversations = await listConversations(req.userId as number);
    return res.json({ status: 'OK', conversations });
}

/** `GET /api/chat/conversations/:id` — détail d'une conversation (membres et rôles). */
export async function getConversationDetailHandler(req: Request, res: Response) {
    const conversationId = parseRouteId(req.params.id);

    if (conversationId === null) {
        return res.status(400).json({ status: 'ERROR', errors: ['Identifiant invalide.'] });
    }

    try {
        const conversation = await getConversationDetail(req.userId as number, conversationId);
        return res.json({ status: 'OK', conversation });
    } catch (err) {
        return fail(res, err);
    }
}

/** `POST /api/chat/conversations/:id/participants` — ajouter un membre à un groupe. */
export async function addParticipantHandler(req: Request, res: Response) {
    const conversationId = parseRouteId(req.params.id);

    if (conversationId === null) {
        return res.status(400).json({ status: 'ERROR', errors: ['Identifiant invalide.'] });
    }

    const errors = validateAddParticipantInput(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ status: 'ERROR', errors });
    }

    const { userId } = req.body as AddParticipantInput;

    try {
        await addParticipant(req.userId as number, conversationId, userId);
        return res.status(201).json({ status: 'OK' });
    } catch (err) {
        return fail(res, err);
    }
}

/** `DELETE /api/chat/conversations/:id/participants/:userId` — retirer un membre (ou quitter le groupe soi-même). */
export async function removeParticipantHandler(req: Request, res: Response) {
    const conversationId = parseRouteId(req.params.id);
    const targetId = parseRouteId(req.params.userId);

    if (conversationId === null || targetId === null) {
        return res.status(400).json({ status: 'ERROR', errors: ['Identifiant invalide.'] });
    }

    try {
        await removeParticipant(req.userId as number, conversationId, targetId);
        return res.json({ status: 'OK' });
    } catch (err) {
        return fail(res, err);
    }
}

/** `GET /api/chat/conversations/:id/messages` — historique d'une conversation. */
export async function getMessagesHandler(req: Request, res: Response) {
    const conversationId = parseRouteId(req.params.id);

    if (conversationId === null) {
        return res.status(400).json({ status: 'ERROR', errors: ['Identifiant invalide.'] });
    }

    const limit = parseOptionalIntParam(req.query.limit);
    const before = parseOptionalIntParam(req.query.before);

    try {
        const messages = await listMessages(req.userId as number, conversationId, {
            limit: limit ?? undefined,
            before: before ?? undefined,
        });
        return res.json({ status: 'OK', messages });
    } catch (err) {
        return fail(res, err);
    }
}

/** `POST /api/chat/conversations/:id/messages` — envoyer un message (texte et/ou média). */
export async function sendMessageHandler(req: Request, res: Response) {
    const conversationId = parseRouteId(req.params.id);

    if (conversationId === null) {
        return res.status(400).json({ status: 'ERROR', errors: ['Identifiant invalide.'] });
    }

    const errors = validateSendMessageInput(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ status: 'ERROR', errors });
    }

    const { content, mediaUrl } = req.body as SendMessageInput;

    try {
        const message = await sendMessage(req.userId as number, conversationId, content, mediaUrl);
        return res.status(201).json({ status: 'OK', message });
    } catch (err) {
        return fail(res, err);
    }
}

/** `POST /api/chat/conversations/:id/read` — marquer la conversation comme lue. */
export async function markReadHandler(req: Request, res: Response) {
    const conversationId = parseRouteId(req.params.id);

    if (conversationId === null) {
        return res.status(400).json({ status: 'ERROR', errors: ['Identifiant invalide.'] });
    }

    const errors = validateMarkReadInput(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ status: 'ERROR', errors });
    }

    const { messageId } = (req.body ?? {}) as MarkReadInput;

    try {
        const lastReadMessageId = await markRead(req.userId as number, conversationId, messageId);
        return res.json({ status: 'OK', lastReadMessageId });
    } catch (err) {
        return fail(res, err);
    }
}

/** `GET /api/chat/conversations/:id/read-receipts` — indicateur de lecture de chaque membre. */
export async function getReadReceiptsHandler(req: Request, res: Response) {
    const conversationId = parseRouteId(req.params.id);

    if (conversationId === null) {
        return res.status(400).json({ status: 'ERROR', errors: ['Identifiant invalide.'] });
    }

    try {
        const receipts = await listReadReceipts(req.userId as number, conversationId);
        return res.json({ status: 'OK', receipts });
    } catch (err) {
        return fail(res, err);
    }
}
