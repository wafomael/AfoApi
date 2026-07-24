import { pool, query } from '../dbConnect.js';

const RDV = 's_afro_dev.rendez_vous';
const PRESTATION = 's_afro_dev.prestation';
const USER = 's_afro_dev.utilisateur';

/**
 * Crée un rendez-vous.
 * @param {{ clientId: number, coiffeurId: number, prestationId?: number|null, dateDebut: Date, dateFin: Date, prix?: number|null, unitePrix?: string, noteClient?: string|null }}
 */
export const createRendezVous = async ({
    clientId, coiffeurId, prestationId, dateDebut, dateFin, dateFinBlocage,
    prix = null, unitePrix = 'forfait', noteClient = null, champsProfilPartages = [],
    modePrestation, tempsReposMinutes, tempsTrajetMinutes,
    acomptePaye, montantAcompte, statutAcompte, politiqueAcceptee, politiqueSnapshot
}) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(`
            INSERT INTO ${RDV} (
                client_id, coiffeur_id, prestation_id, date_debut, date_fin, date_fin_blocage,
                prix, unite_prix, note_client, champs_profil_partages, mode_prestation,
                temps_repos_minutes, temps_trajet_minutes, acompte_paye, montant_acompte,
                statut_acompte, politique_acceptee_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
            RETURNING *
        `, [
            clientId, coiffeurId, prestationId, dateDebut, dateFin, dateFinBlocage,
            prix, unitePrix, noteClient, champsProfilPartages, modePrestation,
            tempsReposMinutes, tempsTrajetMinutes, acomptePaye, montantAcompte,
            statutAcompte, politiqueAcceptee ? new Date() : null
        ]);
        const rdv = result.rows[0];
        for (const champ of champsProfilPartages) {
            await client.query(
                `INSERT INTO s_afro_dev.consentement_profil (rendez_vous_id, champ_profil) VALUES ($1, $2)`,
                [rdv.id, champ]
            );
        }
        await client.query(`
            INSERT INTO s_afro_dev.historique_rendez_vous
                (rendez_vous_id, action, auteur_id, auteur_role, nouvelle_date, details)
            VALUES ($1, 'creation', $2, 'client', $3, $4)
        `, [rdv.id, clientId, dateDebut, JSON.stringify({
            mode_prestation: modePrestation,
            montant_acompte: montantAcompte,
            politique_acceptee: politiqueSnapshot
        })]);
        await client.query('COMMIT');
        return rdv;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
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
export const updateRendezVousStatut = async (id, statutActuel, nouveauStatut, { auteurId, auteurRole, motif = null, statutAcompte = null, details = {} } = {}) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            `UPDATE ${RDV}
             SET statut = $3, statut_acompte = COALESCE($4, statut_acompte)
             WHERE id = $1 AND statut = $2 RETURNING *`,
            [id, statutActuel, nouveauStatut, statutAcompte]
        );
        const rdv = result.rows[0];
        if (!rdv) {
            await client.query('ROLLBACK');
            return null;
        }
        await client.query(`
            INSERT INTO s_afro_dev.historique_rendez_vous
                (rendez_vous_id, action, auteur_id, auteur_role, motif, details)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [id, nouveauStatut, auteurId, auteurRole, motif, JSON.stringify({
            ancien_statut: statutActuel,
            nouveau_statut: nouveauStatut,
            statut_acompte: rdv.statut_acompte,
            ...details
        })]);
        await client.query('COMMIT');
        return rdv;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export const listHistoriqueRendezVous = async (id) => {
    const result = await query(`
        SELECT h.*, u.nom_utilisateur AS auteur_username
        FROM s_afro_dev.historique_rendez_vous h
        LEFT JOIN ${USER} u ON u.id = h.auteur_id
        WHERE h.rendez_vous_id = $1 ORDER BY h.date_action DESC
    `, [id]);
    return result.rows;
};

export const reportRendezVous = async (rdv, dateDebut, dateFin, dateFinBlocage, auteurId, motif) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(`
            UPDATE ${RDV}
            SET date_debut = $2, date_fin = $3, date_fin_blocage = $4, nb_reports = nb_reports + 1,
                retard_minutes = 0, decalage_minutes = 0
            WHERE id = $1 AND statut IN ('demande', 'confirme') RETURNING *
        `, [rdv.id, dateDebut, dateFin, dateFinBlocage]);
        if (!result.rows[0]) {
            await client.query('ROLLBACK');
            return null;
        }
        await client.query(`
            INSERT INTO s_afro_dev.historique_rendez_vous
                (rendez_vous_id, action, auteur_id, auteur_role, motif, ancienne_date, nouvelle_date)
            VALUES ($1, 'report', $2, 'client', $3, $4, $5)
        `, [rdv.id, auteurId, motif, rdv.date_debut, dateDebut]);
        await client.query('COMMIT');
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export const signalerRetardEtDecaler = async (rdv, retardMinutes, auteurId, motif) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SET CONSTRAINTS s_afro_dev.excl_rendez_vous_coiffeur_creneau DEFERRED');
        const affected = await client.query(`
            SELECT id, client_id, date_debut
            FROM ${RDV}
            WHERE coiffeur_id = $1
              AND date_debut::date = $2::timestamp::date
              AND date_debut >= $2
              AND statut IN ('demande', 'confirme', 'en_cours')
            ORDER BY date_debut FOR UPDATE
        `, [rdv.coiffeur_id, rdv.date_debut]);
        const ids = affected.rows.map((row) => row.id);
        await client.query(`
            UPDATE ${RDV}
            SET date_debut = date_debut + ($2 * INTERVAL '1 minute'),
                date_fin = date_fin + ($2 * INTERVAL '1 minute'),
                date_fin_blocage = date_fin_blocage + ($2 * INTERVAL '1 minute'),
                decalage_minutes = decalage_minutes + $2,
                retard_minutes = CASE WHEN id = $1 THEN retard_minutes + $2 ELSE retard_minutes END
            WHERE id = ANY($3::int[])
        `, [rdv.id, retardMinutes, ids]);
        for (const affectedRdv of affected.rows) {
            await client.query(`
                INSERT INTO s_afro_dev.historique_rendez_vous
                    (rendez_vous_id, action, auteur_id, auteur_role, motif, ancienne_date, nouvelle_date, details)
                VALUES ($1, $2, $3, 'client', $4, $5, $6, $7)
            `, [
                affectedRdv.id,
                affectedRdv.id === rdv.id ? 'retard_signale' : 'decale_retard_precedent',
                auteurId,
                motif,
                affectedRdv.date_debut,
                new Date(new Date(affectedRdv.date_debut).getTime() + retardMinutes * 60000),
                JSON.stringify({ retard_minutes: retardMinutes, rendez_vous_source_id: rdv.id })
            ]);
        }
        await client.query('COMMIT');
        return ids;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
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
