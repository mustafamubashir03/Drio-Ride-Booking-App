/**
 * End-to-end dispatch harness — driver side.
 *
 * Acts as a REAL driver over a REAL Socket.IO connection:
 *   1. mints a socket ticket directly in Redis (same key/purpose the main API
 *      uses for `POST /api/v1/socket-tickets/driver`),
 *   2. connects to the socket-server and performs `driver-login` with it,
 *   3. emits a real `driver-location` event so GEO + freshness are written by
 *      the socket-server's own handler, not by a test shortcut,
 *   4. listens for `new_ride_notification` and records receipt in Redis.
 *
 * The dispatcher (`server/src/scripts/dispatch-pipeline.test.ts`) reads those
 * Redis flags to prove the event actually crossed the wire.
 */
import { io, type Socket } from "socket.io-client";
import { createClient, type RedisClientType } from "redis";

const REDIS_URI = process.env.REDIS_URI!;
const SOCKET_URL = process.env.E2E_SOCKET_URL!;
const DRIVER_ID = process.env.E2E_DRIVER_ID!;
const LAT = Number(process.env.E2E_LAT!);
const LNG = Number(process.env.E2E_LNG!);
const RUN_ID = process.env.E2E_RUN_ID!;

const flag = (name: string) => `e2e:${RUN_ID}:${name}`;

const redis: RedisClientType = createClient({ url: REDIS_URI });
redis.on("error", () => undefined);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
    await redis.connect();

    // 1. Mint the socket ticket exactly the way the main API does.
    const ticket = `e2eticket${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    await redis.set(
        `socket-ticket:${ticket}`,
        JSON.stringify({
            userId: DRIVER_ID,
            role: "driver",
            purpose: "driver",
            expiry: Date.now() + 60_000,
        }),
        { EX: 60 },
    );
    console.log(`[E2E-DRIVER] minted ticket=${ticket} driverId=${DRIVER_ID}`);

    // 2. Real Socket.IO connection.
    const socket: Socket = io(SOCKET_URL, {
        transports: ["websocket"],
        withCredentials: true,
        reconnection: false,
    });

    const received: unknown[] = [];

    socket.on("connect", () => {
        console.log(`[E2E-DRIVER] connected socketId=${socket.id}`);
        socket.emit("driver-login", { ticket, driverId: DRIVER_ID });
    });

    socket.on("login-success", async () => {
        console.log("[E2E-DRIVER] login-success");
        // 3. Real driver-location event → socket-server writes GEO + freshness.
        const emitLocation = () => {
            if (!socket.connected) return;
            socket.emit("driver-location", {
                latitude: LAT,
                longitude: LNG,
                accuracy: 5,
                heading: 0,
                speed: 0,
                timestamp: Date.now(),
            });
        };
        emitLocation();
        // Keep the 30s freshness TTL alive for the whole test.
        setInterval(emitLocation, 3_000);
        await sleep(1_200);

        const geoMembers = await redis.zRange("drivers", 0, -1);
        const inGeo = geoMembers.includes(DRIVER_ID);
        const ttl = await redis.ttl(`driver-location:${DRIVER_ID}`);
        const mapped = await redis.hGet("driver-socket", DRIVER_ID);

        console.log(
            `[E2E-DRIVER] registered inGeo=${inGeo} locTTL=${ttl} driverSocket=${mapped}`,
        );
        await redis.set(
            flag("driver-ready"),
            JSON.stringify({
                socketId: socket.id,
                driverId: DRIVER_ID,
                inGeo,
                locTTL: ttl,
                mappedSocketId: mapped,
            }),
            { EX: 120 },
        );
    });

    socket.on("login-fail", (data) => {
        console.log(`[E2E-DRIVER] login-fail ${JSON.stringify(data)}`);
        void redis.set(flag("driver-ready"), JSON.stringify({ error: data }), { EX: 120 });
    });

    // 4. The real payload shape the driver UI consumes.
    socket.on("new_ride_notification", (data: unknown) => {
        received.push(data);
        console.log(`[E2E-DRIVER] *** RECEIVED new_ride_notification *** ${JSON.stringify(data)}`);
        void redis.set(flag("notified"), JSON.stringify(data), { EX: 120 });
    });

    // Hold the connection open until the dispatcher finishes.
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
        if (await redis.get(flag("done"))) break;
        await sleep(500);
    }
    console.log(`[E2E-DRIVER] shutting down, received=${received.length}`);
    socket.close();
    await redis.quit();
    process.exit(0);
}

main().catch((err) => {
    console.error("[E2E-DRIVER] fatal", err);
    process.exit(1);
});