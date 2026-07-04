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

    // Abonnement à la présence en live (le follow lui-même est persisté via REST).
    // Permet de (dé)s'abonner à la room de présence d'un user sans reconnexion.
    FOLLOW:   'follow',   // client → serveur : rejoindre la room de présence d'un username (si autorisé)
    UNFOLLOW: 'unfollow', // client → serveur : quitter la room de présence d'un username

    // Messagerie (chat)
    CONVERSATION_OPEN:    'conversation:open',    // client → serveur : rejoindre la room conv:<id> (si participant)
    CONVERSATION_CLOSE:   'conversation:close',   // client → serveur : quitter la room conv:<id>
    MESSAGE_SEND:         'message:send',         // client → serveur : envoyer un message (avec ack)
    MESSAGE_NEW:          'message:new',          // serveur → room conv:<id> : nouveau message
    MESSAGE_READ:         'message:read',         // client → serveur : signaler la lecture d'une conversation
    MESSAGES_READ:        'messages:read',        // serveur → user:<emetteur> : ses messages ont été lus
    CONVERSATION_UPDATED: 'conversation:updated', // serveur → user:<destinataire> : maj liste + badge non-lus
};
