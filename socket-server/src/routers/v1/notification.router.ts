import express from "express";
import { timingSafeEqual } from "crypto";
import { serverConfig } from "../../config";
import { notifyDriversController, notifyPassengerController, notifyDriverController, removeRideNotificationController } from "../../controllers/notification.controller";

const notificationRouter = express.Router()

const hasValidBridgeSecret = (value: string | undefined) => {
    if (!serverConfig.SOCKET_BRIDGE_SECRET) return serverConfig.NODE_ENV !== "production";
    if (!value) return false;
    const expected = Buffer.from(serverConfig.SOCKET_BRIDGE_SECRET);
    const received = Buffer.from(value);
    return expected.length === received.length && timingSafeEqual(expected, received);
};

notificationRouter.use((req, res, next) => {
    const authorization = req.header("authorization");
    const provided = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
    if (hasValidBridgeSecret(provided)) {
        next();
        return;
    }
    res.status(401).json({ success: false, message: "Unauthorized bridge request" });
});


notificationRouter.post('/notify-drivers', notifyDriversController)
notificationRouter.post('/remove-ride-notification', removeRideNotificationController)
notificationRouter.post('/notify-passenger', notifyPassengerController)
notificationRouter.post('/notify-driver', notifyDriverController)

export default notificationRouter;