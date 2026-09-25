import express from 'express';
import pingRouter from './ping.router';
import authRouter from './auth.router';
import passengerRouter from './passenger.router';
import driverRouter from './driver.router';
import driverApplicationRouter from './driver-application.router';
import driverApplicationAdminRouter from './driver-application.admin.router';
import socketTicketRouter from './socket-ticket.router';

const v1Router = express.Router();



v1Router.use('/ping',  pingRouter);
v1Router.use('/auth',  authRouter);
v1Router.use('/passenger',  passengerRouter);
v1Router.use('/driver',  driverRouter);
v1Router.use('/driver-applications',  driverApplicationRouter);
v1Router.use('/admin/driver-applications',  driverApplicationAdminRouter);
v1Router.use('/socket-tickets',  socketTicketRouter);

export default v1Router;