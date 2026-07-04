import { query } from '../dbConnect.js';

const MSG = 's_afro_dev.message';

/**
 * Crée un message. Le trigger SQL met à jour la conversation
 * (updated_at + dernier_message_id) automatiquement.
 *
 * `media` indique seulement la PRÉSENCE d'un fichier (nommé
 * {conversation_id}_{id}.webp). L'URL n'est jamais stockée : on la reconstruit.
 * @param {{ conversationId: number, emetteurId: number, contenu?: string|null, media?: boolean }} data
 * @returns {Promise<object>} le message créé
 */
export const createMessage = async ({ conversationId, emetteurId, contenu = null, media = false }) => {
    const sql = `
        INSERT INTO ${MSG} (conversation_id, emetteur_id, contenu, media)
        VALUES ($1, $2, $3, $4)
        RETURNING *
    `;
    const result = await query(sql, [conversationId, emetteurId, contenu, media]);
    return result.rows[0];
};

/**
 * Met à jour le flag media d'un message (après écriture/échec du fichier).
 * @param {number} messageId
 * @param {boolean} [value=true]
 * @returns {Promise<void>}
 */
export const setMessageMedia = async (messageId, value = true) => {
    await query(`UPDATE ${MSG} SET media = $2 WHERE id = $1`, [messageId, value]);
};

/**
 * Supprime un message (utilisé pour le rollback si l'écriture du média échoue).
 * @param {number} messageId
 * @returns {Promise<void>}
 */
export const deleteMessage = async (messageId) => {
    await query(`DELETE FROM ${MSG} WHERE id = $1`, [messageId]);
};

/**
 * Historique paginé d'une conversation (du plus récent au plus ancien).
 * Pagination par curseur : passer `beforeId` pour charger les messages
 * plus anciens (scroll vers le haut).
 * @param {number} conversationId
 * @param {{ limit?: number, beforeId?: number|null }} options
 * @returns {Promise<object[]>}
 */
export const getMessages = async (conversationId, { limit = 30, beforeId = null } = {}) => {
    const params = [conversationId];
    let filtreCurseur = '';
    if (beforeId) {
        params.push(beforeId);
        filtreCurseur = `AND id < $${params.length}`;
    }
    params.push(limit);

    const sql = `
        SELECT * FROM ${MSG}
        WHERE conversation_id = $1 ${filtreCurseur}
        ORDER BY id DESC
        LIMIT $${params.length}
    `;
    const result = await query(sql, params);
    return result.rows;
};

/**
 * Marque comme lus tous les messages reçus (non envoyés par le lecteur)
 * et non encore lus d'une conversation.
 * @param {number} conversationId
 * @param {number} lecteurId - l'utilisateur qui lit
 * @returns {Promise<number[]>} ids des messages marqués lus
 */
export const markRead = async (conversationId, lecteurId) => {
    const sql = `
        UPDATE ${MSG}
           SET lu = TRUE
         WHERE conversation_id = $1
           AND emetteur_id <> $2
           AND lu = FALSE
        RETURNING id
    `;
    const result = await query(sql, [conversationId, lecteurId]);
    return result.rows.map((r) => r.id);
};
