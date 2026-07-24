import Joi from 'joi';

export const bookingPolicySchema = Joi.object({
    delai_min_heures: Joi.number().integer().min(0).max(720).required(),
    delai_max_jours: Joi.number().integer().min(1).max(365).required(),
    annulation_gratuite_heures: Joi.number().integer().min(0).max(720).required(),
    report_max_heures: Joi.number().integer().min(0).max(720).required(),
    nb_reports_max: Joi.number().integer().min(0).max(10).required(),
    tolerance_retard_min: Joi.number().integer().min(0).max(180).required(),
    annulation_auto_retard: Joi.boolean().required(),
    acompte_remboursable: Joi.boolean().required(),
    acompte_pourcentage: Joi.number().min(0).max(100).required(),
    politique_obligatoire: Joi.boolean().valid(true).required()
}).custom((value, helpers) => {
    if (value.delai_max_jours * 24 <= value.delai_min_heures) return helpers.error('any.invalid');
    return value;
}).messages({
    'any.invalid': 'Le délai maximum doit être supérieur au délai minimum'
});
