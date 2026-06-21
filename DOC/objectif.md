**But de l'API**

L'API agit comme le moteur invisible derrière l'application mobile. Elle reçoit les demandes du téléphone, traite les informations, communique avec la base de données et renvoie les réponses nécessaires pour gérer les utilisateurs, l'authentification, les profils, les abonnements et la présence en temps réel.

---

# RAPPORT D'ÉTAT — Sprint 1

*Dernière mise à jour : Juin 2026*

---

## Base de données — `s_afro_dev`

- Schéma PostgreSQL : `s_afro_dev`
- Utilisateur DB applicatif : `haire_dev`

### Tables existantes ✅

**`utilisateur`**
- `id`, `nom_utilisateur`, `email`, `mot_de_passe` (bcrypt)
- `prenom`, `nom`, `date_naissance`, `sexe`, `ville`, `latitude`, `longitude`, `telephone`
- `role` ENUM (`client / coiffeur / admin`), `is_pro` BOOLEAN
- `statut` ENUM (`actif / desabonne`), `is_online` BOOLEAN, `last_activity` TIMESTAMP
- `created_at`, `updated_at` — auto-gérés par trigger `trg_utilisateur_updated_at`

**`abonnement`** ✅ *(Sprint 1)*
- `suiveur_id`, `suivi_id` — FK vers `utilisateur`, PK composite
- `created_at` TIMESTAMP
- Contrainte `no_self_follow`, `ON DELETE CASCADE`
- Index sur `suiveur_id` (connexion Socket) et `suivi_id` (stats profil)

**`visibilite_utilisateur`** ✅ *(Sprint 1)*
- `utilisateur_id` — PK, FK vers `utilisateur`, `ON DELETE CASCADE`
- `online_status`, `telephone`, `email`, `localisation`, `date_naissance` — SMALLINT 0-3
- Niveaux : `0=Personne / 1=Tribu(défaut) / 2=Abonnés / 3=Public`
- Trigger `trg_create_visibilite` — ligne créée automatiquement à chaque inscription
- `updated_at` TIMESTAMP

**`refresh_token`** ✅
- Gestion multi-appareils, rotation automatique, révocation

### Migration à exécuter ⚠️
`DOC/bd/migration.sql` — contient les tables `abonnement` + `visibilite_utilisateur` + trigger + seed.
**À exécuter UNE fois sur la DB existante avant tout test.**

---

## Fichiers backend — état

### Auth & Tokens
| Fichier | État | Description |
|---|---|---|
| `routes/auth.routes.refresh.js` | ✅ | Inscription, connexion, refresh, déconnexion, profil |
| `middleware/tokens.js` | ✅ | JWT accessToken (15min) + refreshToken (30j) avec rotation |
| `middleware/auth.js` | ✅ | `authenticate`, `requireAdmin`, `requirePermission`, `requireAuthAdmin` |
| `middleware/validate.js` | ✅ | Validation Joi centralisée |
| `validators/user.validator.js` | ✅ | Schémas inscription, connexion, profil, admin |
| `dataBase/utils/refreshToken.js` | ✅ | CRUD refresh tokens avec révocation |

### Utilisateurs
| Fichier | État | Description |
|---|---|---|
| `dataBase/utils/user.js` | ✅ | `getUserById`, `getUserByUsername`, `getUsersByUsernames`, `createUser`, `updateUser`, `softDeleteUser`, `updateOnlineStatus`, `setAllUsersOffline` |
| `routes/admin/users.routes.js` | ✅ | CRUD complet admin (liste, détail, création, modif, soft delete, forcer statut) |
| `routes/users.routes.js` | ✅ *(Sprint 1)* | Profil public filtré, follow, unfollow, get/put visibilité |

### Abonnements & Visibilité
| Fichier | État | Description |
|---|---|---|
| `dataBase/utils/abonnement.js` | ✅ *(Sprint 1)* | `getAbonnements`, `isFollowing`, `follow`, `unfollow`, `getRelation`, `getCompteurs` |
| `dataBase/utils/visibilite.js` | ✅ *(Sprint 1)* | `peutVoir`, `getVisibilite`, `updateVisibilite`, constantes `NIVEAU` et `RELATION` |

### Socket.IO — Présence
| Fichier | État | Description |
|---|---|---|
| `socket/index.js` | ✅ | Init Socket.IO sur le serveur HTTP Express (même port) |
| `socket/middleware/auth.js` | ✅ | Authentification JWT à la connexion WebSocket |
| `socket/presence/onlineUsers.js` | ✅ | Cache mémoire `Map<userId, Set<socketId>>` — multi-appareils |
| `socket/events.js` | ✅ | Constantes centralisées : `PRESENCE_CHANGED`, `PRESENCE_LIST`, `FOLLOW`, `UNFOLLOW` |
| `socket/handlers/presence.handler.js` | ✅ *(Sprint 1)* | Rooms automatiques par abonnements, follow/unfollow live, markPresence |

---

## Routes REST — référence complète

### Auth (`/auth`)
| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | `/auth/inscription` | ❌ | Créer un compte |
| POST | `/auth/connexion` | ❌ | Connexion + tokens |
| POST | `/auth/refresh` | ❌ | Rafraîchir les tokens |
| POST | `/auth/deconnexion` | ✅ | Déconnecter (révoque refreshToken) |
| POST | `/auth/deconnexion-globale` | ✅ | Déconnecter tous les appareils |
| GET | `/auth/session` | ✅ | Vérifier session + temps restant |
| GET | `/auth/profil` | ✅ | Profil complet de l'utilisateur connecté |
| PUT | `/auth/profil` | ✅ | Modifier son profil |
| DELETE | `/auth/profil` | ✅ | Soft delete de son compte |

### Utilisateurs (`/users`)
| Méthode | Route | Auth | Description |
|---|---|---|---|
| GET | `/users/:username` | ✅ | Profil public filtré selon visibilité + relation |
| POST | `/users/:username/follow` | ✅ | Suivre un utilisateur |
| DELETE | `/users/:username/follow` | ✅ | Ne plus suivre |
| GET | `/users/me/visibilite` | ✅ | Voir ses paramètres de visibilité |
| PUT | `/users/me/visibilite` | ✅ | Modifier ses paramètres de visibilité (0-3) |

### Admin (`/admin/users`)
| Méthode | Route | Auth | Description |
|---|---|---|---|
| GET | `/admin/users` | ✅ Admin | Liste filtrée + paginée |
| GET | `/admin/users/:id` | ✅ Admin | Détail par ID |
| POST | `/admin/users` | ✅ Admin | Créer un utilisateur avec rôle |
| PUT | `/admin/users/:id` | ✅ Admin | Modifier n'importe quel champ |
| DELETE | `/admin/users/:id` | ✅ Admin | Soft delete |
| POST | `/admin/users/:id/activity` | ✅ Admin | Forcer le statut is_online |

### Socket.IO (WebSocket)
| Événement | Direction | Description |
|---|---|---|
| `presence:changed` | Serveur → Client | Présence d'un abonné mutuel changée |
| `presence:list` | Client ↔ Serveur | Photo instantanée des statuts |
| `follow` | Client → Serveur | Suivre + rejoindre room Socket |
| `unfollow` | Client → Serveur | Se désabonner + quitter room Socket |

---

## Documentation disponible

| Fichier | Description |
|---|---|
| `DOC/bd/shema.sql` | Schéma complet pour installation fraîche |
| `DOC/bd/abonnement.sql` | Table abonnement + requêtes de référence |
| `DOC/bd/migration.sql` | Migration Sprint 1 à exécuter sur DB existante |
| `DOC/socket.md` | Mécanisme WebSocket complet (rooms, flux, multi-appareils) |
| `DOC/postman.md` | 4 scénarios de test Postman avec requêtes exactes |

---

## Ce qui fonctionne maintenant ✅

- Inscription / connexion / déconnexion avec refresh token et rotation
- Gestion multi-appareils (déconnexion globale)
- Présence en temps réel via Socket.IO avec rooms ciblées (abonnés seulement)
- Follow / unfollow persisté en DB + mise à jour room Socket en live
- Profil public filtré dynamiquement selon la visibilité configurée et la relation
- Constantes `NIVEAU` et `RELATION` — pas de magic strings
- Reset de tous les statuts au démarrage du serveur

## Ce qui reste à faire 🔲

- **Exécuter `migration.sql`** sur la DB ← *bloquant pour tout test Sprint 1*
- Refactor du handler Socket : déplacer la persistance DB follow/unfollow côté REST uniquement (étape 7 du plan), le Socket ne faisant que `join`/`leave`
- `GET /users/:username` : exposer `is_online` filtré selon `visibilite_utilisateur.online_status` (actuellement il passe par `peutVoir` mais `getUserByUsername` ne retourne pas `is_online` — à ajouter)
- Table `profil_capillaire` (Sprint 2)
- Table `annonce` + mise en relation coiffeurs/clients (Sprint 3)
- Photo de profil : upload + service fichier `{id}.webp` (Sprint 2)