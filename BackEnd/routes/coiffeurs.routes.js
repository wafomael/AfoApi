import { Router } from 'express';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSION_LEVELS } from '../utils/permissions.js';
import { uploadSingleImage, uploadMedias } from '../middleware/upload.js';
import { sendSuccess, sendError, internalErrorResponse, notFoundResponse } from '../utils/apiResponse.js';
import { getUserByUsername, getUserById } from '../dataBase/utils/user.js';
import { buildPhotoUrl } from '../utils/photo.js';
import { getProfilCoiffeur, upsertProfilCoiffeur } from '../dataBase/utils/coiffeur.js';
import {
    createPrestation, getPrestationById, listPrestations,
    updatePrestation, setPrestationMediaCount, deactivatePrestation
} from '../dataBase/utils/prestation.js';
import { upsertAvis, listAvis, getAvisByClient, deleteAvis } from '../dataBase/utils/avis.js';
import {
    saveProPhoto, deleteProPhoto, getProPhotoPath, proPhotoExists, buildProPhotoUrl,
    saveBanner, deleteBanner, getBannerPath, bannerExists, buildBannerUrl
} from '../utils/coiffeurMedia.js';
import {
    savePrestationMedias, deletePrestationMedias, getPrestationMediaPath,
    prestationMediaExists, buildPrestationMediaUrls
} from '../utils/prestationMedia.js';

const router = Router();

/** Auth + rôle coiffeur minimum (pour les routes de gestion). */
const coiffeurOnly = [authenticate, requirePermission(PERMISSION_LEVELS.COIFFEUR)];

/** Gère les erreurs multer communes. */
const handleUploadError = (err, res) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return sendError(res, 'Image trop volumineuse (max 5 Mo)', 413, null, 'FILE_TOO_LARGE');
    }
    if (err.message === 'FORMAT_INVALIDE') {
        return sendError(res, 'Format non supporté (jpeg, png, webp, gif)', 400, null, 'INVALID_FORMAT');
    }
    return sendError(res, "Échec de l'upload", 400, null, 'UPLOAD_ERROR');
};

/** Sérialise une prestation pour l'API (ajoute media_urls). */
const formatPrestation = (req, p) => ({
    id:              p.id,
    coiffeur_id:     p.coiffeur_id,
    nom:             p.nom,
    categorie:       p.categorie,
    prix:            p.prix === null ? null : Number(p.prix),
    unite_prix:      p.unite_prix,
    duree_min:       p.duree_min,
    materiel_client: p.materiel_client,
    description:     p.description,
    media_count:     p.media_count,
    media_urls:      buildPrestationMediaUrls(req, p.id, p.media_count),
    actif:           p.actif,
    created_at:      p.created_at
});

/**
 * ============================================
 * PROFIL COIFFEUR — gestion (self, rôle coiffeur)
 * ============================================
 */

/**
 * PUT /coiffeurs/me
 * Crée / met à jour son profil coiffeur (nom_salon, description, adresse, rayon_km).
 */
router.put('/me', coiffeurOnly, async (req, res) => {
    try {
        const updates = {};
        if (req.body.nom_salon !== undefined)   updates.nom_salon   = req.body.nom_salon === null ? null : String(req.body.nom_salon).trim();
        if (req.body.description !== undefined)  updates.description  = req.body.description === null ? null : String(req.body.description).trim();
        if (req.body.adresse !== undefined)      updates.adresse      = req.body.adresse === null ? null : String(req.body.adresse).trim();
        if (req.body.rayon_km !== undefined) {
            if (req.body.rayon_km === null) {
                updates.rayon_km = null;
            } else {
                const r = parseInt(req.body.rayon_km);
                if (isNaN(r) || r < 0) return sendError(res, 'rayon_km invalide', 400, null, 'INVALID_RAYON');
                updates.rayon_km = r;
            }
        }

        const profil = await upsertProfilCoiffeur(req.userId, updates);
        sendSuccess(res, 'Profil coiffeur mis à jour', { profil });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/** POST /coiffeurs/me/photo-pro — upload photo pro (champ "image"). */
router.post('/me/photo-pro', coiffeurOnly, (req, res) => {
    uploadSingleImage(req, res, async (err) => {
        if (err) return handleUploadError(err, res);
        if (!req.file) return sendError(res, 'Aucun fichier (champ "image")', 400, null, 'NO_FILE');
        try {
            await saveProPhoto(req.file.buffer, req.userId);
            const me = await getUserById(req.userId, ['nom_utilisateur']);
            sendSuccess(res, 'Photo pro mise à jour', {
                photo_pro_url: buildProPhotoUrl(req, req.userId, me?.nom_utilisateur)
            });
        } catch (error) {
            internalErrorResponse(res, error);
        }
    });
});

/** DELETE /coiffeurs/me/photo-pro */
router.delete('/me/photo-pro', coiffeurOnly, (req, res) => {
    try {
        const ok = deleteProPhoto(req.userId);
        if (!ok) return notFoundResponse(res, 'Photo pro');
        sendSuccess(res, 'Photo pro supprimée');
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/** POST /coiffeurs/me/banner — upload bannière (champ "image"). */
router.post('/me/banner', coiffeurOnly, (req, res) => {
    uploadSingleImage(req, res, async (err) => {
        if (err) return handleUploadError(err, res);
        if (!req.file) return sendError(res, 'Aucun fichier (champ "image")', 400, null, 'NO_FILE');
        try {
            await saveBanner(req.file.buffer, req.userId);
            const me = await getUserById(req.userId, ['nom_utilisateur']);
            sendSuccess(res, 'Bannière mise à jour', {
                banner_url: buildBannerUrl(req, req.userId, me?.nom_utilisateur)
            });
        } catch (error) {
            internalErrorResponse(res, error);
        }
    });
});

/** DELETE /coiffeurs/me/banner */
router.delete('/me/banner', coiffeurOnly, (req, res) => {
    try {
        const ok = deleteBanner(req.userId);
        if (!ok) return notFoundResponse(res, 'Bannière');
        sendSuccess(res, 'Bannière supprimée');
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * ============================================
 * PRESTATIONS — gestion (self, rôle coiffeur)
 * ============================================
 */

/**
 * POST /coiffeurs/me/prestations
 * Crée une prestation. Médias optionnels (champ "medias", multipart).
 */
router.post('/me/prestations', coiffeurOnly, (req, res) => {
    uploadMedias(req, res, async (err) => {
        if (err) return handleUploadError(err, res);
        try {
            const nom = (req.body.nom || '').trim();
            if (!nom) return sendError(res, 'Le nom de la prestation est requis', 400, null, 'NOM_REQUIRED');

            const prestation = await createPrestation({
                coiffeurId:      req.userId,
                nom,
                categorie:       req.body.categorie ?? null,
                prix:            req.body.prix !== undefined ? parseFloat(req.body.prix) : null,
                unite_prix:      req.body.unite_prix ?? 'forfait',
                duree_min:       req.body.duree_min !== undefined ? parseInt(req.body.duree_min) : null,
                materiel_client: req.body.materiel_client === 'true' || req.body.materiel_client === true,
                description:     req.body.description ?? null
            });

            let finale = prestation;
            if (req.files && req.files.length > 0) {
                const count = await savePrestationMedias(req.files.map((f) => f.buffer), prestation.id);
                finale = await setPrestationMediaCount(prestation.id, count);
            }

            sendSuccess(res, 'Prestation créée', { prestation: formatPrestation(req, finale) }, 201);
        } catch (error) {
            internalErrorResponse(res, error);
        }
    });
});

/**
 * PUT /coiffeurs/me/prestations/:id
 * Met à jour les champs d'une prestation (pas les médias).
 */
router.put('/me/prestations/:id', coiffeurOnly, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return sendError(res, 'id invalide', 400, null, 'INVALID_ID');

        const existante = await getPrestationById(id);
        if (!existante) return notFoundResponse(res, 'Prestation');
        if (existante.coiffeur_id !== req.userId) {
            return sendError(res, 'Cette prestation ne vous appartient pas', 403, null, 'FORBIDDEN');
        }

        const updates = {};
        if (req.body.nom !== undefined)             updates.nom = String(req.body.nom).trim();
        if (req.body.categorie !== undefined)        updates.categorie = req.body.categorie;
        if (req.body.prix !== undefined)             updates.prix = req.body.prix === null ? null : parseFloat(req.body.prix);
        if (req.body.unite_prix !== undefined)       updates.unite_prix = req.body.unite_prix;
        if (req.body.duree_min !== undefined)        updates.duree_min = req.body.duree_min === null ? null : parseInt(req.body.duree_min);
        if (req.body.materiel_client !== undefined)  updates.materiel_client = req.body.materiel_client === true || req.body.materiel_client === 'true';
        if (req.body.description !== undefined)       updates.description = req.body.description;
        if (req.body.actif !== undefined)            updates.actif = req.body.actif === true || req.body.actif === 'true';

        const prestation = await updatePrestation(id, updates);
        sendSuccess(res, 'Prestation mise à jour', { prestation: formatPrestation(req, prestation) });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * POST /coiffeurs/me/prestations/:id/medias
 * Remplace tous les médias d'une prestation (champ "medias", multipart).
 */
router.post('/me/prestations/:id/medias', coiffeurOnly, (req, res) => {
    uploadMedias(req, res, async (err) => {
        if (err) return handleUploadError(err, res);
        try {
            const id = parseInt(req.params.id);
            if (isNaN(id)) return sendError(res, 'id invalide', 400, null, 'INVALID_ID');

            const existante = await getPrestationById(id);
            if (!existante) return notFoundResponse(res, 'Prestation');
            if (existante.coiffeur_id !== req.userId) {
                return sendError(res, 'Cette prestation ne vous appartient pas', 403, null, 'FORBIDDEN');
            }
            if (!req.files || req.files.length === 0) {
                return sendError(res, 'Aucun fichier (champ "medias")', 400, null, 'NO_FILE');
            }

            // Supprime les anciens fichiers puis écrit les nouveaux (réindexés à 0).
            deletePrestationMedias(id, existante.media_count);
            const count = await savePrestationMedias(req.files.map((f) => f.buffer), id);
            const prestation = await setPrestationMediaCount(id, count);

            sendSuccess(res, 'Médias mis à jour', { prestation: formatPrestation(req, prestation) });
        } catch (error) {
            internalErrorResponse(res, error);
        }
    });
});

/**
 * DELETE /coiffeurs/me/prestations/:id
 * Soft delete (actif = false). Les fichiers médias sont conservés.
 */
router.delete('/me/prestations/:id', coiffeurOnly, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return sendError(res, 'id invalide', 400, null, 'INVALID_ID');

        const existante = await getPrestationById(id);
        if (!existante) return notFoundResponse(res, 'Prestation');
        if (existante.coiffeur_id !== req.userId) {
            return sendError(res, 'Cette prestation ne vous appartient pas', 403, null, 'FORBIDDEN');
        }

        await deactivatePrestation(id);
        sendSuccess(res, 'Prestation désactivée');
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * ============================================
 * PUBLIC — consultation profil coiffeur, prestations, avis
 * ============================================
 */

/** GET /coiffeurs/prestations/:id/media/:index — sert un média de prestation. */
router.get('/prestations/:id/media/:index', authenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const index = parseInt(req.params.index);
        if (isNaN(id) || isNaN(index)) return sendError(res, 'Identifiants invalides', 400, null, 'INVALID_IDS');
        if (!prestationMediaExists(id, index)) return notFoundResponse(res, 'Média');
        res.set('Cache-Control', 'public, max-age=86400');
        res.sendFile(getPrestationMediaPath(id, index));
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/** GET /coiffeurs/:username — profil coiffeur public enrichi. */
router.get('/:username', authenticate, async (req, res) => {
    try {
        const target = await getUserByUsername(req.params.username);
        if (!target) return notFoundResponse(res, 'Utilisateur');

        const profil = await getProfilCoiffeur(target.id);
        if (!profil) return notFoundResponse(res, 'Profil coiffeur');

        sendSuccess(res, 'Profil coiffeur récupéré', {
            coiffeur: {
                user_id:         target.id,
                nom_utilisateur: target.nom_utilisateur,
                prenom:          target.prenom,
                nom:             target.nom,
                photo_url:       buildPhotoUrl(req, target.id, target.nom_utilisateur),
                photo_pro_url:   buildProPhotoUrl(req, target.id, target.nom_utilisateur),
                banner_url:      buildBannerUrl(req, target.id, target.nom_utilisateur),
                nom_salon:       profil.nom_salon,
                description:     profil.description,
                adresse:         profil.adresse,
                rayon_km:        profil.rayon_km,
                note_moyenne:    Number(profil.note_moyenne),
                nb_avis:         profil.nb_avis,
                updated_at:      profil.updated_at
            }
        });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/** GET /coiffeurs/:username/photo-pro — sert la photo pro. */
router.get('/:username/photo-pro', async (req, res) => {
    try {
        const target = await getUserByUsername(req.params.username);
        if (!target || !proPhotoExists(target.id)) return notFoundResponse(res, 'Photo pro');
        res.set('Cache-Control', 'public, max-age=86400');
        res.sendFile(getProPhotoPath(target.id));
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/** GET /coiffeurs/:username/banner — sert la bannière. */
router.get('/:username/banner', async (req, res) => {
    try {
        const target = await getUserByUsername(req.params.username);
        if (!target || !bannerExists(target.id)) return notFoundResponse(res, 'Bannière');
        res.set('Cache-Control', 'public, max-age=86400');
        res.sendFile(getBannerPath(target.id));
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/** GET /coiffeurs/:username/prestations — catalogue actif du coiffeur. */
router.get('/:username/prestations', authenticate, async (req, res) => {
    try {
        const target = await getUserByUsername(req.params.username);
        if (!target) return notFoundResponse(res, 'Utilisateur');

        // Le coiffeur voit aussi ses prestations inactives.
        const includeInactive = target.id === req.userId;
        const prestations = await listPrestations(target.id, { includeInactive });

        sendSuccess(res, `${prestations.length} prestation(s)`, {
            prestations: prestations.map((p) => formatPrestation(req, p))
        });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/** GET /coiffeurs/:username/avis — liste des avis reçus. */
router.get('/:username/avis', authenticate, async (req, res) => {
    try {
        const target = await getUserByUsername(req.params.username);
        if (!target) return notFoundResponse(res, 'Utilisateur');

        const limit  = Math.min(parseInt(req.query.limit) || 20, 50);
        const offset = parseInt(req.query.offset) || 0;

        const avis = await listAvis(target.id, { limit, offset });
        const monAvis = await getAvisByClient(req.userId, target.id);

        sendSuccess(res, `${avis.length} avis`, { avis, mon_avis: monAvis });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * POST /coiffeurs/:username/avis
 * Body: { note (1-5), commentaire? }. Un seul avis par client/coiffeur (upsert).
 */
router.post('/:username/avis', authenticate, async (req, res) => {
    try {
        const target = await getUserByUsername(req.params.username);
        if (!target) return notFoundResponse(res, 'Utilisateur');
        if (target.id === req.userId) {
            return sendError(res, 'Vous ne pouvez pas vous noter vous-même', 400, null, 'SELF_REVIEW_FORBIDDEN');
        }

        const coiffeur = await getProfilCoiffeur(target.id);
        if (!coiffeur) return sendError(res, "Cet utilisateur n'est pas un coiffeur", 400, null, 'NOT_A_COIFFEUR');

        const note = parseInt(req.body.note);
        if (isNaN(note) || note < 1 || note > 5) {
            return sendError(res, 'La note doit être comprise entre 1 et 5', 400, null, 'INVALID_NOTE');
        }
        const commentaire = req.body.commentaire ? String(req.body.commentaire).trim() : null;

        const avis = await upsertAvis({
            clientId: req.userId, coiffeurId: target.id, note, commentaire
        });
        sendSuccess(res, 'Avis enregistré', { avis });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/** DELETE /coiffeurs/:username/avis — supprime son propre avis. */
router.delete('/:username/avis', authenticate, async (req, res) => {
    try {
        const target = await getUserByUsername(req.params.username);
        if (!target) return notFoundResponse(res, 'Utilisateur');

        const ok = await deleteAvis(req.userId, target.id);
        if (!ok) return notFoundResponse(res, 'Avis');
        sendSuccess(res, 'Avis supprimé');
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

export default router;
