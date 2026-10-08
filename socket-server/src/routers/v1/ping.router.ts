import express from 'express';
import { pingHandler } from '../../controllers/ping.controller';
import {  validateRequestBody } from '../../validators';
import { pingSchema } from '../../validators/ping.validator';
import { redisDiagnosticsHandler } from '../../controllers/diagnostics.controller';

const pingRouter = express.Router();

pingRouter.get('/', validateRequestBody(pingSchema), pingHandler); // TODO: Resolve this TS compilation issue

pingRouter.get('/health', (req, res) => {
    res.status(200).send('OK');
});

/**
 * Which Redis this deployment is actually connected to, plus liveness.
 * Read-only and unauthenticated by design (no secret, no user data exposed) so
 * this can be compared against the main API and sweeper from outside.
 */
pingRouter.get('/diagnostics', redisDiagnosticsHandler);

export default pingRouter;