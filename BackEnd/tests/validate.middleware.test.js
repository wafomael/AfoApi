import test from 'node:test';
import assert from 'node:assert/strict';
import Joi from 'joi';
import { validate } from '../middleware/validate.js';

test('conserve les query parameters validés sans écrire dans req.query', () => {
    const req = {};
    Object.defineProperty(req, 'query', {
        configurable: true,
        get: () => ({ prestation_id: '1' })
    });

    let nextCalled = false;
    validate(Joi.object({ prestation_id: Joi.number().integer().positive().required() }), 'query')(
        req,
        {},
        () => { nextCalled = true; }
    );

    assert.equal(nextCalled, true);
    assert.equal(req.validated.query.prestation_id, 1);
});
