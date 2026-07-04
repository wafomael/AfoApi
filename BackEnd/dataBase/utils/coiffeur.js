import { query } from '../dbConnect.js';

const TABLE = 's_afro_dev.profil_coiffeur';

/**
 * Récupère le profil coiffeur d'un utilisateur (null si pas un pro / pas créé).
 * @param {number} userId
 * @returns {Promise<object|null>}
 */
export const getProfilCoiffeur = async (userId) => {
    const sql = `
        SELECT user_id, nom_salon, description, adresse, rayon_km,
               note_moyenne, nb_avis, updated_at
        FROM ${TABLE}
        WHERE user_id = $1
    `;
    const result = await query(sql, [userId]);
    return result.rows[0] || null;
};

/** Champs modifiables du profil coiffeur (note_moyenne/nb_avis = trigger). */
const CHAMPS_AUTORISES = ['nom_salon', 'description', 'adresse', 'rayon_km'];

/**
 * Met à jour (ou crée) le profil coiffeur d'un utilisateur.
 * @param {number} userId
 * @param {object} updates - { nom_salon, description, adresse, rayon_km }
 * @returns {Promise<object>} le profil à jour
 */
export const upsertProfilCoiffeur = async (userId, updates) => {
    const cols = [];
    const vals = [userId];
    const setClauses = [];

    for (const champ of CHAMPS_AUTORISES) {
        if (updates[champ] !== undefined) {
            cols.push(champ);
            vals.push(updates[champ]);
            setClauses.push(`${champ} = EXCLUDED.${champ}`);
        }
    }

    if (cols.length === 0) {
        await query(
            `INSERT INTO ${TABLE} (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
            [userId]
        );
        return getProfilCoiffeur(userId);
    }

    const placeholders = cols.map((_, idx) => `$${idx + 2}`).join(', ');
    const sql = `
        INSERT INTO ${TABLE} (user_id, ${cols.join(', ')})
        VALUES ($1, ${placeholders})
        ON CONFLICT (user_id) DO UPDATE SET ${setClauses.join(', ')}
        RETURNING user_id, nom_salon, description, adresse, rayon_km,
                  note_moyenne, nb_avis, updated_at
    `;
    const result = await query(sql, vals);
    return result.rows[0];
};
