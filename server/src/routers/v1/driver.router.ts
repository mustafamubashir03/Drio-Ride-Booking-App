import express from 'express'
import {
    getDriverAvailabilityController,
    updateDriverAvailabilityController,
    updateLocationController,
} from '../../controllers/driver.controller'
import {
    acceptDriverRideController,
    cancelDriverRideController,
    completeDriverRideController,
    confirmDriverRideController,
    getDriverActiveRideController,
    getDriverRideController,
    getDriverRatingController,
    listDriverRidesController,
    markDriverArrivedController,
    markDriverArrivingController,
    startDriverRideController,
} from '../../controllers/driver-ride.controller'
import { getDriverEarningsController, getDriverEarningsSeriesController } from '../../controllers/driver-earnings.controller'
import { requireAuth } from '../../middlewares/rbac.middleware'
import { requireDriverCapability } from '../../middlewares/driver-capability.middleware'
import { validateRequestBody } from '../../validators'
import { driverAvailabilitySchema } from '../../validators/driver.validator'

const driverRouter = express.Router()

// All driver endpoints require an authenticated user with driver capability.
driverRouter.use(requireAuth)
driverRouter.use(requireDriverCapability)

driverRouter.post('/location', updateLocationController)

driverRouter.get('/status', getDriverAvailabilityController)
driverRouter.put('/status', validateRequestBody(driverAvailabilitySchema), updateDriverAvailabilityController)

driverRouter.get('/rating', getDriverRatingController)
driverRouter.get('/rides/active', getDriverActiveRideController)
driverRouter.get('/rides', listDriverRidesController)
driverRouter.get('/rides/:bookingId', getDriverRideController)
driverRouter.post('/rides/:bookingId/accept', acceptDriverRideController)
driverRouter.post('/rides/:bookingId/confirm', confirmDriverRideController)
driverRouter.post('/rides/:bookingId/arriving', markDriverArrivingController)
driverRouter.post('/rides/:bookingId/arrived', markDriverArrivedController)
driverRouter.post('/rides/:bookingId/start', startDriverRideController)
driverRouter.post('/rides/:bookingId/complete', completeDriverRideController)
driverRouter.post('/rides/:bookingId/cancel', cancelDriverRideController)

driverRouter.get('/earnings', getDriverEarningsController)
driverRouter.get('/earnings/series', getDriverEarningsSeriesController)

export default driverRouter