import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { uploadMessageMedia } from '../middleware/upload.js';
import { sendSuccess, sendError, internalErrorResponse, notFoundResponse } from '../utils/apiResponse.js';
import { getUserByUsername } from '../dataBase/utils/user.js';
import { buildPhotoUrl } from '../utils/photo.js';
import {
    getMessageMediaPath,
    messageMediaExists,
    saveMessageMedia,
    buildMessageMediaUrl
} from '../utils/messageMedia.js';
import {
    getOrCreateConversation,
    getConversationById,
    autreParticipant,
    listConversations,
    isParticipant
} from '../dataBase/utils/conversation.js';
import { getMessages, createMessage, deleteMessage, markRead } from '../dataBase/utils/message.js';
import { SOCKET_EVENTS } from '../socket/events.js';

const router = Router();

/**
 * Sérialise un message pour l'API : ajoute media_url reconstruite depuis les ids
 * (l'URL n'est jamais stockée en base, cf. convention des photos de profil).
 */
const formatMessage = (req, conversationId, m) => ({
    id:          m.id,
    conversation_id: m.conversation_id,
    emetteur_id: m.emetteur_id,
    contenu:     m.contenu,
    media:       m.media,
    media_url:   buildMessageMediaUrl(req, conversationId, m.id, m.media),
    lu:          m.lu,
    created_at:  m.created_at
});

/**
 * ============================================
 * ROUTES MESSAGERIE — conversations & historique
 * ============================================
 * Le temps réel (envoi/réception) passe par Socket.IO. Ces routes REST
 * servent à la PERSISTANCE consultable : liste des conversations,
 * historique paginé, création/résolution d'une conversation, et lecture.
 */

/**
 * GET /conversations
 * Liste des conversations de l'utilisateur, triées par activité récente,
 * avec l'autre participant, le dernier message et le nombre de non-lus.
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const limit  = Math.min(parseInt(req.query.limit) || 20, 50);
        const offset = parseInt(req.query.offset) || 0;

        const rows = await listConversations(req.userId, { limit, offset });

        const conversations = rows.map((c) => ({
            id: c.id,
            autre: {
                id:              c.autre_id,
                nom_utilisateur: c.autre_username,
                prenom:          c.autre_prenom,
                nom:             c.autre_nom,
                photo_url:       buildPhotoUrl(req, c.autre_id, c.autre_username)
            },
            dernier_message: c.dernier_message_id ? {
                id:          c.dernier_message_id,
                contenu:     c.dernier_contenu,
                media:       c.dernier_media,
                media_url:   buildMessageMediaUrl(req, c.id, c.dernier_message_id, c.dernier_media),
                emetteur_id: c.dernier_emetteur_id,
                created_at:  c.dernier_message_at
            } : null,
            non_lus:    c.non_lus,
            updated_at: c.updated_at
        }));

        sendSuccess(res, `${conversations.length} conversation(s)`, { conversations });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * POST /conversations
 * Body: { username }
 * Récupère (ou crée) la conversation avec un utilisateur. Idempotent.
 */
router.post('/', authenticate, async (req, res) => {
    try {
        const username = (req.body?.username || '').trim();
        if (!username) {
            return sendError(res, 'username requis', 400, null, 'USERNAME_REQUIRED');
        }

        const target = await getUserByUsername(username);
        if (!target) return notFoundResponse(res, 'Utilisateur');

        if (target.id === req.userId) {
            return sendError(res, 'Impossible de discuter avec soi-même', 400, null, 'SELF_CONVERSATION_FORBIDDEN');
        }

        const conversation = await getOrCreateConversation(req.userId, target.id);

        sendSuccess(res, 'Conversation prête', {
            id: conversation.id,
            autre: {
                id:              target.id,
                nom_utilisateur: target.nom_utilisateur,
                prenom:          target.prenom,
                nom:             target.nom,
                photo_url:       buildPhotoUrl(req, target.id, target.nom_utilisateur)
            },
            updated_at: conversation.updated_at
        });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * GET /conversations/:id/messages?limit=&before=
 * Historique paginé (curseur `before` = id du plus ancien message déjà chargé).
 * Renvoie du plus récent au plus ancien.
 */
router.get('/:id/messages', authenticate, async (req, res) => {
    try {
        const conversationId = parseInt(req.params.id);
        if (isNaN(conversationId)) {
            return sendError(res, 'id de conversation invalide', 400, null, 'INVALID_CONVERSATION_ID');
        }

        if (!(await isParticipant(conversationId, req.userId))) {
            return sendError(res, 'Accès refusé à cette conversation', 403, null, 'FORBIDDEN');
        }

        const limit    = Math.min(parseInt(req.query.limit) || 30, 50);
        const beforeId = req.query.before ? parseInt(req.query.before) : null;

        const rows = await getMessages(conversationId, { limit, beforeId });
        const messages = rows.map((m) => formatMessage(req, conversationId, m));

        sendSuccess(res, `${messages.length} message(s)`, { messages });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * POST /conversations/:id/read
 * Marque comme lus les messages reçus de la conversation (fallback REST du
 * socket `message:read`). Renvoie le nombre de messages marqués.
 */
router.post('/:id/read', authenticate, async (req, res) => {
    try {
        const conversationId = parseInt(req.params.id);
        if (isNaN(conversationId)) {
            return sendError(res, 'id de conversation invalide', 400, null, 'INVALID_CONVERSATION_ID');
        }

        if (!(await isParticipant(conversationId, req.userId))) {
            return sendError(res, 'Accès refusé à cette conversation', 403, null, 'FORBIDDEN');
        }

        const messageIds = await markRead(conversationId, req.userId);
        sendSuccess(res, 'Conversation marquée comme lue', { messageIds, count: messageIds.length });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * GET /conversations/:id/messages/:messageId/media
 * Sert le fichier image d'un message (nommé {conversationId}_{messageId}.webp).
 * Réservé aux participants de la conversation.
 */
router.get('/:id/messages/:messageId/media', authenticate, async (req, res) => {
    try {
        const conversationId = parseInt(req.params.id);
        const messageId = parseInt(req.params.messageId);
        if (isNaN(conversationId) || isNaN(messageId)) {
            return sendError(res, 'Identifiants invalides', 400, null, 'INVALID_IDS');
        }

        if (!(await isParticipant(conversationId, req.userId))) {
            return sendError(res, 'Accès refusé à cette conversation', 403, null, 'FORBIDDEN');
        }

        if (!messageMediaExists(conversationId, messageId)) {
            return notFoundResponse(res, 'Média');
        }

        res.sendFile(getMessageMediaPath(conversationId, messageId));
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * POST /conversations/:id/media
 * Envoie un message avec image (form-data, champ "media", + "contenu" optionnel).
 * Persiste le message, écrit le fichier {conversationId}_{messageId}.webp,
 * puis diffuse en temps réel comme un message socket classique.
 */
router.post('/:id/media', authenticate, uploadMessageMedia, async (req, res) => {
    try {
        const conversationId = parseInt(req.params.id);
        if (isNaN(conversationId)) {
            return sendError(res, 'id de conversation invalide', 400, null, 'INVALID_CONVERSATION_ID');
        }
        if (!req.file) {
            return sendError(res, 'Aucun fichier "media" fourni', 400, null, 'MEDIA_REQUIRED');
        }
        if (!(await isParticipant(conversationId, req.userId))) {
            return sendError(res, 'Accès refusé à cette conversation', 403, null, 'FORBIDDEN');
        }

        const contenu = typeof req.body?.contenu === 'string' ? req.body.contenu.trim() : null;

        // 1. Créer le message (media = true) pour obtenir l'id (nommage du fichier).
        const message = await createMessage({
            conversationId,
            emetteurId: req.userId,
            contenu: contenu || null,
            media: true
        });

        // 2. Écrire le fichier. En cas d'échec, rollback du message.
        try {
            await saveMessageMedia(req.file.buffer, conversationId, message.id);
        } catch (e) {
            await deleteMessage(message.id);
            return internalErrorResponse(res, e);
        }

        // 3. Diffuser en temps réel (même forme que le socket message:send).
        const io = req.app.get('io');
        if (io) {
            io.to(`conv:${conversationId}`).emit(SOCKET_EVENTS.MESSAGE_NEW, message);
            const conv = await getConversationById(conversationId);
            const destinataire = autreParticipant(conv, req.userId);
            io.to(`user:${destinataire}`).emit(SOCKET_EVENTS.CONVERSATION_UPDATED, {
                conversationId, message
            });
        }

        sendSuccess(res, 'Message média envoyé', {
            message: formatMessage(req, conversationId, message)
        }, 201);
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

export default router;
