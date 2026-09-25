import redisClient from "../lib/redis";
import logger from "../config/logger.config";

export const SOCKET_TICKET_KEY_PREFIX = "socket-ticket:";

export type SocketTicketPurpose = "passenger" | "driver";

export type SocketTicketPayload = {
    userId: string;
    role: string;
    purpose: SocketTicketPurpose;
    expiry: number;
};

const ticketPattern = /^[A-Za-z0-9_-]{1,256}$/;

const isTicketPayload = (
    value: unknown,
    expectedPurpose: SocketTicketPurpose
): value is SocketTicketPayload => {
    if (!value || typeof value !== "object") return false;

    const payload = value as Record<string, unknown>;
    if (typeof payload.userId !== "string" || payload.userId.trim().length === 0) {
        return false;
    }
    if (typeof payload.role !== "string" || payload.role.trim().length === 0) {
        return false;
    }
    if (payload.purpose !== expectedPurpose) return false;
    if (
        expectedPurpose === "passenger" &&
        payload.role !== "passenger" &&
        payload.role !== "admin"
    ) {
        return false;
    }
    return (
        typeof payload.expiry === "number" &&
        Number.isFinite(payload.expiry) &&
        payload.expiry > Date.now()
    );
};

export const consumeSocketTicket = async (
    ticket: unknown,
    expectedPurpose: SocketTicketPurpose
): Promise<SocketTicketPayload | null> => {
    if (typeof ticket !== "string" || !ticketPattern.test(ticket)) return null;

    const key = `${SOCKET_TICKET_KEY_PREFIX}${ticket}`;
    const raw = await redisClient.getDel(key);
    if (!raw) return null;

    let payload: unknown;
    try {
        payload = JSON.parse(raw);
    } catch (error) {
        logger.warn("[AUTH] Invalid socket ticket payload");
        return null;
    }

    return isTicketPayload(payload, expectedPurpose) ? payload : null;
};
