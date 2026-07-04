import { query } from '../dbConnect.js';

const ACC = 's_afro_dev.accomplissement';
const UA  = 's_afro_dev.utilisateur_accomplissement';

/**
 * Liste le catalogue complet des accomplissements (badges).
 * @returns {Promise<object[]>}
 */
export const listAccomplissements = async () => {
    const result = await query(
        `SELECT id, code, nom, icone, condition FROM ${ACC} ORDER BY id`
    );
    return result.rows;
};

/**
 * Liste les accomplissements débloqués par un utilisateur (avec date).
 * @param {number} userId
 * @returns {Promise<object[]>}
 */
export const listUserAccomplissements = async (userId) => {
    const sql = `
        SELECT a.id, a.code, a.nom, a.icone, a.condition, ua.obtenu_le
        FROM ${UA} ua
        JOIN ${ACC} a ON a.id = ua.accomplissement_id
        WHERE ua.user_id = $1
        ORDER BY ua.obtenu_le DESC
    `;
    const result = await query(sql, [userId]);
    return result.rows;
};

/**
 * Débloque un accomplissement pour un utilisateur (idempotent).
 * @param {number} userId
 * @param {string} code - code technique de l'accomplissement
 * @returns {Promise<boolean>} true si nouvellement débloqué
 */
export const grantAccomplissement = async (userId, code) => {
    const sql = `
        INSERT INTO ${UA} (user_id, accomplissement_id)
        SELECT $1, a.id FROM ${ACC} a WHERE a.code = $2
        ON CONFLICT DO NOTHING
        RETURNING user_id
    `;
    const result = await query(sql, [userId, code]);
    return result.rowCount > 0;
};
