import { SOCKET_EVENTS } from '../events.js';
import { updateOnlineStatus, getUsersByUsernames, getUserById, getUserByUsername } from '../../dataBase/utils/user.js';
import { getAbonnements, getRelation } from '../../dataBase/utils/abonnement.js';
import { getVisibilite, peutVoir, NIVEAU } from '../../dataBase/utils/visibilite.js';
import {
    addConnection,
    removeConnection,
    isUserOnline
} from '../presence/onlineUsers.js';

/**
 * Détermine si `observerId` a le droit de voir la présence (online) de `target`.
 * Utilise exactement la même règle que la route REST GET /users/:username
 * (champ `online_status` de la visibilité + relation), pour rester cohérent.
 * @param {number} observerId
 * @param {{ id: number }} target
 * @returns {Promise<boolean>}
 */
const peutVoirPresence = async (observerId, target) => {
    if (observerId === target.id) return true;
    const [visibilite, relation] = await Promise.all([
        getVisibilite(target.id),
        getRelation(observerId, target.id)
    ]);
    const niveau = visibilite?.online_status ?? NIVEAU.TRIBU;
    return peutVoir(niveau, relation);
};

/**
 * Nom de la room Socket.IO pour un username donné.
 * Chaque user a sa propre room. Seuls ceux qui le suivent la rejoignent
 * → ils reçoivent uniquement les presence:changed qui les concernent.
 */
const presenceRoom = (username) => `presence:${username}`;

/**
 * Handler de présence (online / offline).
 *
 * Flux à la connexion :
 *   1. La socket rejoint sa propre room (`presence:<username>`).
 *   2. On charge les abonnements depuis la DB (qui est-ce que je suis ?).
 *   3. La socket rejoint les rooms des personnes suivies — uniquement
 *      celles dont la visibilité autorise l'observateur à voir leur présence.
 *   4. Si c'est le 1er appareil → marquer ONLINE + notifier les abonnés.
 *
 * Le follow / unfollow (persistance DB) est géré côté REST. Les événements
 * socket `follow`/`unfollow` ne servent qu'à (dé)s'abonner à la room de
 * présence en live, sans reconnexion, et toujours sous réserve d'autorisation.
 *
 * Déconnexion :
 *   - Si plus aucun appareil → marquer OFFLINE + notifier les abonnés.
 *   - Socket.IO nettoie les rooms automatiquement.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export const registerPresenceHandlers = async (io, socket) => {
    const userId = socket.userId;

    // Pas d'userId (connexion anonyme de test) → pas de présence à gérer.
    if (!userId) return;

    // --- 1. Résoudre le username UNE fois (utilisé dans tous les broadcasts) ---
    try {
        const user = await getUserById(userId, ['nom_utilisateur']);
        socket.username = user?.nom_utilisateur || null;
    } catch {
        socket.username = null;
    }

    if (!socket.username) return;

    // --- 2. Rejoindre sa propre room (ceux qui le suivent y sont déjà) ---
    socket.join(presenceRoom(socket.username));

    // --- 3. Rejoindre les rooms des gens qu'il suit ---
    // On attend la fin (succès ou échec) avant d'appeler addConnection,
    // pour que markPresence ne broadcast qu'une fois toutes les rooms prêtes.
    try {
        const abonnements = await getAbonnements(userId);
        await Promise.all(
            abonnements.map(async ({ username }) => {
                const target = await getUserByUsername(username);
                if (target && await peutVoirPresence(userId, target)) {
                    socket.join(presenceRoom(username));
                }
            })
        );
    } catch (error) {
        console.error('[presence] erreur chargement abonnements:', error.message);
    }

    // --- 4. Marquer online si c'est le premier appareil ---
    // Appelé après le chargement des rooms (garanti par le await ci-dessus).
    const activeSockets = addConnection(userId, socket.id);
    if (activeSockets === 1) {
        await markPresence(socket, true);
    }

    // --- 5. Follow live : rejoindre la room de présence si autorisé ---
    // Le follow est déjà persisté via REST ; ici on ne fait que s'abonner
    // à la présence en live (et on renvoie l'état courant immédiatement).
    socket.on(SOCKET_EVENTS.FOLLOW, async (payload = {}) => {
        const targetUsername = payload.username;
        if (!targetUsername || targetUsername === socket.username) return;

        try {
            const target = await getUserByUsername(targetUsername);
            if (!target) return;

            if (!(await peutVoirPresence(userId, target))) return; // non autorisé → silencieux

            socket.join(presenceRoom(targetUsername));

            // Snapshot immédiat : l'observateur connaît tout de suite l'état courant.
            socket.emit(SOCKET_EVENTS.PRESENCE_CHANGED, {
                username: targetUsername,
                online: isUserOnline(target.id),
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('[presence] erreur follow (presence):', error.message);
        }
    });

    // --- 6. Unfollow live : quitter la room de présence ---
    socket.on(SOCKET_EVENTS.UNFOLLOW, async (payload = {}) => {
        const targetUsername = payload.username;
        if (!targetUsername || targetUsername === socket.username) return;
        socket.leave(presenceRoom(targetUsername));
    });

    // --- 7. Photo instantanée : état actuel de la liste demandée ---
    socket.on(SOCKET_EVENTS.PRESENCE_LIST, async (payload = {}) => {
        try {
            const raw = Array.isArray(payload.usernames) ? payload.usernames : [];
            const usernames = raw.slice(0, 50); // limite : 50 usernames par requête

            if (usernames.length === 0) {
                return socket.emit(SOCKET_EVENTS.PRESENCE_LIST, { users: [] });
            }

            const rows = await getUsersByUsernames(usernames);

            // On ne renvoie la présence que des users dont la visibilité
            // autorise l'observateur à la voir (même règle que le reste).
            const resolved = await Promise.all(
                rows
                    .filter((row) => row.id !== userId)
                    .map(async (row) => {
                        if (!(await peutVoirPresence(userId, row))) return null;
                        return {
                            username: row.nom_utilisateur,
                            online: isUserOnline(row.id)
                        };
                    })
            );
            const users = resolved.filter(Boolean);

            socket.emit(SOCKET_EVENTS.PRESENCE_LIST, { users });
        } catch (error) {
            console.error('[presence] erreur presence:list:', error.message);
            socket.emit(SOCKET_EVENTS.PRESENCE_LIST, { users: [], error: 'Erreur serveur' });
        }
    });

    // --- 8. Déconnexion : marquer offline si plus aucun appareil ---
    socket.on('disconnect', async () => {
        const remaining = removeConnection(userId, socket.id);
        if (remaining === 0) {
            await markPresence(socket, false);
        }
    });
};

/**
 * Met à jour le statut en base et notifie UNIQUEMENT les abonnés
 * de cet utilisateur (ceux dans sa room `presence:<username>`).
 * On ne diffuse que le username (jamais l'id interne).
 */
const markPresence = async (socket, online) => {
    const userId = socket.userId;
    try {
        await updateOnlineStatus(userId, online);

        // socket.to() exclut la socket émettrice → les autres appareils
        // du même user dans la même room ne reçoivent pas le message.
        socket.to(presenceRoom(socket.username)).emit(SOCKET_EVENTS.PRESENCE_CHANGED, {
            username: socket.username,
            online,
            timestamp: new Date().toISOString()
        });

        console.log(`[presence] ${socket.username} → ${online ? 'ONLINE' : 'OFFLINE'}`);
    } catch (error) {
        console.error(`[presence] erreur maj statut user ${userId}:`, error.message);
    }
};
