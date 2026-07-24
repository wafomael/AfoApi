import { query } from '../dbConnect.js';

const TABLE = 's_afro_dev.prestation';
const CATEGORIE = 's_afro_dev.categorie';
const SOUS_TYPE = 's_afro_dev.sous_type';
const PRESTATION_TAG = 's_afro_dev.prestation_tag';
const TAG = 's_afro_dev.tag';

const SELECT_ENRICHI = `
    SELECT p.id, p.coiffeur_id, p.nom, p.categorie, p.categorie_id, p.sous_type_id,
           p.prix, p.unite_prix, p.duree_min, p.materiel_client, p.description,
           p.media_count, p.actif, p.created_at,
           CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
               'id', c.id, 'nom', c.nom, 'slug', c.slug, 'icone', c.icone
           ) END AS categorie_detail,
           CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
               'id', s.id, 'categorie_id', s.categorie_id, 'nom', s.nom, 'slug', s.slug
           ) END AS sous_type,
           COALESCE((SELECT jsonb_agg(jsonb_build_object(
               'id', t.id, 'nom', t.nom, 'slug', t.slug, 'type', t.type
           ) ORDER BY t.type, t.nom)
           FROM ${PRESTATION_TAG} pt JOIN ${TAG} t ON t.id = pt.tag_id
           WHERE pt.prestation_id = p.id), '[]'::jsonb) AS tags,
           ARRAY(SELECT pcp.champ_profil
                 FROM s_afro_dev.prestation_champ_profil pcp
                 WHERE pcp.prestation_id = p.id
                 ORDER BY pcp.champ_profil) AS champs_profil_demandes
    FROM ${TABLE} p
    LEFT JOIN ${CATEGORIE} c ON c.id = p.categorie_id
    LEFT JOIN ${SOUS_TYPE} s ON s.id = p.sous_type_id
`;

/**
 * Crée une prestation (media_count = 0 ; les médias sont uploadés ensuite).
 * @param {object} data
 * @returns {Promise<object>}
 */
export const createPrestation = async (data) => {
    const {
        coiffeurId, nom, categorie = null, categorie_id = null, sous_type_id = null,
        prix = null, unite_prix = 'forfait', duree_min = null,
        materiel_client = false, description = null
    } = data;

    const sql = `
        INSERT INTO ${TABLE}
            (coiffeur_id, nom, categorie, categorie_id, sous_type_id, prix, unite_prix, duree_min, materiel_client, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
    `;
    const result = await query(sql, [
        coiffeurId, nom, categorie, categorie_id, sous_type_id, prix,
        unite_prix, duree_min, materiel_client, description
    ]);
    return getPrestationById(result.rows[0].id);
};

/**
 * Récupère une prestation par id.
 * @param {number} id
 * @returns {Promise<object|null>}
 */
export const getPrestationById = async (id) => {
    const result = await query(`${SELECT_ENRICHI} WHERE p.id = $1`, [id]);
    return result.rows[0] || null;
};

/**
 * Liste les prestations d'un coiffeur.
 * @param {number} coiffeurId
 * @param {{ includeInactive?: boolean }} options
 * @returns {Promise<object[]>}
 */
export const listPrestations = async (coiffeurId, {
    includeInactive = false, categorieId = null, sousTypeId = null, tagIds = []
} = {}) => {
    const values = [coiffeurId];
    const filters = ['p.coiffeur_id = $1'];
    if (!includeInactive) filters.push('p.actif = TRUE');
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
        filters.push(`p.id IN (
            SELECT pt.prestation_id FROM ${PRESTATION_TAG} pt
            WHERE pt.tag_id = ANY($${values.length}::int[])
            GROUP BY pt.prestation_id HAVING COUNT(DISTINCT pt.tag_id) = $${values.length + 1}
        )`);
        values.push(tagIds.length);
    }
    const sql = `${SELECT_ENRICHI}
        WHERE ${filters.join(' AND ')}
        ORDER BY p.actif DESC, p.created_at DESC`;
    const result = await query(sql, values);
    return result.rows;
};

/** Champs modifiables d'une prestation. */
const CHAMPS_AUTORISES = [
    'nom', 'categorie', 'categorie_id', 'sous_type_id', 'prix', 'unite_prix', 'duree_min',
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
    const sql = `UPDATE ${TABLE} SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING id`;
    const result = await query(sql, vals);
    return result.rows[0] ? getPrestationById(result.rows[0].id) : null;
};

/** Met à jour le nombre de médias après upload. */
export const setPrestationMediaCount = async (id, count) => {
    const result = await query(
        `UPDATE ${TABLE} SET media_count = $2 WHERE id = $1 RETURNING id`,
        [id, count]
    );
    return result.rows[0] ? getPrestationById(result.rows[0].id) : null;
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
