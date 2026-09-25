import winston from "winston";
import { getCorrelationId } from "../utils/helpers/request.helpers";
import DailyRotateFile from "winston-daily-rotate-file";

// Vercel functions run on a read-only filesystem, so the rotating file
// transport can never create logs/ and its failure surfaces as an unhandled
// 'error' event that kills the instance. Render never sets VERCEL, so its
// on-disk logging is untouched.
const isVercelFunction = Boolean(process.env.VERCEL);

const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.timestamp({ format: "MM-DD-YYYY HH:mm:ss"  }),
        winston.format.json(),
        winston.format.printf( ({  level, message, timestamp, ...data }) => {
            const output = { 
                level,
                message, 
                timestamp, 
                correlationId: getCorrelationId(), 
                data 
            };
            return JSON.stringify(output);
        })
    ),
    transports: [
        new winston.transports.Console(),
        ...(isVercelFunction
            ? []
            : [new DailyRotateFile({
                filename: "logs/%DATE%-app.log",
                datePattern: "YYYY-MM-DD",
                maxSize: "20m",
                maxFiles: "14d",
            })]
        )
        // TODO: add logic to integrate and save logs in mongo
    ]
});

export default logger;