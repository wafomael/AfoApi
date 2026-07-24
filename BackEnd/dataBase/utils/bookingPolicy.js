import { query } from '../dbConnect.js';

const TABLE = 's_afro_dev.politique_reservation';

const COLUMNS = [
    'delai_min_heures', 'delai_max_jours', 'annulation_gratuite_heures',
    'report_max_heures', 'nb_reports_max', 'tolerance_retard_min',
    'annulation_auto_retard', 'acompte_remboursable', 'acompte_pourcentage',
    'politique_obligatoire'
];

export const getBookingPolicy = async (coiffeurId) => {
    const result = await query(`SELECT * FROM ${TABLE} WHERE coiffeur_id = $1`, [coiffeurId]);
    return result.rows[0] ?? {
        coiffeur_id: coiffeurId,
        delai_min_heures: 3,
        delai_max_jours: 90,
        annulation_gratuite_heures: 24,
        report_max_heures: 24,
        nb_reports_max: 1,
        tolerance_retard_min: 15,
        annulation_auto_retard: false,
        acompte_remboursable: true,
        acompte_pourcentage: 20,
        politique_obligatoire: true,
        updated_at: null
    };
};

export const upsertBookingPolicy = async (coiffeurId, data) => {
    const values = COLUMNS.map((column) => data[column]);
    const placeholders = COLUMNS.map((_, index) => `$${index + 2}`).join(', ');
    const updates = COLUMNS.map((column) => `${column} = EXCLUDED.${column}`).join(', ');
    const result = await query(`
        INSERT INTO ${TABLE} (coiffeur_id, ${COLUMNS.join(', ')})
        VALUES ($1, ${placeholders})
        ON CONFLICT (coiffeur_id) DO UPDATE SET ${updates}
        RETURNING *
    `, [coiffeurId, ...values]);
    return result.rows[0];
};
