import type { Request, Response } from 'express';
import {
    FriendsError,
    acceptRequest,
    blockUser,
    dropRequest,
    getRelationStatus,
    listBlocked,
    listFriends,
    listIncomingRequests,
    listOutgoingRequests,
    removeFriend,
    sendRequest,
    toFriendshipResponse,
    unblockUser,
    suggestFriends
} from './friends.js';
import {
    parseRouteId,
    validateFriendRequestInput,
    validateFriendResponseInput,
    parseSuggestionsLimit
} from './friends.validation.js';
import type { FriendRequestInput, FriendResponseInput } from './friends.types.js';

/** Traduit une exception en réponse d'erreur. */
function fail(res: Response, err: unknown): Response {
    if (err instanceof FriendsError) {
        return res.status(err.status).json({ status: 'ERROR', errors: [err.message] });
    }
    // Une erreur non prévue ne doit jamais fuiter sa trace au client.
    console.error(err);
    return res.status(500).json({ status: 'ERROR', errors: ['Erreur serveur.'] });
}

/** `POST /api/friends` — envoyer une demande d'amitié. */
export async function sendFriendRequest(req: Request, res: Response) {
    const errors = validateFriendRequestInput(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ status: 'ERROR', errors });
    }

    const { targetUserId } = req.body as FriendRequestInput;

    try {
        const relation = await sendRequest(req.userId as number, targetUserId);
        return res.status(201).json({ status: 'OK', friendship: toFriendshipResponse(relation) });
    } catch (err) {
        return fail(res, err);
    }
}

/**
 * `PATCH /api/friends/:id` — répondre à une demande reçue.
 *
 * Une acceptation renvoie la relation mise à jour ; un refus supprime la
 * ligne, il n'y a donc rien à renvoyer.
 */
export async function respondToFriendRequest(req: Request, res: Response) {
    const friendshipId = parseRouteId(req.params.id);

    if (friendshipId === null) {
        return res.status(400).json({ status: 'ERROR', errors: ['Identifiant invalide.'] });
    }

    const errors = validateFriendResponseInput(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ status: 'ERROR', errors });
    }

    const { status } = req.body as FriendResponseInput;

    try {
        if (status === 'rejected') {
            await dropRequest(req.userId as number, friendshipId);
            return res.json({ status: 'OK' });
        }

        const relation = await acceptRequest(req.userId as number, friendshipId);
        return res.json({ status: 'OK', friendship: toFriendshipResponse(relation) });
    } catch (err) {
        return fail(res, err);
    }
}

/** `DELETE /api/friends/requests/:id` — annuler une demande envoyée. */
export async function cancelFriendRequest(req: Request, res: Response) {
    const friendshipId = parseRouteId(req.params.id);

    if (friendshipId === null) {
        return res.status(400).json({ status: 'ERROR', errors: ['Identifiant invalide.'] });
    }

    try {
        await dropRequest(req.userId as number, friendshipId);
        return res.json({ status: 'OK' });
    } catch (err) {
        return fail(res, err);
    }
}

/** `GET /api/friends` — liste des amis confirmés. */
export async function getFriends(req: Request, res: Response) {
    const friends = await listFriends(req.userId as number);
    return res.json({ status: 'OK', friends });
}

/** `GET /api/friends/requests` — demandes reçues et envoyées. */
export async function getFriendRequests(req: Request, res: Response) {
    const userId = req.userId as number;
    const [incoming, outgoing] = await Promise.all([
        listIncomingRequests(userId),
        listOutgoingRequests(userId),
    ]);
    return res.json({ status: 'OK', incoming, outgoing });
}

/** `GET /api/friends/suggestions` — suggestions d'amis (amis en commun). */
export async function getFriendSuggestions(req: Request, res: Response) {
    const limit = parseSuggestionsLimit(req.query.limit);
    const suggestions = await suggestFriends(req.userId as number, limit);
    return res.json({ status: 'OK', suggestions });
}

/** `GET /api/friends/blocked` — comptes bloqués. */
export async function getBlockedUsers(req: Request, res: Response) {
    const blocked = await listBlocked(req.userId as number);
    return res.json({ status: 'OK', blocked });
}

/** `GET /api/friends/status/:userId` — relation avec un compte. */
export async function getFriendshipStatus(req: Request, res: Response) {
    const otherId = parseRouteId(req.params.userId);

    if (otherId === null) {
        return res.status(400).json({ status: 'ERROR', errors: ['Identifiant invalide.'] });
    }

    const relation = await getRelationStatus(req.userId as number, otherId);
    return res.json({ status: 'OK', relation });
}

/** `DELETE /api/friends/:userId` — rompre une amitié. */
export async function removeFriendHandler(req: Request, res: Response) {
    const targetId = parseRouteId(req.params.userId);

    if (targetId === null) {
        return res.status(400).json({ status: 'ERROR', errors: ['Identifiant invalide.'] });
    }

    try {
        await removeFriend(req.userId as number, targetId);
        return res.json({ status: 'OK' });
    } catch (err) {
        return fail(res, err);
    }
}

/** `POST /api/friends/block/:userId` — bloquer un compte. */
export async function blockUserHandler(req: Request, res: Response) {
    const targetId = parseRouteId(req.params.userId);

    if (targetId === null) {
        return res.status(400).json({ status: 'ERROR', errors: ['Identifiant invalide.'] });
    }

    try {
        const relation = await blockUser(req.userId as number, targetId);
        return res.status(201).json({ status: 'OK', friendship: toFriendshipResponse(relation) });
    } catch (err) {
        return fail(res, err);
    }
}

/** `DELETE /api/friends/block/:userId` — lever un blocage. */
export async function unblockUserHandler(req: Request, res: Response) {
    const targetId = parseRouteId(req.params.userId);

    if (targetId === null) {
        return res.status(400).json({ status: 'ERROR', errors: ['Identifiant invalide.'] });
    }

    try {
        await unblockUser(req.userId as number, targetId);
        return res.json({ status: 'OK' });
    } catch (err) {
        return fail(res, err);
    }
}
