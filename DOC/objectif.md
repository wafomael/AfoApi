**But de l'API**

L'API agit comme le moteur invisible derrière l'application mobile. Elle reçoit les demandes du téléphone, traite les informations, communique avec la base de données et renvoie les réponses nécessaires pour gérer les utilisateurs, l'authentification et les profils.

---

**Structure de la base de données**

- Schéma PostgreSQL : `s_afro_dev`
- Utilisateur DB applicatif : `haire_dev`

**Table `utilisateur`**

- `id` — SERIAL, clé primaire auto-générée
- `nom_utilisateur` — VARCHAR(50), unique, nullable
- `email` — VARCHAR(255), unique, NOT NULL
- `mot_de_passe` — VARCHAR(255), haché (bcrypt), NOT NULL
- `prenom`, `nom` — VARCHAR(100), NOT NULL
- `date_naissance` — DATE, nullable *(remplace âge)*
- `sexe` — ENUM : `homme / femme / non_précisé`
- `ville` — VARCHAR(100), nullable
- `telephone` — VARCHAR(20), nullable
- `role` — ENUM : `client / coiffeur / admin`, DEFAULT `client`
- `is_pro` — BOOLEAN, DEFAULT `false` *(séparé du rôle)*
- `statut` — ENUM : `actif / desabonne`, DEFAULT `actif`
- `is_online` — BOOLEAN, DEFAULT `false`
- `last_activity` — TIMESTAMP, nullable *(backup présence si crash)*
- `created_at`, `updated_at` — TIMESTAMP auto-gérés par trigger

**Ce qui n'est pas en DB**

- Photo de profil : fichier stocké côté serveur, nommé `{id}.webp` — l'URL est construite dynamiquement par l'API
- Type de cheveux : retiré de cette table, prévu dans une future table `profil_capillaire`

---

**Routes API — Authentification & sessions**

- `POST /inscription` — reçoit le formulaire, valide et crée l'utilisateur
- `POST /connexion` — vérifie identifiant + mot de passe, génère un token JWT, passe `is_online` à `TRUE`
- `GET /session` — valide le token pour la persistance de session (réouverture de l'app)
- `POST /deconnexion` — invalide le token, passe `is_online` à `FALSE`

---

**Routes API — Gestion du profil**

- `GET /profil` — retourne les données de l'utilisateur connecté
- `PUT /profil` — met à jour les champs modifiés par l'utilisateur
- `DELETE /profil` — soft delete : passe `statut` à `desabonne`, ne supprime pas la ligne

---

**À venir**

- Table `profil_capillaire` — liée à `utilisateur` via `user_id`
- Table `annonce`
- Routes liées aux annonces et à la mise en relation coiffeurs/clients