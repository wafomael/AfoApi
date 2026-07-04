import { SOCKET_EVENTS } from '../events.js';
import {
    isParticipant,
    getConversationById,
    autreParticipant
} from '../../dataBase/utils/conversation.js';
import { createMessage, markRead } from '../../dataBase/utils/message.js';

/** Room d'une conversation : seuls ses participants (et présents) la rejoignent. */
const convRoom = (conversationId) => `conv:${conversationId}`;
/** Room personnelle d'un user (tous ses appareils) : notifs liste/badge/RDV. */
const userRoom = (userId) => `user:${userId}`;

/**
 * Handlers de messagerie (chat) en temps réel.
 *
 * Philosophie : la PERSISTANCE se fait ici (le serveur écrit en DB), puis on
 * diffuse. L'historique paginé et la liste des conversations restent en REST.
 *
 * Flux d'un message :
 *   1. client émet `message:send {conversationId, contenu, mediaUrl}` (avec ack)
 *   2. serveur vérifie l'appartenance → INSERT (le trigger maj la conversation)
 *   3. serveur renvoie l'ack {message} (UI optimiste confirmée, vrai id/created_at)
 *   4. serveur broadcast `message:new` à la room conv:<id> (les 2 si ouverte)
 *   5. serveur notifie le destinataire sur user:<id> via `conversation:updated`
 *      (mise à jour de la liste + badge non-lus même conversation fermée)
 *
 * NB : l'émetteur reçoit aussi `message:new` (il est dans la room). Le client
 * doit dédupliquer par `message.id` puisqu'il a déjà le message via l'ack.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export const registerChatHandlers = (io, socket) => {
    const userId = socket.userId;
    if (!userId) return; // connexion anonyme : pas de chat

    // --- Ouvrir une conversation : rejoindre la room + marquer lu ---
    socket.on(SOCKET_EVENTS.CONVERSATION_OPEN, async (payload = {}, ack) => {
        try {
            const conversationId = payload.conversationId;
            if (!conversationId || !(await isParticipant(conversationId, userId))) {
                return ack?.({ error: 'Accès refusé à la conversation' });
            }

            socket.join(convRoom(conversationId));

            // Marquer comme lus les messages reçus et notifier l'émetteur.
            const messageIds = await markRead(conversationId, userId);
            if (messageIds.length > 0) {
                const conv = await getConversationById(conversationId);
                const autre = autreParticipant(conv, userId);
                io.to(userRoom(autre)).emit(SOCKET_EVENTS.MESSAGES_READ, {
                    conversationId, messageIds, par: userId
                });
            }

            ack?.({ ok: true });
        } catch (error) {
            console.error('[chat] erreur conversation:open:', error.message);
            ack?.({ error: 'Erreur serveur' });
        }
    });

    // --- Fermer une conversation : quitter la room ---
    socket.on(SOCKET_EVENTS.CONVERSATION_CLOSE, (payload = {}) => {
        const conversationId = payload.conversationId;
        if (conversationId) socket.leave(convRoom(conversationId));
    });

    // --- Envoyer un message (persistance + ack + broadcast) ---
    socket.on(SOCKET_EVENTS.MESSAGE_SEND, async (payload = {}, ack) => {
        try {
            const { conversationId } = payload;
            const contenu = typeof payload.contenu === 'string' ? payload.contenu.trim() : null;

            // Le socket gère les messages TEXTE. Les médias passent par
            // POST /conversations/:id/media (multipart), puis sont diffusés
            // avec les mêmes events MESSAGE_NEW / CONVERSATION_UPDATED.
            if (!conversationId) return ack?.({ error: 'conversationId requis' });
            if (!contenu) return ack?.({ error: 'Message vide' });
            if (!(await isParticipant(conversationId, userId))) {
                return ack?.({ error: 'Accès refusé à la conversation' });
            }

            const message = await createMessage({
                conversationId,
                emetteurId: userId,
                contenu
            });

            // 1) Confirmer à l'émetteur (UI optimiste).
            ack?.({ message });

            // 2) Diffuser aux participants présents dans la conversation.
            io.to(convRoom(conversationId)).emit(SOCKET_EVENTS.MESSAGE_NEW, message);

            // 3) Notifier le destinataire sur sa room perso (liste + badge).
            const conv = await getConversationById(conversationId);
            const destinataire = autreParticipant(conv, userId);
            io.to(userRoom(destinataire)).emit(SOCKET_EVENTS.CONVERSATION_UPDATED, {
                conversationId, message
            });
        } catch (error) {
            console.error('[chat] erreur message:send:', error.message);
            ack?.({ error: 'Erreur serveur' });
        }
    });

    // --- Signaler la lecture d'une conversation (sans l'ouvrir via socket) ---
    socket.on(SOCKET_EVENTS.MESSAGE_READ, async (payload = {}) => {
        try {
            const conversationId = payload.conversationId;
            if (!conversationId || !(await isParticipant(conversationId, userId))) return;

            const messageIds = await markRead(conversationId, userId);
            if (messageIds.length === 0) return;

            const conv = await getConversationById(conversationId);
            const autre = autreParticipant(conv, userId);
            io.to(userRoom(autre)).emit(SOCKET_EVENTS.MESSAGES_READ, {
                conversationId, messageIds, par: userId
            });
        } catch (error) {
            console.error('[chat] erreur message:read:', error.message);
        }
    });
};
