import jwt from 'jsonwebtoken';
import { getUserById } from '../dataBase/utils/user.js';
import { verifyRefreshToken, revokeRefreshToken } from '../dataBase/utils/refreshToken.js';
import { sendError } from '../utils/apiResponse.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';  // Court: 15 min

/**
 * ============================================
 * GÉNÉRATION DE TOKENS
 * ============================================
 */

/**
 * Générer un access token (court durée)
 * @param {object} payload - { userId, role }
 * @returns {string} Access token JWT
 */
export const generateAccessToken = (payload) => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_ACCESS_EXPIRES_IN });
};

/**
 * Générer la réponse complète avec les deux tokens
 * @param {object} user - L'objet utilisateur
 * @param {string} refreshToken - Le refresh token (déjà généré)
 * @param {object} metadata - Infos supplémentaires pour la réponse
 * @returns {object} Objet de réponse standardisé
 */
export const generateTokenPair = (user, refreshToken, metadata = {}) => {
    const accessToken = generateAccessToken({ 
        userId: user.id, 
        role: user.role 
    });

    return {
        accessToken,
        refreshToken,
        expiresIn: JWT_ACCESS_EXPIRES_IN,  // "15m"
        tokenType: 'Bearer',
        user: {
            id: user.id,
            nom_utilisateur: user.nom_utilisateur,
            email: user.email,
            prenom: user.prenom,
            nom: user.nom,
            role: user.role,
            statut: user.statut,
            is_pro: user.is_pro
        },
        ...metadata
    };
};

/**
 * ============================================
 * AUTHENTIFICATION AVEC ACCESS TOKEN
 * ============================================
 */

/**
 * Middleware: Vérifier l'access token (Bearer)
 * Gère aussi le cas où le token est expiré (code spécial pour le frontend)
 */
export const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return sendError(res, 'Token manquant', 401, null, 'AUTH_REQUIRED');
        }

        const token = authHeader.substring(7);
        
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Vérifier que l'utilisateur existe toujours
        const user = await getUserById(decoded.userId, ['id', 'role', 'statut']);
        
        if (!user) {
            return sendError(res, 'Utilisateur non trouvé', 401, null, 'USER_NOT_FOUND');
        }
        
        if (user.statut === 'desabonne') {
            return sendError(res, 'Compte désactivé', 401, null, 'ACCOUNT_DISABLED');
        }

        req.userId = decoded.userId;
        req.userRole = decoded.role;
        req.tokenExp = decoded.exp;  // Timestamp d'expiration
        
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return sendError(res, 'Token invalide', 401, null, 'INVALID_TOKEN');
        }
        if (error.name === 'TokenExpiredError') {
            // Code spécial pour que le frontend sache qu'il doit refresh
            return sendError(res, 'Token expiré', 401, { 
                expiredAt: error.expiredAt,
                shouldRefresh: true 
            }, 'TOKEN_EXPIRED');
        }
        return sendError(res, 'Erreur d\'authentification', 500, error.message);
    }
};

/**
 * ============================================
 * REFRESH TOKEN ENDPOINT LOGIC
 * ============================================
 */

/**
 * Rafraîchir les tokens
 * Route POST /auth/refresh
 */
export const refreshTokens = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return sendError(res, 'Refresh token manquant', 401, null, 'REFRESH_TOKEN_REQUIRED');
        }

        // Vérifier le refresh token en base
        const tokenData = await verifyRefreshToken(refreshToken);
        
        if (!tokenData) {
            return sendError(res, 'Refresh token invalide ou expiré', 401, null, 'INVALID_REFRESH_TOKEN');
        }

        // Révoquer l'ancien refresh token (rotation)
        await revokeRefreshToken(refreshToken);

        // Générer un nouveau refresh token
        const { generateRefreshToken, saveRefreshToken } = await import('../dataBase/utils/refreshToken.js');
        const newRefreshToken = generateRefreshToken();
        
        // Sauvegarder le nouveau
        const savedToken = await saveRefreshToken(
            tokenData.user_id, 
            newRefreshToken, 
            { deviceInfo: req.headers['user-agent'] }
        );

        // Générer la réponse avec les nouveaux tokens
        const response = generateTokenPair(
            {
                id: tokenData.user_id,
                role: tokenData.role,
                statut: tokenData.statut
            },
            newRefreshToken,
            { refreshedAt: new Date().toISOString() }
        );

        res.json({
            success: true,
            message: 'Tokens rafraîchis',
            data: response
        });

    } catch (error) {
        console.error('Erreur refresh token:', error);
        return sendError(res, 'Erreur lors du rafraîchissement', 500, error.message);
    }
};

/**
 * ============================================
 * DÉCONNEXION (RÉVOCATION)
 * ============================================
 */

/**
 * Déconnexion avec révocation du refresh token
 */
export const logoutWithRevocation = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        // Révoquer le refresh token si fourni
        if (refreshToken) {
            await revokeRefreshToken(refreshToken);
        }

        res.json({
            success: true,
            message: 'Déconnexion réussie'
        });
    } catch (error) {
        console.error('Erreur logout:', error);
        return sendError(res, 'Erreur lors de la déconnexion', 500, error.message);
    }
};

/**
 * ============================================
 * UTILITAIRES POUR LE FRONTEND
 * ============================================
 */

/**
 * Calculer le temps restant avant expiration (en secondes)
 * @param {number} exp - Timestamp d'expiration (du JWT)
 * @returns {number} Secondes restantes
 */
export const getTimeUntilExpiry = (exp) => {
    const now = Math.floor(Date.now() / 1000);
    return exp - now;
};

/**
 * Vérifier si le token va bientôt expirer (moins de 5 minutes)
 * @param {number} exp - Timestamp d'expiration
 * @returns {boolean}
 */
export const shouldRefreshSoon = (exp) => {
    const timeLeft = getTimeUntilExpiry(exp);
    return timeLeft < 300;  // 5 minutes = 300 secondes
};
