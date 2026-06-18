import jwt from 'jsonwebtoken';
import { getUserById } from '../dataBase/utils/user.js';
import { isAdmin, hasPermission, PERMISSION_LEVELS } from '../utils/permissions.js';
import { sendError } from '../utils/apiResponse.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;

/**
 * ============================================
 * AUTHENTIFICATION (Qui es-tu ?)
 * ============================================
 */

/**
 * Middleware: Vérifier que l'utilisateur est connecté (JWT valide)
 * Ajoute req.userId et req.userRole si valide
 */
export const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return sendError(res, 'Token manquant', 401, null, 'AUTH_REQUIRED');
        }

        const token = authHeader.substring(7);
        
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Vérifier que l'utilisateur existe toujours en DB
        const user = await getUserById(decoded.userId, ['id', 'role', 'statut']);
        
        if (!user) {
            return sendError(res, 'Utilisateur non trouvé', 401, null, 'USER_NOT_FOUND');
        }
        
        if (user.statut === 'desabonne') {
            return sendError(res, 'Compte désactivé', 401, null, 'ACCOUNT_DISABLED');
        }

        req.userId = decoded.userId;
        req.userRole = decoded.role;
        
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return sendError(res, 'Token invalide', 401, null, 'INVALID_TOKEN');
        }
        if (error.name === 'TokenExpiredError') {
            return sendError(res, 'Token expiré', 401, null, 'TOKEN_EXPIRED');
        }
        return sendError(res, 'Erreur d\'authentification', 500, error.message);
    }
};

/**
 * Générer un token JWT
 * @param {object} payload - { userId, role }
 * @returns {string} Token JWT
 */
export const generateToken = (payload) => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * ============================================
 * AUTORISATION (Que peux-tu faire ?)
 * ============================================
 */

/**
 * Middleware: Vérifier que l'utilisateur a un niveau de permission minimum
 * @param {number} requiredLevel - Niveau requis (PERMISSION_LEVELS.CLIENT/COIFFEUR/ADMIN)
 */
export const requirePermission = (requiredLevel) => {
    return (req, res, next) => {
        if (!req.userRole) {
            return sendError(res, 'Authentification requise', 401, null, 'AUTH_REQUIRED');
        }
        
        if (!hasPermission(req.userRole, requiredLevel)) {
            return sendError(res, 'Permission insuffisante', 403, null, 'FORBIDDEN');
        }
        
        next();
    };
};

/**
 * Middleware: Vérifier que l'utilisateur est admin
 */
export const requireAdmin = (req, res, next) => {
    if (!req.userRole) {
        return sendError(res, 'Authentification requise', 401, null, 'AUTH_REQUIRED');
    }
    
    if (!isAdmin(req.userRole)) {
        return sendError(res, 'Accès admin requis', 403, null, 'ADMIN_REQUIRED');
    }
    
    next();
};

/**
 * Middleware: Vérifier que l'utilisateur peut modifier la ressource cible
 * Règle: Admin peut tout, sinon uniquement sa propre ressource
 * @param {string} paramName - Nom du paramètre contenant l'ID cible (défaut: 'id')
 */
export const canModifyResource = (paramName = 'id') => {
    return (req, res, next) => {
        if (!req.userId || !req.userRole) {
            return sendError(res, 'Authentification requise', 401, null, 'AUTH_REQUIRED');
        }
        
        const targetId = parseInt(req.params[paramName]);
        
        // Admin peut tout modifier
        if (isAdmin(req.userRole)) {
            return next();
        }
        
        // Sinon, on ne peut modifier que sa propre ressource
        if (req.userId !== targetId) {
            return sendError(res, 'Vous ne pouvez modifier que vos propres données', 403, null, 'FORBIDDEN');
        }
        
        next();
    };
};

/**
 * Middleware combiné: Auth + Admin (pour les routes admin uniquement)
 */
export const requireAuthAdmin = [authenticate, requireAdmin];

/**
 * Middleware combiné: Auth + Permission minimum
 * @param {number} level
 */
export const requireAuthWithPermission = (level) => [authenticate, requirePermission(level)];
