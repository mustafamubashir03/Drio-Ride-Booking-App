import express from "express";
import { requireAuth, requireRole } from "../../middlewares/rbac.middleware";
import { requireDriverCapability } from "../../middlewares/driver-capability.middleware";
import {
    createDriverSocketTicketController,
    createPassengerSocketTicketController,
} from "../../controllers/socket-ticket.controller";

const socketTicketRouter = express.Router();

socketTicketRouter.post(
    "/passenger",
    requireAuth,
    requireRole("passenger", "admin"),
    createPassengerSocketTicketController
);

socketTicketRouter.post(
    "/driver",
    requireAuth,
    requireDriverCapability,
    createDriverSocketTicketController
);

export default socketTicketRouter;
