# Tests Postman — Scénarios complets

## Prérequis

1. Serveur démarré : `node BackEnd/index.js`
2. Migration exécutée : `DOC/bd/migration.sql` appliqué sur la DB
3. Variable d'environnement Postman : `base_url = http://localhost:3000`

---

## Scénario 0 — Préparation : créer 3 utilisateurs de test

### 0.1 Inscription Alice (coiffeure)
```
POST {{base_url}}/auth/inscription
Content-Type: application/json

{
  "nom_utilisateur": "alice",
  "email": "alice@test.com",
  "mot_de_passe": "password123",
  "prenom": "Alice",
  "nom": "Dupont",
  "role": "coiffeur"
}
```
→ Récupérer `accessToken` → sauvegarder dans variable `token_alice`

### 0.2 Inscription Bob (client)
```
POST {{base_url}}/auth/inscription
Content-Type: application/json

{
  "nom_utilisateur": "bob",
  "email": "bob@test.com",
  "mot_de_passe": "password123",
  "prenom": "Bob",
  "nom": "Martin"
}
```
→ Sauvegarder `token_bob`

### 0.3 Inscription Sara (client)
```
POST {{base_url}}/auth/inscription
Content-Type: application/json

{
  "nom_utilisateur": "sara",
  "email": "sara@test.com",
  "mot_de_passe": "password123",
  "prenom": "Sara",
  "nom": "Klein"
}
```
→ Sauvegarder `token_sara`

---

## Scénario 1 — Profil public sans relation

**Contexte :** Bob consulte le profil d'Alice. Ils ne se suivent pas.

```
GET {{base_url}}/users/alice
Authorization: Bearer {{token_bob}}
```

**Réponse attendue :**
```json
{
  "success": true,
  "data": {
    "nom_utilisateur": "alice",
    "prenom": "Alice",
    "nom": "Dupont",
    "role": "coiffeur",
    "is_pro": false,
    "abonnements": 0,
    "abonnes": 0,
    "relation": "aucune"
    // ← is_online absent (niveau Tribu, pas de relation)
    // ← telephone absent
    // ← email absent
    // ← localisation absente (niveau par défaut = 3 Public → présente si ville renseignée)
  }
}
```

---

## Scénario 2 — Follow / Unfollow (via Socket uniquement)

> Le follow/unfollow est géré **exclusivement par Socket**.
> L'utilisateur est toujours connecté quand il agit → pas de route REST.
> Tester dans Postman WebSocket (Socket.IO) ou via l'app Flutter.

### 2.1 Bob suit Alice (Socket)
```
Événement émis : follow
Payload        : { "username": "alice" }
Socket         : token_bob connecté
```
→ INSERT en DB + Bob rejoint la room `presence:alice`  
→ Si Alice est en ligne, Bob recevra ses prochains `presence:changed`

### 2.2 Vérifier en DB que la relation existe
```sql
SELECT * FROM s_afro_dev.abonnement WHERE suiveur_id = <bob_id>;
```

### 2.3 Vérifier via REST : Bob consulte le profil Alice
```
GET {{base_url}}/users/alice
Authorization: Bearer {{token_bob}}
```
→ `relation: "je_suis"` — Bob suit Alice, pas l'inverse  
→ `is_online` absent (Tribu = mutuel requis)

### 2.4 Alice suit Bob (Socket)
```
Événement émis : follow
Payload        : { "username": "bob" }
Socket         : token_alice connecté
```

### 2.5 Vérifier profil : relation = "mutuel"
```
GET {{base_url}}/users/alice
Authorization: Bearer {{token_bob}}
```
→ `relation: "mutuel"`  
→ `is_online` **maintenant présent** (Tribu = mutuel ✓)

### 2.6 Unfollow (Socket)
```
Événement émis : unfollow
Payload        : { "username": "alice" }
Socket         : token_bob connecté
```
→ DELETE en DB + Bob quitte la room `presence:alice`

---

## Scénario 3 — Visibilité

### 3.1 Alice récupère ses paramètres
```
GET {{base_url}}/users/me/visibilite
Authorization: Bearer {{token_alice}}
```
→ Valeurs par défaut :
```json
{
  "online_status": 1,
  "telephone": 1,
  "email": 1,
  "localisation": 3,
  "date_naissance": 0
}
```

### 3.2 Alice rend son statut online public
```
PUT {{base_url}}/users/me/visibilite
Authorization: Bearer {{token_alice}}
Content-Type: application/json

{
  "online_status": 3
}
```
→ `200` — champ mis à jour

### 3.3 Sara (sans relation) consulte Alice — voit is_online maintenant
```
GET {{base_url}}/users/alice
Authorization: Bearer {{token_sara}}
```
→ `is_online` **présent** (niveau 3 = public, Sara n'a pas besoin d'être abonnée)

### 3.4 Alice masque complètement son statut
```
PUT {{base_url}}/users/me/visibilite
Authorization: Bearer {{token_alice}}
Content-Type: application/json

{
  "online_status": 0
}
```

### 3.5 Bob (mutuel avec Alice) consulte Alice — is_online absent
```
GET {{base_url}}/users/alice
Authorization: Bearer {{token_bob}}
```
→ `is_online` **absent** même en relation mutuelle (niveau 0 = personne)

### 3.6 Valeur invalide — doit échouer
```
PUT {{base_url}}/users/me/visibilite
Authorization: Bearer {{token_alice}}
Content-Type: application/json

{
  "online_status": 5
}
```
→ `400` `INVALID_VISIBILITY_LEVEL`

---

## Scénario 4 — Socket.IO (Présence en temps réel)

> Postman supporte Socket.IO depuis v10.
> Ouvrir 2 onglets Postman WebSocket en parallèle.

### 4.1 Configuration connexion

```
URL : ws://localhost:3000
Type : Socket.IO

Onglet "Config" → Auth :
  Key: token
  Value: <accessToken>

Ou dans l'URL :
  ws://localhost:3000?token=<accessToken>
```

### 4.2 Séquence de test : Alice online → Bob reçoit

**Prérequis :** Alice et Bob se suivent mutuellement (scénario 2).

```
Onglet 1 (Bob)    : connecter avec token_bob
Onglet 2 (Alice)  : connecter avec token_alice

→ Onglet 1 (Bob) doit recevoir :
  Événement : presence:changed
  Payload   : { "username": "alice", "online": true, "timestamp": "..." }
```

### 4.3 Photo instantanée des statuts
```
Onglet 1 (Bob) émet :
  Événement : presence:list
  Payload   : { "usernames": ["alice", "sara"] }

Réponse (même événement) :
  { "users": [{ "username": "alice", "online": true }, { "username": "sara", "online": false }] }
```

### 4.4 Alice se déconnecte → Bob reçoit offline
```
Déconnecter Onglet 2 (Alice)

→ Onglet 1 (Bob) reçoit :
  Événement : presence:changed
  Payload   : { "username": "alice", "online": false, "timestamp": "..." }
```

### 4.5 Bob masque son statut (online_status = 0) puis se reconnecte
```
REST : PUT /users/me/visibilite { "online_status": 0 }  (token_bob)

Déconnecter et reconnecter Onglet 1 (Bob)

→ Alice NE reçoit PAS presence:changed pour bob
  (le statut est masqué côté Socket dans markPresence)
```

### 4.6 Follow en live via Socket
```
Onglet 1 (Bob) émet :
  Événement : follow
  Payload   : { "username": "sara" }

→ Bob rejoint maintenant la room "presence:sara"
→ Si Sara se connecte ensuite, Bob reçoit presence:changed { username: "sara", online: true }
```

---

## Récapitulatif des routes REST

| Méthode | URL | Auth | Description |
|---|---|---|---|
| `GET` | `/users/:username` | ✅ | Profil public filtré par visibilité |
| `GET` | `/users/me/visibilite` | ✅ | Voir ses paramètres de visibilité |
| `PUT` | `/users/me/visibilite` | ✅ | Modifier ses paramètres de visibilité |

> `follow` et `unfollow` sont gérés **uniquement via Socket** — pas de route REST.

## Récapitulatif des événements Socket

| Événement | Direction | Payload | Description |
|---|---|---|---|
| `presence:changed` | Serveur → Client | `{ username, online, timestamp }` | Un abonné mutuel a changé d'état |
| `presence:list` | Client ↔ Serveur | `{ usernames[] }` / `{ users[] }` | Photo instantanée des statuts |
| `follow` | Client → Serveur | `{ username }` | Suivre + rejoindre la room Socket |
| `unfollow` | Client → Serveur | `{ username }` | Se désabonner + quitter la room Socket |
