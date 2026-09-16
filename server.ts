import http from 'http';
import { app } from './src/app.js';
import { Server } from 'socket.io';
import { setIO } from './src/sockets/io.js';
import { registerChatSocket } from './src/modules/chat/chat.socket.js';

const server = http.createServer(app);

export const io = new Server(server, {
    cors: { origin: '*', credentials: true }
});

setIO(io);
registerChatSocket(io);

const PORT = process.env.PORT || 1337;

server.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
