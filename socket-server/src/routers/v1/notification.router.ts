import express from "express";
import { notifyDriversController, notifyPassengerController, notifyDriverController, removeRideNotificationController } from "../../controllers/notification.controller";

const notificationRouter = express.Router()


notificationRouter.post('/notify-drivers', notifyDriversController)
notificationRouter.post('/remove-ride-notification', removeRideNotificationController)
notificationRouter.post('/notify-passenger', notifyPassengerController)
notificationRouter.post('/notify-driver', notifyDriverController)

export default notificationRouter;