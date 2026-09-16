import type { Server } from 'socket.io';

/**
 * Référence globale vers le serveur Socket.io, posée par `server.ts` au
 * démarrage.
 *
 * Les modules métier (ex. chat.ts) ne peuvent pas importer `server.ts`
 * directement : celui-ci importe `app.ts`, qui monte les routes des
 * modules, ce qui créerait une dépendance circulaire. Ce petit registre
 * évite le problème. En test (où seul `app.ts` est chargé, jamais
 * `server.ts`), `getIO()` renvoie `null` et la diffusion temps réel est
 * simplement ignorée — la logique métier, elle, s'exécute normalement.
 */
let ioInstance: Server | null = null;

/** Enregistre l'instance Socket.io active. Appelé une seule fois par `server.ts`. */
export function setIO(instance: Server): void {
    ioInstance = instance;
}

/** Renvoie l'instance Socket.io active, ou `null` si le serveur temps réel n'est pas démarré. */
export function getIO(): Server | null {
    return ioInstance;
}
