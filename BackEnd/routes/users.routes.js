import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { sendSuccess, sendError, internalErrorResponse, notFoundResponse } from '../utils/apiResponse.js';
import { getUserByUsername, getUserById, listUsers } from '../dataBase/utils/user.js';
import {
    getRelation,
    getCompteurs,
    follow,
    unfollow
} from '../dataBase/utils/abonnement.js';
import {
    getVisibilite,
    updateVisibilite,
    peutVoir,
    relationToCode,
    NIVEAU,
    RELATION
} from '../dataBase/utils/visibilite.js';
import { uploadPhoto } from '../middleware/upload.js';
import { savePhoto, deletePhoto, buildPhotoUrl, getPhotoPath, photoExists } from '../utils/photo.js';
import { getProfilUtilisateur, upsertProfilUtilisateur } from '../dataBase/utils/profilUtilisateur.js';
import { listUserAccomplissements } from '../dataBase/utils/accomplissement.js';

const router = Router();

/** Profil étendu par défaut (si la ligne n'existe pas encore). */
const profilParDefaut = {
    bio: null, lien_externe: null, type_cheveux: [], coiffure_preferee: []
};

/** Valide un champ "tableau de chaînes" (type_cheveux, coiffure_preferee). */
const normaliseTableau = (val) => {
    if (!Array.isArray(val)) return null;
    return val.map((x) => String(x).trim()).filter((x) => x.length > 0);
};

/**
 * ============================================
 * ROUTES UTILISATEURS — PROFIL & ABONNEMENTS
 * ============================================
 */

/**
 * GET /users?search=<texte>&limit=10&role=coiffeur&is_pro=true
 * Recherche d'utilisateurs par prénom, nom ou nom d'utilisateur.
 * Filtres optionnels : role, is_pro.
 * Renvoie une liste légère destinée à l'autocomplétion de recherche.
 * NB: doit rester déclarée AVANT la route '/:username'.
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const search = (req.query.search || '').trim();
        const role = req.query.role ? String(req.query.role).trim() : null;
        const isPro = req.query.is_pro === 'true' ? true : undefined;

        if (search.length < 1 && !role) {
            return sendSuccess(res, 'Aucun terme de recherche', { users: [] });
        }

        const limit = Math.min(parseInt(req.query.limit) || 10, 30);
        const filters = { search };
        if (role) filters.role = role;
        if (isPro !== undefined) filters.is_pro = isPro;

        const { users } = await listUsers(filters, { limit, offset: 0 });

        const resultats = users.map((u) => ({
            nom_utilisateur: u.nom_utilisateur,
            prenom:          u.prenom,
            nom:             u.nom,
            role:            u.role,
            is_pro:          u.is_pro,
            photo_url:       buildPhotoUrl(req, u.id, u.nom_utilisateur)
        }));

        sendSuccess(res, `${resultats.length} résultat(s)`, { users: resultats });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * GET /users/me/profil
 * Récupère son propre profil étendu (bio, liens, cheveux, préférences).
 * NB: déclarée AVANT '/:username/profil' pour que 'me' ne soit pas pris
 * pour un nom d'utilisateur.
 */
router.get('/me/profil', authenticate, async (req, res) => {
    try {
        const profil = await getProfilUtilisateur(req.userId);
        sendSuccess(res, 'Profil étendu récupéré', { profil: profil ?? { user_id: req.userId, ...profilParDefaut } });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * PUT /users/me/profil
 * Met à jour son profil étendu. Champs: bio, lien_externe,
 * type_cheveux[], coiffure_preferee[].
 */
router.put('/me/profil', authenticate, async (req, res) => {
    try {
        const updates = {};

        if (req.body.bio !== undefined) {
            const bio = req.body.bio === null ? null : String(req.body.bio).trim();
            if (bio && bio.length > 200) {
                return sendError(res, 'La bio ne peut pas dépasser 200 caractères', 400, null, 'BIO_TOO_LONG');
            }
            updates.bio = bio || null;
        }

        if (req.body.lien_externe !== undefined) {
            const lien = req.body.lien_externe === null ? null : String(req.body.lien_externe).trim();
            if (lien && lien.length > 255) {
                return sendError(res, 'Le lien est trop long (max 255)', 400, null, 'LINK_TOO_LONG');
            }
            updates.lien_externe = lien || null;
        }

        if (req.body.type_cheveux !== undefined) {
            const arr = normaliseTableau(req.body.type_cheveux);
            if (arr === null) return sendError(res, 'type_cheveux doit être un tableau', 400, null, 'INVALID_ARRAY');
            updates.type_cheveux = arr;
        }

        if (req.body.coiffure_preferee !== undefined) {
            const arr = normaliseTableau(req.body.coiffure_preferee);
            if (arr === null) return sendError(res, 'coiffure_preferee doit être un tableau', 400, null, 'INVALID_ARRAY');
            updates.coiffure_preferee = arr;
        }

        const profil = await upsertProfilUtilisateur(req.userId, updates);
        sendSuccess(res, 'Profil étendu mis à jour', { profil });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * GET /users/me/accomplissements
 * Liste ses accomplissements débloqués.
 */
router.get('/me/accomplissements', authenticate, async (req, res) => {
    try {
        const accomplissements = await listUserAccomplissements(req.userId);
        sendSuccess(res, `${accomplissements.length} accomplissement(s)`, { accomplissements });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * GET /users/:username
 * Profil public d'un utilisateur.
 * Les champs sensibles sont filtrés selon la visibilité configurée
 * et la relation entre l'observateur et le propriétaire du profil.
 */
router.get('/:username', authenticate, async (req, res) => {
    try {
        const target = await getUserByUsername(req.params.username);
        if (!target) return notFoundResponse(res, 'Utilisateur');

        const observateurId = req.userId;
        const estSoiMeme = observateurId === target.id;

        const [visibilite, relation, compteurs, profilEtendu] = await Promise.all([
            getVisibilite(target.id),
            estSoiMeme ? Promise.resolve(RELATION.MUTUEL) : getRelation(observateurId, target.id),
            getCompteurs(target.id),
            getProfilUtilisateur(target.id)
        ]);

        const pe = profilEtendu ?? profilParDefaut;

        // Champs toujours publics
        const profil = {
            nom_utilisateur: target.nom_utilisateur,
            prenom:          target.prenom,
            nom:             target.nom,
            role:            target.role,
            is_pro:          target.is_pro,
            abonnements:     compteurs.abonnements,
            abonnes:         compteurs.abonnes,
            // Photo de profil : publique, null si l'utilisateur n'en a pas
            photo_url:       buildPhotoUrl(req, target.id, target.nom_utilisateur),
            // Profil étendu (public)
            bio:               pe.bio,
            lien_externe:      pe.lien_externe,
            type_cheveux:      pe.type_cheveux ?? [],
            coiffure_preferee: pe.coiffure_preferee ?? [],
            // Code entier : -1 soi-même | 0 aucune | 1 je le suis | 2 il me suit | 3 mutuel
            relation:        relationToCode(relation, estSoiMeme)
        };

        // Champs conditionnels selon visibilité
        const v = visibilite ?? {};

        if (peutVoir(v.online_status  ?? NIVEAU.TRIBU,     relation, estSoiMeme)) {
            profil.is_online = target.is_online;
        }
        if (peutVoir(v.telephone      ?? NIVEAU.TRIBU,     relation, estSoiMeme)) {
            profil.telephone = target.telephone;
        }
        if (peutVoir(v.email          ?? NIVEAU.TRIBU,     relation, estSoiMeme)) {
            profil.email = target.email;
        }
        if (peutVoir(v.localisation   ?? NIVEAU.TOUT_LE_MONDE, relation, estSoiMeme)) {
            profil.ville      = target.ville;
            profil.latitude   = target.latitude;
            profil.longitude  = target.longitude;
        }
        if (peutVoir(v.date_naissance ?? NIVEAU.PERSONNE,  relation, estSoiMeme)) {
            profil.date_naissance = target.date_naissance;
        }

        sendSuccess(res, 'Profil récupéré', profil);
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * GET /users/:username/photo
 * Sert la photo de profil d'un utilisateur (publique).
 * Le fichier est nommé par id en interne, mais l'accès se fait par username.
 */
router.get('/:username/photo', async (req, res) => {
    try {
        const target = await getUserByUsername(req.params.username);
        if (!target || !photoExists(target.id)) {
            return notFoundResponse(res, 'Photo de profil');
        }
        res.set('Cache-Control', 'public, max-age=86400'); // 1 jour
        res.sendFile(getPhotoPath(target.id));
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * GET /users/:username/accomplissements
 * Liste publique des accomplissements débloqués d'un utilisateur.
 */
router.get('/:username/accomplissements', authenticate, async (req, res) => {
    try {
        const target = await getUserByUsername(req.params.username);
        if (!target) return notFoundResponse(res, 'Utilisateur');

        const accomplissements = await listUserAccomplissements(target.id);
        sendSuccess(res, `${accomplissements.length} accomplissement(s)`, { accomplissements });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * POST /users/me/photo
 * Uploader / remplacer sa photo de profil.
 * Form-data : champ "photo" (jpeg, png, webp, gif, max 5 Mo).
 * L'image est convertie en .webp 512x512 et nommée {id}.webp.
 */
router.post('/me/photo', authenticate, (req, res) => {
    uploadPhoto(req, res, async (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return sendError(res, 'Image trop volumineuse (max 5 Mo)', 413, null, 'FILE_TOO_LARGE');
            }
            if (err.message === 'FORMAT_INVALIDE') {
                return sendError(res, 'Format non supporté (jpeg, png, webp, gif)', 400, null, 'INVALID_FORMAT');
            }
            return sendError(res, "\u00c9chec de l'upload", 400, null, 'UPLOAD_ERROR');
        }
        if (!req.file) {
            return sendError(res, 'Aucun fichier fourni (champ "photo")', 400, null, 'NO_FILE');
        }
        try {
            await savePhoto(req.file.buffer, req.userId);
            const me = await getUserById(req.userId, ['nom_utilisateur']);
            sendSuccess(res, 'Photo de profil mise à jour', {
                photo_url: buildPhotoUrl(req, req.userId, me?.nom_utilisateur)
            });
        } catch (error) {
            internalErrorResponse(res, error);
        }
    });
});

/**
 * DELETE /users/me/photo
 * Supprimer sa photo de profil.
 */
router.delete('/me/photo', authenticate, (req, res) => {
    try {
        const supprime = deletePhoto(req.userId);
        if (!supprime) return notFoundResponse(res, 'Photo de profil');
        sendSuccess(res, 'Photo de profil supprimée');
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * GET /users/me/visibilite
 * Récupérer ses propres paramètres de visibilité.
 */
router.get('/me/visibilite', authenticate, async (req, res) => {
    try {
        const visibilite = await getVisibilite(req.userId);
        if (!visibilite) return notFoundResponse(res, 'Paramètres de visibilité');

        sendSuccess(res, 'Paramètres de visibilité récupérés', visibilite);
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * PUT /users/me/visibilite
 * Mettre à jour ses paramètres de visibilité.
 * Chaque champ accepte une valeur entre 0 et 3.
 */
router.put('/me/visibilite', authenticate, async (req, res) => {
    try {
        const { online_status, telephone, email, localisation, date_naissance } = req.body;

        const updates = {};
        const champs = { online_status, telephone, email, localisation, date_naissance };

        for (const [key, val] of Object.entries(champs)) {
            if (val !== undefined) {
                const n = parseInt(val);
                if (isNaN(n) || n < 0 || n > 3) {
                    return sendError(res, `La valeur de "${key}" doit être entre 0 et 3`, 400, null, 'INVALID_VISIBILITY_LEVEL');
                }
                updates[key] = n;
            }
        }

        if (Object.keys(updates).length === 0) {
            return sendError(res, 'Aucun champ fourni', 400, null, 'EMPTY_UPDATE');
        }

        const updated = await updateVisibilite(req.userId, updates);
        sendSuccess(res, 'Visibilité mise à jour', updated);
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * POST /users/:username/abonnement
 * S'abonner à un utilisateur. Auto-abonnement interdit.
 */
router.post('/:username/abonnement', authenticate, async (req, res) => {
    try {
        const target = await getUserByUsername(req.params.username);
        if (!target) return notFoundResponse(res, 'Utilisateur');

        if (target.id === req.userId) {
            return sendError(res, 'Vous ne pouvez pas vous abonner à vous-même', 400, null, 'SELF_FOLLOW_FORBIDDEN');
        }

        await follow(req.userId, target.id);

        const relation = await getRelation(req.userId, target.id);
        sendSuccess(res, 'Abonnement ajouté', { relation: relationToCode(relation) });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * DELETE /users/:username/abonnement
 * Se désabonner d'un utilisateur.
 */
router.delete('/:username/abonnement', authenticate, async (req, res) => {
    try {
        const target = await getUserByUsername(req.params.username);
        if (!target) return notFoundResponse(res, 'Utilisateur');

        if (target.id === req.userId) {
            return sendError(res, 'Action invalide', 400, null, 'SELF_UNFOLLOW_FORBIDDEN');
        }

        await unfollow(req.userId, target.id);

        const relation = await getRelation(req.userId, target.id);
        sendSuccess(res, 'Désabonnement effectué', { relation: relationToCode(relation) });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

export default router;
