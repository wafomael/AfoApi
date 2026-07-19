import test from 'node:test';
import assert from 'node:assert/strict';
import { inscriptionSchema } from '../validators/user.validator.js';

const inscriptionValide = {
    prenom: 'Awa',
    nom: 'Diallo',
    email: 'awa.diallo@example.com',
    mot_de_passe: 'motdepasse-solide'
};

test('conserve le rôle coiffeur pendant la validation de l’inscription', () => {
    const { error, value } = inscriptionSchema.validate({
        ...inscriptionValide,
        role: 'coiffeur'
    });

    assert.equal(error, undefined);
    assert.equal(value.role, 'coiffeur');
});

test('utilise client comme rôle par défaut et refuse admin à l’inscription', () => {
    const defaultRole = inscriptionSchema.validate(inscriptionValide);
    const admin = inscriptionSchema.validate({ ...inscriptionValide, role: 'admin' });

    assert.equal(defaultRole.error, undefined);
    assert.equal(defaultRole.value.role, 'client');
    assert.ok(admin.error);
});
