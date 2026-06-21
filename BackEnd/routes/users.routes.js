import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { sendSuccess, sendError, internalErrorResponse, notFoundResponse } from '../utils/apiResponse.js';
import { getUserByUsername } from '../dataBase/utils/user.js';
import {
    getRelation,
    getCompteurs
} from '../dataBase/utils/abonnement.js';
import {
    getVisibilite,
    updateVisibilite,
    peutVoir,
    NIVEAU,
    RELATION
} from '../dataBase/utils/visibilite.js';

const router = Router();

/**
 * ============================================
 * ROUTES UTILISATEURS — PROFIL & ABONNEMENTS
 * ============================================
 */

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

        const [visibilite, relation, compteurs] = await Promise.all([
            getVisibilite(target.id),
            estSoiMeme ? Promise.resolve(RELATION.MUTUEL) : getRelation(observateurId, target.id),
            getCompteurs(target.id)
        ]);

        // Champs toujours publics
        const profil = {
            nom_utilisateur: target.nom_utilisateur,
            prenom:          target.prenom,
            nom:             target.nom,
            role:            target.role,
            is_pro:          target.is_pro,
            abonnements:     compteurs.abonnements,
            abonnes:         compteurs.abonnes,
            relation         // 'aucune' | 'je_suis' | 'me_suit' | 'mutuel'
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

export default router;
