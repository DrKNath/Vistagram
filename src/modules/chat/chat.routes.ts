import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
    addParticipantHandler,
    createGroupHandler,
    getConversationDetailHandler,
    getConversationsHandler,
    getMessagesHandler,
    getReadReceiptsHandler,
    markReadHandler,
    removeParticipantHandler,
    sendMessageHandler,
    startConversationHandler,
} from './chat.controller.js';

export const chatRouter = Router();

chatRouter.get('/conversations', requireAuth, getConversationsHandler);
chatRouter.post('/conversations', requireAuth, startConversationHandler);
chatRouter.post('/conversations/group', requireAuth, createGroupHandler);

chatRouter.get('/conversations/:id', requireAuth, getConversationDetailHandler);
chatRouter.post('/conversations/:id/participants', requireAuth, addParticipantHandler);
chatRouter.delete('/conversations/:id/participants/:userId', requireAuth, removeParticipantHandler);

chatRouter.get('/conversations/:id/messages', requireAuth, getMessagesHandler);
chatRouter.post('/conversations/:id/messages', requireAuth, sendMessageHandler);

chatRouter.post('/conversations/:id/read', requireAuth, markReadHandler);
chatRouter.get('/conversations/:id/read-receipts', requireAuth, getReadReceiptsHandler);
