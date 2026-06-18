# Documentation API Afro

## Base URL
```
http://localhost:3000
```

## En-têtes communs

### Pour routes publiques
```
Content-Type: application/json
```

### Pour routes protégées
```
Content-Type: application/json
Authorization: Bearer <token>
```

---

## Authentification (Auth Routes)

Base path: `/auth`

### 1. Inscription

**POST** `/auth/inscription`

Créer un nouveau compte utilisateur (rôle: client par défaut).

#### Requête
```json
{
  "email": "user@example.com",
  "mot_de_passe": "password123",
  "prenom": "John",
  "nom": "Doe",
  "nom_utilisateur": "johndoe",
  "date_naissance": "1990-01-15",
  "sexe": "homme",
  "ville": "Paris",
  "telephone": "+33 6 12 34 56 78",
  "latitude": 48.8566,
  "longitude": 2.3522
}
```

#### Champs obligatoires
| Champ | Type | Description |
|-------|------|-------------|
| `email` | string | Email valide |
| `mot_de_passe` | string | Min 8 caractères |
| `prenom` | string | Min 2 caractères |
| `nom` | string | Min 2 caractères |

#### Succès 201
```json
{
  "success": true,
  "message": "Inscription réussie",
  "data": {
    "user": {
      "id": 1,
      "nom_utilisateur": "johndoe",
      "email": "user@example.com",
      "prenom": "John",
      "nom": "Doe",
      "role": "client",
      "statut": "actif",
      "is_pro": false,
      "is_online": false,
      "ville": "Paris",
      "latitude": 48.8566,
      "longitude": 2.3522,
      "created_at": "2026-01-15T10:30:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### Erreurs
```json
// 400 - Validation Joi
{
  "success": false,
  "message": "Erreur de validation",
  "details": {
    "email": "Format email invalide",
    "mot_de_passe": "Le mot de passe doit faire au moins 8 caractères"
  },
  "errorCode": "VALIDATION_ERROR"
}

// 409 - Email existant
{
  "success": false,
  "message": "Cet email est déjà utilisé",
  "errorCode": "EMAIL_EXISTS"
}

// 409 - Username existant
{
  "success": false,
  "message": "Ce nom d'utilisateur est déjà pris",
  "errorCode": "USERNAME_EXISTS"
}
```

---

### 2. Connexion

**POST** `/auth/connexion`

Connecter un utilisateur existant.

#### Requête
```json
{
  "email": "user@example.com",
  "mot_de_passe": "password123"
}
```

#### Succès 200
```json
{
  "success": true,
  "message": "Connexion réussie",
  "data": {
    "user": {
      "id": 1,
      "nom_utilisateur": "johndoe",
      "email": "user@example.com",
      "prenom": "John",
      "nom": "Doe",
      "role": "client",
      "statut": "actif",
      "is_pro": false,
      "is_online": true,
      "ville": "Paris",
      "latitude": 48.8566,
      "longitude": 2.3522,
      "created_at": "2026-01-15T10:30:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### Erreurs
```json
// 401 - Identifiants invalides
{
  "success": false,
  "message": "Email ou mot de passe incorrect",
  "errorCode": "INVALID_CREDENTIALS"
}

// 400 - Validation Joi
{
  "success": false,
  "message": "Erreur de validation",
  "details": {
    "email": "L'email est requis",
    "mot_de_passe": "Le mot de passe est requis"
  },
  "errorCode": "VALIDATION_ERROR"
}
```

---

### 3. Déconnexion

**POST** `/auth/deconnexion`

Déconnecter l'utilisateur connecté.

#### Headers
```
Authorization: Bearer <token>
```

#### Requête
Body vide

#### Succès 200
```json
{
  "success": true,
  "message": "Déconnexion réussie",
  "data": null
}
```

#### Erreurs
```json
// 401 - Non authentifié
{
  "success": false,
  "message": "Token manquant",
  "errorCode": "AUTH_REQUIRED"
}

// 401 - Token invalide
{
  "success": false,
  "message": "Token invalide",
  "errorCode": "INVALID_TOKEN"
}

// 401 - Token expiré
{
  "success": false,
  "message": "Token expiré",
  "errorCode": "TOKEN_EXPIRED"
}
```

---

### 4. Vérifier Session

**GET** `/auth/session`

Vérifier la validité du token et récupérer l'utilisateur courant.

#### Headers
```
Authorization: Bearer <token>
```

#### Succès 200
```json
{
  "success": true,
  "message": "Session valide",
  "data": {
    "user": {
      "id": 1,
      "nom_utilisateur": "johndoe",
      "email": "user@example.com",
      "prenom": "John",
      "nom": "Doe",
      "role": "client",
      "statut": "actif",
      "is_pro": false,
      "is_online": true,
      "ville": "Paris",
      "latitude": 48.8566,
      "longitude": 2.3522,
      "created_at": "2026-01-15T10:30:00.000Z"
    }
  }
}
```

#### Erreurs
```json
// 404 - Utilisateur supprimé depuis
{
  "success": false,
  "message": "Utilisateur non trouvé",
  "errorCode": "USER_NOT_FOUND"
}

// 401 - Compte désactivé
{
  "success": false,
  "message": "Compte désactivé",
  "errorCode": "ACCOUNT_DISABLED"
}
```

---

### 5. Voir son Profil

**GET** `/auth/profil`

Récupérer les informations de l'utilisateur connecté.

#### Headers
```
Authorization: Bearer <token>
```

#### Succès 200
```json
{
  "success": true,
  "message": "Profil récupéré",
  "data": {
    "id": 1,
    "nom_utilisateur": "johndoe",
    "email": "user@example.com",
    "prenom": "John",
    "nom": "Doe",
    "date_naissance": "1990-01-15",
    "sexe": "homme",
    "ville": "Paris",
    "telephone": "+33 6 12 34 56 78",
    "latitude": 48.8566,
    "longitude": 2.3522,
    "role": "client",
    "statut": "actif",
    "is_pro": false,
    "is_online": true,
    "created_at": "2026-01-15T10:30:00.000Z",
    "updated_at": "2026-01-15T10:30:00.000Z"
  }
}
```

#### Erreurs
```json
// 404 - Profil non trouvé
{
  "success": false,
  "message": "Profil non trouvé",
  "errorCode": "USER_NOT_FOUND"
}
```

---

### 6. Modifier son Profil

**PUT** `/auth/profil`

Modifier les informations du profil. Au moins un champ requis.

#### Headers
```
Authorization: Bearer <token>
```

#### Requête
```json
{
  "nom_utilisateur": "john_new",
  "email": "newemail@example.com",
  "mot_de_passe": "newpassword123",
  "prenom": "Johnny",
  "ville": "Lyon",
  "latitude": 45.7640,
  "longitude": 4.8357
}
```

#### Succès 200
```json
{
  "success": true,
  "message": "Profil mis à jour",
  "data": {
    "id": 1,
    "nom_utilisateur": "john_new",
    "email": "newemail@example.com",
    "prenom": "Johnny",
    "nom": "Doe",
    "ville": "Lyon",
    "latitude": 45.7640,
    "longitude": 4.8357,
    "role": "client",
    "statut": "actif",
    "updated_at": "2026-01-15T12:00:00.000Z"
  }
}
```

#### Erreurs
```json
// 400 - Aucun champ fourni (Joi)
{
  "success": false,
  "message": "Erreur de validation",
  "details": {
    "": "Au moins un champ doit être fourni pour la mise à jour"
  },
  "errorCode": "VALIDATION_ERROR"
}

// 409 - Email déjà utilisé
{
  "success": false,
  "message": "Cet email est déjà utilisé",
  "errorCode": "EMAIL_EXISTS"
}

// 409 - Username déjà pris
{
  "success": false,
  "message": "Ce nom d'utilisateur est déjà pris",
  "errorCode": "USERNAME_EXISTS"
}
```

---

### 7. Désactiver son Compte (Soft Delete)

**DELETE** `/auth/profil`

Désactiver son propre compte (soft delete).

#### Headers
```
Authorization: Bearer <token>
```

#### Succès 200
```json
{
  "success": true,
  "message": "Compte désactivé avec succès",
  "data": null
}
```

---

## Administration (Admin Routes)

**⚠️ Toutes ces routes nécessitent un token admin.**

Base path: `/admin/users`

---

### 1. Lister tous les Utilisateurs

**GET** `/admin/users`

Récupérer la liste paginée des utilisateurs avec filtres optionnels.

#### Headers
```
Authorization: Bearer <token_admin>
```

#### Query Parameters (optionnels)
| Param | Type | Description | Défaut |
|-------|------|-------------|--------|
| `page` | integer | Numéro de page | 1 |
| `limit` | integer | Résultats par page (max 100) | 20 |
| `role` | string | Filtrer par rôle: `client`, `coiffeur`, `admin` | - |
| `search` | string | Recherche texte (min 2 caractères) | - |

#### Exemple
```
GET /admin/users?page=1&limit=10&role=client&search=john
```

#### Succès 200
```json
{
  "success": true,
  "message": "42 utilisateur(s) trouvé(s)",
  "data": {
    "users": [
      {
        "id": 1,
        "nom_utilisateur": "johndoe",
        "email": "john@example.com",
        "prenom": "John",
        "nom": "Doe",
        "role": "client",
        "statut": "actif",
        "is_pro": false,
        "is_online": false,
        "ville": "Paris",
        "created_at": "2026-01-15T10:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 42,
      "totalPages": 5
    }
  }
}
```

#### Erreurs
```json
// 403 - Non admin
{
  "success": false,
  "message": "Accès réservé aux administrateurs",
  "errorCode": "ADMIN_REQUIRED"
}
```

---

### 2. Voir un Utilisateur

**GET** `/admin/users/:id`

Récupérer les détails d'un utilisateur spécifique.

#### Headers
```
Authorization: Bearer <token_admin>
```

#### Exemple
```
GET /admin/users/1
```

#### Succès 200
```json
{
  "success": true,
  "message": "Utilisateur récupéré",
  "data": {
    "id": 1,
    "nom_utilisateur": "johndoe",
    "email": "john@example.com",
    "prenom": "John",
    "nom": "Doe",
    "date_naissance": "1990-01-15",
    "sexe": "homme",
    "ville": "Paris",
    "telephone": "+33 6 12 34 56 78",
    "latitude": 48.8566,
    "longitude": 2.3522,
    "role": "client",
    "statut": "actif",
    "is_pro": false,
    "is_online": false,
    "created_at": "2026-01-15T10:30:00.000Z",
    "updated_at": "2026-01-15T10:30:00.000Z"
  }
}
```

#### Erreurs
```json
// 404 - Utilisateur non trouvé
{
  "success": false,
  "message": "Utilisateur non trouvé",
  "errorCode": "NOT_FOUND"
}
```

---

### 3. Créer un Utilisateur (Admin)

**POST** `/admin/users`

Créer un utilisateur avec un rôle spécifique (client, coiffeur, ou admin).

#### Headers
```
Authorization: Bearer <token_admin>
```

#### Requête
```json
{
  "email": "coiffeur@example.com",
  "mot_de_passe": "password123",
  "prenom": "Marie",
  "nom": "Dupont",
  "nom_utilisateur": "marie_coiffure",
  "ville": "Paris",
  "telephone": "+33 6 98 76 54 32",
  "latitude": 48.8566,
  "longitude": 2.3522,
  "role": "coiffeur",
  "is_pro": true
}
```

#### Champs spécifiques admin
| Champ | Type | Description | Défaut |
|-------|------|-------------|--------|
| `role` | string | `client`, `coiffeur`, `admin` | `client` |
| `is_pro` | boolean | Statut professionnel | `false` |

#### Succès 201
```json
{
  "success": true,
  "message": "Utilisateur coiffeur créé avec succès",
  "data": {
    "id": 2,
    "nom_utilisateur": "marie_coiffure",
    "email": "coiffeur@example.com",
    "prenom": "Marie",
    "nom": "Dupont",
    "role": "coiffeur",
    "statut": "actif",
    "is_pro": true,
    "is_online": false,
    "ville": "Paris",
    "created_at": "2026-01-15T14:00:00.000Z"
  }
}
```

#### Erreurs
```json
// 400 - Rôle invalide
{
  "success": false,
  "message": "Erreur de validation",
  "details": {
    "role": "Le rôle doit être: client, coiffeur, ou admin"
  },
  "errorCode": "VALIDATION_ERROR"
}
```

---

### 4. Modifier un Utilisateur (Admin)

**PUT** `/admin/users/:id`

Modifier n'importe quel utilisateur. Au moins un champ requis.

#### Headers
```
Authorization: Bearer <token_admin>
```

#### Exemple
```
PUT /admin/users/2
```

#### Requête
```json
{
  "role": "admin",
  "statut": "actif",
  "is_pro": true,
  "ville": "Lyon"
}
```

#### Succès 200
```json
{
  "success": true,
  "message": "Utilisateur mis à jour",
  "data": {
    "id": 2,
    "nom_utilisateur": "marie_coiffure",
    "email": "coiffeur@example.com",
    "prenom": "Marie",
    "nom": "Dupont",
    "role": "admin",
    "statut": "actif",
    "is_pro": true,
    "ville": "Lyon",
    "updated_at": "2026-01-15T15:00:00.000Z"
  }
}
```

#### Erreurs
```json
// 400 - Statut invalide
{
  "success": false,
  "message": "Erreur de validation",
  "details": {
    "statut": "Le statut doit être: actif ou desabonne"
  },
  "errorCode": "VALIDATION_ERROR"
}
```

---

### 5. Désactiver un Utilisateur (Admin)

**DELETE** `/admin/users/:id`

Soft delete d'un utilisateur par son ID.

#### Headers
```
Authorization: Bearer <token_admin>
```

#### Exemple
```
DELETE /admin/users/2
```

#### Succès 200
```json
{
  "success": true,
  "message": "Utilisateur #2 désactivé avec succès",
  "data": null
}
```

#### Erreurs
```json
// 403 - Auto-désactivation interdite
{
  "success": false,
  "message": "Vous ne pouvez pas désactiver votre propre compte",
  "errorCode": "SELF_DELETE_FORBIDDEN"
}

// 404 - Utilisateur inexistant
{
  "success": false,
  "message": "Utilisateur non trouvé",
  "errorCode": "NOT_FOUND"
}
```

---

### 6. Modifier le Statut Online (Admin)

**POST** `/admin/users/:id/activity`

Forcer le statut online/offline d'un utilisateur.

#### Headers
```
Authorization: Bearer <token_admin>
```

#### Exemple
```
POST /admin/users/2/activity
```

#### Requête
```json
{
  "is_online": false
}
```

#### Succès 200
```json
{
  "success": true,
  "message": "Statut de Marie Dupont mis à jour",
  "data": {
    "userId": 2,
    "is_online": false
  }
}
```

#### Erreurs
```json
// 400 - Champ manquant
{
  "success": false,
  "message": "Erreur de validation",
  "details": {
    "is_online": "Le statut is_online est requis"
  },
  "errorCode": "VALIDATION_ERROR"
}
```

---

## Codes d'Erreur Globaux

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Erreur de validation des données (Joi) |
| `AUTH_REQUIRED` | Token manquant |
| `INVALID_TOKEN` | Token invalide |
| `TOKEN_EXPIRED` | Token expiré |
| `USER_NOT_FOUND` | Utilisateur introuvable |
| `ACCOUNT_DISABLED` | Compte désactivé (statut: desabonne) |
| `INVALID_CREDENTIALS` | Email ou mot de passe incorrect |
| `EMAIL_EXISTS` | Email déjà utilisé |
| `USERNAME_EXISTS` | Nom d'utilisateur déjà pris |
| `ADMIN_REQUIRED` | Accès réservé aux admins |
| `SELF_DELETE_FORBIDDEN` | Impossible de se désactiver soi-même |
| `NOT_FOUND` | Ressource non trouvée |
| `NO_CHANGES` | Aucune modification à effectuer |
| `UPDATE_FAILED` | Échec de la mise à jour |
| `DELETE_FAILED` | Échec de la suppression |

---

## Codes HTTP

| Code | Signification |
|------|---------------|
| 200 | OK - Succès |
| 201 | Created - Création réussie |
| 400 | Bad Request - Requête invalide |
| 401 | Unauthorized - Non authentifié |
| 403 | Forbidden - Non autorisé |
| 404 | Not Found - Ressource non trouvée |
| 409 | Conflict - Conflit (unicité) |
| 500 | Internal Server Error - Erreur serveur |

---

## Rôles et Permissions

| Rôle | Niveau | Description |
|------|--------|-------------|
| `client` | 0 | Utilisateur standard |
| `coiffeur` | 1 | Professionnel de la coiffure |
| `admin` | 2 | Administrateur (accès total) |
