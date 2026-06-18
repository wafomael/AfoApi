/**
 * Niveaux de permission hiérarchiques
 * Plus le niveau est élevé, plus les droits sont importants
 */
export const PERMISSION_LEVELS = {
    CLIENT: 0,
    COIFFEUR: 1,
    ADMIN: 2
};

/**
 * Mapping des rôles DB vers niveaux
 */
export const ROLE_TO_LEVEL = {
    'client': PERMISSION_LEVELS.CLIENT,
    'coiffeur': PERMISSION_LEVELS.COIFFEUR,
    'admin': PERMISSION_LEVELS.ADMIN
};

/**
 * Vérifie si l'utilisateur a au moins le niveau requis
 * @param {string} userRole - Rôle de l'utilisateur (client/coiffeur/admin)
 * @param {number} requiredLevel - Niveau minimum requis
 * @returns {boolean}
 */
export const hasPermission = (userRole, requiredLevel) => {
    const userLevel = ROLE_TO_LEVEL[userRole] ?? PERMISSION_LEVELS.CLIENT;
    return userLevel >= requiredLevel;
};

/**
 * Vérifie si l'utilisateur est admin
 * @param {string} userRole
 * @returns {boolean}
 */
export const isAdmin = (userRole) => {
    return ROLE_TO_LEVEL[userRole] === PERMISSION_LEVELS.ADMIN;
};

/**
 * Vérifie si l'utilisateur est coiffeur ou plus
 * @param {string} userRole
 * @returns {boolean}
 */
export const isCoiffeurOrHigher = (userRole) => {
    const level = ROLE_TO_LEVEL[userRole] ?? PERMISSION_LEVELS.CLIENT;
    return level >= PERMISSION_LEVELS.COIFFEUR;
};

/**
 * Vérifie si un utilisateur peut modifier un autre utilisateur
 * Règles:
 * - Admin peut modifier n'importe qui
 * - Un user peut modifier son propre profil
 * - Personne d'autre ne peut modifier un autre user
 * @param {string} currentUserRole - Rôle de l'utilisateur qui fait l'action
 * @param {number} currentUserId - ID de l'utilisateur qui fait l'action
 * @param {number} targetUserId - ID de l'utilisateur cible
 * @returns {boolean}
 */
export const canModifyUser = (currentUserRole, currentUserId, targetUserId) => {
    // Admin peut tout faire
    if (isAdmin(currentUserRole)) return true;
    // Un user ne peut modifier que son propre profil
    return currentUserId === targetUserId;
};

/**
 * Vérifie si un utilisateur peut voir les détails d'un autre utilisateur
 * Règles:
 * - Admin voit tout
 * - Coiffeur voit les clients (pour les rendez-vous)
 * - Client voit les coiffeurs (liste publique)
 * - Un user voit son propre profil complet
 * @param {string} currentUserRole
 * @param {number} currentUserId
 * @param {number} targetUserId
 * @param {string} targetUserRole
 * @returns {boolean}
 */
export const canViewUser = (currentUserRole, currentUserId, targetUserId, targetUserRole) => {
    // Admin voit tout
    if (isAdmin(currentUserRole)) return true;
    // On voit toujours son propre profil
    if (currentUserId === targetUserId) return true;
    // Client peut voir les coiffeurs (liste publique)
    if (targetUserRole === 'coiffeur') return true;
    // Coiffeur peut voir les clients (pour prendre RDV)
    if (currentUserRole === 'coiffeur' && targetUserRole === 'client') return true;
    
    return false;
};

/**
 * Vérifie si on peut lister tous les utilisateurs
 * @param {string} userRole
 * @returns {boolean}
 */
export const canListAllUsers = (userRole) => {
    return isAdmin(userRole);
};
