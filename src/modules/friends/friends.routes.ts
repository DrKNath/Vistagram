import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
    blockUserHandler,
    cancelFriendRequest,
    getBlockedUsers,
    getFriendRequests,
    getFriends,
    getFriendshipStatus,
    removeFriendHandler,
    respondToFriendRequest,
    sendFriendRequest,
    unblockUserHandler,
} from './friends.controller.js';

export const friendsRouter = Router();

// Les chemins littéraux précèdent les chemins paramétrés, sinon `/requests`
// serait capté par `/:userId`.
friendsRouter.get('/', requireAuth, getFriends);
friendsRouter.get('/requests', requireAuth, getFriendRequests);
friendsRouter.get('/blocked', requireAuth, getBlockedUsers);
friendsRouter.get('/status/:userId', requireAuth, getFriendshipStatus);

friendsRouter.post('/', requireAuth, sendFriendRequest);
friendsRouter.patch('/:id', requireAuth, respondToFriendRequest);
friendsRouter.delete('/requests/:id', requireAuth, cancelFriendRequest);

friendsRouter.post('/block/:userId', requireAuth, blockUserHandler);
friendsRouter.delete('/block/:userId', requireAuth, unblockUserHandler);

friendsRouter.delete('/:userId', requireAuth, removeFriendHandler);
