import { sendError, validationErrorResponse } from '../utils/apiResponse.js';

/**
 * Middleware de validation Joi
 * @param {Joi.Schema} schema - Schéma Joi à valider
 * @param {string} source - Source des données: 'body' | 'query' | 'params'
 */
export const validate = (schema, source = 'body') => {
    return (req, res, next) => {
        const data = req[source];
        
        const { error, value } = schema.validate(data, {
            abortEarly: false, // Récupérer toutes les erreurs, pas juste la première
            stripUnknown: true, // Supprimer les champs non définis dans le schéma
            convert: true // Convertir les types (ex: string '123' -> number 123)
        });

        if (error) {
            // Formatter les erreurs Joi en objet clé-valeur
            const errors = {};
            error.details.forEach(detail => {
                const path = detail.path.join('.');
                // Si le champ a déjà une erreur, on garde la première
                if (!errors[path]) {
                    errors[path] = detail.message;
                }
            });

            return validationErrorResponse(res, errors);
        }

        // Remplacer les données par les valeurs validées/converties
        req[source] = value;
        next();
    };
};

/**
 * Middleware pour valider que au moins un champ est présent
 * Utile pour les PUT où tout est optionnel mais il faut au moins une modif
 */
export const validateAtLeastOneField = (req, res, next) => {
    if (Object.keys(req.body).length === 0) {
        return sendError(res, 'Au moins un champ doit être fourni', 400, null, 'NO_CHANGES');
    }
    next();
};
