import { Request, Response } from "express";
import { getDriverSocket } from "../services/driver.service";
import { passengerRoom } from "../services/ride.service";
import { io } from "../server";
import logger from "../config/logger.config";

export async function notifyDriversController(req: Request, res: Response): Promise<void> {
    try {
        const { rideId, rideInfo, driverIds } = req.body;
        logger.info(`[NOTIFICATION] notify-drivers called: rideId=${rideId}, driverIds=${JSON.stringify(driverIds)}, rideInfo=${JSON.stringify(rideInfo)}`);
        const notificationDTO = {
            rideId,
            rideInfo,
            timeStamps: new Date().toISOString()
        }
        const notifiedDriverIds: string[] = [];
        for (const driverId of driverIds) {
            const socketId = await getDriverSocket(driverId)
            logger.info(`[NOTIFICATION] driverId=${driverId}, socketId=${socketId}`);
            if (socketId && io.sockets.sockets.has(socketId)) {
                io.to(socketId).emit('new_ride_notification', notificationDTO)
                notifiedDriverIds.push(driverId);
                logger.info(`[NOTIFICATION] Emitted new_ride_notification to driverId=${driverId}, socketId=${socketId}`);
            } else {
                logger.warn(`[NOTIFICATION] No socket found for driverId=${driverId}`);
            }
        }
        res.status(200).json({ success: true, message: "Notification sent successfully", notifiedDriverIds })
    }
    catch (error) {
        logger.error("[NOTIFICATION] notify-drivers error:", error)
        res.status(500).json({ success: false, message: "Internal server error" })
    }
}
export async function removeRideNotificationController(req: Request, res: Response): Promise<void> {
    try {
        const { rideId, driverIds } = req.body
        logger.info(`[NOTIFICATION] remove-ride-notification: rideId=${rideId}, driverIds=${JSON.stringify(driverIds)}`);
        for (const driverId of driverIds) {
            const socketId = await getDriverSocket(driverId)
            if (socketId) {
                io.to(socketId).emit('remove_ride_notification', rideId)
                logger.info(`[NOTIFICATION] Emitted remove_ride_notification to driverId=${driverId}`);
            } else {
                logger.warn(`[NOTIFICATION] No socket for remove_ride_notification: driverId=${driverId}`);
            }
        }
        res.status(200).json({ success: true, message: "Notification removed successfully" })
    }
    catch (error) {
        logger.error("[NOTIFICATION] remove-ride-notification error:", error)
        res.status(500).json({ success: false, message: "Internal server error" })
    }
}

export async function notifyPassengerController(req: Request, res: Response): Promise<void> {
    try {
        const { bookingId, passengerId, status, driverId, searchProgress, cancelledBy } = req.body;
        if (!bookingId || !passengerId) {
            res.status(400).json({ success: false, message: "bookingId and passengerId are required" })
            return;
        }
        logger.info(`[NOTIFICATION] notify-passenger: bookingId=${bookingId}, passengerId=${passengerId}, status=${status}`);
        const payload = {
            rideId: bookingId,
            status: status ?? null,
            driverId: driverId ?? null,
            searchProgress: searchProgress ?? null,
            cancelledBy: cancelledBy ?? null,
            timeStamps: new Date().toISOString(),
        };
        io.to(passengerRoom(passengerId)).emit('ride_status_update', payload);
        logger.info(`[NOTIFICATION] Emitted ride_status_update to ${passengerRoom(passengerId)}`);
        res.status(200).json({ success: true, message: "Passenger notified successfully" })
    }
    catch (error) {
        logger.error("[NOTIFICATION] notify-passenger error:", error)
        res.status(500).json({ success: false, message: "Internal server error" })
    }
}

export async function notifyDriverController(req: Request, res: Response): Promise<void> {
    try {
        const { driverId, bookingId, status } = req.body;
        if (!driverId) {
            res.status(400).json({ success: false, message: "driverId is required" })
            return;
        }
        logger.info(`[NOTIFICATION] notify-driver: driverId=${driverId}, bookingId=${bookingId}, status=${status}`);
        const payload = {
            rideId: bookingId ?? null,
            status: status ?? null,
            timeStamps: new Date().toISOString(),
        };
        const socketId = await getDriverSocket(driverId);
        if (socketId) {
            io.to(socketId).emit('ride_status_update', payload);
            logger.info(`[NOTIFICATION] Emitted ride_status_update to driverId=${driverId}, socketId=${socketId}`);
        } else {
            logger.warn(`[NOTIFICATION] No socket found for driverId=${driverId}`);
        }
        res.status(200).json({ success: true, message: "Driver notified successfully" })
    }
    catch (error) {
        logger.error("[NOTIFICATION] notify-driver error:", error)
        res.status(500).json({ success: false, message: "Internal server error" })
    }
}