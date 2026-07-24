import { query } from '../dbConnect.js';

const CATEGORIE = 's_afro_dev.categorie';
const SOUS_TYPE = 's_afro_dev.sous_type';
const TAG = 's_afro_dev.tag';
const PRESTATION_TAG = 's_afro_dev.prestation_tag';
const PUBLICATION_TAG = 's_afro_dev.publication_tag';

export const listTaxonomy = async () => {
    const [categoriesResult, tagsResult] = await Promise.all([
        query(`
            SELECT c.id, c.nom, c.slug, c.icone, c.ordre,
                   COALESCE(jsonb_agg(
                       jsonb_build_object('id', s.id, 'categorie_id', s.categorie_id, 'nom', s.nom, 'slug', s.slug, 'ordre', s.ordre)
                       ORDER BY s.ordre, s.nom
                   ) FILTER (WHERE s.id IS NOT NULL), '[]'::jsonb) AS sous_types
            FROM ${CATEGORIE} c
            LEFT JOIN ${SOUS_TYPE} s ON s.categorie_id = c.id AND s.actif = TRUE
            WHERE c.actif = TRUE
            GROUP BY c.id
            ORDER BY c.ordre, c.nom
        `),
        query(`SELECT id, nom, slug, type FROM ${TAG} WHERE actif = TRUE ORDER BY type, nom`)
    ]);
    return { categories: categoriesResult.rows, tags: tagsResult.rows };
};

export const validateTaxonomySelection = async ({ categorieId = null, sousTypeId = null, tagIds = [] }) => {
    if (sousTypeId !== null && categorieId === null) return false;
    if (sousTypeId !== null) {
        const subtype = await query(
            `SELECT 1 FROM ${SOUS_TYPE} WHERE id = $1 AND categorie_id = $2 AND actif = TRUE`,
            [sousTypeId, categorieId]
        );
        if (subtype.rows.length === 0) return false;
    } else if (categorieId !== null) {
        const category = await query(`SELECT 1 FROM ${CATEGORIE} WHERE id = $1 AND actif = TRUE`, [categorieId]);
        if (category.rows.length === 0) return false;
    }
    const uniqueTagIds = [...new Set(tagIds)];
    if (uniqueTagIds.length > 0) {
        const tags = await query(`SELECT id FROM ${TAG} WHERE id = ANY($1::int[]) AND actif = TRUE`, [uniqueTagIds]);
        if (tags.rows.length !== uniqueTagIds.length) return false;
    }
    return true;
};

const replaceTags = async (table, idColumn, entityId, tagIds) => {
    await query(`DELETE FROM ${table} WHERE ${idColumn} = $1`, [entityId]);
    const uniqueTagIds = [...new Set(tagIds)];
    if (uniqueTagIds.length > 0) {
        await query(
            `INSERT INTO ${table} (${idColumn}, tag_id) SELECT $1, UNNEST($2::int[]) ON CONFLICT DO NOTHING`,
            [entityId, uniqueTagIds]
        );
    }
};

export const replacePrestationTags = (prestationId, tagIds) =>
    replaceTags(PRESTATION_TAG, 'prestation_id', prestationId, tagIds);

export const replacePublicationTags = (publicationId, tagIds) =>
    replaceTags(PUBLICATION_TAG, 'publication_id', publicationId, tagIds);
