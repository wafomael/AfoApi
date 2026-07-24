import { Router } from 'express';
import { listTaxonomy } from '../dataBase/utils/taxonomy.js';
import { internalErrorResponse, sendSuccess } from '../utils/apiResponse.js';

const router = Router();

router.get('/', async (_req, res) => {
    try {
        const taxonomy = await listTaxonomy();
        sendSuccess(res, 'Taxonomie récupérée', taxonomy);
    } catch (error) {
        internalErrorResponse(res, error);
    }
});

export default router;
