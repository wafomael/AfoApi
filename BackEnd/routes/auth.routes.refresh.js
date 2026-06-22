import { Router } from 'express';
import bcrypt from 'bcrypt';
import { authenticate, generateTokenPair, refreshTokens, logoutWithRevocation } from '../middleware/tokens.js';
import { validate } from '../middleware/validate.js';
import { sendSuccess, sendError, internalErrorResponse } from '../utils/apiResponse.js';
import * as userDB from '../dataBase/utils/user.js';
import * as refreshTokenDB from '../dataBase/utils/refreshToken.js';
import { buildPhotoUrl, deletePhoto } from '../utils/photo.js';
import {
    inscriptionSchema,
    connexionSchema,
    updateProfilSchema
} from '../validators/user.validator.js';

const router = Router();
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS) || 10;

/**
 * ============================================
 * AUTHENTIFICATION AVEC REFRESH TOKEN
 * ============================================
 * 
 * Flow:
 * 1. Inscription/Connexion → Reçoit accessToken (15min) + refreshToken (30j)
 * 2. Frontend stocke les deux dans localStorage
 * 3. Utilise accessToken pour les requêtes API
 * 4. Quand accessToken expire (401) → POST /auth/refresh avec refreshToken
 * 5. Reçoit nouveau accessToken + nouveau refreshToken (rotation)
 * 6. Déconnexion → Révoque le refreshToken
 */

/**
 * POST /auth/inscription
 * Créer un compte avec tokens
 */
router.post('/inscription', validate(inscriptionSchema), async (req, res) => {
    try {
        const {
            nom_utilisateur, email, mot_de_passe, prenom, nom,
            date_naissance, sexe, ville, telephone, latitude, longitude
        } = req.body;

        // Vérifier unicités
        if (await userDB.emailExists(email)) {
            return sendError(res, 'Cet email est déjà utilisé', 409, null, 'EMAIL_EXISTS');
        }
        if (nom_utilisateur && await userDB.usernameExists(nom_utilisateur)) {
            return sendError(res, 'Ce nom d\'utilisateur est déjà pris', 409, null, 'USERNAME_EXISTS');
        }

        // Créer l'utilisateur
        const hashedPassword = await bcrypt.hash(mot_de_passe, SALT_ROUNDS);
        const newUser = await userDB.createUser({
            nom_utilisateur, email, mot_de_passe: hashedPassword, prenom, nom,
            date_naissance, sexe, ville, telephone, latitude, longitude,
            role: 'client', is_pro: false
        });

        // Générer refresh token
        const refreshToken = refreshTokenDB.generateRefreshToken();
        await refreshTokenDB.saveRefreshToken(
            newUser.id, 
            refreshToken, 
            { deviceInfo: req.headers['user-agent'] }
        );

        // Réponse avec les deux tokens
        const tokenData = generateTokenPair(newUser, refreshToken);

        sendSuccess(res, 'Inscription réussie', tokenData, 201);

    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * POST /auth/connexion
 * Connecter et recevoir les tokens
 */
router.post('/connexion', validate(connexionSchema), async (req, res) => {
    try {
        const { email, mot_de_passe } = req.body;

        // Vérifier credentials
        const credentials = await userDB.getUserCredentials(email);
        if (!credentials || !(await bcrypt.compare(mot_de_passe, credentials.mot_de_passe))) {
            return sendError(res, 'Email ou mot de passe incorrect', 401, null, 'INVALID_CREDENTIALS');
        }

        // Mettre à jour statut
        await userDB.updateOnlineStatus(credentials.id, true);

        // Récupérer données complètes
        const user = await userDB.getUserById(credentials.id);

        // Générer refresh token
        const refreshToken = refreshTokenDB.generateRefreshToken();
        await refreshTokenDB.saveRefreshToken(
            user.id,
            refreshToken,
            { deviceInfo: req.headers['user-agent'] }
        );

        // Réponse avec tokens
        const tokenData = generateTokenPair(user, refreshToken);

        sendSuccess(res, 'Connexion réussie', tokenData);

    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * POST /auth/refresh
 * Rafraîchir les tokens (quand accessToken expire)
 */
router.post('/refresh', refreshTokens);

/**
 * POST /auth/deconnexion
 * Déconnecter et révoquer le refresh token
 */
router.post('/deconnexion', authenticate, logoutWithRevocation);

/**
 * POST /auth/deconnexion-globale
 * Révoquer TOUS les refresh tokens de l'utilisateur (déconnexion de tous les appareils)
 */
router.post('/deconnexion-globale', authenticate, async (req, res) => {
    try {
        const count = await refreshTokenDB.revokeAllUserTokens(req.userId);
        await userDB.updateOnlineStatus(req.userId, false);

        sendSuccess(res, `Déconnexion réussie sur ${count} appareil(s)`);
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * ============================================
 * SESSION & PROFIL
 * ============================================
 */

/**
 * GET /auth/session
 * Vérifier session et récupérer temps avant expiration
 */
router.get('/session', authenticate, async (req, res) => {
    try {
        const user = await userDB.getUserById(req.userId);
        if (!user) {
            return sendError(res, 'Utilisateur non trouvé', 404, null, 'USER_NOT_FOUND');
        }

        // Calculer temps restant avant expiration
        const timeLeft = req.tokenExp ? req.tokenExp - Math.floor(Date.now() / 1000) : null;

        sendSuccess(res, 'Session valide', {
            user: { ...user, photo_url: buildPhotoUrl(req, user.id, user.nom_utilisateur) },
            tokenExpiresIn: timeLeft,  // secondes
            shouldRefresh: timeLeft && timeLeft < 300  // true si < 5 min
        });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * GET /auth/profil
 */
router.get('/profil', authenticate, async (req, res) => {
    try {
        const user = await userDB.getUserById(req.userId);
        if (!user) return sendError(res, 'Profil non trouvé', 404, null, 'USER_NOT_FOUND');
        sendSuccess(res, 'Profil récupéré', { ...user, photo_url: buildPhotoUrl(req, user.id, user.nom_utilisateur) });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * PUT /auth/profil
 */
router.put('/profil', authenticate, validate(updateProfilSchema), async (req, res) => {
    try {
        const updates = {};
        const fields = ['nom_utilisateur', 'email', 'mot_de_passe', 'prenom', 'nom', 
                       'date_naissance', 'sexe', 'ville', 'telephone', 'latitude', 'longitude'];

        for (const field of fields) {
            if (req.body[field] !== undefined) {
                if (field === 'nom_utilisateur' && req.body[field]) {
                    if (await userDB.usernameExists(req.body[field], req.userId)) {
                        return sendError(res, 'Ce nom d\'utilisateur est déjà pris', 409, null, 'USERNAME_EXISTS');
                    }
                }
                if (field === 'email') {
                    if (await userDB.emailExists(req.body[field], req.userId)) {
                        return sendError(res, 'Cet email est déjà utilisé', 409, null, 'EMAIL_EXISTS');
                    }
                }
                if (field === 'mot_de_passe') {
                    updates[field] = await bcrypt.hash(req.body[field], SALT_ROUNDS);
                } else {
                    updates[field] = req.body[field];
                }
            }
        }

        const updatedUser = await userDB.updateUser(req.userId, updates);
        if (!updatedUser) return sendError(res, 'Mise à jour échouée', 500, null, 'UPDATE_FAILED');

        sendSuccess(res, 'Profil mis à jour', updatedUser);
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * DELETE /auth/profil
 */
router.delete('/profil', authenticate, async (req, res) => {
    try {
        // Révoquer tous les tokens
        await refreshTokenDB.revokeAllUserTokens(req.userId);
        
        const deleted = await userDB.softDeleteUser(req.userId);
        if (!deleted) return sendError(res, 'Suppression échouée', 500, null, 'DELETE_FAILED');

        // Nettoyer le fichier photo pour ne pas laisser d'orphelin
        deletePhoto(req.userId);

        sendSuccess(res, 'Compte désactivé avec succès');
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

export default router;
