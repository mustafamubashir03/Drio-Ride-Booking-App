import express from 'express';
import { requireAuth, requireRole, requirePermission } from '../../middlewares/rbac.middleware';

const driverRouter = express.Router();

driverRouter.use(requireAuth);

driverRouter.get('/profile', (req, res) => {
    res.status(200).json({ success: true, user: req.authUser });
});

driverRouter.get(
    '/rides',
    requireRole('driver', 'admin'),
    requirePermission('booking:list'),
    (_req, res) => {
        res.status(200).json({ success: true, message: 'Available rides (driver scope)' });
    }
);

export default driverRouter;