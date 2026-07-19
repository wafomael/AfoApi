import Joi from 'joi';

const dateTime = Joi.date().iso().messages({
    'date.base': 'La date doit être valide',
    'date.format': 'La date doit être au format ISO 8601'
});

export const rendezVousIdParamsSchema = Joi.object({
    id: Joi.number().integer().positive().required()
});

export const rendezVousIdQuerySchema = Joi.object({
    rendez_vous_id: Joi.number().integer().positive().required()
});

export const createRendezVousSchema = Joi.object({
    coiffeur_username: Joi.string().trim().min(3).max(50).required(),
    prestation_id: Joi.number().integer().positive().required(),
    date_debut: dateTime.required(),
    date_fin: dateTime.greater(Joi.ref('date_debut')).required(),
    note_client: Joi.string().trim().max(1000).allow(null, '').default(null)
});

export const listRendezVousQuerySchema = Joi.object({
    statuts: Joi.string().trim().max(100).allow(''),
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0)
});

export const updateRendezVousStatutSchema = Joi.object({
    statut: Joi.string().valid('confirme', 'annule', 'termine', 'non_present').required()
});

export const creneauxQuerySchema = Joi.object({
    date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
    prestation_id: Joi.number().integer().positive().required()
});

export const disponibiliteSchema = Joi.object({
    jour_semaine: Joi.number().integer().min(0).max(6).required(),
    heure_debut: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
    heure_fin: Joi.string().pattern(/^\d{2}:\d{2}$/).required()
}).custom((value, helpers) => value.heure_fin > value.heure_debut
    ? value
    : helpers.error('any.invalid')).messages({
    'any.invalid': "L'heure de fin doit être postérieure à l'heure de début"
});

export const exceptionDisponibiliteSchema = Joi.object({
    date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
    heure_debut: Joi.string().pattern(/^\d{2}:\d{2}$/).allow(null, '').default(null),
    heure_fin: Joi.string().pattern(/^\d{2}:\d{2}$/).allow(null, '').default(null),
    raison: Joi.string().trim().max(255).allow(null, '').default(null)
}).custom((value, helpers) => {
    const hasStart = Boolean(value.heure_debut);
    const hasEnd = Boolean(value.heure_fin);
    if (hasStart !== hasEnd || (hasStart && value.heure_fin <= value.heure_debut)) {
        return helpers.error('any.invalid');
    }
    return value;
}).messages({
    'any.invalid': 'Les heures doivent être toutes deux absentes ou former un créneau valide'
});

export const avisSchema = Joi.object({
    rendez_vous_id: Joi.number().integer().positive().required(),
    note: Joi.number().integer().min(1).max(5).required(),
    commentaire: Joi.string().trim().max(1000).allow(null, '').default(null)
});
