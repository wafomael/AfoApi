import { query } from '../dbConnect.js';
import crypto from 'crypto';

const TABLE_NAME = process.env.DB_SCHEMA 
    ? `${process.env.DB_SCHEMA}.refresh_tokens` 
    : 'refresh_tokens';

/**
 * Générer un refresh token aléatoire sécurisé
 * @returns {string} Refresh token (64 caractères hex)
 */
export const generateRefreshToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

/**
 * Sauvegarder un refresh token en base
 * @param {number} userId - ID de l'utilisateur
 * @param {string} token - Le token à sauvegarder
 * @param {number} expiresInDays - Durée de validité en jours (défaut: 30)
 * @param {object} metadata - Métadonnées optionnelles (deviceInfo, ipAddress)
 * @returns {Promise<object>} Token sauvegardé
 */
export const saveRefreshToken = async (userId, token, expiresInDays = 30, metadata = {}) => {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const sql = `
        INSERT INTO ${TABLE_NAME} (user_id, token, expires_at, device_info, ip_address)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, token, expires_at, created_at
    `;
    
    const values = [
        userId,
        token,
        expiresAt,
        metadata.deviceInfo || null,
        metadata.ipAddress || null
    ];

    const result = await query(sql, values);
    return result.rows[0];
};

/**
 * Vérifier et récupérer un refresh token valide
 * @param {string} token - Le token à vérifier
 * @returns {Promise<object|null>} Token avec user_id si valide, null sinon
 */
export const verifyRefreshToken = async (token) => {
    const sql = `
        SELECT rt.*, u.id as user_id, u.role, u.statut
        FROM ${TABLE_NAME} rt
        JOIN ${process.env.DB_SCHEMA ? process.env.DB_SCHEMA + '.' : ''}utilisateur u ON rt.user_id = u.id
        WHERE rt.token = $1 
        AND rt.expires_at > NOW()
        AND rt.revoked_at IS NULL
        AND u.statut = 'actif'
        LIMIT 1
    `;
    
    const result = await query(sql, [token]);
    return result.rows[0] || null;
};

/**
 * Révoquer un refresh token (déconnexion)
 * @param {string} token - Le token à révoquer
 * @returns {Promise<boolean>} true si révoqué
 */
export const revokeRefreshToken = async (token) => {
    const sql = `
        UPDATE ${TABLE_NAME}
        SET revoked_at = NOW()
        WHERE token = $1
        RETURNING id
    `;
    
    const result = await query(sql, [token]);
    return result.rows.length > 0;
};

/**
 * Révoquer tous les refresh tokens d'un utilisateur (déconnexion globale)
 * @param {number} userId - ID de l'utilisateur
 * @returns {Promise<number>} Nombre de tokens révoqués
 */
export const revokeAllUserTokens = async (userId) => {
    const sql = `
        UPDATE ${TABLE_NAME}
        SET revoked_at = NOW()
        WHERE user_id = $1 AND revoked_at IS NULL
        RETURNING id
    `;
    
    const result = await query(sql, [userId]);
    return result.rows.length;
};

/**
 * Supprimer les tokens expirés (nettoyage)
 * @returns {Promise<number>} Nombre de tokens supprimés
 */
export const cleanupExpiredTokens = async () => {
    const sql = `
        DELETE FROM ${TABLE_NAME}
        WHERE expires_at < NOW()
        OR revoked_at IS NOT NULL
        RETURNING id
    `;
    
    const result = await query(sql);
    return result.rows.length;
};

/**
 * Compter les refresh tokens actifs d'un utilisateur
 * @param {number} userId 
 * @returns {Promise<number>}
 */
export const countActiveTokens = async (userId) => {
    const sql = `
        SELECT COUNT(*) as count
        FROM ${TABLE_NAME}
        WHERE user_id = $1
        AND expires_at > NOW()
        AND revoked_at IS NULL
    `;
    
    const result = await query(sql, [userId]);
    return parseInt(result.rows[0].count);
};
