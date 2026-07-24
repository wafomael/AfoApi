import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { uploadMedias } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { sendSuccess, sendError, internalErrorResponse, notFoundResponse } from '../utils/apiResponse.js';
import { getRendezVousDetailById } from '../dataBase/utils/rendezVous.js';
import {
    getHairProfile, upsertHairProfile, replaceHairProfilePhotos, getHairProfilePhoto
} from '../dataBase/utils/hairProfile.js';
import { hairProfileSchema } from '../validators/hairProfile.validator.js';
import {
    saveHairProfilePhotos, getHairProfilePhotoPath, hairProfilePhotoExists, buildHairProfilePhotoUrl
} from '../utils/hairProfileMedia.js';

const router = Router();

const photoPath = (numero) => `/profil-capillaire/me/photos/${numero}`;
const sharedPhotoPath = (rdvId, numero) => `/profil-capillaire/rendez-vous/${rdvId}/photos/${numero}`;

const formatPhotos = (req, photos, pathBuilder) => (photos ?? []).map((photo) => ({
    numero: photo.numero,
    date_prise: photo.date_prise,
    date_upload: photo.date_upload,
    url: buildHairProfilePhotoUrl(req, pathBuilder(photo.numero), photo.date_upload)
}));

const formatOwnProfile = (req, profile) => profile ? {
    ...profile,
    longueur_cm: profile.longueur_cm === null ? null : Number(profile.longueur_cm),
    photos: formatPhotos(req, profile.photos, photoPath)
} : null;

const formatSharedProfile = (req, profile, fields, rdvId) => {
    const result = { id: profile.id, user_id: profile.user_id, updated_at: profile.updated_at };
    if (fields.includes('longueur')) {
        result.longueur_texte = profile.longueur_texte;
        result.longueur_cm = profile.longueur_cm === null ? null : Number(profile.longueur_cm);
    }
    if (fields.includes('densite')) result.densite = profile.densite;
    if (fields.includes('texture')) {
        result.texture_texte = profile.texture_texte;
        result.texture_code = profile.texture_code;
    }
    if (fields.includes('etat_actuel')) result.etat_actuel = profile.etat_actuel;
    if (fields.includes('naturel_defrise')) result.naturel_defrise = profile.naturel_defrise;
    if (fields.includes('traitements_chimiques')) {
        result.traitements_chimiques = profile.traitements_chimiques;
        result.date_dernier_traitement = profile.date_dernier_traitement;
    }
    if (fields.includes('sensibilite_cuir_chevelu')) result.sensibilite_cuir_chevelu = profile.sensibilite_cuir_chevelu;
    if (fields.includes('extensions')) {
        result.extensions = profile.extensions;
        result.extensions_type = profile.extensions_type;
    }
    if (fields.includes('preferences_allergies')) result.preferences_allergies = profile.preferences_allergies;
    if (fields.includes('photos')) result.photos = formatPhotos(req, profile.photos, (numero) => sharedPhotoPath(rdvId, numero));
    return result;
};

const getAuthorizedRendezVous = async (req, rdvId, requirePhotos = false) => {
    const rdv = await getRendezVousDetailById(rdvId);
    if (!rdv) return { error: 'NOT_FOUND' };
    if (rdv.coiffeur_id !== req.userId || !['confirme', 'en_cours'].includes(rdv.statut)) return { error: 'FORBIDDEN' };
    const fields = rdv.champs_profil_partages ?? [];
    if (requirePhotos && !fields.includes('photos')) return { error: 'FORBIDDEN' };
    return { rdv, fields };
};

router.get('/me', authenticate, async (req, res) => {
    try {
        const profile = await getHairProfile(req.userId);
        sendSuccess(res, 'Profil capillaire récupéré', { profil_capillaire: formatOwnProfile(req, profile) });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

router.put('/me', authenticate, validate(hairProfileSchema), async (req, res) => {
    try {
        const profile = await upsertHairProfile(req.userId, req.body);
        sendSuccess(res, 'Profil capillaire mis à jour', { profil_capillaire: formatOwnProfile(req, profile) });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

router.post('/me/photos', authenticate, (req, res) => {
    uploadMedias(req, res, async (error) => {
        if (error?.code === 'LIMIT_FILE_SIZE') return sendError(res, 'Image trop volumineuse (max 5 Mo)', 413, null, 'FILE_TOO_LARGE');
        if (error?.message === 'FORMAT_INVALIDE') return sendError(res, 'Format non supporté', 400, null, 'INVALID_FORMAT');
        if (error) return sendError(res, "Échec de l'upload", 400, null, 'UPLOAD_ERROR');
        if (!req.files?.length) return sendError(res, 'Aucune photo fournie', 400, null, 'NO_FILE');
        try {
            const existingProfile = await getHairProfile(req.userId);
            if (!existingProfile) {
                return sendError(res, 'Enregistrez d’abord le profil capillaire', 409, null, 'HAIR_PROFILE_REQUIRED');
            }
            const dates = await saveHairProfilePhotos(req.files.map((file) => file.buffer), req.userId);
            await replaceHairProfilePhotos(req.userId, dates);
            const profile = await getHairProfile(req.userId);
            sendSuccess(res, 'Photos capillaires mises à jour', { profil_capillaire: formatOwnProfile(req, profile) });
        } catch (saveError) {
            internalErrorResponse(res, saveError);
        }
    });
});

router.delete('/me/photos', authenticate, async (req, res) => {
    try {
        await saveHairProfilePhotos([], req.userId);
        await replaceHairProfilePhotos(req.userId, []);
        const profile = await getHairProfile(req.userId);
        sendSuccess(res, 'Photos capillaires supprimées', { profil_capillaire: formatOwnProfile(req, profile) });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

router.get('/me/photos/:numero', authenticate, async (req, res) => {
    try {
        const numero = Number(req.params.numero);
        const photo = Number.isInteger(numero) ? await getHairProfilePhoto(req.userId, numero) : null;
        if (!photo || !hairProfilePhotoExists(req.userId, numero)) return notFoundResponse(res, 'Photo capillaire');
        res.set('Cache-Control', 'private, max-age=3600');
        res.sendFile(getHairProfilePhotoPath(req.userId, numero));
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

router.get('/rendez-vous/:id', authenticate, async (req, res) => {
    try {
        const access = await getAuthorizedRendezVous(req, req.params.id);
        if (access.error === 'NOT_FOUND') return notFoundResponse(res, 'Rendez-vous');
        if (access.error) return sendError(res, 'Profil inaccessible pour ce rendez-vous', 403, null, 'HAIR_PROFILE_FORBIDDEN');
        const profile = await getHairProfile(access.rdv.client_id);
        if (!profile) return notFoundResponse(res, 'Profil capillaire');
        sendSuccess(res, 'Profil capillaire partagé', {
            profil_capillaire: formatSharedProfile(req, profile, access.fields, access.rdv.id),
            champs_partages: access.fields
        });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

router.get('/rendez-vous/:id/photos/:numero', authenticate, async (req, res) => {
    try {
        const access = await getAuthorizedRendezVous(req, req.params.id, true);
        if (access.error === 'NOT_FOUND') return notFoundResponse(res, 'Rendez-vous');
        if (access.error) return sendError(res, 'Photo inaccessible pour ce rendez-vous', 403, null, 'HAIR_PROFILE_FORBIDDEN');
        const numero = Number(req.params.numero);
        const photo = Number.isInteger(numero) ? await getHairProfilePhoto(access.rdv.client_id, numero) : null;
        if (!photo || !hairProfilePhotoExists(access.rdv.client_id, numero)) return notFoundResponse(res, 'Photo capillaire');
        res.set('Cache-Control', 'private, max-age=3600');
        res.sendFile(getHairProfilePhotoPath(access.rdv.client_id, numero));
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

export default router;
