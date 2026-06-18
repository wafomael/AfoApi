/**
 * Réponse API standardisée - Succès
 * @param {string} message - Message descriptif
 * @param {*} data - Données à retourner
 * @param {string|object} details - Détails additionnels
 * @returns {object} Réponse formatée
 */
export const successResponse = (message, data = null, details = null) => {
    const response = {
        success: true,
        message,
    };

    if (data !== null) {
        response.data = data;
    }

    if (details !== null) {
        response.details = details;
    }

    return response;
};

/**
 * Réponse API standardisée - Erreur
 * @param {string} message - Message d'erreur
 * @param {string|object} details - Détails de l'erreur
 * @param {number} statusCode - Code HTTP (optionnel, pour référence)
 * @param {string} errorCode - Code d'erreur interne (optionnel)
 * @returns {object} Réponse formatée
 */
export const errorResponse = (message, details = null, statusCode = null, errorCode = null) => {
    const response = {
        success: false,
        message,
    };

    if (details !== null) {
        response.details = details;
    }

    if (statusCode !== null) {
        response.statusCode = statusCode;
    }

    if (errorCode !== null) {
        response.errorCode = errorCode;
    }

    return response;
};

/**
 * Envoyer une réponse de succès
 * @param {object} res - Objet response Express
 * @param {string} message - Message descriptif
 * @param {*} data - Données à retourner
 * @param {number} statusCode - Code HTTP (défaut: 200)
 * @param {string|object} details - Détails additionnels
 */
export const sendSuccess = (res, message, data = null, statusCode = 200, details = null) => {
    res.status(statusCode).json(successResponse(message, data, details));
};

/**
 * Envoyer une réponse d'erreur
 * @param {object} res - Objet response Express
 * @param {string} message - Message d'erreur
 * @param {number} statusCode - Code HTTP (défaut: 500)
 * @param {string|object} details - Détails de l'erreur
 * @param {string} errorCode - Code d'erreur interne
 */
export const sendError = (res, message, statusCode = 500, details = null, errorCode = null) => {
    res.status(statusCode).json(errorResponse(message, details, statusCode, errorCode));
};

/**
 * Codes d'erreur standards
 */
export const ErrorCodes = {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
    AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    CONFLICT: 'CONFLICT',
    DATABASE_ERROR: 'DATABASE_ERROR',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
};

/**
 * Réponse pour ressource non trouvée
 */
export const notFoundResponse = (res, resource = 'Ressource') => {
    sendError(res, `${resource} non trouvée`, 404, null, ErrorCodes.NOT_FOUND);
};

/**
 * Réponse pour erreur de validation
 */
export const validationErrorResponse = (res, details) => {
    sendError(res, 'Erreur de validation', 400, details, ErrorCodes.VALIDATION_ERROR);
};

/**
 * Réponse pour erreur serveur inattendue (catch final)
 * @param {object} res - Objet response Express
 * @param {Error} error - Objet Error
 */
export const internalErrorResponse = (res, error) => {
    console.error('Erreur interne:', error);
    return sendError(res, 'Erreur interne du serveur', 500, null, ErrorCodes.INTERNAL_ERROR);
};
