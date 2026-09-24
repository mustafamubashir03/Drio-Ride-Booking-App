import { serverConfig } from "../config";
import logger from "../config/logger.config";

type SessionUser = {
    id: string;
    name?: string;
    email?: string;
    role?: string;
};

/**
 * Validates a passenger socket against the main API's session (better-auth)
 * by forwarding the browser's session cookie. The socket-server never touches
 * Mongo or the DB; identity resolution happens over this HTTP bridge.
 */
export const resolveSessionUser = async (cookie: string | undefined): Promise<SessionUser | null> => {
    if (!cookie) {
        logger.warn("[AUTH] passenger-login without a session cookie");
        return null;
    }
    try {
        const res = await fetch(`${serverConfig.MAIN_API_URL}/api/v1/auth/me`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                Cookie: cookie,
            },
        });
        if (!res.ok) {
            logger.warn(`[AUTH] session bridge rejected: status=${res.status}`);
            return null;
        }
        const data = (await res.json()) as { success?: boolean; user?: SessionUser };
        if (!data.success || !data.user?.id) {
            logger.warn("[AUTH] session bridge returned no user");
            return null;
        }
        return data.user;
    }
    catch (error) {
        logger.error("[AUTH] Error calling session bridge", error);
        return null;
    }
};

export const canJoinPassengerRoom = (user: SessionUser | null) =>
    !!user && (user.role === "passenger" || user.role === "admin");