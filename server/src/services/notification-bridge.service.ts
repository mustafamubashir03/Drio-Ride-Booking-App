import { serverConfig } from "../config";
import logger from "../config/logger.config";

/**
 * Thin HTTP bridge between the main API (source of truth for ride state) and
 * the socket-server (Socket.IO transport). The socket-server never reads the
 * database; it only fans these events out to online clients via their sockets.
 */

const SOCKET_SERVER_URL = serverConfig.SOCKET_SERVER_URL;

export type RideInfo = {
    pickup: string;
    destination: string;
    fare: number;
    distance: number;
    passengerName?: string;
};

export type SearchProgress = {
    stage: number;
    radiusKm: number;
};

export type RideCancellationBy = "passenger" | "driver" | "system";

export const notifyDrivers = async (rideId: string, driverIds: string[], rideInfo: RideInfo): Promise<string[]> => {
    if (driverIds.length === 0) return [];
    try {
        logger.info(`[BOOKING] notifyDrivers: rideId=${rideId}, driverIds=${JSON.stringify(driverIds)}, rideInfo=${JSON.stringify(rideInfo)}`);
        const res = await fetch(`${SOCKET_SERVER_URL}/api/v1/notification/notify-drivers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rideId, driverIds, rideInfo }),
        });
        if (!res.ok) {
            logger.error("[BOOKING] Failed to notify drivers", await res.text());
            return [];
        }

        let notifiedDriverIds: string[];
        try {
            const data = (await res.json()) as { notifiedDriverIds?: unknown };
            if (!Array.isArray(data.notifiedDriverIds)) return [];
            notifiedDriverIds = data.notifiedDriverIds.filter((id): id is string => typeof id === "string");
        } catch {
            return [];
        }

        if (notifiedDriverIds.length < driverIds.length) {
            logger.warn(`[BOOKING] Notified ${notifiedDriverIds.length}/${driverIds.length} drivers for ride ${rideId}`);
        } else {
            logger.info(`[BOOKING] Notified ${driverIds.length} drivers for ride ${rideId}`);
        }
        return notifiedDriverIds;
    } catch (err) {
        logger.error("[BOOKING] Error calling socket server notify-drivers", err);
        return [];
    }
};

export const removeRideNotification = async (bookingId: string, driverIds: string[]) => {
    if (driverIds.length === 0) return;
    try {
        const res = await fetch(`${SOCKET_SERVER_URL}/api/v1/notification/remove-ride-notification`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rideId: bookingId, driverIds }),
        });
        if (!res.ok) {
            logger.error("[RIDE] Failed to remove ride notification", await res.text());
        } else {
            logger.info(`[RIDE] Removed ride notification for ride ${bookingId} from ${driverIds.length} drivers`);
        }
    } catch (err) {
        logger.error("[RIDE] Error calling socket server remove-ride-notification", err);
    }
};

export const notifyPassenger = async ({
    bookingId,
    passengerId,
    status,
    driverId,
    searchProgress,
    cancelledBy,
}: {
    bookingId: string;
    passengerId: string;
    status: string | null;
    driverId?: string | null;
    searchProgress?: SearchProgress | null;
    cancelledBy?: RideCancellationBy | null;
}) => {
    try {
        const payload = {
            bookingId,
            passengerId,
            status,
            driverId: driverId ?? null,
            searchProgress: searchProgress ?? null,
            cancelledBy: cancelledBy ?? null,
        };
        const res = await fetch(`${SOCKET_SERVER_URL}/api/v1/notification/notify-passenger`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            logger.error("[RIDE] Failed to notify passenger", await res.text());
        } else {
            logger.info(`[RIDE] Notified passenger ${passengerId} of status=${status} for ride ${bookingId}`);
        }
    } catch (err) {
        logger.error("[RIDE] Error calling socket server notify-passenger", err);
    }
};

/**
 * Realtime status push to a single driver (used when the passenger cancels an
 * already-assigned ride so the driver's ride card dismisses without waiting
 * for the periodic poll). Transport only — payload mirrors ride_status_update.
 */
export const notifyDriver = async ({
    driverId,
    bookingId,
    status,
}: {
    driverId: string;
    bookingId: string;
    status: string;
}) => {
    try {
        const res = await fetch(`${SOCKET_SERVER_URL}/api/v1/notification/notify-driver`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ driverId, bookingId, status }),
        });
        if (!res.ok) {
            logger.error("[RIDE] Failed to notify driver", await res.text());
        } else {
            logger.info(`[RIDE] Notified driver ${driverId} of status=${status} for ride ${bookingId}`);
        }
    } catch (err) {
        logger.error("[RIDE] Error calling socket server notify-driver", err);
    }
};