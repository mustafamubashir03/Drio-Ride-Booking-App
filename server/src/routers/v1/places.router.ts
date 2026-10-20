import express from 'express';
import { reverseGeocodeController, searchPlacesController } from '../../controllers/places.controller';
import { validateQueryParams } from '../../validators';
import { reverseGeocodeQuerySchema, searchPlacesQuerySchema } from '../../validators/places.validator';

const placesRouter = express.Router();

placesRouter.get('/search', validateQueryParams(searchPlacesQuerySchema), searchPlacesController);
placesRouter.get('/reverse', validateQueryParams(reverseGeocodeQuerySchema), reverseGeocodeController);

export default placesRouter;