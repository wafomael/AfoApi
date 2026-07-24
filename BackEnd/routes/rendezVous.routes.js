import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { sendSuccess, sendError, internalErrorResponse, notFoundResponse } from '../utils/apiResponse.js';
import { getUserByUsername } from '../dataBase/utils/user.js';
import { getPrestationById } from '../dataBase/utils/prestation.js';
import {
    createRendezVous, getRendezVousDetailById, listRendezVous,
    updateRendezVousStatut, listHistoriqueRendezVous, reportRendezVous,
    signalerRetardEtDecaler
} from '../dataBase/utils/rendezVous.js';
import { isCreneauDansDisponibilite } from '../dataBase/utils/disponibilite.js';
import { getProfilCoiffeur } from '../dataBase/utils/coiffeur.js';
import { getBookingPolicy } from '../dataBase/utils/bookingPolicy.js';
import {
    createRendezVousSchema, listRendezVousQuerySchema,
    rendezVousIdParamsSchema, updateRendezVousStatutSchema,
    retardRendezVousSchema, reportRendezVousSchema
} from '../validators/rendezVous.validator.js';

const router = Router();

const STATUTS_VALIDES = ['demande', 'confirme', 'en_cours', 'annule', 'refuse', 'termine', 'non_present'];

const mockPayerAcompte = async () => true;
const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000);

/**
 * POST /rendez-vous
 * Crée un rendez-vous.
 * Body : { coiffeur_username, prestation_id?, date_debut, date_fin, prix?, unite_prix?, note_client? }
 */
router.post('/', authenticate, validate(createRendezVousSchema), async (req, res) => {
    try {
        const {
            coiffeur_username: username, prestation_id: prestationId,
            date_debut: dateDebut, date_fin: dateFin, note_client: noteClient,
            champs_profil_partages: champsProfilPartages, mode_prestation: modePrestation,
            politique_acceptee: politiqueAcceptee
        } = req.body;
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

        const profilCoiffeur = await getProfilCoiffeur(coiffeur.id);
        if (!profilCoiffeur) return sendError(res, 'Profil coiffeur indisponible', 409, null, 'COIFFEUR_PROFILE_REQUIRED');
        if (profilCoiffeur.mode_prestation_defaut !== 'les_deux' && profilCoiffeur.mode_prestation_defaut !== modePrestation) {
            return sendError(res, 'Ce mode de prestation n’est pas proposé', 400, null, 'SERVICE_MODE_UNAVAILABLE');
        }
        const politique = await getBookingPolicy(coiffeur.id);
        const delaiHeures = (dateDebut.getTime() - Date.now()) / 3600000;
        if (delaiHeures < politique.delai_min_heures) {
            return sendError(res, `Réservation requise au moins ${politique.delai_min_heures} h à l’avance`, 409, null, 'BOOKING_TOO_SOON');
        }
        if (delaiHeures > politique.delai_max_jours * 24) {
            return sendError(res, `Réservation limitée à ${politique.delai_max_jours} jours`, 409, null, 'BOOKING_TOO_FAR');
        }
        if (!politiqueAcceptee) {
            return sendError(res, 'La politique de réservation doit être acceptée', 400, null, 'POLICY_REQUIRED');
        }

        const champsDemandes = prestation.champs_profil_demandes ?? [];
        if (champsProfilPartages.some((champ) => !champsDemandes.includes(champ))) {
            return sendError(res, 'Un champ partagé n’est pas demandé par cette prestation', 400, null, 'INVALID_SHARED_HAIR_PROFILE_FIELDS');
        }

        const dureeDemandee = (dateFin - dateDebut) / 60000;
        if (prestation.duree_min && dureeDemandee !== prestation.duree_min) {
            return sendError(res, `La durée doit être de ${prestation.duree_min} min`, 400, null, 'INVALID_DURATION');
        }

        const tempsReposMinutes = profilCoiffeur.temps_repos_minutes ?? 0;
        const tempsTrajetMinutes = modePrestation === 'domicile' ? (profilCoiffeur.temps_trajet_minutes ?? 0) : 0;
        const dateFinBlocage = addMinutes(dateFin, tempsReposMinutes + tempsTrajetMinutes);
        const disponible = await isCreneauDansDisponibilite(coiffeur.id, dateDebut, dateFinBlocage);
        if (!disponible) {
            return sendError(res, "Ce créneau n'est pas dans les disponibilités du coiffeur", 409, null, 'CRENEAU_INDISPONIBLE');
        }

        const montantAcompte = Math.round((Number(prestation.prix ?? 0) * Number(politique.acompte_pourcentage)) * 100) / 10000;
        const acomptePaye = montantAcompte > 0 ? await mockPayerAcompte() : false;
        if (montantAcompte > 0 && !acomptePaye) {
            return sendError(res, 'Le paiement de l’acompte a échoué', 402, null, 'DEPOSIT_PAYMENT_FAILED');
        }

        const rdv = await createRendezVous({
            clientId: req.userId,
            coiffeurId: coiffeur.id,
            prestationId,
            dateDebut,
            dateFin,
            dateFinBlocage,
            prix: prestation.prix,
            unitePrix: prestation.unite_prix,
            noteClient: noteClient || null,
            champsProfilPartages,
            modePrestation,
            tempsReposMinutes,
            tempsTrajetMinutes,
            acomptePaye,
            montantAcompte,
            statutAcompte: acomptePaye ? 'paye' : 'non_requis',
            politiqueAcceptee,
            politiqueSnapshot: politique
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
        const { statut, motif } = req.body;
        const rdv = await getRendezVousDetailById(id);
        if (!rdv) return notFoundResponse(res, 'Rendez-vous');

        const isAdmin = req.userRole === 'admin';
        const isCoiffeur = rdv.coiffeur_id === req.userId;
        const isClient = rdv.client_id === req.userId;
        const transitionsCoiffeur = {
            demande: ['confirme', 'refuse', 'annule'],
            confirme: ['en_cours', 'non_present', 'annule'],
            en_cours: ['termine', 'annule']
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

        let statutAcompte = null;
        if (rdv.acompte_paye && ['refuse', 'annule'].includes(statut)) {
            if (statut === 'refuse' || isCoiffeur || isAdmin) {
                statutAcompte = 'remboursement_prevu';
            } else {
                const politique = await getBookingPolicy(rdv.coiffeur_id);
                const heuresAvant = (new Date(rdv.date_debut).getTime() - Date.now()) / 3600000;
                statutAcompte = politique.acompte_remboursable && heuresAvant >= politique.annulation_gratuite_heures
                    ? 'remboursement_prevu'
                    : 'non_remboursable';
            }
        }
        const updated = await updateRendezVousStatut(id, rdv.statut, statut, {
            auteurId: req.userId,
            auteurRole: isAdmin ? 'admin' : isCoiffeur ? 'coiffeur' : 'client',
            motif,
            statutAcompte
        });
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
router.post('/:id/retard', authenticate, validate(rendezVousIdParamsSchema, 'params'), validate(retardRendezVousSchema), async (req, res) => {
    try {
        const rdv = await getRendezVousDetailById(req.params.id);
        if (!rdv) return notFoundResponse(res, 'Rendez-vous');
        if (rdv.client_id !== req.userId) return sendError(res, 'Accès interdit', 403, null, 'FORBIDDEN');
        if (!['confirme', 'en_cours'].includes(rdv.statut)) {
            return sendError(res, 'Le retard ne peut pas être signalé pour ce rendez-vous', 409, null, 'INVALID_STATUS_TRANSITION');
        }
        const now = new Date();
        const start = new Date(rdv.date_debut);
        const end = new Date(rdv.date_fin);
        if (now.toDateString() !== start.toDateString() || now < addMinutes(start, -180) || now > end) {
            return sendError(res, 'Le retard peut être signalé le jour du rendez-vous, au maximum 3 h avant', 409, null, 'DELAY_REPORT_WINDOW');
        }
        const retardTotal = rdv.retard_minutes + req.body.retard_minutes;
        if (retardTotal > 180) {
            return sendError(res, 'Le retard cumulé ne peut pas dépasser 180 minutes', 400, null, 'DELAY_LIMIT_EXCEEDED');
        }
        const politique = await getBookingPolicy(rdv.coiffeur_id);
        if (retardTotal > politique.tolerance_retard_min && politique.annulation_auto_retard) {
            await updateRendezVousStatut(rdv.id, rdv.statut, 'annule', {
                auteurId: req.userId, auteurRole: 'client', motif: req.body.motif || 'Retard au-delà de la tolérance',
                statutAcompte: rdv.acompte_paye ? 'non_remboursable' : null,
                details: { retard_minutes: req.body.retard_minutes, retard_total_minutes: retardTotal, annulation_automatique: true }
            });
            const detail = await getRendezVousDetailById(rdv.id);
            return sendSuccess(res, 'Rendez-vous annulé automatiquement après retard', { rendez_vous: formatRendezVous(detail) });
        }
        await signalerRetardEtDecaler(rdv, req.body.retard_minutes, req.userId, req.body.motif);
        const detail = await getRendezVousDetailById(rdv.id);
        sendSuccess(res, 'Retard signalé et planning décalé', { rendez_vous: formatRendezVous(detail) });
    } catch (error) {
        if (['23P01', '23514'].includes(error.code)) {
            return sendError(res, 'Le décalage dépasse les disponibilités de la coiffeuse', 409, null, 'DELAY_SCHEDULE_CONFLICT');
        }
        internalErrorResponse(res, error);
    }
});

router.post('/:id/report', authenticate, validate(rendezVousIdParamsSchema, 'params'), validate(reportRendezVousSchema), async (req, res) => {
    try {
        const rdv = await getRendezVousDetailById(req.params.id);
        if (!rdv) return notFoundResponse(res, 'Rendez-vous');
        if (rdv.client_id !== req.userId) return sendError(res, 'Accès interdit', 403, null, 'FORBIDDEN');
        if (!['demande', 'confirme'].includes(rdv.statut)) return sendError(res, 'Report impossible', 409, null, 'INVALID_STATUS_TRANSITION');
        const politique = await getBookingPolicy(rdv.coiffeur_id);
        if (rdv.nb_reports >= politique.nb_reports_max) return sendError(res, 'Nombre maximal de reports atteint', 409, null, 'REPORT_LIMIT_REACHED');
        const heuresAvant = (new Date(rdv.date_debut).getTime() - Date.now()) / 3600000;
        if (heuresAvant < politique.report_max_heures) return sendError(res, 'Délai de report dépassé', 409, null, 'REPORT_TOO_LATE');
        const { date_debut: dateDebut, date_fin: dateFin, motif } = req.body;
        if (dateDebut.toISOString().slice(0, 10) !== dateFin.toISOString().slice(0, 10)) {
            return sendError(res, 'Le rendez-vous doit commencer et finir le même jour', 400, null, 'MULTI_DAY_RENDEZ_VOUS');
        }
        if ((dateFin - dateDebut) !== (new Date(rdv.date_fin) - new Date(rdv.date_debut))) {
            return sendError(res, 'La durée de la prestation doit rester identique', 400, null, 'INVALID_DURATION');
        }
        const delaiHeures = (dateDebut.getTime() - Date.now()) / 3600000;
        if (delaiHeures < politique.delai_min_heures || delaiHeures > politique.delai_max_jours * 24) {
            return sendError(res, 'Nouvelle date hors des délais de réservation', 409, null, 'INVALID_BOOKING_WINDOW');
        }
        const dateFinBlocage = addMinutes(dateFin, rdv.temps_repos_minutes + rdv.temps_trajet_minutes);
        const disponible = await isCreneauDansDisponibilite(rdv.coiffeur_id, dateDebut, dateFinBlocage);
        if (!disponible) return sendError(res, 'Nouveau créneau indisponible', 409, null, 'CRENEAU_INDISPONIBLE');
        const updated = await reportRendezVous(rdv, dateDebut, dateFin, dateFinBlocage, req.userId, motif);
        if (!updated) return sendError(res, 'Le rendez-vous a été modifié entre-temps', 409, null, 'RENDEZ_VOUS_CONFLICT');
        const detail = await getRendezVousDetailById(rdv.id);
        sendSuccess(res, 'Rendez-vous reporté', { rendez_vous: formatRendezVous(detail) });
    } catch (error) {
        if (error.code === '23P01') return sendError(res, 'Nouveau créneau déjà occupé', 409, null, 'CRENEAU_CONFLICT');
        internalErrorResponse(res, error);
    }
});

router.get('/:id/historique', authenticate, validate(rendezVousIdParamsSchema, 'params'), async (req, res) => {
    try {
        const rdv = await getRendezVousDetailById(req.params.id);
        if (!rdv) return notFoundResponse(res, 'Rendez-vous');
        if (rdv.client_id !== req.userId && rdv.coiffeur_id !== req.userId && req.userRole !== 'admin') {
            return sendError(res, 'Accès interdit', 403, null, 'FORBIDDEN');
        }
        const historique = await listHistoriqueRendezVous(rdv.id);
        sendSuccess(res, 'Historique du rendez-vous', { historique });
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

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

        const isCoiffeur = rdv.coiffeur_id === req.userId || req.userRole === 'admin';
        const politique = await getBookingPolicy(rdv.coiffeur_id);
        const heuresAvant = (new Date(rdv.date_debut).getTime() - Date.now()) / 3600000;
        const statutAcompte = rdv.acompte_paye
            ? (isCoiffeur || (politique.acompte_remboursable && heuresAvant >= politique.annulation_gratuite_heures)
                ? 'remboursement_prevu' : 'non_remboursable')
            : null;
        const updated = await updateRendezVousStatut(id, rdv.statut, 'annule', {
            auteurId: req.userId,
            auteurRole: req.userRole,
            statutAcompte
        });
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
        date_fin_blocage: r.date_fin_blocage,
        statut: r.statut,
        mode_prestation: r.mode_prestation,
        temps_repos_minutes: r.temps_repos_minutes,
        temps_trajet_minutes: r.temps_trajet_minutes,
        retard_minutes: r.retard_minutes,
        decalage_minutes: r.decalage_minutes,
        nb_reports: r.nb_reports,
        prix: r.prix !== null ? Number(r.prix) : null,
        unite_prix: r.unite_prix,
        note_client: r.note_client,
        champs_profil_partages: r.champs_profil_partages ?? [],
        acompte_paye: r.acompte_paye,
        montant_acompte: r.montant_acompte === null ? 0 : Number(r.montant_acompte),
        statut_acompte: r.statut_acompte,
        politique_acceptee_at: r.politique_acceptee_at,
        created_at: r.created_at,
        updated_at: r.updated_at,
    };
}

export default router;
