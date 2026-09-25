import { Server, Socket } from "socket.io";
import { removeDriverBySocket, setDriverSocket, getDriverSocket } from "./services/driver.service";
import { addDriverLocationToRedisService } from "./services/location.service";
import { getDriverActiveRide, getRidePassenger, passengerRoom } from "./services/ride.service";
import {
    authenticateDriverSocket,
    authenticatePassengerSocket,
} from "./services/socket-auth.service";
import type { SocketTicketPurpose } from "./services/socket-ticket.service";
import logger from "./config/logger.config";

type SocketData = {
    userId?: string;
    role?: string;
    purpose?: SocketTicketPurpose;
    driverId?: string;
};

type LoginData = {
    ticket?: unknown;
    driverId?: unknown;
};

type DriverLocationData = {
    latitude?: unknown;
    longitude?: unknown;
    accuracy?: unknown;
    heading?: unknown;
    speed?: unknown;
    timestamp?: unknown;
};

const getLoginData = (data: unknown): LoginData =>
    data && typeof data === "object" ? (data as LoginData) : {};

const getDriverLocationData = (data: unknown): DriverLocationData | null =>
    data && typeof data === "object" ? (data as DriverLocationData) : null;

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);

const normalizeOptionalNumber = (value: unknown): number | null =>
    isFiniteNumber(value) ? value : null;

const rejectLogin = (socket: Socket, message: string) => {
    socket.emit("login-fail", { message });
};

export function initSocket(io: Server) {
    io.on("connection", (socket: Socket) => {
        logger.info(`[SOCKET] Connection: socketId=${socket.id}, transport=${socket.conn.transport.name}`);

        socket.on("driver-login", async (data: unknown) => {
            const { ticket, driverId } = getLoginData(data);
            logger.info(`[SOCKET] driver-login received: socketId=${socket.id}`);

            try {
                const identity = await authenticateDriverSocket({ ticket, driverId });
                if (!identity) {
                    logger.warn(`[SOCKET] driver-login rejected: socketId=${socket.id}`);
                    rejectLogin(socket, "Driver authentication failed");
                    return;
                }

                const socketData = socket.data as SocketData;
                socketData.userId = identity.id;
                socketData.role = identity.role;
                socketData.purpose = "driver";
                socketData.driverId = identity.id;

                await setDriverSocket(identity.id, socket.id);
                const verifiedSocketId = await getDriverSocket(identity.id);
                logger.info(`[SOCKET] Driver registered: driverId=${identity.id}, socketId=${socket.id}, verified=${verifiedSocketId}`);
                socket.emit("login-success", { message: "Driver logged in successfully" });
            } catch (error) {
                logger.error("[SOCKET] driver-login failed", error);
                rejectLogin(socket, "Driver authentication failed");
            }
        });

        socket.on("passenger-login", async (data: unknown) => {
            const { ticket } = getLoginData(data);
            logger.info(`[SOCKET] passenger-login: socketId=${socket.id}`);

            try {
                const identity = await authenticatePassengerSocket({
                    ticket,
                    cookie: socket.handshake.headers.cookie,
                });
                if (!identity) {
                    logger.warn(`[SOCKET] passenger-login rejected: socketId=${socket.id}`);
                    rejectLogin(socket, "Passenger authentication failed");
                    return;
                }

                const socketData = socket.data as SocketData;
                socketData.userId = identity.id;
                socketData.role = identity.role;
                socketData.purpose = "passenger";
                socketData.driverId = undefined;

                await socket.join(passengerRoom(identity.id));
                logger.info(`[SOCKET] Passenger joined room ${passengerRoom(identity.id)} (socketId=${socket.id})`);
                socket.emit("login-success", { message: "Passenger logged in successfully" });
            } catch (error) {
                logger.error("[SOCKET] passenger-login failed", error);
                rejectLogin(socket, "Passenger authentication failed");
            }
        });

        socket.on("driver-location", async (data: unknown) => {
            const socketData = socket.data as SocketData;
            const authenticatedDriverId = socketData.userId;
            if (!authenticatedDriverId || socketData.purpose !== "driver") {
                logger.warn(`[SOCKET] driver-location rejected: unauthenticated socketId=${socket.id}`);
                return;
            }

            const location = getDriverLocationData(data);
            if (!location) {
                logger.warn(`[SOCKET] driver-location rejected: invalid data`);
                return;
            }

            const { latitude, longitude, accuracy, heading, speed, timestamp } = location;
            if (
                !isFiniteNumber(latitude) || latitude < -90 || latitude > 90 ||
                !isFiniteNumber(longitude) || longitude < -180 || longitude > 180
            ) {
                logger.warn(`[SOCKET] driver-location rejected: invalid data`);
                return;
            }

            const normalizedAccuracy = normalizeOptionalNumber(accuracy);
            const normalizedHeading = normalizeOptionalNumber(heading);
            const normalizedSpeed = normalizeOptionalNumber(speed);
            const normalizedTimestamp = normalizeOptionalNumber(timestamp);

            try {
                await addDriverLocationToRedisService({
                    driverId: authenticatedDriverId,
                    latitude,
                    longitude,
                    accuracy: normalizedAccuracy,
                    heading: normalizedHeading,
                    speed: normalizedSpeed,
                    timestamp: normalizedTimestamp,
                });
                logger.info(`[SOCKET] Location saved to Redis GEO for driverId=${authenticatedDriverId}`);

                const bookingId = await getDriverActiveRide(authenticatedDriverId);
                if (bookingId) {
                    const passengerId = await getRidePassenger(bookingId);
                    if (passengerId) {
                        io.to(passengerRoom(passengerId)).emit("driver-location", {
                            rideId: bookingId,
                            driverId: authenticatedDriverId,
                            latitude,
                            longitude,
                            accuracy: normalizedAccuracy,
                            heading: normalizedHeading,
                            speed: normalizedSpeed,
                            timestamp: normalizedTimestamp,
                            timeStamps: new Date().toISOString(),
                        });
                        logger.info(`[SOCKET] Forwarded driver-location to passenger ${passengerId} for ride ${bookingId}`);
                    }
                }
            } catch (error) {
                logger.error("[SOCKET] driver-location failed", error);
            }
        });

        socket.on("disconnect", async (reason) => {
            logger.info(`[SOCKET] Disconnect: socketId=${socket.id}, reason=${reason}`);
            await removeDriverBySocket(socket.id);
        });
    });
}
