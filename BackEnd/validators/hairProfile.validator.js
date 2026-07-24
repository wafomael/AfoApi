import Joi from 'joi';
import { HAIR_PROFILE_FIELDS } from '../utils/hairProfileFields.js';

const optionalText = (max) => Joi.string().trim().max(max).allow(null, '').default(null);

export const hairProfileSchema = Joi.object({
    longueur_texte: Joi.string().valid('courte', 'mi_longue', 'longue').required(),
    longueur_cm: Joi.number().min(0).max(300).allow(null).default(null),
    densite: Joi.string().valid('fine', 'moyenne', 'epaisse').allow(null).default(null),
    texture_texte: Joi.string().valid('lisse', 'ondule', 'boucle', 'crepu').required(),
    texture_code: Joi.string().valid('1A', '1B', '1C', '2A', '2B', '2C', '3A', '3B', '3C', '4A', '4B', '4C').allow(null).default(null),
    etat_actuel: Joi.array().items(Joi.string().valid('sain', 'sec', 'cassant', 'abime', 'gras')).unique().default([]),
    naturel_defrise: Joi.string().valid('naturel', 'defrise').allow(null).default(null),
    traitements_chimiques: Joi.array().items(Joi.string().valid('coloration', 'defrisage', 'permanente')).unique().default([]),
    date_dernier_traitement: Joi.date().iso().max('now').allow(null).default(null),
    sensibilite_cuir_chevelu: Joi.string().valid('aucune', 'legere', 'sensible', 'tres_sensible').allow(null).default(null),
    extensions: Joi.boolean().allow(null).default(null),
    extensions_type: optionalText(100),
    preferences_allergies: optionalText(2000)
}).custom((value, helpers) => {
    if (value.extensions === true && !value.extensions_type) return helpers.error('any.custom');
    if (value.traitements_chimiques.length === 0) value.date_dernier_traitement = null;
    if (value.extensions !== true) value.extensions_type = null;
    return value;
}).messages({
    'any.custom': "Le type d'extension est requis lorsque des extensions sont présentes"
});

export const sharedHairProfileFieldsSchema = Joi.array()
    .items(Joi.string().valid(...HAIR_PROFILE_FIELDS))
    .unique()
    .default([]);
