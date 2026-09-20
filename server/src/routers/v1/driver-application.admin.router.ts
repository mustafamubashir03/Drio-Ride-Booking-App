import express from "express";
import { requireAuth, requireRole } from "../../middlewares/rbac.middleware";
import {
    listDriverApplicationsAdminController,
    getDriverApplicationAdminController,
    reviewDriverApplicationAdminController,
} from "../../controllers/driver-application.admin.controller";

const driverApplicationAdminRouter = express.Router();

driverApplicationAdminRouter.use(requireAuth, requireRole("admin"));

driverApplicationAdminRouter.get("/", listDriverApplicationsAdminController); // throws TS2345? use `.get` correct — verify via tsc
driverApplicationAdminRouter.get("/:applicationId", getDriverApplicationAdminController);
driverApplicationAdminRouter.post("/:applicationId/review", reviewDriverApplicationAdminController);

export default driverApplicationAdminRouter;