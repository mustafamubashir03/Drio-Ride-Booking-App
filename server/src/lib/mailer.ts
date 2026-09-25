import nodemailer from "nodemailer";
import dotenv from "dotenv";
import logger from "../config/logger.config";

dotenv.config();

const mailId = (process.env.MAIL_ID || "").replace(/^"|"$/g, "").trim();
const mailPassword = (process.env.MAIL_PASSWORD || "").replace(/^"|"$/g, "").trim();

// Gmail submission (implicit TLS on 465) — the exact settings Nodemailer's
// `service: "gmail"` shorthand resolved to, spelled out so the effective
// host/port/secure values are visible in code and in the startup log.
const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 465;
const SMTP_SECURE = true;
// Nodemailer defaults are 2 min / 30 s / 10 min, which turns an unreachable
// port into a 2 minute hang. Fail fast instead so the log states the stage.
const SMTP_CONNECTION_TIMEOUT_MS = 10_000;
const SMTP_GREETING_TIMEOUT_MS = 10_000;
const SMTP_SOCKET_TIMEOUT_MS = 20_000;

export const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    requireTLS: true,
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    auth: {
        user: mailId,
        pass: mailPassword,
    },
});

type SmtpFailure = {
    code?: string;
    command?: string;
    responseCode?: string | number;
    message?: string;
};

const CONNECT_ERROR_CODES = new Set([
    "ECONNREFUSED",
    "ECONNRESET",
    "EHOSTUNREACH",
    "EAI_AGAIN",
    "ENETUNREACH",
    "ENOTFOUND",
    "EPIPE",
    "ESOCKET",
    "ETIMEDOUT",
]);

const AUTH_RESPONSE_CODES = new Set([530, 534, 535, "530", "534", "535"]);

/**
 * Groups an Nodemailer failure into the phase it happened in, so a TCP
 * connect timeout is never mistaken for a TLS, credential or Gmail rejection
 * problem. Nothing secret is read here — only codes, the SMTP command and the
 * server response code.
 */
const smtpFailureStage = (failure: SmtpFailure): string => {
    if (failure.command === "CONN" || (failure.code && CONNECT_ERROR_CODES.has(failure.code))) return "connect";
    if (failure.command === "STARTTLS" || failure.code === "EPROTO") return "tls";
    if (failure.command === "AUTH" || failure.command === "LOGIN" || failure.command === "AUTH PLAIN") return "auth";
    if (failure.responseCode !== undefined && AUTH_RESPONSE_CODES.has(failure.responseCode)) return "auth";
    if (failure.responseCode !== undefined) return "smtp-response";
    return "unknown";
};

const smtpFailureDetails = (error: unknown) => {
    const failure = (error ?? {}) as SmtpFailure;
    const message = typeof failure.message === "string" ? failure.message.slice(0, 300) : undefined;
    return {
        stage: smtpFailureStage(failure),
        code: failure.code ?? "UNKNOWN",
        command: failure.command ?? "UNKNOWN",
        responseCode: failure.responseCode ?? "UNKNOWN",
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        // Nodemailer never puts the password in the message, but redact
        // defensively before anything reaches the logs.
        message: message && mailPassword ? message.split(mailPassword).join("[redacted]") : message,
    };
};

// Shape only: no password, no token, no header value.
logger.info("SMTP transporter configured", {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    requireTLS: true,
    connectionTimeoutMs: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeoutMs: SMTP_GREETING_TIMEOUT_MS,
    socketTimeoutMs: SMTP_SOCKET_TIMEOUT_MS,
    userPresent: mailId.length > 0,
    passwordPresent: mailPassword.length > 0,
});

/**
 * Opens an SMTP connection and authenticates without sending a message.
 * Not called during startup — run it manually to tell a blocked port apart
 * from rejected credentials.
 */
export async function verifySmtpConnection() {
    try {
        await transporter.verify();
        logger.info("SMTP connection verified", {
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_SECURE,
            userPresent: mailId.length > 0,
            passwordPresent: mailPassword.length > 0,
        });
        return true;
    } catch (error) {
        logger.error("SMTP connection verification failed", smtpFailureDetails(error));
        return false;
    }
}

export async function sendMail(opts: { to: string; subject: string; html: string; text?: string }) {
    try {
        return await transporter.sendMail({
            from: `Drio <${mailId}>`,
            to: opts.to,
            subject: opts.subject,
            html: opts.html,
            text: opts.text,
        });
    } catch (error) {
        logger.error("Email delivery failed", smtpFailureDetails(error));
        throw error;
    }
}
