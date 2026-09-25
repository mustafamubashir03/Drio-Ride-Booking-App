import logger from "../config/logger.config";
import { canJoinPassengerRoom, resolveSessionUser } from "./passenger-auth.service";
import {
    consumeSocketTicket,
    type SocketTicketPayload,
    type SocketTicketPurpose,
} from "./socket-ticket.service";

export type SocketIdentity = {
    id: string;
    role: string;
    purpose: SocketTicketPurpose;
};

const isProduction = () => process.env.NODE_ENV === "production";

const identityFromTicket = (payload: SocketTicketPayload): SocketIdentity => ({
    id: payload.userId,
    role: payload.role,
    purpose: payload.purpose,
});

const resolveTicketIdentity = async (
    ticket: unknown,
    purpose: SocketTicketPurpose
): Promise<SocketIdentity | null> => {
    if (typeof ticket !== "string" || ticket.length === 0) return null;

    try {
        const payload = await consumeSocketTicket(ticket, purpose);
        return payload ? identityFromTicket(payload) : null;
    } catch (error) {
        logger.error("[AUTH] Socket ticket consumption failed", error);
        return null;
    }
};

export const authenticatePassengerSocket = async ({
    ticket,
    cookie,
}: {
    ticket?: unknown;
    cookie?: string;
}): Promise<SocketIdentity | null> => {
    const ticketIdentity = await resolveTicketIdentity(ticket, "passenger");
    if (ticketIdentity) return ticketIdentity;
    if (isProduction()) return null;

    const user = await resolveSessionUser(cookie);
    if (!user || !canJoinPassengerRoom(user)) return null;
    return {
        id: user.id,
        role: user.role ?? "passenger",
        purpose: "passenger",
    };
};

export const authenticateDriverSocket = async ({
    ticket,
    driverId,
}: {
    ticket?: unknown;
    driverId?: unknown;
}): Promise<SocketIdentity | null> => {
    const ticketIdentity = await resolveTicketIdentity(ticket, "driver");
    if (ticketIdentity) return ticketIdentity;
    if (isProduction()) return null;

    if (typeof driverId !== "string" || driverId.trim().length === 0) return null;
    return {
        id: driverId,
        role: "driver",
        purpose: "driver",
    };
};
