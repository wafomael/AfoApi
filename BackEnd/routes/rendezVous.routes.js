import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { sendSuccess, sendError, internalErrorResponse, notFoundResponse } from '../utils/apiResponse.js';
import { getUserByUsername } from '../dataBase/utils/user.js';
import { getPrestationById } from '../dataBase/utils/prestation.js';
import {
    createRendezVous, getRendezVousDetailById, listRendezVous,
    updateRendezVousStatut, deleteRendezVous, hasConflitRendezVous
} from '../dataBase/utils/rendezVous.js';

const router = Router();

const STATUTS_VALIDES = ['demande', 'confirme', 'annule', 'termine', 'non_present'];

/**
 * POST /rendez-vous
 * Crée un rendez-vous.
 * Body : { coiffeur_username, prestation_id?, date_debut, date_fin, prix?, unite_prix?, note_client? }
 */
router.post('/', authenticate, async (req, res) => {
    try {
        const username = (req.body.coiffeur_username || '').trim();
        if (!username) return sendError(res, 'coiffeur_username requis', 400, null, 'USERNAME_REQUIRED');

        const coiffeur = await getUserByUsername(username);
        if (!coiffeur) return notFoundResponse(res, 'Coiffeur');
        if (coiffeur.id === req.userId) {
            return sendError(res, 'Vous ne pouvez pas vous réserver à vous-même', 400, null, 'SELF_RDV');
        }

        const prestationId = req.body.prestation_id ? parseInt(req.body.prestation_id) : null;
        let prix = null;
        let unitePrix = 'forfait';
        let dureeMin = 0;

        if (prestationId) {
            const p = await getPrestationById(prestationId);
            if (!p || p.coiffeur_id !== coiffeur.id) {
                return sendError(res, 'Prestation invalide', 400, null, 'INVALID_PRESTATION');
            }
            prix = p.prix;
            unitePrix = p.unite_prix;
            dureeMin = p.duree_min || 0;
        }

        const dateDebut = req.body.date_debut ? new Date(req.body.date_debut) : null;
        const dateFin = req.body.date_fin ? new Date(req.body.date_fin) : null;
        if (!dateDebut || !dateFin || isNaN(dateDebut) || isNaN(dateFin) || dateFin <= dateDebut) {
            return sendError(res, 'Dates invalides', 400, null, 'INVALID_DATES');
        }

        if (prestationId && dureeMin > 0) {
            const dureeDemandee = (dateFin - dateDebut) / (60 * 1000);
            if (dureeDemandee < dureeMin) {
                return sendError(res, `Durée minimum ${dureeMin} min`, 400, null, 'DUREE_TOO_SHORT');
            }
        }

        const conflit = await hasConflitRendezVous(coiffeur.id, dateDebut, dateFin);
        if (conflit) {
            return sendError(res, 'Ce créneau est déjà réservé', 409, null, 'CRENEAU_CONFLICT');
        }

        const rdv = await createRendezVous({
            clientId: req.userId,
            coiffeurId: coiffeur.id,
            prestationId,
            dateDebut,
            dateFin,
            prix: req.body.prix !== undefined ? parseFloat(req.body.prix) : prix,
            unitePrix: req.body.unite_prix || unitePrix,
            noteClient: req.body.note_client ? String(req.body.note_client).trim() : null,
        });

        const detail = await getRendezVousDetailById(rdv.id);
        sendSuccess(res, 'Rendez-vous demandé', { rendez_vous: formatRendezVous(detail) }, 201);
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * GET /rendez-vous
 * Liste les rendez-vous de l'utilisateur connecté (client ou coiffeur).
 * Query : statuts (optionnel, ex: "demande,confirme")
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const rawStatuts = req.query.statuts;
        const statuts = rawStatuts
            ? String(rawStatuts).split(',').map(s => s.trim()).filter(s => STATUTS_VALIDES.includes(s))
            : [];

        const isCoiffeur = req.userRole === 'coiffeur' || req.userRole === 'admin';
        const rdvs = await listRendezVous({
            clientId: isCoiffeur ? null : req.userId,
            coiffeurId: isCoiffeur ? req.userId : null,
            statuts,
            limit: Math.min(parseInt(req.query.limit) || 50, 100),
            offset: parseInt(req.query.offset) || 0,
        });

        sendSuccess(res, `${rdvs.length} rendez-vous`, {
            rendez_vous: rdvs.map(formatRendezVous)
        });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * GET /rendez-vous/:id
 * Détail d'un rendez-vous (accessible au client, au coiffeur et admin).
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return sendError(res, 'id invalide', 400, null, 'INVALID_ID');

        const rdv = await getRendezVousDetailById(id);
        if (!rdv) return notFoundResponse(res, 'Rendez-vous');
        if (rdv.client_id !== req.userId && rdv.coiffeur_id !== req.userId && req.userRole !== 'admin') {
            return sendError(res, 'Accès interdit', 403, null, 'FORBIDDEN');
        }

        sendSuccess(res, 'Rendez-vous', { rendez_vous: formatRendezVous(rdv) });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * PATCH /rendez-vous/:id/statut
 * Change le statut d'un rendez-vous.
 * Body : { statut } ∈ {demande, confirme, annule, termine, non_present}
 */
router.patch('/:id/statut', authenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return sendError(res, 'id invalide', 400, null, 'INVALID_ID');

        const statut = String(req.body.statut || '').trim();
        if (!STATUTS_VALIDES.includes(statut)) {
            return sendError(res, 'Statut invalide', 400, null, 'INVALID_STATUT');
        }

        const rdv = await getRendezVousDetailById(id);
        if (!rdv) return notFoundResponse(res, 'Rendez-vous');

        const isCoiffeur = rdv.coiffeur_id === req.userId || req.userRole === 'admin';
        const isClient   = rdv.client_id === req.userId;

        if (!isCoiffeur && !isClient) {
            return sendError(res, 'Accès interdit', 403, null, 'FORBIDDEN');
        }

        // Le client peut annuler son RDV, le coiffeur peut tout changer.
        if (!isCoiffeur && statut !== 'annule') {
            return sendError(res, 'Action non autorisée', 403, null, 'FORBIDDEN');
        }

        const updated = await updateRendezVousStatut(id, statut);
        sendSuccess(res, 'Statut mis à jour', { rendez_vous: formatRendezVous(updated) });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * DELETE /rendez-vous/:id
 * Supprime un rendez-vous (client ou coiffeur).
 */
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return sendError(res, 'id invalide', 400, null, 'INVALID_ID');

        const rdv = await getRendezVousDetailById(id);
        if (!rdv) return notFoundResponse(res, 'Rendez-vous');
        if (rdv.client_id !== req.userId && rdv.coiffeur_id !== req.userId && req.userRole !== 'admin') {
            return sendError(res, 'Accès interdit', 403, null, 'FORBIDDEN');
        }

        await deleteRendezVous(id);
        sendSuccess(res, 'Rendez-vous supprimé');
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

function formatRendezVous(r) {
    return {
        id: r.id,
        client_id: r.client_id,
        client_username: r.client_username,
        client_prenom: r.client_prenom,
        client_nom: r.client_nom,
        coiffeur_id: r.coiffeur_id,
        coiffeur_username: r.coiffeur_username,
        coiffeur_prenom: r.coiffeur_prenom,
        coiffeur_nom: r.coiffeur_nom,
        prestation_id: r.prestation_id,
        prestation_nom: r.prestation_nom,
        prestation_duree_min: r.prestation_duree_min,
        date_debut: r.date_debut,
        date_fin: r.date_fin,
        statut: r.statut,
        prix: r.prix !== null ? Number(r.prix) : null,
        unite_prix: r.unite_prix,
        note_client: r.note_client,
        created_at: r.created_at,
        updated_at: r.updated_at,
    };
}

export default router;
