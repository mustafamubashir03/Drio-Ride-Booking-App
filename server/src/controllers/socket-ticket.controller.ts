import type { NextFunction, Request, Response } from "express";
import {
    issueSocketTicket,
    SOCKET_TICKET_TTL_SECONDS,
    type SocketTicketPurpose,
} from "../services/socket-ticket.service";
import { UnauthorizedError } from "../utils/errors/app.error";

const createTicketController = (purpose: SocketTicketPurpose) =>
    async (req: Request, res: Response, next: NextFunction) => {
        const user = req.authUser;
        if (!user?.id || !user.role) {
            next(new UnauthorizedError("Authentication required"));
            return;
        }

        try {
            const { ticket, expiry } = await issueSocketTicket({
                userId: user.id,
                role: user.role,
                purpose,
            });
            res.setHeader("Cache-Control", "no-store");
            res.status(200).json({
                success: true,
                ticket,
                expiry,
                expiresIn: SOCKET_TICKET_TTL_SECONDS,
            });
        } catch (error) {
            next(error);
        }
    };

export const createPassengerSocketTicketController = createTicketController("passenger");
export const createDriverSocketTicketController = createTicketController("driver");
