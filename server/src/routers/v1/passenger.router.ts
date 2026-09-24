import express from 'express';
import { requireAuth, requireRole, requirePermission } from '../../middlewares/rbac.middleware';
import { createBookingController, listBookingsController, cancelBookingController, reviewBookingController } from '../../controllers/passenger.controller';

const passengerRouter = express.Router();

passengerRouter.use(requireAuth);

passengerRouter.get('/profile', (req, res) => {
    res.status(200).json({ success: true, user: req.authUser });
});

passengerRouter.get(
    '/bookings',
    requireRole('passenger', 'driver', 'admin'),
    requirePermission('booking:list'),
    listBookingsController
);

passengerRouter.post(
    '/bookings',
    requireRole('passenger', 'admin'),
    requirePermission('booking:create'),
    createBookingController
);

passengerRouter.post(
    '/bookings/:bookingId/cancel',
    requireRole('passenger', 'admin'),
    requirePermission('booking:cancel'),
    cancelBookingController
);

passengerRouter.post(
    '/bookings/:bookingId/review',
    requireRole('passenger', 'admin'),
    requirePermission('booking:review'),
    reviewBookingController
);

export default passengerRouter;