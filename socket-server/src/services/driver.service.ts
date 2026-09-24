import logger from "../config/logger.config";
import redisClient from "../lib/redis";
import fs from "fs";

const DRIVER_SOCKET_KEY = "driver-socket";
const LOG_FILE = "G:/Drio/socket-server/driver-socket.log";

function logToFile(message: string) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
}

export const setDriverSocket = async (driverId: string, socketId: string) => {
    try {
        const message = `[DriverService] Setting driver socket: driverId=${driverId}, socketId=${socketId}`;
        console.log(message);
        logToFile(message);
        
        const result = await redisClient.hSet(DRIVER_SOCKET_KEY, driverId, socketId);
        const resultMsg = `[DriverService] hSet result: ${result}`;
        console.log(resultMsg);
        logToFile(resultMsg);
    }
    catch (error) {
        const errorMsg = `[DriverService] Failed to set driver socket: ${error}`;
        console.error(errorMsg);
        logToFile(errorMsg);
        logger.error("Failed to set driver socket", error);
        return;
    }
}


export const getDriverSocket = async (driverId: string) => {
    try {
        const socketId = await redisClient.hGet(DRIVER_SOCKET_KEY, driverId);
        if (!socketId) {
            return null;
        }
        return socketId;
    }
    catch (error) {
        logger.error("Failed to get driver socket", error);
        return null;
    }
}


export const removeDriverSocket = async (driverId: string) => {
    try {
        await redisClient.hDel(DRIVER_SOCKET_KEY, driverId);
    }
    catch (error) {
        logger.error("Failed to remove driver socket", error);
        return;
    }
}

export const removeDriverBySocket = async (socketId: string) => {
    try {
        // Need to find the driverId by socketId first
        const allMappings = await redisClient.hGetAll(DRIVER_SOCKET_KEY);
        for (const [driverId, storedSocketId] of Object.entries(allMappings)) {
            if (storedSocketId === socketId) {
                await redisClient.hDel(DRIVER_SOCKET_KEY, driverId);
                break;
            }
        }
    }
    catch (error) {
        logger.error("Failed to remove driver by socket", error);
        return;
    }
}
