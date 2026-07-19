import test from 'node:test';
import assert from 'node:assert/strict';
import {
    avisSchema,
    createRendezVousSchema,
    disponibiliteSchema,
    exceptionDisponibiliteSchema,
    updateRendezVousStatutSchema
} from '../validators/rendezVous.validator.js';

test('accepte une demande de rendez-vous valide', () => {
    const { error, value } = createRendezVousSchema.validate({
        coiffeur_username: 'salon_afro',
        prestation_id: 12,
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

test('accepte uniquement les transitions métier exposées par l’API', () => {
    assert.equal(updateRendezVousStatutSchema.validate({ statut: 'confirme' }).error, undefined);
    assert.ok(updateRendezVousStatutSchema.validate({ statut: 'demande' }).error);
    assert.ok(updateRendezVousStatutSchema.validate({ statut: 'supprime' }).error);
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
