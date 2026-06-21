import { Server } from 'socket.io';
import { authenticateSocket } from './middleware/auth.js';
import { registerTestHandlers } from './handlers/test.handler.js';
import { registerPresenceHandlers } from './handlers/presence.handler.js';

/**
 * Initialise Socket.IO sur le serveur HTTP existant.
 *
 * IMPORTANT (scaling futur) :
 * - Tout le code socket vit ici, isolé du reste de l'API.
 * - Le jour où tu passes en cluster / multi-serveurs, il suffira
 *   d'ajouter l'adaptateur Redis ICI (quelques lignes), sans toucher
 *   au reste du code.
 *
 * @param {import('http').Server} server - Le serveur HTTP créé dans index.js
 * @returns {Server} L'instance Socket.IO
 */
export const initSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    // Middlewares de connexion (auth, plus tard rate-limit, logging...)
    io.use(authenticateSocket);

    io.on('connection', (socket) => {
        console.log(`[socket] connecté: ${socket.id} (userId: ${socket.userId ?? 'anonyme'})`);

        // Enregistrer les handlers par fonctionnalité
        registerTestHandlers(io, socket);
        registerPresenceHandlers(io, socket).catch((err) =>
            console.error('[presence] erreur init handler:', err.message)
        );
        // (Futur) registerChatHandlers(io, socket);

        socket.on('disconnect', (reason) => {
            console.log(`[socket] déconnecté: ${socket.id} (${reason})`);
        });
    });

    return io;
};
