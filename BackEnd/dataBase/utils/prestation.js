import { query } from '../dbConnect.js';

const TABLE = 's_afro_dev.prestation';

const COLS = `id, coiffeur_id, nom, categorie, prix, unite_prix, duree_min,
              materiel_client, description, media_count, actif, created_at`;

/**
 * Crée une prestation (media_count = 0 ; les médias sont uploadés ensuite).
 * @param {object} data
 * @returns {Promise<object>}
 */
export const createPrestation = async (data) => {
    const {
        coiffeurId, nom, categorie = null, prix = null,
        unite_prix = 'forfait', duree_min = null,
        materiel_client = false, description = null
    } = data;

    const sql = `
        INSERT INTO ${TABLE}
            (coiffeur_id, nom, categorie, prix, unite_prix, duree_min, materiel_client, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING ${COLS}
    `;
    const result = await query(sql, [
        coiffeurId, nom, categorie, prix, unite_prix, duree_min, materiel_client, description
    ]);
    return result.rows[0];
};

/**
 * Récupère une prestation par id.
 * @param {number} id
 * @returns {Promise<object|null>}
 */
export const getPrestationById = async (id) => {
    const result = await query(`SELECT ${COLS} FROM ${TABLE} WHERE id = $1`, [id]);
    return result.rows[0] || null;
};

/**
 * Liste les prestations d'un coiffeur.
 * @param {number} coiffeurId
 * @param {{ includeInactive?: boolean }} options
 * @returns {Promise<object[]>}
 */
export const listPrestations = async (coiffeurId, { includeInactive = false } = {}) => {
    const filtreActif = includeInactive ? '' : 'AND actif = TRUE';
    const sql = `
        SELECT ${COLS} FROM ${TABLE}
        WHERE coiffeur_id = $1 ${filtreActif}
        ORDER BY actif DESC, created_at DESC
    `;
    const result = await query(sql, [coiffeurId]);
    return result.rows;
};

/** Champs modifiables d'une prestation. */
const CHAMPS_AUTORISES = [
    'nom', 'categorie', 'prix', 'unite_prix', 'duree_min',
    'materiel_client', 'description', 'actif'
];

/**
 * Met à jour une prestation. Ne touche pas à media_count (voir setPrestationMediaCount).
 * @param {number} id
 * @param {object} updates
 * @returns {Promise<object|null>}
 */
export const updatePrestation = async (id, updates) => {
    const setClauses = [];
    const vals = [];
    let i = 1;

    for (const champ of CHAMPS_AUTORISES) {
        if (updates[champ] !== undefined) {
            setClauses.push(`${champ} = $${i++}`);
            vals.push(updates[champ]);
        }
    }
    if (setClauses.length === 0) return getPrestationById(id);

    vals.push(id);
    const sql = `UPDATE ${TABLE} SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING ${COLS}`;
    const result = await query(sql, vals);
    return result.rows[0] || null;
};

/** Met à jour le nombre de médias après upload. */
export const setPrestationMediaCount = async (id, count) => {
    const result = await query(
        `UPDATE ${TABLE} SET media_count = $2 WHERE id = $1 RETURNING ${COLS}`,
        [id, count]
    );
    return result.rows[0] || null;
};

/** Soft delete : masque la prestation sans perdre l'historique. */
export const deactivatePrestation = async (id) => {
    const result = await query(
        `UPDATE ${TABLE} SET actif = FALSE WHERE id = $1 RETURNING id`,
        [id]
    );
    return result.rowCount > 0;
};

/** Suppression définitive (rare : utilisé pour le nettoyage des médias). */
export const deletePrestation = async (id) => {
    const result = await query(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
    return result.rowCount > 0;
};
