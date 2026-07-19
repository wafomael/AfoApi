import { query } from '../dbConnect.js';

const RDV = 's_afro_dev.rendez_vous';
const PRESTATION = 's_afro_dev.prestation';
const USER = 's_afro_dev.utilisateur';

/**
 * Crée un rendez-vous.
 * @param {{ clientId: number, coiffeurId: number, prestationId?: number|null, dateDebut: Date, dateFin: Date, prix?: number|null, unitePrix?: string, noteClient?: string|null }}
 */
export const createRendezVous = async ({ clientId, coiffeurId, prestationId = null, dateDebut, dateFin, prix = null, unitePrix = 'forfait', noteClient = null }) => {
    const sql = `
        INSERT INTO ${RDV} (client_id, coiffeur_id, prestation_id, date_debut, date_fin, prix, unite_prix, note_client)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, client_id, coiffeur_id, prestation_id, date_debut, date_fin, statut, prix, unite_prix, note_client, created_at, updated_at
    `;
    const result = await query(sql, [clientId, coiffeurId, prestationId, dateDebut, dateFin, prix, unitePrix, noteClient]);
    return result.rows[0];
};

/** Récupère un RDV par id. */
export const getRendezVousById = async (id) => {
    const result = await query(
        `SELECT * FROM ${RDV} WHERE id = $1`,
        [id]
    );
    return result.rows[0] || null;
};

export const getRendezVousTerminePourAvis = async (id, clientId, coiffeurId) => {
    const result = await query(
        `SELECT id, client_id, coiffeur_id
         FROM ${RDV}
         WHERE id = $1 AND client_id = $2 AND coiffeur_id = $3 AND statut = 'termine'`,
        [id, clientId, coiffeurId]
    );
    return result.rows[0] || null;
};

/** Récupère un RDV enrichi (avec noms, prestation). */
export const getRendezVousDetailById = async (id) => {
    const sql = `
        SELECT r.*,
               c.nom_utilisateur AS client_username, c.prenom AS client_prenom, c.nom AS client_nom,
               co.nom_utilisateur AS coiffeur_username, co.prenom AS coiffeur_prenom, co.nom AS coiffeur_nom,
               p.nom AS prestation_nom, p.duree_min AS prestation_duree_min
        FROM ${RDV} r
        JOIN ${USER} c ON c.id = r.client_id
        JOIN ${USER} co ON co.id = r.coiffeur_id
        LEFT JOIN ${PRESTATION} p ON p.id = r.prestation_id
        WHERE r.id = $1
    `;
    const result = await query(sql, [id]);
    return result.rows[0] || null;
};

/**
 * Liste les rendez-vous d'un client ou d'un coiffeur.
 * @param {{ clientId?: number, coiffeurId?: number, statuts?: string[], limit?: number, offset?: number }}
 */
export const listRendezVous = async ({ clientId, coiffeurId, statuts = [], limit = 50, offset = 0 } = {}) => {
    const conditions = [];
    const values = [];
    let idx = 1;

    if (clientId) {
        conditions.push(`r.client_id = $${idx++}`);
        values.push(clientId);
    }
    if (coiffeurId) {
        conditions.push(`r.coiffeur_id = $${idx++}`);
        values.push(coiffeurId);
    }
    if (statuts.length > 0) {
        conditions.push(`r.statut = ANY($${idx++})`);
        values.push(statuts);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
        SELECT r.*,
               c.nom_utilisateur AS client_username, c.prenom AS client_prenom, c.nom AS client_nom,
               co.nom_utilisateur AS coiffeur_username, co.prenom AS coiffeur_prenom, co.nom AS coiffeur_nom,
               p.nom AS prestation_nom
        FROM ${RDV} r
        JOIN ${USER} c ON c.id = r.client_id
        JOIN ${USER} co ON co.id = r.coiffeur_id
        LEFT JOIN ${PRESTATION} p ON p.id = r.prestation_id
        ${where}
        ORDER BY r.date_debut DESC
        LIMIT $${idx++} OFFSET $${idx++}
    `;
    values.push(limit, offset);
    const result = await query(sql, values);
    return result.rows;
};

/** Met à jour le statut d'un rendez-vous seulement depuis le statut attendu. */
export const updateRendezVousStatut = async (id, statutActuel, nouveauStatut) => {
    const result = await query(
        `UPDATE ${RDV} SET statut = $3 WHERE id = $1 AND statut = $2
         RETURNING id, client_id, coiffeur_id, prestation_id, date_debut, date_fin, statut, prix, unite_prix, note_client`,
        [id, statutActuel, nouveauStatut]
    );
    return result.rows[0] || null;
};

/** Supprime/annule un rendez-vous (soft delete via statut annule, ou hard delete). */
export const deleteRendezVous = async (id) => {
    const result = await query(`DELETE FROM ${RDV} WHERE id = $1`, [id]);
    return result.rowCount > 0;
};

/**
 * Vérifie s'il y a un conflit de créneau pour un coiffeur.
 * Exclut optionnellement un RDV existant (modification).
 */
export const hasConflitRendezVous = async (coiffeurId, dateDebut, dateFin, excludeId = null) => {
    const sql = `
        SELECT 1 FROM ${RDV}
        WHERE coiffeur_id = $1
          AND statut IN ('demande', 'confirme')
          AND date_debut < $3 AND date_fin > $2
          ${excludeId ? 'AND id <> $4' : ''}
        LIMIT 1
    `;
    const params = excludeId ? [coiffeurId, dateDebut, dateFin, excludeId] : [coiffeurId, dateDebut, dateFin];
    const result = await query(sql, params);
    return result.rows.length > 0;
};
