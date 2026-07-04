import { query } from '../dbConnect.js';

const PUB    = 's_afro_dev.publication';
const CAURIS = 's_afro_dev.cauris';
const USER   = 's_afro_dev.utilisateur';

/**
 * Crée une publication (media_count = 0 ; médias uploadés ensuite).
 * @param {{ userId: number, legende?: string|null }} data
 * @returns {Promise<object>}
 */
export const createPublication = async ({ userId, legende = null }) => {
    const sql = `
        INSERT INTO ${PUB} (user_id, legende)
        VALUES ($1, $2)
        RETURNING id, user_id, legende, media_count, created_at
    `;
    const result = await query(sql, [userId, legende]);
    return result.rows[0];
};

/** Met à jour le nombre de médias après upload. */
export const setPublicationMediaCount = async (id, count) => {
    const result = await query(
        `UPDATE ${PUB} SET media_count = $2 WHERE id = $1
         RETURNING id, user_id, legende, media_count, created_at`,
        [id, count]
    );
    return result.rows[0] || null;
};

/**
 * Récupère une publication enrichie (auteur, nb cauris, liké par viewer).
 * @param {number} id
 * @param {number|null} viewerId
 * @returns {Promise<object|null>}
 */
export const getPublicationById = async (id, viewerId = null) => {
    const sql = `
        SELECT p.id, p.user_id, p.legende, p.media_count, p.created_at,
               u.nom_utilisateur AS auteur_username,
               u.prenom AS auteur_prenom, u.nom AS auteur_nom,
               (SELECT COUNT(*)::int FROM ${CAURIS} c WHERE c.publication_id = p.id) AS cauris_count,
               EXISTS (
                   SELECT 1 FROM ${CAURIS} c
                   WHERE c.publication_id = p.id AND c.user_id = $2
               ) AS liked
        FROM ${PUB} p
        JOIN ${USER} u ON u.id = p.user_id
        WHERE p.id = $1
    `;
    const result = await query(sql, [id, viewerId]);
    return result.rows[0] || null;
};

/**
 * Liste les publications d'un utilisateur (feed de profil).
 * @param {number} userId - auteur des publications
 * @param {{ viewerId?: number|null, limit?: number, offset?: number }} options
 * @returns {Promise<object[]>}
 */
export const listPublications = async (userId, { viewerId = null, limit = 20, offset = 0 } = {}) => {
    const sql = `
        SELECT p.id, p.user_id, p.legende, p.media_count, p.created_at,
               u.nom_utilisateur AS auteur_username,
               u.prenom AS auteur_prenom, u.nom AS auteur_nom,
               (SELECT COUNT(*)::int FROM ${CAURIS} c WHERE c.publication_id = p.id) AS cauris_count,
               EXISTS (
                   SELECT 1 FROM ${CAURIS} c
                   WHERE c.publication_id = p.id AND c.user_id = $2
               ) AS liked
        FROM ${PUB} p
        JOIN ${USER} u ON u.id = p.user_id
        WHERE p.user_id = $1
        ORDER BY p.created_at DESC
        LIMIT $3 OFFSET $4
    `;
    const result = await query(sql, [userId, viewerId, limit, offset]);
    return result.rows;
};

/**
 * Supprime une publication.
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export const deletePublication = async (id) => {
    const result = await query(`DELETE FROM ${PUB} WHERE id = $1`, [id]);
    return result.rowCount > 0;
};

/**
 * ============================================
 * CAURIS (likes)
 * ============================================
 */

/** Ajoute un cauris (idempotent). */
export const addCauris = async (userId, publicationId) => {
    await query(
        `INSERT INTO ${CAURIS} (user_id, publication_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [userId, publicationId]
    );
};

/** Retire un cauris. */
export const removeCauris = async (userId, publicationId) => {
    await query(
        `DELETE FROM ${CAURIS} WHERE user_id = $1 AND publication_id = $2`,
        [userId, publicationId]
    );
};

/** Nombre de cauris d'une publication. */
export const countCauris = async (publicationId) => {
    const result = await query(
        `SELECT COUNT(*)::int AS n FROM ${CAURIS} WHERE publication_id = $1`,
        [publicationId]
    );
    return result.rows[0].n;
};

/** Le viewer a-t-il liké cette publication ? */
export const hasCauris = async (userId, publicationId) => {
    const result = await query(
        `SELECT 1 FROM ${CAURIS} WHERE user_id = $1 AND publication_id = $2`,
        [userId, publicationId]
    );
    return result.rows.length > 0;
};
