import { NextFunction, Request, Response } from "express";
import logger from "../config/logger.config";

const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;

let logged = false;

const looksLikeIp = (value: string) => IPV4_PATTERN.test(value) || value.includes(":");

/**
 * Better Auth keys its rate-limit buckets on the client IP it can resolve from
 * `x-forwarded-for`. Behind Render (Cloudflare + Render proxy + the frontend
 * `/api/*` rewrite) that header carries several hops, so the address cannot be
 * resolved and every user shares one bucket. Log the shape of the chain once
 * per process so the exact trusted proxy hops can be configured — the client
 * entry itself is never logged, only whether it parses as an IP.
 */
export function logForwardedClientIpMiddleware(req: Request, _res: Response, next: NextFunction) {
    if (!logged && req.path.startsWith("/api/auth")) {
        logged = true;
        const raw = req.headers["x-forwarded-for"];
        const tokens = (Array.isArray(raw) ? raw.join(",") : raw ?? "")
            .split(",")
            .map((token) => token.trim())
            .filter(Boolean);

        logger.info("Forwarded client IP diagnostics", {
            path: req.path,
            xForwardedForTokens: tokens.length,
            // Right-most entries are proxy hops, never the end user.
            proxyHops: tokens.slice(-2),
            clientEntryLooksLikeIp: tokens.length > 0 ? looksLikeIp(tokens[0]) : false,
            xRealIpPresent: Boolean(req.headers["x-real-ip"]),
            cfConnectingIpPresent: Boolean(req.headers["cf-connecting-ip"]),
        });
    }
    next();
}
