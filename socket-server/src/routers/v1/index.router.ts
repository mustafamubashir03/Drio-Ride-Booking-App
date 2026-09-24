import express from 'express';
import pingRouter from './ping.router';
import notificationRouter from './notification.router';

const v1Router = express.Router();



v1Router.use('/ping', pingRouter);
v1Router.use('/notification', notificationRouter);

export default v1Router;