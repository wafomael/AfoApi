import { query } from '../dbConnect.js';

const TABLE = 's_afro_dev.avis';
const USER  = 's_afro_dev.utilisateur';

/**
 * Crée ou met à jour l'avis d'un client pour un rendez-vous terminé.
 * Le trigger SQL recalcule note_moyenne/nb_avis du coiffeur.
 * @param {object} data - { rendezVousId, clientId, coiffeurId, note, commentaire }
 * @returns {Promise<object>}
 */
export const upsertAvis = async ({ rendezVousId, clientId, coiffeurId, note, commentaire = null }) => {
    const sql = `
        INSERT INTO ${TABLE} (rendez_vous_id, client_id, coiffeur_id, note, commentaire)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (rendez_vous_id)
        DO UPDATE SET note = EXCLUDED.note,
                      commentaire = EXCLUDED.commentaire,
                      updated_at = NOW()
        RETURNING id, rendez_vous_id, client_id, coiffeur_id, note, commentaire, created_at, updated_at
    `;
    const result = await query(sql, [rendezVousId, clientId, coiffeurId, note, commentaire]);
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
        SELECT a.id, a.rendez_vous_id, a.note, a.commentaire, a.created_at, a.updated_at,
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
        SELECT id, rendez_vous_id, client_id, coiffeur_id, note, commentaire, created_at, updated_at
        FROM ${TABLE}
        WHERE client_id = $1 AND coiffeur_id = $2
        ORDER BY created_at DESC
        LIMIT 1
    `;
    const result = await query(sql, [clientId, coiffeurId]);
    return result.rows[0] || null;
};

/**
 * Supprime l'avis d'un client (seul l'auteur peut supprimer le sien).
 * @param {number} clientId
 * @param {number} coiffeurId
 * @param {number} rendezVousId
 * @returns {Promise<boolean>}
 */
export const deleteAvis = async (clientId, coiffeurId, rendezVousId) => {
    const result = await query(
        `DELETE FROM ${TABLE} WHERE client_id = $1 AND coiffeur_id = $2 AND rendez_vous_id = $3`,
        [clientId, coiffeurId, rendezVousId]
    );
    return result.rowCount > 0;
};
