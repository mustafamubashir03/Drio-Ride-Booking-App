import nodemailer from "nodemailer";
import dotenv from "dotenv";
import logger from "../config/logger.config";

dotenv.config();

const mailId = (process.env.MAIL_ID || "").replace(/^"|"$/g, "").trim();
const mailPassword = (process.env.MAIL_PASSWORD || "").replace(/^"|"$/g, "").trim();

export const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: mailId,
        pass: mailPassword,
    },
});

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
        const mailError = error as {
            code?: string;
            command?: string;
            responseCode?: string | number;
        };
        logger.error("Email delivery failed", {
            code: mailError.code ?? "UNKNOWN",
            command: mailError.command ?? "UNKNOWN",
            responseCode: mailError.responseCode ?? "UNKNOWN",
        });
        throw error;
    }
}