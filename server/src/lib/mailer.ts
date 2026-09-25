import { Resend } from "resend";
import dotenv from "dotenv";
import logger from "../config/logger.config";

dotenv.config();

const resendApiKey = (process.env.RESEND_API_KEY || "").replace(/^"|"$/g, "").trim();
const configuredFromEmail = (process.env.RESEND_FROM_EMAIL || "").replace(/^"|"$/g, "").trim();
// Resend's test sender. It authenticates and delivers over HTTPS with no domain
// setup, and Resend only lets it deliver to the account owner's own address.
// Replace it with a verified domain sender via RESEND_FROM_EMAIL for real users.
const RESEND_TEST_SENDER = "onboarding@resend.dev";
const fromEmail = configuredFromEmail || RESEND_TEST_SENDER;
const from = `Drio <${fromEmail}>`;

const resend = new Resend(resendApiKey);

// Shape only: never the API key, a token or a header value.
logger.info("Email transport configured", {
    provider: "resend",
    from: fromEmail,
    usingResendTestSender: fromEmail === RESEND_TEST_SENDER,
    apiKeyPresent: resendApiKey.length > 0,
});

const describeSendFailure = (error: unknown) => {
    const failure = (error ?? {}) as { name?: string; message?: string };
    const message = typeof failure.message === "string" ? failure.message.slice(0, 300) : undefined;
    return {
        stage: "request",
        name: failure.name ?? "UNKNOWN",
        provider: "resend",
        // The key is only sent in an Authorization header, but redact defensively.
        message: message && resendApiKey ? message.split(resendApiKey).join("[redacted]") : message,
    };
};

export async function sendMail(opts: { to: string; subject: string; html: string; text?: string }) {
    let apiFailure: ReturnType<typeof describeSendFailure> | null = null;
    try {
        const { data, error } = await resend.emails.send({
            from,
            to: opts.to,
            subject: opts.subject,
            html: opts.html,
            text: opts.text,
        });

        if (error) {
            apiFailure = {
                stage: "api-response",
                name: error.name,
                provider: "resend",
                message: error.message,
            };
            throw new Error(error.message);
        }

        return data;
    } catch (error) {
        logger.error("Email delivery failed", apiFailure ?? describeSendFailure(error));
        throw error;
    }
}
