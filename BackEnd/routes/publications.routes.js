import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { uploadMedias } from '../middleware/upload.js';
import { sendSuccess, sendError, internalErrorResponse, notFoundResponse } from '../utils/apiResponse.js';
import { getUserByUsername } from '../dataBase/utils/user.js';
import {
    createPublication, setPublicationMediaCount, getPublicationById,
    listPublications, deletePublication, addCauris, removeCauris, hasCauris
} from '../dataBase/utils/publication.js';
import {
    savePublicationMedias, deletePublicationMedias, getPublicationMediaPath,
    publicationMediaExists, buildPublicationMediaUrls
} from '../utils/publicationMedia.js';

const router = Router();

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

/** Sérialise une publication pour l'API (ajoute media_urls). */
const formatPublication = (req, p) => ({
    id:          p.id,
    user_id:     p.user_id,
    legende:     p.legende,
    media_count: p.media_count,
    media_urls:  buildPublicationMediaUrls(req, p.id, p.media_count),
    created_at:  p.created_at,
    auteur: {
        nom_utilisateur: p.auteur_username,
        prenom:          p.auteur_prenom,
        nom:             p.auteur_nom
    },
    cauris_count: p.cauris_count,
    liked:        p.liked
});

/**
 * ============================================
 * PUBLICATIONS — gestion (self)
 * ============================================
 */

/**
 * POST /publications
 * Crée une publication. Médias optionnels (champ "medias", multipart).
 */
router.post('/', authenticate, (req, res) => {
    uploadMedias(req, res, async (err) => {
        if (err) return handleUploadError(err, res);
        try {
            const legende = req.body.legende ? String(req.body.legende).trim() : null;
            if (legende && legende.length > 500) {
                return sendError(res, 'La légende ne peut pas dépasser 500 caractères', 400, null, 'LEGENDE_TOO_LONG');
            }

            const publication = await createPublication({ userId: req.userId, legende });

            let finale = publication;
            if (req.files && req.files.length > 0) {
                const count = await savePublicationMedias(req.files.map((f) => f.buffer), publication.id);
                finale = await setPublicationMediaCount(publication.id, count);
            }

            sendSuccess(res, 'Publication créée', { publication: formatPublication(req, finale) }, 201);
        } catch (error) {
            internalErrorResponse(res, error);
        }
    });
});

/**
 * POST /publications/:id/medias
 * Remplace tous les médias d'une publication (champ "medias", multipart).
 */
router.post('/:id/medias', authenticate, (req, res) => {
    uploadMedias(req, res, async (err) => {
        if (err) return handleUploadError(err, res);
        try {
            const id = parseInt(req.params.id);
            if (isNaN(id)) return sendError(res, 'id invalide', 400, null, 'INVALID_ID');

            const existante = await getPublicationById(id, req.userId);
            if (!existante) return notFoundResponse(res, 'Publication');
            if (existante.user_id !== req.userId) {
                return sendError(res, 'Cette publication ne vous appartient pas', 403, null, 'FORBIDDEN');
            }
            if (!req.files || req.files.length === 0) {
                return sendError(res, 'Aucun fichier (champ "medias")', 400, null, 'NO_FILE');
            }

            deletePublicationMedias(id, existante.media_count);
            const count = await savePublicationMedias(req.files.map((f) => f.buffer), id);
            const publication = await setPublicationMediaCount(id, count);

            sendSuccess(res, 'Médias mis à jour', { publication: formatPublication(req, publication) });
        } catch (error) {
            internalErrorResponse(res, error);
        }
    });
});

/**
 * DELETE /publications/:id
 * Supprime une publication (et ses fichiers médias).
 */
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return sendError(res, 'id invalide', 400, null, 'INVALID_ID');

        const existante = await getPublicationById(id, req.userId);
        if (!existante) return notFoundResponse(res, 'Publication');
        if (existante.user_id !== req.userId) {
            return sendError(res, 'Cette publication ne vous appartient pas', 403, null, 'FORBIDDEN');
        }

        deletePublicationMedias(id, existante.media_count);
        await deletePublication(id);
        sendSuccess(res, 'Publication supprimée');
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * POST /publications/:id/cauris
 * Ajoute un cauris (like) à une publication.
 */
router.post('/:id/cauris', authenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return sendError(res, 'id invalide', 400, null, 'INVALID_ID');

        const existante = await getPublicationById(id, req.userId);
        if (!existante) return notFoundResponse(res, 'Publication');

        await addCauris(req.userId, id);
        sendSuccess(res, 'Cauris ajouté');
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * DELETE /publications/:id/cauris
 * Retire un cauris.
 */
router.delete('/:id/cauris', authenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return sendError(res, 'id invalide', 400, null, 'INVALID_ID');

        await removeCauris(req.userId, id);
        sendSuccess(res, 'Cauris retiré');
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * ============================================
 * PUBLIC — consultation publications
 * ============================================
 */

/** GET /publications/:id/media/:index — sert un média de publication. */
router.get('/:id/media/:index', authenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const index = parseInt(req.params.index);
        if (isNaN(id) || isNaN(index)) return sendError(res, 'Identifiants invalides', 400, null, 'INVALID_IDS');
        if (!publicationMediaExists(id, index)) return notFoundResponse(res, 'Média');
        res.set('Cache-Control', 'public, max-age=86400');
        res.sendFile(getPublicationMediaPath(id, index));
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/** GET /publications/:id — une publication enrichie. */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return sendError(res, 'id invalide', 400, null, 'INVALID_ID');

        const publication = await getPublicationById(id, req.userId);
        if (!publication) return notFoundResponse(res, 'Publication');

        sendSuccess(res, 'Publication récupérée', { publication: formatPublication(req, publication) });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/** GET /publications?username=:username — feed d'un profil. */
router.get('/', authenticate, async (req, res) => {
    try {
        const username = req.query.username;
        if (!username) return sendError(res, 'username requis', 400, null, 'USERNAME_REQUIRED');

        const target = await getUserByUsername(username);
        if (!target) return notFoundResponse(res, 'Utilisateur');

        const limit  = Math.min(parseInt(req.query.limit) || 20, 50);
        const offset = parseInt(req.query.offset) || 0;

        const publications = await listPublications(target.id, { viewerId: req.userId, limit, offset });

        sendSuccess(res, `${publications.length} publication(s)`, {
            publications: publications.map((p) => formatPublication(req, p))
        });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

export default router;
