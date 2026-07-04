import { query } from '../dbConnect.js';

const TABLE = 's_afro_dev.profil_utilisateur';

/**
 * Récupère le profil étendu d'un utilisateur.
 * La ligne est censée exister (trigger à l'inscription + backfill), mais on
 * renvoie un profil vide par défaut si elle manque.
 * @param {number} userId
 * @returns {Promise<object|null>}
 */
export const getProfilUtilisateur = async (userId) => {
    const sql = `
        SELECT user_id, bio, lien_externe, type_cheveux, coiffure_preferee, updated_at
        FROM ${TABLE}
        WHERE user_id = $1
    `;
    const result = await query(sql, [userId]);
    return result.rows[0] || null;
};

/**
 * Champs modifiables du profil étendu.
 */
const CHAMPS_AUTORISES = ['bio', 'lien_externe', 'type_cheveux', 'coiffure_preferee'];

/**
 * Met à jour (ou crée) le profil étendu d'un utilisateur.
 * Upsert : si la ligne n'existe pas encore, elle est créée.
 * @param {number} userId
 * @param {object} updates - { bio, lien_externe, type_cheveux, coiffure_preferee }
 * @returns {Promise<object>} le profil à jour
 */
export const upsertProfilUtilisateur = async (userId, updates) => {
    const cols = [];
    const vals = [userId];
    const setClauses = [];
    let i = 2;

    for (const champ of CHAMPS_AUTORISES) {
        if (updates[champ] !== undefined) {
            cols.push(champ);
            vals.push(updates[champ]);
            setClauses.push(`${champ} = EXCLUDED.${champ}`);
            i++;
        }
    }

    if (cols.length === 0) {
        // Rien à modifier : on garantit juste l'existence de la ligne.
        await query(
            `INSERT INTO ${TABLE} (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
            [userId]
        );
        return getProfilUtilisateur(userId);
    }

    const placeholders = cols.map((_, idx) => `$${idx + 2}`).join(', ');
    const sql = `
        INSERT INTO ${TABLE} (user_id, ${cols.join(', ')})
        VALUES ($1, ${placeholders})
        ON CONFLICT (user_id) DO UPDATE SET ${setClauses.join(', ')}
        RETURNING user_id, bio, lien_externe, type_cheveux, coiffure_preferee, updated_at
    `;
    const result = await query(sql, vals);
    return result.rows[0];
};
