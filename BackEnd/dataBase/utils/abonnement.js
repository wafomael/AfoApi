import { query } from '../dbConnect.js';
import { RELATION } from './visibilite.js';

const TABLE = 's_afro_dev.abonnement';
const USER  = 's_afro_dev.utilisateur';

/**
 * Récupérer les usernames de tous les utilisateurs que userId suit.
 * Utilisé à la connexion Socket pour rejoindre les rooms de présence.
 * @param {number} userId
 * @returns {Promise<Array<{username: string}>>}
 */
export const getAbonnements = async (userId) => {
    const sql = `
        SELECT u.nom_utilisateur AS username
        FROM ${TABLE} a
        JOIN ${USER} u ON u.id = a.suivi_id
        WHERE a.suiveur_id = $1
          AND u.statut = 'actif'
    `;
    const result = await query(sql, [userId]);
    return result.rows;
};

/**
 * Vérifier si userId suit targetId.
 * @param {number} userId
 * @param {number} targetId
 * @returns {Promise<boolean>}
 */
export const isFollowing = async (userId, targetId) => {
    const sql = `SELECT 1 FROM ${TABLE} WHERE suiveur_id = $1 AND suivi_id = $2`;
    const result = await query(sql, [userId, targetId]);
    return result.rows.length > 0;
};

/**
 * Suivre un utilisateur.
 * @param {number} suiveurId
 * @param {number} suiviId
 * @returns {Promise<void>}
 */
export const follow = async (suiveurId, suiviId) => {
    const sql = `
        INSERT INTO ${TABLE} (suiveur_id, suivi_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
    `;
    await query(sql, [suiveurId, suiviId]);
};

/**
 * Ne plus suivre un utilisateur.
 * @param {number} suiveurId
 * @param {number} suiviId
 * @returns {Promise<void>}
 */
export const unfollow = async (suiveurId, suiviId) => {
    const sql = `DELETE FROM ${TABLE} WHERE suiveur_id = $1 AND suivi_id = $2`;
    await query(sql, [suiveurId, suiviId]);
};

/**
 * Obtenir le type de relation entre userA et userB.
 * Utilisé par peutVoir() pour déterminer les droits d'accès.
 * @param {number} userAId - L'observateur (celui qui consulte)
 * @param {number} userBId - Le propriétaire du profil
 * @returns {Promise<import('./visibilite.js').RELATION[keyof import('./visibilite.js').RELATION]>}
 */
export const getRelation = async (userAId, userBId) => {
    if (userAId === userBId) return RELATION.MUTUEL; // soi-même = accès total

    const sql = `
        SELECT
            CASE
                WHEN a_vers_b.suiveur_id IS NOT NULL AND b_vers_a.suiveur_id IS NOT NULL THEN '${RELATION.MUTUEL}'
                WHEN a_vers_b.suiveur_id IS NOT NULL                                     THEN '${RELATION.JE_SUIS}'
                WHEN b_vers_a.suiveur_id IS NOT NULL                                     THEN '${RELATION.ME_SUIT}'
                ELSE                                                                          '${RELATION.AUCUNE}'
            END AS relation
        FROM (SELECT NULL) AS base
        LEFT JOIN ${TABLE} a_vers_b
               ON a_vers_b.suiveur_id = $1 AND a_vers_b.suivi_id = $2
        LEFT JOIN ${TABLE} b_vers_a
               ON b_vers_a.suiveur_id = $2 AND b_vers_a.suivi_id = $1
    `;
    const result = await query(sql, [userAId, userBId]);
    return result.rows[0]?.relation ?? RELATION.AUCUNE;
};

/**
 * Compter les abonnements et abonnés d'un user (pour le profil public).
 * @param {number} userId
 * @returns {Promise<{abonnements: number, abonnes: number}>}
 */
export const getCompteurs = async (userId) => {
    const sql = `
        SELECT
            (SELECT COUNT(*) FROM ${TABLE} WHERE suiveur_id = $1)::int AS abonnements,
            (SELECT COUNT(*) FROM ${TABLE} WHERE suivi_id   = $1)::int AS abonnes
    `;
    const result = await query(sql, [userId]);
    return result.rows[0] ?? { abonnements: 0, abonnes: 0 };
};
