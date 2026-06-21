/**
 * Suivi en mémoire des utilisateurs connectés (présence).
 *
 * Pourquoi en mémoire ?
 * - C'est un CACHE rapide de "qui est connecté en ce moment".
 * - La SOURCE DE VÉRITÉ pour les lectures REST reste la colonne
 *   `is_online` en base (mise à jour par le handler de présence).
 *
 * Multi-appareils :
 * - Un même userId peut avoir PLUSIEURS sockets (téléphone + tablette...).
 * - On stocke donc un Set de socketIds par userId.
 * - L'utilisateur est "online" tant qu'il lui reste >= 1 socket.
 *
 * NOTE (scaling futur) :
 * - Cette Map vit dans la RAM d'UN process. En multi-serveurs, il faudra
 *   déporter ce suivi dans Redis. Le reste du code n'aura pas à changer.
 */

// userId -> Set<socketId>
const connections = new Map();

/**
 * Enregistre une nouvelle socket pour un user.
 * @returns {number} Nombre de sockets actives pour ce user après ajout.
 */
export const addConnection = (userId, socketId) => {
    if (!connections.has(userId)) {
        connections.set(userId, new Set());
    }
    connections.get(userId).add(socketId);
    return connections.get(userId).size;
};

/**
 * Retire une socket pour un user.
 * @returns {number} Nombre de sockets restantes pour ce user.
 */
export const removeConnection = (userId, socketId) => {
    const set = connections.get(userId);
    if (!set) return 0;

    set.delete(socketId);

    if (set.size === 0) {
        connections.delete(userId);
        return 0;
    }
    return set.size;
};

/**
 * @returns {boolean} true si le user a au moins une socket active.
 */
export const isUserOnline = (userId) => connections.has(userId);

/**
 * @returns {number[]} Liste des userId actuellement en ligne.
 */
export const getOnlineUserIds = () => Array.from(connections.keys());
