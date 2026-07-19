import Joi from 'joi';

// Schéma pour l'inscription
export const inscriptionSchema = Joi.object({
    nom_utilisateur: Joi.string()
        .min(3)
        .max(50)
        .allow(null, '')
        .messages({
            'string.min': 'Le nom d\'utilisateur doit faire au moins 3 caractères',
            'string.max': 'Le nom d\'utilisateur ne doit pas dépasser 50 caractères'
        }),
    
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Format email invalide',
            'any.required': 'L\'email est requis'
        }),
    
    mot_de_passe: Joi.string()
        .min(8)
        .required()
        .messages({
            'string.min': 'Le mot de passe doit faire au moins 8 caractères',
            'any.required': 'Le mot de passe est requis'
        }),
    
    prenom: Joi.string()
        .min(2)
        .max(100)
        .required()
        .messages({
            'string.min': 'Le prénom doit faire au moins 2 caractères',
            'string.max': 'Le prénom ne doit pas dépasser 100 caractères',
            'any.required': 'Le prénom est requis'
        }),
    
    nom: Joi.string()
        .min(2)
        .max(100)
        .required()
        .messages({
            'string.min': 'Le nom doit faire au moins 2 caractères',
            'string.max': 'Le nom ne doit pas dépasser 100 caractères',
            'any.required': 'Le nom est requis'
        }),
    
    date_naissance: Joi.date()
        .iso()
        .allow(null)
        .less('now')
        .messages({
            'date.format': 'Format de date invalide (YYYY-MM-DD)',
            'date.less': 'La date de naissance doit être dans le passé'
        }),
    
    sexe: Joi.string()
        .valid('homme', 'femme', 'non_precise')
        .allow(null)
        .messages({
            'any.only': 'Le sexe doit être: homme, femme, ou non_precise'
        }),
    
    ville: Joi.string()
        .max(100)
        .allow(null, '')
        .messages({
            'string.max': 'Le nom de la ville ne doit pas dépasser 100 caractères'
        }),
    
    telephone: Joi.string()
        .pattern(/^[0-9+\-\s()]{8,20}$/)
        .allow(null, '')
        .messages({
            'string.pattern.base': 'Format de téléphone invalide'
        }),
    
    latitude: Joi.number()
        .min(-90)
        .max(90)
        .allow(null)
        .messages({
            'number.min': 'La latitude doit être entre -90 et 90',
            'number.max': 'La latitude doit être entre -90 et 90'
        }),
    
    longitude: Joi.number()
        .min(-180)
        .max(180)
        .allow(null)
        .messages({
            'number.min': 'La longitude doit être entre -180 et 180',
            'number.max': 'La longitude doit être entre -180 et 180'
        }),

    role: Joi.string()
        .valid('client', 'coiffeur')
        .default('client')
        .messages({
            'any.only': 'Le rôle doit être client ou coiffeur'
        })
});

// Schéma pour la connexion
export const connexionSchema = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Format email invalide',
            'any.required': 'L\'email est requis'
        }),
    
    mot_de_passe: Joi.string()
        .required()
        .messages({
            'any.required': 'Le mot de passe est requis'
        })
});

// Schéma pour la mise à jour du profil (tous les champs optionnels)
export const updateProfilSchema = Joi.object({
    nom_utilisateur: Joi.string()
        .min(3)
        .max(50)
        .allow(null, '')
        .messages({
            'string.min': 'Le nom d\'utilisateur doit faire au moins 3 caractères',
            'string.max': 'Le nom d\'utilisateur ne doit pas dépasser 50 caractères'
        }),
    
    email: Joi.string()
        .email()
        .messages({
            'string.email': 'Format email invalide'
        }),
    
    mot_de_passe: Joi.string()
        .min(8)
        .messages({
            'string.min': 'Le nouveau mot de passe doit faire au moins 8 caractères'
        }),
    
    prenom: Joi.string()
        .min(2)
        .max(100)
        .messages({
            'string.min': 'Le prénom doit faire au moins 2 caractères',
            'string.max': 'Le prénom ne doit pas dépasser 100 caractères'
        }),
    
    nom: Joi.string()
        .min(2)
        .max(100)
        .messages({
            'string.min': 'Le nom doit faire au moins 2 caractères',
            'string.max': 'Le nom ne doit pas dépasser 100 caractères'
        }),
    
    date_naissance: Joi.date()
        .iso()
        .allow(null)
        .less('now')
        .messages({
            'date.format': 'Format de date invalide (YYYY-MM-DD)',
            'date.less': 'La date de naissance doit être dans le passé'
        }),
    
    sexe: Joi.string()
        .valid('homme', 'femme', 'non_precise')
        .allow(null)
        .messages({
            'any.only': 'Le sexe doit être: homme, femme, ou non_precise'
        }),
    
    ville: Joi.string()
        .max(100)
        .allow(null, '')
        .messages({
            'string.max': 'Le nom de la ville ne doit pas dépasser 100 caractères'
        }),
    
    telephone: Joi.string()
        .pattern(/^[0-9+\-\s()]{8,20}$/)
        .allow(null, '')
        .messages({
            'string.pattern.base': 'Format de téléphone invalide'
        }),
    
    latitude: Joi.number()
        .min(-90)
        .max(90)
        .allow(null)
        .messages({
            'number.min': 'La latitude doit être entre -90 et 90',
            'number.max': 'La latitude doit être entre -90 et 90'
        }),
    
    longitude: Joi.number()
        .min(-180)
        .max(180)
        .allow(null)
        .messages({
            'number.min': 'La longitude doit être entre -180 et 180',
            'number.max': 'La longitude doit être entre -180 et 180'
        })
}).min(1).messages({
    'object.min': 'Au moins un champ doit être fourni pour la mise à jour'
});

// Schéma pour la création d'utilisateur par admin
export const createUserAdminSchema = inscriptionSchema.keys({
    role: Joi.string()
        .valid('client', 'coiffeur', 'admin')
        .default('client')
        .messages({
            'any.only': 'Le rôle doit être: client, coiffeur, ou admin'
        }),
    
    is_pro: Joi.boolean()
        .default(false)
        .messages({
            'boolean.base': 'is_pro doit être un booléen'
        })
});

// Schéma pour la mise à jour d'utilisateur par admin
export const updateUserAdminSchema = updateProfilSchema.keys({
    role: Joi.string()
        .valid('client', 'coiffeur', 'admin')
        .messages({
            'any.only': 'Le rôle doit être: client, coiffeur, ou admin'
        }),
    
    is_pro: Joi.boolean()
        .messages({
            'boolean.base': 'is_pro doit être un booléen'
        }),
    
    statut: Joi.string()
        .valid('actif', 'desabonne')
        .messages({
            'any.only': 'Le statut doit être: actif ou desabonne'
        })
});

// Schéma pour la pagination et les filtres
export const listUsersQuerySchema = Joi.object({
    page: Joi.number()
        .integer()
        .min(1)
        .default(1)
        .messages({
            'number.base': 'La page doit être un nombre',
            'number.min': 'La page doit être au moins 1'
        }),
    
    limit: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .default(20)
        .messages({
            'number.base': 'La limite doit être un nombre',
            'number.min': 'La limite doit être au moins 1',
            'number.max': 'La limite ne doit pas dépasser 100'
        }),
    
    role: Joi.string()
        .valid('client', 'coiffeur', 'admin')
        .messages({
            'any.only': 'Le filtre rôle doit être: client, coiffeur, ou admin'
        }),
    
    search: Joi.string()
        .min(2)
        .max(100)
        .messages({
            'string.min': 'La recherche doit faire au moins 2 caractères',
            'string.max': 'La recherche ne doit pas dépasser 100 caractères'
        }),

    is_pro: Joi.boolean()
        .messages({
            'boolean.base': 'is_pro doit être un booléen'
        }),

    ville: Joi.string()
        .max(100)
        .messages({
            'string.max': 'Le nom de la ville ne doit pas dépasser 100 caractères'
        }),

    statut: Joi.string()
        .valid('actif', 'desabonne')
        .messages({
            'any.only': 'Le statut doit être: actif ou desabonne'
        })
});
