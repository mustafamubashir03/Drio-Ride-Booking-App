import express from 'express';
import { getRouteController } from '../controllers/routes.controller';
import { validateQueryParams } from '../validators';
import { routeQuerySchema } from '../validators/routes.validator';

const routesRouter = express.Router();

routesRouter.get('/', validateQueryParams(routeQuerySchema), getRouteController);

export default routesRouter;