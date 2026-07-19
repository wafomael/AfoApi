import { query } from '../dbConnect.js';

const RDV       = 's_afro_dev.rendez_vous';
const DISPO     = 's_afro_dev.disponibilite';
const EXCEPTION = 's_afro_dev.exception_disponibilite';

/**
 * Crée une disponibilité récurrente.
 * @param {{ coiffeurId: number, jourSemaine: number, heureDebut: string, heureFin: string }} data
 */
export const createDisponibilite = async ({ coiffeurId, jourSemaine, heureDebut, heureFin }) => {
    const sql = `
        INSERT INTO ${DISPO} (coiffeur_id, jour_semaine, heure_debut, heure_fin)
        VALUES ($1, $2, $3, $4)
        RETURNING id, coiffeur_id, jour_semaine, heure_debut, heure_fin, actif
    `;
    const result = await query(sql, [coiffeurId, jourSemaine, heureDebut, heureFin]);
    return result.rows[0];
};

/** Liste les disponibilités d'un coiffeur. */
export const listDisponibilites = async (coiffeurId) => {
    const result = await query(
        `SELECT id, coiffeur_id, jour_semaine, heure_debut, heure_fin, actif
         FROM ${DISPO} WHERE coiffeur_id = $1 ORDER BY jour_semaine, heure_debut`,
        [coiffeurId]
    );
    return result.rows;
};

/** Supprime une disponibilité. */
export const deleteDisponibilite = async (id, coiffeurId) => {
    const result = await query(
        `DELETE FROM ${DISPO} WHERE id = $1 AND coiffeur_id = $2`,
        [id, coiffeurId]
    );
    return result.rowCount > 0;
};

/** Crée une exception de disponibilité (jour ou créneau bloqué). */
export const createException = async ({ coiffeurId, date, heureDebut, heureFin, raison }) => {
    const sql = `
        INSERT INTO ${EXCEPTION} (coiffeur_id, date, heure_debut, heure_fin, raison)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, coiffeur_id, date, heure_debut, heure_fin, raison, actif
    `;
    const result = await query(sql, [coiffeurId, date, heureDebut || null, heureFin || null, raison || null]);
    return result.rows[0];
};

/** Liste les exceptions actives d'un coiffeur sur une période. */
export const listExceptions = async (coiffeurId, { dateDebut, dateFin }) => {
    const result = await query(
        `SELECT id, coiffeur_id, date, heure_debut, heure_fin, raison, actif
         FROM ${EXCEPTION}
         WHERE coiffeur_id = $1 AND actif = TRUE
           AND date >= $2 AND date <= $3
         ORDER BY date, heure_debut`,
        [coiffeurId, dateDebut, dateFin]
    );
    return result.rows;
};

/** Supprime une exception. */
export const deleteException = async (id, coiffeurId) => {
    const result = await query(
        `DELETE FROM ${EXCEPTION} WHERE id = $1 AND coiffeur_id = $2`,
        [id, coiffeurId]
    );
    return result.rowCount > 0;
};

export const isCreneauDansDisponibilite = async (coiffeurId, dateDebut, dateFin) => {
    const sql = `
        SELECT EXISTS (
            SELECT 1
            FROM ${DISPO} d
            WHERE d.coiffeur_id = $1
              AND d.actif = TRUE
              AND d.jour_semaine = EXTRACT(DOW FROM $2::timestamp)::smallint
              AND d.heure_debut <= $2::timestamp::time
              AND d.heure_fin >= $3::timestamp::time
        )
        AND NOT EXISTS (
            SELECT 1
            FROM ${EXCEPTION} e
            WHERE e.coiffeur_id = $1
              AND e.date = $2::timestamp::date
              AND e.actif = TRUE
              AND (
                  e.heure_debut IS NULL
                  OR (e.heure_debut < $3::timestamp::time AND e.heure_fin > $2::timestamp::time)
              )
        ) AS disponible
    `;
    const result = await query(sql, [coiffeurId, dateDebut, dateFin]);
    return result.rows[0].disponible;
};

/**
 * Retourne les créneaux libres d'un coiffeur pour une date et une durée données.
 * @param {number} coiffeurId
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} dureeMin - durée en minutes
 * @param {number} [excludeRdvId] - RDV à ignorer (utile pour modification)
 */
export const getCreneauxLibres = async (coiffeurId, dateStr, dureeMin, excludeRdvId = null) => {
    const date = new Date(dateStr + 'T00:00:00');
    const jourSemaine = date.getDay(); // 0 = dimanche

    // 1. Disponibilités récurrentes pour ce jour
    const dispos = await query(
        `SELECT heure_debut, heure_fin FROM ${DISPO}
         WHERE coiffeur_id = $1 AND jour_semaine = $2 AND actif = TRUE
         ORDER BY heure_debut`,
        [coiffeurId, jourSemaine]
    );

    if (dispos.rows.length === 0) return [];

    // 2. Exceptions sur cette date
    const exceptions = await query(
        `SELECT heure_debut, heure_fin FROM ${EXCEPTION}
         WHERE coiffeur_id = $1 AND date = $2 AND actif = TRUE`,
        [coiffeurId, dateStr]
    );

    // 3. Rendez-vous déjà pris ce jour (demande ou confirmé)
    const rdvs = await query(
        `SELECT date_debut, date_fin FROM ${RDV}
         WHERE coiffeur_id = $1
           AND statut IN ('demande', 'confirme')
           AND DATE(date_debut) = $2
           ${excludeRdvId ? 'AND id <> $3' : ''}
         ORDER BY date_debut`,
        excludeRdvId ? [coiffeurId, dateStr, excludeRdvId] : [coiffeurId, dateStr]
    );

    const creneaux = [];
    const dureeMs = dureeMin * 60 * 1000;

    for (const d of dispos.rows) {
        let debut = new Date(`${dateStr}T${d.heure_debut}`);
        const finDispo = new Date(`${dateStr}T${d.heure_fin}`);

        // Fusionne les exceptions et les rdvs pour les découper
        const occurences = [
            ...exceptions.rows.map(e => ({
                debut: e.heure_debut ? new Date(`${dateStr}T${e.heure_debut}`) : new Date(`${dateStr}T00:00:00`),
                fin:   e.heure_fin   ? new Date(`${dateStr}T${e.heure_fin}`)   : new Date(`${dateStr}T23:59:59`),
            })),
            ...rdvs.rows.map(r => ({
                debut: new Date(r.date_debut),
                fin:   new Date(r.date_fin),
            })),
        ].sort((a, b) => a.debut - b.debut);

        for (const occ of occurences) {
            if (occ.debut <= debut) {
                if (occ.fin > debut) debut = new Date(occ.fin);
                continue;
            }
            // Génère les créneaux possibles entre debut et occ.debut
            while (debut.getTime() + dureeMs <= occ.debut.getTime()) {
                const finCreneau = new Date(debut.getTime() + dureeMs);
                if (finCreneau > finDispo) break;
                creneaux.push({
                    heure_debut: formatTime(debut),
                    heure_fin:   formatTime(finCreneau),
                });
                debut = finCreneau;
            }
            if (occ.fin > debut) debut = new Date(occ.fin);
        }

        // Créneaux jusqu'à la fin de la dispo
        while (debut.getTime() + dureeMs <= finDispo.getTime()) {
            const finCreneau = new Date(debut.getTime() + dureeMs);
            creneaux.push({
                heure_debut: formatTime(debut),
                heure_fin:   formatTime(finCreneau),
            });
            debut = finCreneau;
        }
    }

    return creneaux;
};

function formatTime(date) {
    return date.toTimeString().slice(0, 5); // HH:MM
}
