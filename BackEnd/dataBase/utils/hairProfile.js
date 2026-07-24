import { pool, query } from '../dbConnect.js';

const PROFILE = 's_afro_dev.profil_capillaire';
const PHOTO = 's_afro_dev.photo_profil_capillaire';
const PRESTATION_FIELD = 's_afro_dev.prestation_champ_profil';

const PROFILE_COLUMNS = [
    'longueur_texte', 'longueur_cm', 'densite', 'texture_texte', 'texture_code',
    'etat_actuel', 'naturel_defrise', 'traitements_chimiques', 'date_dernier_traitement',
    'sensibilite_cuir_chevelu', 'extensions', 'extensions_type', 'preferences_allergies'
];

export const getHairProfile = async (userId) => {
    const result = await query(`
        SELECT p.*,
               COALESCE((SELECT jsonb_agg(jsonb_build_object(
                   'numero', ph.numero, 'date_prise', ph.date_prise, 'date_upload', ph.date_upload
               ) ORDER BY ph.numero) FROM ${PHOTO} ph WHERE ph.user_id = p.user_id), '[]'::jsonb) AS photos
        FROM ${PROFILE} p WHERE p.user_id = $1
    `, [userId]);
    return result.rows[0] || null;
};

export const upsertHairProfile = async (userId, data) => {
    const values = PROFILE_COLUMNS.map((column) => data[column] ?? null);
    const placeholders = PROFILE_COLUMNS.map((_, index) => `$${index + 2}`).join(', ');
    const updates = PROFILE_COLUMNS.map((column) => `${column} = EXCLUDED.${column}`).join(', ');
    await query(`
        INSERT INTO ${PROFILE} (user_id, ${PROFILE_COLUMNS.join(', ')})
        VALUES ($1, ${placeholders})
        ON CONFLICT (user_id) DO UPDATE SET ${updates}
    `, [userId, ...values]);
    return getHairProfile(userId);
};

export const replaceHairProfilePhotos = async (userId, dates) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM ${PHOTO} WHERE user_id = $1`, [userId]);
        for (let numero = 0; numero < dates.length; numero++) {
            await client.query(
                `INSERT INTO ${PHOTO} (user_id, numero, date_prise) VALUES ($1, $2, $3)`,
                [userId, numero, dates[numero]]
            );
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export const getHairProfilePhoto = async (userId, numero) => {
    const result = await query(
        `SELECT numero, date_prise, date_upload FROM ${PHOTO} WHERE user_id = $1 AND numero = $2`,
        [userId, numero]
    );
    return result.rows[0] || null;
};

export const replacePrestationHairProfileFields = async (prestationId, fields) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM ${PRESTATION_FIELD} WHERE prestation_id = $1`, [prestationId]);
        for (const field of fields) {
            await client.query(
                `INSERT INTO ${PRESTATION_FIELD} (prestation_id, champ_profil) VALUES ($1, $2)`,
                [prestationId, field]
            );
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export const getPrestationHairProfileFields = async (prestationId) => {
    const result = await query(
        `SELECT champ_profil FROM ${PRESTATION_FIELD} WHERE prestation_id = $1 ORDER BY champ_profil`,
        [prestationId]
    );
    return result.rows.map((row) => row.champ_profil);
};
