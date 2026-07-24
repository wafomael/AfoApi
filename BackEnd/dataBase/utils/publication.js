import { query } from '../dbConnect.js';

const PUB    = 's_afro_dev.publication';
const CAURIS = 's_afro_dev.cauris';
const USER   = 's_afro_dev.utilisateur';
const CATEGORIE = 's_afro_dev.categorie';
const SOUS_TYPE = 's_afro_dev.sous_type';
const PUBLICATION_TAG = 's_afro_dev.publication_tag';
const TAG = 's_afro_dev.tag';

const TAXONOMY_SELECT = `
    CASE WHEN cat.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', cat.id, 'nom', cat.nom, 'slug', cat.slug, 'icone', cat.icone
    ) END AS categorie_detail,
    CASE WHEN st.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', st.id, 'categorie_id', st.categorie_id, 'nom', st.nom, 'slug', st.slug
    ) END AS sous_type,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'nom', t.nom, 'slug', t.slug, 'type', t.type
    ) ORDER BY t.type, t.nom)
    FROM ${PUBLICATION_TAG} pt JOIN ${TAG} t ON t.id = pt.tag_id
    WHERE pt.publication_id = p.id), '[]'::jsonb) AS tags
`;

/**
 * Crée une publication (media_count = 0 ; médias uploadés ensuite).
 * @param {{ userId: number, legende?: string|null }} data
 * @returns {Promise<object>}
 */
export const createPublication = async ({ userId, legende = null, categorieId = null, sousTypeId = null }) => {
    const sql = `
        INSERT INTO ${PUB} (user_id, legende, categorie_id, sous_type_id)
        VALUES ($1, $2, $3, $4)
        RETURNING id, user_id, legende, categorie_id, sous_type_id, media_count, created_at
    `;
    const result = await query(sql, [userId, legende, categorieId, sousTypeId]);
    return result.rows[0];
};

/** Met à jour le nombre de médias après upload. */
export const setPublicationMediaCount = async (id, count) => {
    const result = await query(
        `UPDATE ${PUB} SET media_count = $2 WHERE id = $1
         RETURNING id, user_id, legende, categorie_id, sous_type_id, media_count, created_at`,
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
        SELECT p.id, p.user_id, p.legende, p.categorie_id, p.sous_type_id, p.media_count, p.created_at,
               u.nom_utilisateur AS auteur_username,
               u.prenom AS auteur_prenom, u.nom AS auteur_nom,
               ${TAXONOMY_SELECT},
               (SELECT COUNT(*)::int FROM ${CAURIS} c WHERE c.publication_id = p.id) AS cauris_count,
               EXISTS (
                   SELECT 1 FROM ${CAURIS} c
                   WHERE c.publication_id = p.id AND c.user_id = $2
               ) AS liked
        FROM ${PUB} p
        JOIN ${USER} u ON u.id = p.user_id
        LEFT JOIN ${CATEGORIE} cat ON cat.id = p.categorie_id
        LEFT JOIN ${SOUS_TYPE} st ON st.id = p.sous_type_id
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
export const listPublications = async (userId, {
    viewerId = null, limit = 20, offset = 0, categorieId = null, sousTypeId = null, tagIds = []
} = {}) => {
    const values = [userId, viewerId];
    const filters = ['p.user_id = $1'];
    if (categorieId !== null) {
        values.push(categorieId);
        filters.push(`p.categorie_id = $${values.length}`);
    }
    if (sousTypeId !== null) {
        values.push(sousTypeId);
        filters.push(`p.sous_type_id = $${values.length}`);
    }
    if (tagIds.length > 0) {
        values.push(tagIds);
        const tagArrayIndex = values.length;
        values.push(tagIds.length);
        filters.push(`p.id IN (
            SELECT pt.publication_id FROM ${PUBLICATION_TAG} pt
            WHERE pt.tag_id = ANY($${tagArrayIndex}::int[])
            GROUP BY pt.publication_id HAVING COUNT(DISTINCT pt.tag_id) = $${values.length}
        )`);
    }
    values.push(limit, offset);
    const limitIndex = values.length - 1;
    const offsetIndex = values.length;
    const sql = `
        SELECT p.id, p.user_id, p.legende, p.categorie_id, p.sous_type_id, p.media_count, p.created_at,
               u.nom_utilisateur AS auteur_username,
               u.prenom AS auteur_prenom, u.nom AS auteur_nom,
               ${TAXONOMY_SELECT},
               (SELECT COUNT(*)::int FROM ${CAURIS} c WHERE c.publication_id = p.id) AS cauris_count,
               EXISTS (
                   SELECT 1 FROM ${CAURIS} c
                   WHERE c.publication_id = p.id AND c.user_id = $2
               ) AS liked
        FROM ${PUB} p
        JOIN ${USER} u ON u.id = p.user_id
        LEFT JOIN ${CATEGORIE} cat ON cat.id = p.categorie_id
        LEFT JOIN ${SOUS_TYPE} st ON st.id = p.sous_type_id
        WHERE ${filters.join(' AND ')}
        ORDER BY p.created_at DESC
        LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `;
    const result = await query(sql, values);
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
