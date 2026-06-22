# Mécanisme WebSocket — Présence & Abonnements

## Architecture générale

```
Flutter (client)
    │  WebSocket (Socket.IO)
    ▼
BackEnd/socket/index.js          ← init Socket.IO sur le serveur HTTP Express
    │
    ├── middleware/auth.js        ← vérifie le JWT à la connexion
    │
    └── handlers/
        ├── test.handler.js      ← événements de test
        └── presence.handler.js  ← présence + follow/unfollow live
                │
                ├── presence/onlineUsers.js       ← cache mémoire (Map)
                ├── dataBase/utils/user.js         ← source de vérité DB
                └── dataBase/utils/abonnement.js   ← relations suiveur/suivi
```

Le serveur HTTP est **partagé** entre Express (REST) et Socket.IO (WebSocket).
Les deux tournent sur le même port.

---

## Authentification Socket

Le client envoie son JWT à la connexion :

```js
// Côté Flutter / client
const socket = io("ws://localhost:3000", {
  auth: { token: "<access_token>" }
});
```

Le middleware `authenticateSocket` vérifie le JWT.  
Si invalide → connexion refusée.  
Si absent → connexion anonyme acceptée (tests uniquement).

---

## Rooms de présence

Chaque utilisateur possède une **room nommée** `presence:<username>`.

```
Room "presence:alice"  ←  Bob y est inscrit (Bob suit Alice)
                           Sara y est inscrite (Sara suit Alice)
                           → quand Alice passe online/offline,
                             seuls Bob et Sara reçoivent l'événement.
```

Avantage : **zéro message inutile**. Pas de broadcast global.
Avec 1000 users connectés, Alice qui se connecte n'envoie un message
qu'aux users qui la suivent — pas aux 999 autres.

---

## Flux complet à la connexion

```
Alice se connecte (JWT valide)
    │
    ├─ [1] getUserById(alice_id) → socket.username = "alice"
    │
    ├─ [2] socket.join("presence:alice")
    │       Bob (qui suit Alice) est déjà dans cette room.
    │       Quand Alice passe online → Bob reçoit l'événement.
    │
    ├─ [3] getAbonnements(alice_id) → ["bob", "sara"]
    │       socket.join("presence:bob")
    │       socket.join("presence:sara")
    │       Si Bob passe online/offline → Alice reçoit l'événement.
    │
    ├─ [4] addConnection(alice_id, socketId) → activeSockets = 1
    │
    └─ [5] markPresence(online: true)
            → UPDATE utilisateur SET is_online = TRUE
            → socket.to("presence:alice").emit("presence:changed", {
                username: "alice",
                online: true,
                timestamp: "..."
              })
```

---

## Multi-appareils

Un même user peut avoir plusieurs sockets ouvertes (téléphone + tablette).  
Le tracker mémoire `onlineUsers.js` maintient un `Set<socketId>` par `userId`.

```
Alice ouvre l'app sur téléphone  → activeSockets = 1 → ONLINE  ← DB mis à jour
Alice ouvre l'app sur tablette   → activeSockets = 2 → rien    ← déjà online
Alice ferme le téléphone         → activeSockets = 1 → rien    ← tablette encore connectée
Alice ferme la tablette          → activeSockets = 0 → OFFLINE ← DB mis à jour
```

---

## Follow / Unfollow en live (abonnement présence)

**La persistance du follow se fait via REST** (`POST/DELETE /users/:username/abonnement`).
Les événements socket `follow`/`unfollow` ne servent qu'à **(dé)s'abonner à la
room de présence en live**, sans attendre la prochaine reconnexion — et
**toujours sous réserve d'autorisation** (`peutVoir(online_status, relation)`,
la même règle que le champ `is_online` de `GET /users/:username`).

```
Alice suit Charlie via REST, puis émet : follow { username: "charlie" }
    │
    ├─ getUserByUsername("charlie") → { id: 42, ... }
    ├─ peutVoirPresence(alice_id, charlie) ?
    │     non → on ignore (aucune room rejointe)
    │     oui ↓
    ├─ socket.join("presence:charlie")
    └─ socket.emit("presence:changed", { username:"charlie", online: <état courant> })
         → Alice connaît tout de suite l'état + reçoit les changements suivants.

Alice émet : unfollow { username: "charlie" }
    └─ socket.leave("presence:charlie")
         → Alice ne reçoit plus les changements de Charlie.
```

> **Note :** Si Alice ne fait que le follow REST sans émettre l'événement socket,
> la room sera synchronisée à sa **prochaine connexion** Socket
> (étape 3 : rejoint les rooms autorisées de tous ses abonnements).

---

## Déconnexion

```
Alice ferme l'app (dernier appareil)
    │
    ├─ removeConnection(alice_id, socketId) → remaining = 0
    ├─ markPresence(online: false)
    │   → UPDATE utilisateur SET is_online = FALSE
    │   → socket.to("presence:alice").emit("presence:changed", {online: false})
    └─ Socket.IO nettoie automatiquement toutes les rooms d'Alice.
```

---

## Visibilité de la présence (Sprint 1)

La table `visibilite_utilisateur` contrôle qui peut voir le statut online d'un user.  
Le champ `online_status` a 4 niveaux :

| Niveau | Valeur | Qui voit le statut |
|---|---|---|
| Personne | 0 | Personne (même les abonnés mutuels) |
| Tribu | 1 | Abonnements mutuels uniquement **(défaut)** |
| Abonnés | 2 | Tous ceux qui me suivent |
| Public | 3 | Tout le monde |

La fonction `peutVoir(niveau, relation)` (dans `utils/visibilite.js`) retourne
`true/false` selon le niveau configuré et la relation entre les deux users.

---

## Événements Socket.IO — référence client

| Événement | Direction | Payload | Description |
|---|---|---|---|
| `presence:changed` | Serveur → Client | `{ username, online, timestamp }` | Un user suivi a changé d'état |
| `presence:list` | Client ↔ Serveur | `{ usernames[] }` / `{ users[] }` | Photo instantanée des statuts (filtrée par autorisation `peutVoir`) |
| `follow` | Client → Serveur | `{ username }` | S'abonner à la présence d'un user en live (rejoint la room **si autorisé**). La persistance du follow se fait via REST. |
| `unfollow` | Client → Serveur | `{ username }` | Se désabonner de la présence (quitte la room) |

---

## Exemple Flutter (pseudo-code)

```dart
// Connexion
socket = IO.io('ws://api.example.com', {
  'auth': { 'token': accessToken }
});

// Écouter les changements de présence
socket.on('presence:changed', (data) {
  final username = data['username'];
  final isOnline = data['online'];
  // mettre à jour l'UI
});

// Photo instantanée pour une liste
socket.emitWithAck('presence:list',
  { 'usernames': ['bob', 'sara', 'charlie'] },
  ack: (response) {
    final users = response['users'];
    // [{ username: 'bob', online: true }, ...]
  }
);

// Suivre quelqu'un
socket.emit('follow', { 'username': 'charlie' });

// Ne plus suivre
socket.emit('unfollow', { 'username': 'charlie' });
```

---

## Relation REST ↔ Socket

| Action | REST | Socket |
|---|---|---|
| Statut online (photo) | `GET /users/:username` → champ `is_online` | — |
| Statut online (live) | — | Écouter `presence:changed` |
| Liste de présence (photo) | — | Émettre `presence:list` |
| Follow | `POST /users/:username/abonnement` (persistance) | Émettre `follow` pour s'abonner à la présence en live (sinon synchro à la reconnexion) |
| Unfollow | `DELETE /users/:username/abonnement` (persistance) | Émettre `unfollow` pour se désabonner de la présence |

**Source de vérité** : la colonne `is_online` en DB (mise à jour par Socket).  
**Cache temps réel** : la `Map` en mémoire dans `onlineUsers.js` (consultée par `presence:list`).

---

## Scaling futur

Le cache mémoire `onlineUsers.js` vit dans la RAM **d'un seul process**.  
En cas de déploiement multi-serveurs (cluster Node, plusieurs instances) :
- Remplacer la `Map` par un adaptateur **Redis** dans `onlineUsers.js`.
- Ajouter `socket.io-redis` dans `socket/index.js`.
- Le reste du code ne change pas.
