import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
    getConversationsHandler,
    getMessagesHandler,
    sendMessageHandler,
    startConversationHandler,
} from './chat.controller.js';

export const chatRouter = Router();

chatRouter.get('/conversations', requireAuth, getConversationsHandler);
chatRouter.post('/conversations', requireAuth, startConversationHandler);
chatRouter.get('/conversations/:id/messages', requireAuth, getMessagesHandler);
chatRouter.post('/conversations/:id/messages', requireAuth, sendMessageHandler);
