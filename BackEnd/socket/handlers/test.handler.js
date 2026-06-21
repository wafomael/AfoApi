import { SOCKET_EVENTS } from '../events.js';

/**
 * Handler de test.
 * Le client émet 'test:start' → le serveur renvoie 'test:response'
 * 3 fois, à 5s d'intervalle.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export const registerTestHandlers = (io, socket) => {
    socket.on(SOCKET_EVENTS.TEST_START, () => {
        console.log(`[socket] test:start reçu de ${socket.id}`);

        const total = 3;
        const intervalMs = 5000;

        for (let i = 1; i <= total; i++) {
            setTimeout(() => {
                socket.emit(SOCKET_EVENTS.TEST_RESPONSE, {
                    numero: i,
                    total,
                    message: `Réponse ${i} sur ${total}`,
                    timestamp: new Date().toISOString()
                });
                console.log(`[socket] test:response ${i}/${total} envoyée à ${socket.id}`);
            }, i * intervalMs);
        }
    });
};
