import logger from "../config/logger.config";
import redisClient from "../lib/redis";

const DRIVER_SOCKET_KEY = "driver-socket";

/**
 * Compare-and-delete, executed atomically inside Redis.
 *
 * `removeDriverBySocket` used to HGETALL, scan in Node, then HDEL. That is a
 * time-of-check/time-of-use gap: between the read and the delete another
 * socket for the SAME driver can register and overwrite the field, and the
 * unconditional HDEL then removes the NEWER mapping. The symptom is exactly
 * "the driver was notified but getDriverSocket() returns nothing"
 * (mappedSocketId=none) even though the driver's socket is alive and
 * registered - the driver has to reconnect before dispatch works again.
 *
 * Doing the comparison inside Redis removes the gap: the field is only deleted
 * if it still points at the socket that is disconnecting.
 */
const DELETE_IF_OWNER_SCRIPT = `
local current = redis.call('HGET', KEYS[1], ARGV[1])
if current == ARGV[2] then
  return redis.call('HDEL', KEYS[1], ARGV[1])
end
return 0
`;

export const setDriverSocket = async (driverId: string, socketId: string) => {
    try {
        logger.info(`[DriverService] setting driver socket driverId=${driverId} socketId=${socketId}`);
        const result = await redisClient.hSet(DRIVER_SOCKET_KEY, driverId, socketId);
        const verified = await getDriverSocket(driverId);
        logger.info(
            `[DriverService] driver socket stored driverId=${driverId} socketId=${socketId} verified=${verified} hSet=${result}`,
        );
    }
    catch (error) {
        logger.error(`[DriverService] failed to set driver socket driverId=${driverId} socketId=${socketId}`, error);
    }
}


export const getDriverSocket = async (driverId: string) => {
    try {
        const socketId = await redisClient.hGet(DRIVER_SOCKET_KEY, driverId);
        if (!socketId) {
            logger.warn(`[DriverService] no socket registered for driverId=${driverId}`);
            return null;
        }
        return socketId;
    }
    catch (error) {
        logger.error(`[DriverService] failed to get driver socket driverId=${driverId}`, error);
        return null;
    }
}


export const removeDriverSocket = async (driverId: string) => {
    try {
        await redisClient.hDel(DRIVER_SOCKET_KEY, driverId);
    }
    catch (error) {
        logger.error(`[DriverService] failed to remove driver socket driverId=${driverId}`, error);
    }
}

/**
 * Drop a driver's mapping ONLY if it still points at `socketId`.
 * Safe against a newer socket having registered in the meantime.
 * Returns true when a mapping was actually removed.
 */
export const removeDriverSocketIfOwnedBy = async (driverId: string, socketId: string): Promise<boolean> => {
    try {
        const removed = await redisClient.eval(DELETE_IF_OWNER_SCRIPT, {
            keys: [DRIVER_SOCKET_KEY],
            arguments: [driverId, socketId],
        });
        return Number(removed) === 1;
    }
    catch (error) {
        logger.error(`[DriverService] failed to conditionally remove driver socket driverId=${driverId} socketId=${socketId}`, error);
        return false;
    }
}

export const removeDriverBySocket = async (socketId: string) => {
    try {
        // Read to find the candidate owner, then delete atomically. The read is
        // only a hint: correctness comes from the compare-and-delete.
        const allMappings = await redisClient.hGetAll(DRIVER_SOCKET_KEY);
        for (const driverId of Object.keys(allMappings)) {
            if (await removeDriverSocketIfOwnedBy(driverId, socketId)) {
                logger.info(`[DriverService] cleared driver socket driverId=${driverId} socketId=${socketId}`);
            }
        }
    }
    catch (error) {
        logger.error(`[DriverService] failed to remove driver by socketId=${socketId}`, error);
    }
}