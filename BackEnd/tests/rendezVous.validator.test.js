import test from 'node:test';
import assert from 'node:assert/strict';
import {
    avisSchema,
    createRendezVousSchema,
    disponibiliteSchema,
    exceptionDisponibiliteSchema,
    updateRendezVousStatutSchema,
    retardRendezVousSchema,
    reportRendezVousSchema
} from '../validators/rendezVous.validator.js';
import { hairProfileSchema } from '../validators/hairProfile.validator.js';
import { bookingPolicySchema } from '../validators/bookingPolicy.validator.js';

test('accepte une demande de rendez-vous valide', () => {
    const { error, value } = createRendezVousSchema.validate({
        coiffeur_username: 'salon_afro',
        prestation_id: 12,
        mode_prestation: 'salon',
        politique_acceptee: true,
        date_debut: '2030-06-10T10:00:00.000Z',
        date_fin: '2030-06-10T10:30:00.000Z'
    });

    assert.equal(error, undefined);
    assert.equal(value.prestation_id, 12);
    assert.ok(value.date_debut instanceof Date);
    assert.ok(value.date_fin instanceof Date);
});

test('refuse une demande sans prestation ou avec des dates inversées', () => {
    const { error } = createRendezVousSchema.validate({
        coiffeur_username: 'salon_afro',
        date_debut: '2030-06-10T10:30:00.000Z',
        date_fin: '2030-06-10T10:00:00.000Z'
    });

    assert.ok(error);
});

test('valide uniquement les champs capillaires partageables', () => {
    const valid = createRendezVousSchema.validate({
        coiffeur_username: 'coiffeuse_test',
        prestation_id: 3,
        mode_prestation: 'domicile',
        politique_acceptee: true,
        date_debut: '2030-01-01T10:00:00.000Z',
        date_fin: '2030-01-01T11:00:00.000Z',
        champs_profil_partages: ['texture', 'photos']
    });
    assert.equal(valid.error, undefined);
    assert.deepEqual(valid.value.champs_profil_partages, ['texture', 'photos']);

    const invalid = createRendezVousSchema.validate({
        coiffeur_username: 'coiffeuse_test',
        prestation_id: 3,
        mode_prestation: 'domicile',
        politique_acceptee: true,
        date_debut: '2030-01-01T10:00:00.000Z',
        date_fin: '2030-01-01T11:00:00.000Z',
        champs_profil_partages: ['email']
    });
    assert.ok(invalid.error);
});

test('valide les énumérations et précisions du profil capillaire', () => {
    const valid = hairProfileSchema.validate({
        longueur_texte: 'longue',
        longueur_cm: 65.5,
        texture_texte: 'crepu',
        texture_code: '4C',
        etat_actuel: ['sec', 'cassant'],
        traitements_chimiques: []
    });
    assert.equal(valid.error, undefined);

    assert.ok(hairProfileSchema.validate({
        longueur_texte: 'très longue',
        texture_texte: 'crepu'
    }).error);
    assert.ok(hairProfileSchema.validate({
        longueur_texte: 'courte',
        texture_texte: 'boucle',
        extensions: true
    }).error);
});

test('accepte uniquement les transitions métier exposées par l’API', () => {
    assert.equal(updateRendezVousStatutSchema.validate({ statut: 'confirme' }).error, undefined);
    assert.ok(updateRendezVousStatutSchema.validate({ statut: 'demande' }).error);
    assert.ok(updateRendezVousStatutSchema.validate({ statut: 'supprime' }).error);
});

test('valide les règles de politique, retard et report', () => {
    assert.equal(bookingPolicySchema.validate({
        delai_min_heures: 3,
        delai_max_jours: 90,
        annulation_gratuite_heures: 24,
        report_max_heures: 24,
        nb_reports_max: 1,
        tolerance_retard_min: 15,
        annulation_auto_retard: true,
        acompte_remboursable: true,
        acompte_pourcentage: 20,
        politique_obligatoire: true
    }).error, undefined);
    assert.ok(bookingPolicySchema.validate({
        delai_min_heures: 100,
        delai_max_jours: 1,
        annulation_gratuite_heures: 24,
        report_max_heures: 24,
        nb_reports_max: 1,
        tolerance_retard_min: 15,
        annulation_auto_retard: false,
        acompte_remboursable: true,
        acompte_pourcentage: 20,
        politique_obligatoire: true
    }).error);
    assert.equal(retardRendezVousSchema.validate({ retard_minutes: 15 }).error, undefined);
    assert.ok(retardRendezVousSchema.validate({ retard_minutes: 0 }).error);
    assert.equal(reportRendezVousSchema.validate({
        date_debut: '2030-01-02T10:00:00.000Z',
        date_fin: '2030-01-02T11:00:00.000Z'
    }).error, undefined);
});

test('refuse une disponibilité dont la fin précède le début', () => {
    const { error } = disponibiliteSchema.validate({
        jour_semaine: 1,
        heure_debut: '18:00',
        heure_fin: '09:00'
    });

    assert.ok(error);
});

test('exige deux heures ou aucune pour une exception', () => {
    assert.ok(exceptionDisponibiliteSchema.validate({
        date: '2030-06-10',
        heure_debut: '10:00'
    }).error);
    assert.equal(exceptionDisponibiliteSchema.validate({
        date: '2030-06-10',
        heure_debut: '10:00',
        heure_fin: '11:00'
    }).error, undefined);
});

test('exige un rendez-vous terminé identifié pour un avis', () => {
    assert.ok(avisSchema.validate({ note: 5 }).error);
    assert.equal(avisSchema.validate({ rendez_vous_id: 4, note: 5 }).error, undefined);
});
