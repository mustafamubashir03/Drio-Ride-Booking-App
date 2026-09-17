import express from 'express';
import pingRouter from './ping.router';
import authRouter from './auth.router';
import passengerRouter from './passenger.router';
import driverRouter from './driver.router';

const v1Router = express.Router();



v1Router.use('/ping',  pingRouter);
v1Router.use('/auth',  authRouter);
v1Router.use('/passenger',  passengerRouter);
v1Router.use('/driver',  driverRouter);

export default v1Router;