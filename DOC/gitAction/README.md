# Déploiement CI/CD - Afro API

Documentation complète du déploiement automatique de l'API Afro
via GitHub Actions avec un self-hosted runner.

## Architecture

```
┌──────────────┐   git push    ┌──────────────┐
│   Ton PC     │ ────────────> │   GitHub     │
│  (dev local) │               │  (Actions)   │
└──────────────┘               └──────┬───────┘
                                      │ envoie le job
                                      ▼
                        ┌──────────────────────────┐
                        │   VM API (192.168.2.68)   │
                        │  - Self-hosted runner     │
                        │  - Node.js 20 + PM2       │
                        │  - API Express :3000      │
                        └────────────┬──────────────┘
                                     │ réseau 192.168.2.x
                                     ▼
                        ┌──────────────────────────┐
                        │   VM BD (192.168.2.65)    │
                        │  - PostgreSQL 16 :5432    │
                        │  - base afro_db           │
                        │  - schema s_afro_dev      │
                        └──────────────────────────┘
```

Pourquoi un self-hosted runner ? La VM API n'a pas d'IP publique.
Le runner installé sur la VM appelle GitHub (connexion sortante),
donc aucun port entrant à ouvrir.

---

## 1. Pré-requis sur la VM API (192.168.2.68)

### Node.js 20 + PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
sudo npm install -g pm2

# Vérifier
node -v   # v20.x
npm -v
pm2 -v
which pm2 # doit etre dans le PATH (ex: /usr/bin/pm2)
```

---

## 2. Installer le self-hosted runner

Sur GitHub : Repo -> Settings -> Actions -> Runners -> "New self-hosted runner"
-> Linux / x64. GitHub fournit un TOKEN unique.

Sur la VM API :

```bash
mkdir actions-runner && cd actions-runner

# Telecharger (version fournie par GitHub)
curl -o actions-runner-linux-x64-2.335.1.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.335.1/actions-runner-linux-x64-2.335.1.tar.gz

tar xzf ./actions-runner-linux-x64-2.335.1.tar.gz

# Configurer (avec le token GitHub)
./config.sh --url https://github.com/wafomael/AfoApi --token TON_TOKEN
```

### Lancer en service systemd (auto au boot)

```bash
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```

Le runner apparait alors "Idle" (vert) sur la page GitHub Runners.

---

## 3. Secret GitHub : ENV_FILE

Le fichier `.env` n'est jamais commit (gitignore). On le stocke dans
un secret GitHub et le workflow le régénère à chaque déploiement.

GitHub : Repo -> Settings -> Secrets and variables -> Actions
-> New repository secret

- Name : `ENV_FILE`
- Value :

```env
DB_HOST=192.168.2.65
DB_PORT=5432
DB_NAME=afro_db
DB_USER=haire_dev
DB_PASSWORD=haire_dev
DB_SCHEMA=s_afro_dev
PORT=3000
JWT_SECRET=maCleSecreteSuperSecrete
JWT_ACCESS_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN_DAYS=30
SALT_ROUNDS=10
```

IMPORTANT : `DB_HOST=192.168.2.65` (IP de la VM BD), PAS localhost,
car la BD est sur une autre VM.

> **Durée du refresh token** : contrôlée par la variable `REFRESH_TOKEN_EXPIRES_IN_DAYS`
> (défaut 30 jours). Modifie-la dans le secret `ENV_FILE` si besoin. Avant,
> cette valeur était écrite en dur dans le code à 30 jours ; elle est
> maintenant centralisée dans la configuration.

---

## 4. Le workflow GitHub Actions

Fichier : `.github/workflows/deploy.yml`

```yaml
name: Deploy Afro API

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: self-hosted

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Installer les dépendances
        run: npm install --production

      - name: Générer le fichier .env
        env:
          ENV_FILE: ${{ secrets.ENV_FILE }}
        run: echo "$ENV_FILE" > .env

      - name: Redémarrer l'API
        run: pm2 restart afro-api || pm2 start BackEnd/index.js --name afro-api

      - name: Vérification (health check)
        run: |
          sleep 3
          curl -f http://localhost:3000/ || (echo "Health check échoué" && exit 1)
```

### Explication étape par étape

| Étape | Rôle |
|-------|------|
| `runs-on: self-hosted` | Le job tourne sur le runner de la VM API |
| Checkout | Récupère le code sur la VM |
| Setup Node.js | Garantit Node 20 |
| npm install --production | Installe les deps (sans devDependencies) |
| Générer .env | Recrée le .env depuis le secret ENV_FILE |
| Redémarrer l'API | pm2 restart si existe, sinon pm2 start |
| Health check | Vérifie que l'API répond sur le port 3000 |

---

## 5. Configuration PostgreSQL sur la VM BD (192.168.2.65)

Pour que la VM API puisse joindre PostgreSQL sur une autre VM.

### 5.1 listen_addresses (écoute réseau)

```bash
sudo nano /etc/postgresql/16/main/postgresql.conf
```

```conf
listen_addresses = 'localhost,192.168.2.65'
```

ATTENTION : mettre l'IP REELLE de la VM BD. Une faute de frappe
(ex: 192.168.8.65 au lieu de 192.168.2.65) empêche PostgreSQL
d'écouter sur le réseau et provoque "Connection refused".

### 5.2 pg_hba.conf (qui a le droit de se connecter)

```bash
sudo nano /etc/postgresql/16/main/pg_hba.conf
```

```conf
# Autoriser la VM API
host    afro_db    haire_dev    192.168.2.68/32    scram-sha-256
```

### 5.3 Redémarrer et vérifier

```bash
sudo systemctl restart postgresql
sudo ss -tlnp | grep 5432
```

Résultat attendu (écoute sur l'IP réseau) :

```
LISTEN  127.0.0.1:5432
LISTEN  192.168.2.65:5432   <- indispensable
```

### 5.4 Firewall (optionnel, si ufw actif)

```bash
sudo ufw allow from 192.168.2.68 to any port 5432
```

---

## 6. Premier démarrage manuel (validation)

Avant de compter sur le workflow, valider une fois à la main sur la VM API :

```bash
cd ~/actions-runner/_work/AfoApi/AfoApi

cat .env                       # verifier que le .env est bien genere
npm install --production
pm2 start BackEnd/index.js --name afro-api
pm2 status
pm2 logs afro-api --lines 30
curl http://localhost:3000/
```

### Rendre PM2 persistant au reboot

```bash
pm2 save
pm2 startup
# Copier-coller la commande affichee, ex :
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u foham --hp /home/foham
pm2 save
```

---

## 7. Tester le déploiement automatique

```bash
git commit --allow-empty -m "test: trigger deploy"
git push origin main
```

Puis GitHub -> onglet Actions -> "Deploy Afro API" doit passer vert.

Vérification du flux complet (connexion BD inter-VM) :

```bash
curl -X POST http://localhost:3000/auth/inscription \
  -H "Content-Type: application/json" \
  -d '{"email":"vm@test.com","mot_de_passe":"password123","prenom":"Vm","nom":"Test"}'
```

Réponse attendue : `{"success":true, ... accessToken ... refreshToken ...}`

---

## 8. Dépannage (problèmes rencontrés)

| Erreur | Cause | Solution |
|--------|-------|----------|
| `pm2: command not found` | Node/PM2 pas installé sur la VM API | Installer Node 20 + `npm i -g pm2` |
| `curl port 3000 refused` | L'API n'a pas démarré | Vérifier `pm2 logs afro-api` |
| `ECONNREFUSED 192.168.2.65:5432` | PostgreSQL n'écoute pas le réseau | Corriger `listen_addresses` + restart |
| `ss` montre seulement `127.0.0.1:5432` | listen_addresses = localhost ou IP erronée | Mettre la bonne IP de la VM BD |
| `relation "utilisateur" does not exist` | Manque le préfixe schéma | `SELECT ... FROM s_afro_dev.utilisateur` |
| `syntax error near "50"` | `limite` au lieu de `limit` | Utiliser `LIMIT 50` (anglais) |
| `npm test` fait échouer le job | script test = `exit 1` | Retirer l'étape test (pas de tests définis) |
| `DATABASE_URL` ignoré | Le code lit DB_HOST, DB_PORT... séparés | Utiliser ENV_FILE avec les vraies variables |

---

## 9. Commandes utiles du runner

```bash
cd ~/actions-runner

sudo ./svc.sh status     # statut du service
sudo ./svc.sh stop       # arrêter
sudo ./svc.sh start      # démarrer
sudo ./svc.sh uninstall  # désinstaller le service

./config.sh remove --token TOKEN   # retirer le runner de GitHub
```

---

## 10. Sécurité

- Repo PRIVÉ obligatoire avec un self-hosted runner (sinon un fork
  malveillant pourrait exécuter du code sur ta VM).
- Le `.env` n'est jamais commit ; il vit dans le secret ENV_FILE.
- `pg_hba.conf` limite l'accès à l'IP de la VM API (`/32`).
- En production : envisager Nginx reverse proxy + HTTPS (Let's Encrypt)
  devant l'API, et SSL pour la connexion PostgreSQL.

---

## Récapitulatif de l'état final

| Élément | Statut |
|---------|--------|
| Self-hosted runner (VM API) | OK |
| Node.js 20 + PM2 | OK |
| Secret ENV_FILE (DB_HOST=192.168.2.65) | OK |
| Workflow deploy.yml | OK |
| PostgreSQL écoute 192.168.2.65:5432 | OK |
| pg_hba.conf autorise 192.168.2.68 | OK |
| Connexion inter-VM API <-> BD | OK |
| Déploiement auto sur push main | OK |
