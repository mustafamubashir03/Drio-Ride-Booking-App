import { randomBytes } from "crypto";
import redisClient from "../lib/redis";

export const SOCKET_TICKET_TTL_SECONDS = 30;
export const SOCKET_TICKET_KEY_PREFIX = "socket-ticket:";

export type SocketTicketPurpose = "passenger" | "driver";

export type SocketTicketPayload = {
    userId: string;
    role: string;
    purpose: SocketTicketPurpose;
    expiry: number;
};

export const isSocketTicketPurpose = (value: unknown): value is SocketTicketPurpose =>
    value === "passenger" || value === "driver";

export const getSocketTicketKey = (ticket: string) =>
    `${SOCKET_TICKET_KEY_PREFIX}${ticket}`;

export const issueSocketTicket = async ({
    userId,
    role,
    purpose,
}: {
    userId: string;
    role: string;
    purpose: SocketTicketPurpose;
}) => {
    if (!userId || !role || !isSocketTicketPurpose(purpose)) {
        throw new Error("Invalid socket ticket claims");
    }

    const ticket = randomBytes(32).toString("hex");
    const expiry = Date.now() + SOCKET_TICKET_TTL_SECONDS * 1000;
    const payload: SocketTicketPayload = {
        userId,
        role,
        purpose,
        expiry,
    };

    await redisClient.set(getSocketTicketKey(ticket), JSON.stringify(payload), {
        EX: SOCKET_TICKET_TTL_SECONDS,
    });

    return { ticket, expiry };
};
