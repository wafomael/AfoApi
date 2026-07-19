import { Router } from 'express';
import bcrypt from 'bcrypt';
import { requireAuthAdmin } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess, sendError, internalErrorResponse, notFoundResponse } from '../../utils/apiResponse.js';
import * as userDB from '../../dataBase/utils/user.js';
import {
    createUserAdminSchema,
    updateUserAdminSchema,
    listUsersQuerySchema
} from '../../validators/user.validator.js';

const router = Router();
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS) || 10;

/**
 * ============================================
 * ROUTES ADMIN - GESTION DES UTILISATEURS
 * ============================================
 * Toutes ces routes nécessitent d'être authentifié en tant qu'admin
 */

// Appliquer le middleware admin à toutes les routes
router.use(requireAuthAdmin);

/**
 * GET /admin/users
 * Lister tous les utilisateurs (avec filtres et pagination)
 */
router.get('/', validate(listUsersQuerySchema, 'query'), async (req, res) => {
    try {
        const { role, search, is_pro, ville, statut, page, limit } = req.query;

        const pagination = {
            limit: limit,
            offset: (page - 1) * limit
        };

        const filters = {};
        if (role) filters.role = role;
        if (search) filters.search = search;
        if (is_pro !== undefined) filters.is_pro = is_pro;
        if (ville) filters.ville = ville;
        if (statut) filters.statut = statut;

        const { users, total } = await userDB.listUsers(filters, pagination);

        sendSuccess(res, `${total} utilisateur(s) trouvé(s)`, {
            users,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * GET /admin/users/:id
 * Récupérer un utilisateur par ID
 */
router.get('/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const user = await userDB.getUserById(userId);

        if (!user) {
            return notFoundResponse(res, 'Utilisateur');
        }

        sendSuccess(res, 'Utilisateur récupéré', user);
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * POST /admin/users
 * Créer un nouvel utilisateur (par admin)
 * L'admin peut choisir le rôle (client, coiffeur, admin)
 */
router.post('/', validate(createUserAdminSchema), async (req, res) => {
    try {
        const {
            nom_utilisateur,
            email,
            mot_de_passe,
            prenom,
            nom,
            date_naissance,
            sexe,
            ville,
            telephone,
            latitude,
            longitude,
            role,
            is_pro
        } = req.body;

        // Vérifier si email existe déjà
        const emailExists = await userDB.emailExists(email);
        if (emailExists) {
            return sendError(res, 'Cet email est déjà utilisé', 409, null, 'EMAIL_EXISTS');
        }

        // Vérifier nom d'utilisateur
        if (nom_utilisateur) {
            const usernameExists = await userDB.usernameExists(nom_utilisateur);
            if (usernameExists) {
                return sendError(res, 'Ce nom d\'utilisateur est déjà pris', 409, null, 'USERNAME_EXISTS');
            }
        }

        // Hasher le mot de passe
        const hashedPassword = await bcrypt.hash(mot_de_passe, SALT_ROUNDS);

        // Créer l'utilisateur avec le rôle choisi
        const newUser = await userDB.createUser({
            nom_utilisateur,
            email,
            mot_de_passe: hashedPassword,
            prenom,
            nom,
            date_naissance,
            sexe,
            ville,
            telephone,
            latitude,
            longitude,
            role,
            is_pro
        });

        sendSuccess(res, `Utilisateur ${role} créé avec succès`, newUser, 201);

    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * PUT /admin/users/:id
 * Modifier un utilisateur existant (par admin)
 */
router.put('/:id', validate(updateUserAdminSchema), async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const {
            nom_utilisateur,
            email,
            mot_de_passe,
            prenom,
            nom,
            date_naissance,
            sexe,
            ville,
            telephone,
            latitude,
            longitude,
            role,
            is_pro,
            statut
        } = req.body;

        // Vérifier si l'utilisateur existe
        const existingUser = await userDB.getUserById(userId);
        if (!existingUser) {
            return notFoundResponse(res, 'Utilisateur');
        }

        const updates = {};

        // Préparer les mises à jour
        if (nom_utilisateur !== undefined) {
            if (nom_utilisateur) {
                const exists = await userDB.usernameExists(nom_utilisateur, userId);
                if (exists) {
                    return sendError(res, 'Ce nom d\'utilisateur est déjà pris', 409, null, 'USERNAME_EXISTS');
                }
            }
            updates.nom_utilisateur = nom_utilisateur;
        }

        if (email !== undefined) {
            const exists = await userDB.emailExists(email, userId);
            if (exists) {
                return sendError(res, 'Cet email est déjà utilisé', 409, null, 'EMAIL_EXISTS');
            }
            updates.email = email;
        }

        if (mot_de_passe !== undefined) {
            updates.mot_de_passe = await bcrypt.hash(mot_de_passe, SALT_ROUNDS);
        }

        if (role !== undefined) updates.role = role;
        if (statut !== undefined) updates.statut = statut;
        if (prenom !== undefined) updates.prenom = prenom;
        if (nom !== undefined) updates.nom = nom;
        if (date_naissance !== undefined) updates.date_naissance = date_naissance;
        if (sexe !== undefined) updates.sexe = sexe;
        if (ville !== undefined) updates.ville = ville;
        if (telephone !== undefined) updates.telephone = telephone;
        if (latitude !== undefined) updates.latitude = latitude;
        if (longitude !== undefined) updates.longitude = longitude;
        if (is_pro !== undefined) updates.is_pro = is_pro;

        const updatedUser = await userDB.updateUser(userId, updates);
        if (!updatedUser) {
            return sendError(res, 'Impossible de mettre à jour l\'utilisateur', 500, null, 'UPDATE_FAILED');
        }

        sendSuccess(res, 'Utilisateur mis à jour', updatedUser);

    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * DELETE /admin/users/:id
 * Désabonner un utilisateur (soft delete par admin)
 */
router.delete('/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);

        // Vérifier si l'utilisateur existe
        const user = await userDB.getUserById(userId);
        if (!user) {
            return notFoundResponse(res, 'Utilisateur');
        }

        // Empêcher un admin de se désabonner lui-même (sécurité)
        if (userId === req.userId) {
            return sendError(res, 'Vous ne pouvez pas désactiver votre propre compte', 403, null, 'SELF_DELETE_FORBIDDEN');
        }

        const deleted = await userDB.softDeleteUser(userId);
        if (!deleted) {
            return sendError(res, 'Impossible de désactiver l\'utilisateur', 500, null, 'DELETE_FAILED');
        }

        sendSuccess(res, `Utilisateur #${userId} désactivé avec succès`);

    } catch (error) {
        internalErrorResponse(res, error);
    }
});

export default router;
