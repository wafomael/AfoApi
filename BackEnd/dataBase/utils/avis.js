import { query } from '../dbConnect.js';

const TABLE = 's_afro_dev.avis';
const USER  = 's_afro_dev.utilisateur';

/**
 * Crée ou met à jour l'avis d'un client sur un coiffeur (un seul par paire).
 * Le trigger SQL recalcule note_moyenne/nb_avis du coiffeur.
 * @param {object} data - { clientId, coiffeurId, note, commentaire }
 * @returns {Promise<object>}
 */
export const upsertAvis = async ({ clientId, coiffeurId, note, commentaire = null }) => {
    const sql = `
        INSERT INTO ${TABLE} (client_id, coiffeur_id, note, commentaire)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (client_id, coiffeur_id)
        DO UPDATE SET note = EXCLUDED.note,
                      commentaire = EXCLUDED.commentaire,
                      created_at = NOW()
        RETURNING id, client_id, coiffeur_id, note, commentaire, created_at
    `;
    const result = await query(sql, [clientId, coiffeurId, note, commentaire]);
    return result.rows[0];
};

/**
 * Liste les avis reçus par un coiffeur, avec l'auteur (infos publiques).
 * @param {number} coiffeurId
 * @param {{ limit?: number, offset?: number }} pagination
 * @returns {Promise<object[]>}
 */
export const listAvis = async (coiffeurId, { limit = 20, offset = 0 } = {}) => {
    const sql = `
        SELECT a.id, a.note, a.commentaire, a.created_at,
               u.id AS client_id, u.nom_utilisateur AS client_username,
               u.prenom AS client_prenom, u.nom AS client_nom
        FROM ${TABLE} a
        JOIN ${USER} u ON u.id = a.client_id
        WHERE a.coiffeur_id = $1
        ORDER BY a.created_at DESC
        LIMIT $2 OFFSET $3
    `;
    const result = await query(sql, [coiffeurId, limit, offset]);
    return result.rows;
};

/**
 * Récupère l'avis d'un client donné sur un coiffeur (null sinon).
 * @param {number} clientId
 * @param {number} coiffeurId
 * @returns {Promise<object|null>}
 */
export const getAvisByClient = async (clientId, coiffeurId) => {
    const sql = `
        SELECT id, client_id, coiffeur_id, note, commentaire, created_at
        FROM ${TABLE}
        WHERE client_id = $1 AND coiffeur_id = $2
    `;
    const result = await query(sql, [clientId, coiffeurId]);
    return result.rows[0] || null;
};

/**
 * Supprime l'avis d'un client (seul l'auteur peut supprimer le sien).
 * @param {number} clientId
 * @param {number} coiffeurId
 * @returns {Promise<boolean>}
 */
export const deleteAvis = async (clientId, coiffeurId) => {
    const result = await query(
        `DELETE FROM ${TABLE} WHERE client_id = $1 AND coiffeur_id = $2`,
        [clientId, coiffeurId]
    );
    return result.rowCount > 0;
};
