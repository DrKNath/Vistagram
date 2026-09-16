import type { Request, Response } from 'express';
import {
    ChatError,
    listConversations,
    listMessages,
    sendMessage,
    startConversation,
} from './chat.js';
import {
    parseOptionalIntParam,
    parseRouteId,
    validateSendMessageInput,
    validateStartConversationInput,
} from './chat.validation.js';
import type { SendMessageInput, StartConversationInput } from './chat.types.js';

/** Traduit une exception en réponse d'erreur. */
function fail(res: Response, err: unknown): Response {
    if (err instanceof ChatError) {
        return res.status(err.status).json({ status: 'ERROR', errors: [err.message] });
    }
    // Une erreur non prévue ne doit jamais fuiter sa trace au client.
    console.error(err);
    return res.status(500).json({ status: 'ERROR', errors: ['Erreur serveur.'] });
}

/** `POST /api/chat/conversations` — démarrer (ou retrouver) une conversation privée. */
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

/** `GET /api/chat/conversations` — liste des conversations de l'utilisateur. */
export async function getConversationsHandler(req: Request, res: Response) {
    const conversations = await listConversations(req.userId as number);
    return res.json({ status: 'OK', conversations });
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

/** `POST /api/chat/conversations/:id/messages` — envoyer un message. */
export async function sendMessageHandler(req: Request, res: Response) {
    const conversationId = parseRouteId(req.params.id);

    if (conversationId === null) {
        return res.status(400).json({ status: 'ERROR', errors: ['Identifiant invalide.'] });
    }

    const errors = validateSendMessageInput(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ status: 'ERROR', errors });
    }

    const { content } = req.body as SendMessageInput;

    try {
        const message = await sendMessage(req.userId as number, conversationId, content);
        return res.status(201).json({ status: 'OK', message });
    } catch (err) {
        return fail(res, err);
    }
}
