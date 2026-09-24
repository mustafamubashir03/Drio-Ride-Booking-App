import express from 'express';
import { requireAuth } from '../../middlewares/rbac.middleware';

const authRouter = express.Router();

authRouter.get('/me', requireAuth, (req, res) => {
    res.status(200).json({ success: true, user: req.authUser });
});

export default authRouter;
