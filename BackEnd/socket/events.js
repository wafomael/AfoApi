/**
 * Noms des événements Socket.IO centralisés.
 *
 * Pourquoi : les noms d'événements sont des chaînes de caractères.
 * Une faute de frappe (ex: 'test:strat') ne lève aucune erreur, le
 * handler ne se déclenche juste jamais → bug silencieux difficile à trouver.
 * En les centralisant ici, on évite les fautes et on profite de
 * l'autocomplétion.
 */
export const SOCKET_EVENTS = {
    // Test
    TEST_START: 'test:start',
    TEST_RESPONSE: 'test:response',

    // Présence
    PRESENCE_CHANGED: 'presence:changed', // serveur → clients : un user a changé d'état
    PRESENCE_LIST:    'presence:list',    // client ↔ serveur : photo instantanée des statuts

    // Abonnements (follow/unfollow en live — met à jour les rooms de présence)
    FOLLOW:   'follow',   // client → serveur : commencer à suivre un username
    UNFOLLOW: 'unfollow', // client → serveur : arrêter de suivre un username

    // (Futur) Chat
    // MESSAGE_SEND: 'message:send',
    // MESSAGE_NEW: 'message:new',
};
