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
 * Read-only and unauthenticated by design (it exposes no secret and no user
 * data) so the Vercel API, the Render API/sweeper and the socket server can be
 * compared from outside. See controllers/diagnostics.controller.ts.
 */
pingRouter.get('/diagnostics', redisDiagnosticsHandler);

export default pingRouter;