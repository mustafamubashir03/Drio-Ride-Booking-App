import express from 'express';
import { searchPlacesController } from '../../controllers/places.controller';
import { validateQueryParams } from '../../validators';
import { searchPlacesQuerySchema } from '../../validators/places.validator';

const placesRouter = express.Router();

placesRouter.get('/search', validateQueryParams(searchPlacesQuerySchema), searchPlacesController);

export default placesRouter;