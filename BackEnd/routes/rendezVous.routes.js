import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { sendSuccess, sendError, internalErrorResponse, notFoundResponse } from '../utils/apiResponse.js';
import { getUserByUsername } from '../dataBase/utils/user.js';
import { getPrestationById } from '../dataBase/utils/prestation.js';
import {
    createRendezVous, getRendezVousDetailById, listRendezVous,
    updateRendezVousStatut
} from '../dataBase/utils/rendezVous.js';
import { isCreneauDansDisponibilite } from '../dataBase/utils/disponibilite.js';
import {
    createRendezVousSchema, listRendezVousQuerySchema,
    rendezVousIdParamsSchema, updateRendezVousStatutSchema
} from '../validators/rendezVous.validator.js';

const router = Router();

const STATUTS_VALIDES = ['demande', 'confirme', 'annule', 'termine', 'non_present'];

/**
 * POST /rendez-vous
 * Crée un rendez-vous.
 * Body : { coiffeur_username, prestation_id?, date_debut, date_fin, prix?, unite_prix?, note_client? }
 */
router.post('/', authenticate, validate(createRendezVousSchema), async (req, res) => {
    try {
        const { coiffeur_username: username, prestation_id: prestationId, date_debut: dateDebut, date_fin: dateFin, note_client: noteClient } = req.body;
        if (dateDebut <= new Date()) {
            return sendError(res, 'Le rendez-vous doit être dans le futur', 400, null, 'PAST_RENDEZ_VOUS');
        }
        if (dateDebut.toISOString().slice(0, 10) !== dateFin.toISOString().slice(0, 10)) {
            return sendError(res, 'Le rendez-vous doit commencer et finir le même jour', 400, null, 'MULTI_DAY_RENDEZ_VOUS');
        }

        const coiffeur = await getUserByUsername(username);
        if (!coiffeur) return notFoundResponse(res, 'Coiffeur');
        if (coiffeur.id === req.userId) {
            return sendError(res, 'Vous ne pouvez pas vous réserver à vous-même', 400, null, 'SELF_RDV');
        }
        if (coiffeur.role !== 'coiffeur') {
            return sendError(res, "Cet utilisateur n'est pas un coiffeur", 400, null, 'NOT_A_COIFFEUR');
        }

        const prestation = await getPrestationById(prestationId);
        if (!prestation || !prestation.actif || prestation.coiffeur_id !== coiffeur.id) {
            return sendError(res, 'Prestation invalide ou indisponible', 400, null, 'INVALID_PRESTATION');
        }

        const dureeDemandee = (dateFin - dateDebut) / 60000;
        if (prestation.duree_min && dureeDemandee !== prestation.duree_min) {
            return sendError(res, `La durée doit être de ${prestation.duree_min} min`, 400, null, 'INVALID_DURATION');
        }

        const disponible = await isCreneauDansDisponibilite(coiffeur.id, dateDebut, dateFin);
        if (!disponible) {
            return sendError(res, "Ce créneau n'est pas dans les disponibilités du coiffeur", 409, null, 'CRENEAU_INDISPONIBLE');
        }

        const rdv = await createRendezVous({
            clientId: req.userId,
            coiffeurId: coiffeur.id,
            prestationId,
            dateDebut,
            dateFin,
            prix: prestation.prix,
            unitePrix: prestation.unite_prix,
            noteClient: noteClient || null
        });

        const detail = await getRendezVousDetailById(rdv.id);
        sendSuccess(res, 'Rendez-vous demandé', { rendez_vous: formatRendezVous(detail) }, 201);
    } catch (error) {
        if (error.code === '23P01') {
            return sendError(res, 'Ce créneau vient d’être réservé par un autre client', 409, null, 'CRENEAU_CONFLICT');
        }
        if (error.code === '23514') {
            return sendError(res, 'Ce créneau est indisponible', 409, null, 'CRENEAU_INDISPONIBLE');
        }
        internalErrorResponse(res, error);
    }
});

/**
 * GET /rendez-vous
 * Liste les rendez-vous de l'utilisateur connecté (client ou coiffeur).
 * Query : statuts (optionnel, ex: "demande,confirme")
 */
router.get('/', authenticate, validate(listRendezVousQuerySchema, 'query'), async (req, res) => {
    try {
        const rawStatuts = req.validated.query.statuts;
        const statuts = rawStatuts
            ? String(rawStatuts).split(',').map(s => s.trim()).filter(s => STATUTS_VALIDES.includes(s))
            : [];

        const isCoiffeur = req.userRole === 'coiffeur' || req.userRole === 'admin';
        const rdvs = await listRendezVous({
            clientId: isCoiffeur ? null : req.userId,
            coiffeurId: isCoiffeur ? req.userId : null,
            statuts,
            limit: req.validated.query.limit,
            offset: req.validated.query.offset,
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
router.get('/:id', authenticate, validate(rendezVousIdParamsSchema, 'params'), async (req, res) => {
    try {
        const { id } = req.params;

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
router.patch('/:id/statut', authenticate, validate(rendezVousIdParamsSchema, 'params'), validate(updateRendezVousStatutSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const { statut } = req.body;
        const rdv = await getRendezVousDetailById(id);
        if (!rdv) return notFoundResponse(res, 'Rendez-vous');

        const isAdmin = req.userRole === 'admin';
        const isCoiffeur = rdv.coiffeur_id === req.userId;
        const isClient = rdv.client_id === req.userId;
        const transitionsCoiffeur = {
            demande: ['confirme', 'annule'],
            confirme: ['termine', 'non_present', 'annule']
        };
        const transitionsClient = {
            demande: ['annule'],
            confirme: ['annule']
        };
        const transitions = isAdmin || isCoiffeur ? transitionsCoiffeur : isClient ? transitionsClient : null;

        if (!transitions) {
            return sendError(res, 'Accès interdit', 403, null, 'FORBIDDEN');
        }
        if (!transitions[rdv.statut]?.includes(statut)) {
            return sendError(res, `Transition impossible : ${rdv.statut} vers ${statut}`, 409, null, 'INVALID_STATUS_TRANSITION');
        }

        const updated = await updateRendezVousStatut(id, rdv.statut, statut);
        if (!updated) {
            return sendError(res, 'Le rendez-vous a été modifié entre-temps', 409, null, 'RENDEZ_VOUS_CONFLICT');
        }
        const detail = await getRendezVousDetailById(id);
        sendSuccess(res, 'Statut mis à jour', { rendez_vous: formatRendezVous(detail) });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

/**
 * DELETE /rendez-vous/:id
 * Supprime un rendez-vous (client ou coiffeur).
 */
router.delete('/:id', authenticate, validate(rendezVousIdParamsSchema, 'params'), async (req, res) => {
    try {
        const { id } = req.params;
        const rdv = await getRendezVousDetailById(id);
        if (!rdv) return notFoundResponse(res, 'Rendez-vous');
        const isParticipant = rdv.client_id === req.userId || rdv.coiffeur_id === req.userId || req.userRole === 'admin';
        if (!isParticipant) return sendError(res, 'Accès interdit', 403, null, 'FORBIDDEN');
        if (!['demande', 'confirme'].includes(rdv.statut)) {
            return sendError(res, 'Seuls les rendez-vous en attente ou confirmés peuvent être annulés', 409, null, 'INVALID_STATUS_TRANSITION');
        }

        const updated = await updateRendezVousStatut(id, rdv.statut, 'annule');
        if (!updated) return sendError(res, 'Le rendez-vous a été modifié entre-temps', 409, null, 'RENDEZ_VOUS_CONFLICT');
        sendSuccess(res, 'Rendez-vous annulé');
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
