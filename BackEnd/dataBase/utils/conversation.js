import { query } from '../dbConnect.js';

const CONV = 's_afro_dev.conversation';
const MSG  = 's_afro_dev.message';
const USER = 's_afro_dev.utilisateur';

/**
 * Ordonne une paire d'ids en (a, b) avec a < b (tri NUMÉRIQUE).
 * Indispensable pour respecter la contrainte chk_ordre_participants
 * et garantir l'unicité de la conversation entre deux users.
 * @param {number} u1
 * @param {number} u2
 * @returns {[number, number]}
 */
const ordonner = (u1, u2) => (u1 < u2 ? [u1, u2] : [u2, u1]);

/**
 * Récupère la conversation entre deux users, ou la crée si elle n'existe pas.
 * @param {number} userId1
 * @param {number} userId2
 * @returns {Promise<object>} la conversation
 */
export const getOrCreateConversation = async (userId1, userId2) => {
    const [a, b] = ordonner(userId1, userId2);
    // ON CONFLICT ... DO UPDATE (no-op) permet de RETURNING la ligne existante.
    const sql = `
        INSERT INTO ${CONV} (participant_a, participant_b)
        VALUES ($1, $2)
        ON CONFLICT (participant_a, participant_b)
        DO UPDATE SET participant_a = EXCLUDED.participant_a
        RETURNING *
    `;
    const result = await query(sql, [a, b]);
    return result.rows[0];
};

/**
 * Récupère une conversation par son id.
 * @param {number} conversationId
 * @returns {Promise<object|null>}
 */
export const getConversationById = async (conversationId) => {
    const sql = `SELECT * FROM ${CONV} WHERE id = $1`;
    const result = await query(sql, [conversationId]);
    return result.rows[0] || null;
};

/**
 * Vérifie que userId est bien un participant de la conversation.
 * Utilisé pour l'autorisation (rejoindre une room, envoyer/lire un message).
 * @param {number} conversationId
 * @param {number} userId
 * @returns {Promise<boolean>}
 */
export const isParticipant = async (conversationId, userId) => {
    const sql = `
        SELECT 1 FROM ${CONV}
        WHERE id = $1 AND (participant_a = $2 OR participant_b = $2)
    `;
    const result = await query(sql, [conversationId, userId]);
    return result.rows.length > 0;
};

/**
 * Renvoie l'id de l'autre participant d'une conversation.
 * @param {object} conversation - ligne de la table conversation
 * @param {number} userId
 * @returns {number} id de l'autre participant
 */
export const autreParticipant = (conversation, userId) =>
    conversation.participant_a === userId
        ? conversation.participant_b
        : conversation.participant_a;

/**
 * Liste les conversations d'un utilisateur, triées par activité récente,
 * avec l'autre participant, le dernier message (preview) et le nombre de non-lus.
 * @param {number} userId
 * @param {{ limit?: number, offset?: number }} pagination
 * @returns {Promise<object[]>}
 */
export const listConversations = async (userId, { limit = 20, offset = 0 } = {}) => {
    const sql = `
        SELECT
            c.id,
            c.participant_a,
            c.participant_b,
            c.updated_at,
            u.id              AS autre_id,
            u.nom_utilisateur AS autre_username,
            u.prenom          AS autre_prenom,
            u.nom             AS autre_nom,
            m.id              AS dernier_message_id,
            m.contenu         AS dernier_contenu,
            m.media           AS dernier_media,
            m.emetteur_id     AS dernier_emetteur_id,
            m.created_at      AS dernier_message_at,
            (
                SELECT COUNT(*)::int FROM ${MSG} nm
                WHERE nm.conversation_id = c.id
                  AND nm.emetteur_id <> $1
                  AND nm.lu = FALSE
            ) AS non_lus
        FROM ${CONV} c
        JOIN ${USER} u
          ON u.id = CASE WHEN c.participant_a = $1 THEN c.participant_b ELSE c.participant_a END
        LEFT JOIN ${MSG} m ON m.id = c.dernier_message_id
        WHERE c.participant_a = $1 OR c.participant_b = $1
        ORDER BY c.updated_at DESC
        LIMIT $2 OFFSET $3
    `;
    const result = await query(sql, [userId, limit, offset]);
    return result.rows;
};
