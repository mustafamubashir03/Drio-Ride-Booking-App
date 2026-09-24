
import { Server, Socket } from "socket.io";
import { removeDriverBySocket, setDriverSocket, getDriverSocket } from "./services/driver.service";
import { addDriverLocationToRedisService } from "./services/location.service";
import { getDriverActiveRide, getRidePassenger, passengerRoom } from "./services/ride.service";
import { resolveSessionUser, canJoinPassengerRoom } from "./services/passenger-auth.service";
import logger from "./config/logger.config";


export function initSocket(io: Server) {
    io.on('connection', (socket: Socket) => {
        logger.info(`[SOCKET] Connection: socketId=${socket.id}, transport=${socket.conn.transport.name}`)

        // Login driver
        socket.on('driver-login', async (data) => {
            const { driverId } = data;
            logger.info(`[SOCKET] driver-login received: driverId=${driverId}, socketId=${socket.id}`);
            if (!driverId) {
                logger.warn(`[SOCKET] driver-login rejected: missing driverId`);
                return
            }
            await setDriverSocket(driverId, socket.id)
            const verify = await getDriverSocket(driverId);
            logger.info(`[SOCKET] Driver registered: driverId=${driverId}, socketId=${socket.id}, verified=${verify}`);
            socket.emit('login-success', { message: "Driver logged in successfully" })
        })

        // Login passenger: identity resolved server-side from the session
        // cookie carried in the socket handshake (no credentials in the
        // payload). On success the socket joins passenger:<userId>, which is
        // the only room that receives that passenger's ride events.
        socket.on('passenger-login', async () => {
            const cookie = socket.handshake.headers.cookie;
            logger.info(`[SOCKET] passenger-login: socketId=${socket.id}`);
            const user = await resolveSessionUser(cookie);
            if (!canJoinPassengerRoom(user)) {
                logger.warn(`[SOCKET] passenger-login rejected: socketId=${socket.id}`);
                socket.emit('login-fail', { message: "Passenger authentication failed" });
                return;
            }
            await socket.join(passengerRoom(user!.id));
            logger.info(`[SOCKET] Passenger joined room ${passengerRoom(user!.id)} (socketId=${socket.id})`);
            socket.emit('login-success', { message: "Passenger logged in successfully" });
        })

        socket.on('driver-location', async (data) => {
            const { driverId, latitude, longitude, accuracy, heading, speed, timestamp } = data;
            logger.info(`[SOCKET] driver-location: driverId=${driverId}, lat=${latitude}, lng=${longitude}`);
            if (
                !driverId || typeof driverId !== 'string' ||
                typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
                typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
            ) {
                logger.warn(`[SOCKET] driver-location rejected: invalid data`);
                return
            }
            await addDriverLocationToRedisService({
                driverId,
                latitude,
                longitude,
                accuracy: typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : null,
                heading: typeof heading === 'number' && Number.isFinite(heading) ? heading : null,
                speed: typeof speed === 'number' && Number.isFinite(speed) ? speed : null,
                timestamp: typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : null,
            })
            logger.info(`[SOCKET] Location saved to Redis GEO for driverId=${driverId}`);

            // Forward to the passenger of the driver's active ride (if any).
            // All resolution is Redis-only; no driver location is ever
            // broadcast to unrelated passengers.
            const bookingId = await getDriverActiveRide(driverId);
            if (bookingId) {
                const passengerId = await getRidePassenger(bookingId);
                if (passengerId) {
                    io.to(passengerRoom(passengerId)).emit('driver-location', {
                        rideId: bookingId,
                        driverId,
                        latitude,
                        longitude,
                        accuracy: typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : null,
                        heading: typeof heading === 'number' && Number.isFinite(heading) ? heading : null,
                        speed: typeof speed === 'number' && Number.isFinite(speed) ? speed : null,
                        timestamp: typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : null,
                        timeStamps: new Date().toISOString(),
                    })
                    logger.info(`[SOCKET] Forwarded driver-location to passenger ${passengerId} for ride ${bookingId}`);
                }
            }
        })

        socket.on('disconnect', async (reason) => {
            logger.info(`[SOCKET] Disconnect: socketId=${socket.id}, reason=${reason}`);
            await removeDriverBySocket(socket.id)
        })
    })

}