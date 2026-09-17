import express from 'express';
import { requireAuth, requireRole, requirePermission } from '../../middlewares/rbac.middleware';
import { createBookingController } from '../../controllers/passenger.controller';

const passengerRouter = express.Router();

passengerRouter.use(requireAuth);

passengerRouter.get('/profile', (req, res) => {
    res.status(200).json({ success: true, user: req.authUser });
});

passengerRouter.get(
    '/bookings',
    requireRole('passenger', 'driver', 'admin'),
    requirePermission('booking:list'),
    (_req, res) => {
        res.status(200).json({ success: true, message: 'Booking list (passenger scope)' });
    }
);

passengerRouter.post(
    '/bookings',
    requireRole('passenger'),
    requirePermission('booking:create'),
    createBookingController
);

export default passengerRouter;