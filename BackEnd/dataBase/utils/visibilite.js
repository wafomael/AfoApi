import { query } from '../dbConnect.js';

const TABLE = 's_afro_dev.visibilite_utilisateur';

/**
 * Niveaux de visibilité disponibles.
 * SMALLINT 0-3 en base, exposé ici pour éviter les magic numbers.
 */
export const NIVEAU = {
    PERSONNE:  0, // Personne ne voit ce champ
    TRIBU:     1, // Abonnements mutuels uniquement (défaut)
    ABONNES:   2, // Tous ceux qui me suivent
    TOUT_LE_MONDE: 3
};

/**
 * Types de relation entre deux users.
 * Retournés par getRelation() dans abonnement.js.
 */
export const RELATION = {
    AUCUNE:   'aucune',
    JE_SUIS:  'je_suis',  // A suit B, pas l'inverse
    ME_SUIT:  'me_suit',  // B suit A, pas l'inverse
    MUTUEL:   'mutuel'    // Les deux se suivent (Tribu)
};

/**
 * Détermine si `observateur` peut voir un champ selon le niveau configuré
 * et la relation entre lui et le propriétaire du profil.
 *
 * @param {number} niveau      - Niveau de visibilité (0-3) du champ
 * @param {string} relation    - Relation entre observateur et propriétaire
 * @param {boolean} estSoiMeme - true si l'observateur consulte son propre profil
 * @returns {boolean}
 */
export const peutVoir = (niveau, relation, estSoiMeme = false) => {
    if (estSoiMeme) return true;

    switch (niveau) {
        case NIVEAU.TOUT_LE_MONDE:
            return true;
        case NIVEAU.ABONNES:
            return relation === RELATION.ME_SUIT || relation === RELATION.MUTUEL;
        case NIVEAU.TRIBU:
            return relation === RELATION.MUTUEL;
        case NIVEAU.PERSONNE:
        default:
            return false;
    }
};

/**
 * Récupérer les paramètres de visibilité d'un utilisateur.
 * @param {number} utilisateurId
 * @returns {Promise<object|null>}
 */
export const getVisibilite = async (utilisateurId) => {
    const sql = `SELECT * FROM ${TABLE} WHERE utilisateur_id = $1`;
    const result = await query(sql, [utilisateurId]);
    return result.rows[0] || null;
};

/**
 * Mettre à jour les paramètres de visibilité d'un utilisateur.
 * Seuls les champs fournis sont mis à jour.
 * @param {number} utilisateurId
 * @param {object} updates - { online_status?, telephone?, email?, localisation?, date_naissance? }
 * @returns {Promise<object|null>}
 */
export const updateVisibilite = async (utilisateurId, updates) => {
    const fields = ['online_status', 'telephone', 'email', 'localisation', 'date_naissance'];
    const setClauses = [];
    const params = [];
    let i = 1;

    for (const field of fields) {
        if (updates[field] !== undefined) {
            setClauses.push(`${field} = $${i++}`);
            params.push(updates[field]);
        }
    }

    if (setClauses.length === 0) return null;

    setClauses.push(`updated_at = NOW()`);
    params.push(utilisateurId);

    const sql = `
        UPDATE ${TABLE}
        SET ${setClauses.join(', ')}
        WHERE utilisateur_id = $${i}
        RETURNING *
    `;
    const result = await query(sql, params);
    return result.rows[0] || null;
};
