/**
 * End-to-end dispatch harness — orchestrator/assertor.
 *
 * Proves the FULL dispatch pipeline against real Redis + a real socket-server
 * process + a real Socket.IO driver client:
 *
 *   GEORADIUS -> driver ids -> HTTP bridge -> socket-server -> getDriverSocket
 *   -> Socket.IO emit -> driver client listener
 *
 * Nothing here is stubbed except the booking identity, which is a plain object
 * because the search stage machine only reads source/passenger/driver off it.
 */
/**
 * Guarded: this suite deletes and rewrites Redis/Mongo data, so it must never
 * run against a shared or production datastore. Must be the FIRST import.
 */
import "./require-isolated-stores";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import "../config/index";
import mongoose from "mongoose";
import { Types } from "mongoose";
import redisClient, { connectRedis, disconnectRedis } from "../lib/redis";
import Booking from "../models/booking.model";
import "../models/user.model";
import {
    collectEligibleDriverIds,
    kickoffDriverSearch,
    runDriverSearchCycle,
} from "../services/driver-search.service";
import {
    getSearchStageService,
    setSearchStageService,
    setRidePassengerService,
} from "../services/location.service";
import { SEARCH_RADII_KM } from "../config/search.config";

const ROOT = path.resolve(__dirname, "../../..");
const SOCKET_SERVER_DIR = path.join(ROOT, "socket-server");
const TS_NODE_BIN = path.join(SOCKET_SERVER_DIR, "node_modules", "ts-node", "dist", "bin.js");

const E2E_PORT = Number(process.env.E2E_PORT || 5099);
const E2E_SOCKET_URL = `http://127.0.0.1:${E2E_PORT}`;
const RUN_ID = `run${Date.now()}`;
const REDIS_URI = process.env.REDIS_URI!;

// Pickup: Karachi. Offsets below are degrees of latitude, which is ~111.32 km
// per degree, so each scenario lands on a known real distance.
const PICKUP = { latitude: 24.8607, longitude: 67.0011 };
const KM_PER_DEG_LAT = 111.32;

const flag = (name: string) => `e2e:${RUN_ID}:${name}`;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, label: string) {
    if (cond) {
        passed++;
        console.log(`  PASS ${label}`);
    } else {
        failed++;
        failures.push(label);
        console.error(`  FAIL ${label}`);
    }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(key: string, timeoutMs: number): Promise<T | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const raw = await redisClient.get(key);
        if (raw) return JSON.parse(raw) as T;
        await sleep(300);
    }
    return null;
}

const children: ChildProcess[] = [];

function startSocketServer() {
    const child = spawn(
        process.execPath,
        [TS_NODE_BIN, "src/server.ts"],
        {
            cwd: SOCKET_SERVER_DIR,
            env: {
                ...process.env,
                PORT: String(E2E_PORT),
                NODE_ENV: "development",
                REDIS_URI,
                MAIN_API_URL: "http://127.0.0.1:3000",
                TRUSTED_ORIGINS: "http://localhost:5173",
                TS_NODE_TRANSPILE_ONLY: "true",
            },
            stdio: ["ignore", "pipe", "pipe"],
        },
    );
    child.stdout?.on("data", (d: Buffer) => {
        const s = d.toString().trimEnd();
        if (process.env.E2E_VERBOSE) console.log(`[socket-server] ${s}`);
        else if (/NOTIFICATION|SOCKET\]|Error|error/.test(s)) console.log(`[socket-server] ${s}`);
    });
    child.stderr?.on("data", (d: Buffer) => {
        if (process.env.E2E_VERBOSE) console.log(`[socket-server:err] ${d.toString().trimEnd()}`);
    });
    children.push(child);
    return child;
}

function startDriverClient(driverId: string, lat: number, lng: number) {
    const child = spawn(process.execPath, [TS_NODE_BIN, "src/scripts/e2e-driver.ts"], {
        cwd: SOCKET_SERVER_DIR,
        env: {
            ...process.env,
            REDIS_URI,
            E2E_SOCKET_URL,
            E2E_DRIVER_ID: driverId,
            E2E_LAT: String(lat),
            E2E_LNG: String(lng),
            E2E_RUN_ID: RUN_ID,
            TS_NODE_TRANSPILE_ONLY: "true",
        },
        stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (d: Buffer) => console.log(`[driver] ${d.toString().trimEnd()}`));
    child.stderr?.on("data", (d: Buffer) => {
        if (process.env.E2E_VERBOSE) console.log(`[driver:err] ${d.toString().trimEnd()}`);
    });
    children.push(child);
    return child;
}

function cleanup() {
    for (const c of children) {
        try { c.kill(); } catch { /* already gone */ }
    }
}

type DriverReady = {
    socketId?: string;
    driverId?: string;
    inGeo?: boolean;
    locTTL?: number;
    mappedSocketId?: string | null;
    error?: unknown;
};

const rideInfo = {
    pickup: "Pickup",
    destination: "Drop",
    fare: 250,
    distance: 3.2,
    passengerName: "E2E Passenger",
};

/** Real pending booking aged `secondsElapsed`, so the real sweeper drives it. */
async function createAgedBooking(secondsElapsed: number): Promise<string> {
    const agedId = Types.ObjectId.createFromTime(
        Math.floor((Date.now() - secondsElapsed * 1000) / 1000),
    );
    const passengerId = await realPassengerId();
    await Booking.create({
        _id: agedId,
        passenger: new Types.ObjectId(passengerId),
        source: { name: "Pickup", displayName: "Pickup", ...PICKUP },
        destination: { name: "Drop", displayName: "Drop", latitude: 24.8707, longitude: 67.0111 },
        fare: 250,
        distance: 3.2,
        status: "pending",
        driver: null,
    });
    const id = String(agedId);
    await setSearchStageService(id, 0);
    await setRidePassengerService(id, passengerId);
    return id;
}

let cachedPassengerId: string | null = null;
async function realPassengerId(): Promise<string> {
    if (cachedPassengerId) return cachedPassengerId;
    const doc = (await mongoose.connection.db!
        .collection("user")
        .findOne({ role: "passenger" })) as { _id: unknown } | null;
    cachedPassengerId = String(doc?._id);
    return cachedPassengerId;
}

/**
 * One real end-to-end dispatch.
 *
 * `expectKickoff` scenarios use the synchronous stage-0 path (what runs the
 * instant a passenger taps Book). The rest age the booking and drive the real
 * sweeper, which is how a driver beyond 5 km is actually reached.
 */
async function scenario(
    label: string,
    offsetKm: number,
    radiiKm: number[],
    expectKickoff: boolean,
    sweepAtSeconds = 11,
): Promise<void> {
    console.log(`\n─── ${label} (driver ~${offsetKm} km away) ───`);
    const driverId = `e2e-drv-${RUN_ID}-${radiiKm.join("x")}-${offsetKm}`;
    const lat = PICKUP.latitude + offsetKm / KM_PER_DEG_LAT;
    const lng = PICKUP.longitude;

    // Each scenario must start from a clean slate: a previous scenario's
    // notification flag would otherwise be mistaken for this one's receipt.
    await redisClient.del([flag("notified"), flag("driver-ready")]);

    const driverProcess = startDriverClient(driverId, lat, lng);
    const ready = await waitFor<DriverReady>(flag("driver-ready"), 30_000);

    assert(ready !== null, `${label}: driver reached login-success`);
    if (!ready) return;
    assert(!ready.error, `${label}: driver-login was not rejected`);
    assert(ready.inGeo === true, `${label}: driver written to Redis GEO 'drivers'`);
    assert(
        typeof ready.locTTL === "number" && ready.locTTL > 0,
        `${label}: driver-location freshness key alive (ttl=${ready.locTTL})`,
    );
    assert(
        Boolean(ready.mappedSocketId),
        `${label}: driver-socket hash maps driverId -> socketId`,
    );

    // Radius visibility, exactly as the sweeper would query.
    for (const radiusKm of radiiKm) {
        const ids = await collectEligibleDriverIds({ bookingId: `probe-${driverId}-${radiusKm}`, longitude: PICKUP.longitude, latitude: PICKUP.latitude, radiusKm });
        const seen = ids.includes(driverId);
        console.log(`   radius=${radiusKm}km -> ${ids.length} eligible, driverVisible=${seen}`);
        assert(seen, `${label}: driver is eligible at radius=${radiusKm}km`);
    }

    let bookingId: string;
    if (expectKickoff) {
        bookingId = `e2e-bk-${RUN_ID}-${offsetKm}`;
        const notified = await kickoffDriverSearch({
            bookingId,
            longitude: PICKUP.longitude,
            latitude: PICKUP.latitude,
            rideInfo,
        });
        console.log(`   kickoff notified=${notified} expected=${driverId}`);
    } else {
        // Stage 0 (5 km) must NOT reach a driver this far out, then a real
        // sweep at the point where the ladder has widened must reach them.
        const aged = await createAgedBooking(sweepAtSeconds);
        bookingId = aged;
        await runDriverSearchCycle();
        const stage = await getSearchStageService(bookingId);
        console.log(`   sweep advanced to stage=${stage} (radius ${SEARCH_RADII_KM[stage] ?? "?"}km)`);
        assert(stage >= 1, `${label}: ladder advanced past stage 0 (stage=${stage})`);
    }

    const payload = await waitFor<{ rideId: string; rideInfo: { pickup: string; fare: number } }>(
        flag("notified"),
        15_000,
    );

    assert(
        payload !== null && payload.rideId === bookingId,
        `${label}: DRIVER CLIENT received new_ride_notification for booking`,
    );
    if (payload) {
        assert(
            payload.rideInfo?.pickup === "Pickup" && payload.rideInfo?.fare === 250,
            `${label}: payload shape matches the driver UI expectation`,
        );
    }

await redisClient.del(`driver-location:${driverId}`);
    await redisClient.zRem("drivers", driverId);
    await redisClient.hDel("driver-socket", driverId);
    // The sweeper scans EVERY pending booking, so a booking left behind here
    // would be advanced by the next scenario and emit into the wrong assertion.
    if (Types.ObjectId.isValid(bookingId)) {
        await Booking.deleteOne({ _id: new Types.ObjectId(bookingId) });
        await redisClient.del([
            `search-stage:${bookingId}`,
            `ride-passenger:${bookingId}`,
            `notifiedDrivers:${bookingId}`,
        ]);
    }
    try { driverProcess.kill(); } catch { /* already exited */ }
    await sleep(500);
}

async function main() {
    console.log(`[E2E] run=${RUN_ID} socketServer=${E2E_SOCKET_URL}`);
    await connectRedis();
    await mongoose.connect(process.env.MONGO_URI!, { serverSelectionTimeoutMS: 15000 });
    await redisClient.del([flag("driver-ready"), flag("notified"), flag("done")]);

    startSocketServer();
    // Wait for the socket-server to bind.
    let up = false;
    for (let i = 0; i < 60; i++) {
        try {
            const res = await fetch(`${E2E_SOCKET_URL}/api/v1/notification/notify-drivers`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rideId: "probe", driverIds: [], rideInfo }),
            });
            if (res.ok) { up = true; break; }
        } catch { /* not up yet */ }
        await sleep(500);
    }
    assert(up, "socket-server process is listening and serving the bridge endpoint");
    if (!up) { cleanup(); await disconnectRedis(); process.exit(1); }

await scenario("A driver inside initial radius", 3, [5], true);
    await scenario("B driver outside 5km, reached at the 15km stage", 8.5, [15], false, 11);
    await scenario("C driver around 25km, reached at the 25km stage", 25, [25, 45], false, 21);

    // Control: a driver further out must NOT be eligible at a small radius.
    console.log(`\n─── D control: 50km driver must be invisible at 5/10/20/30km ───`);
    const farId = `e2e-drv-far-${RUN_ID}`;
    const farLat = PICKUP.latitude + 49 / KM_PER_DEG_LAT;
    await redisClient.sendCommand(["GEOADD", "drivers", String(PICKUP.longitude), String(farLat), farId]);
    await redisClient.set(`driver-location:${farId}`, JSON.stringify({ latitude: farLat, longitude: PICKUP.longitude, updatedAt: Date.now() }), { EX: 60 });
    for (const r of [5, 10, 20, 30, 40]) {
        const ids = await collectEligibleDriverIds({ bookingId: `probe-far-${r}`, longitude: PICKUP.longitude, latitude: PICKUP.latitude, radiusKm: r });
        assert(!ids.includes(farId), `far driver (49km) NOT eligible at radius=${r}km`);
    }
    const ids50 = await collectEligibleDriverIds({ bookingId: "probe-far-50", longitude: PICKUP.longitude, latitude: PICKUP.latitude, radiusKm: 50 });
    assert(ids50.includes(farId), "far driver (49km) IS eligible at radius=50km");
    await redisClient.del(`driver-location:${farId}`);
    await redisClient.zRem("drivers", farId);

    // Control: a driver with no socket must be reported as NOT notified.
    console.log(`\n─── K driver with no socket ───`);
    const noSock = `e2e-drv-nosock-${RUN_ID}`;
    await redisClient.sendCommand(["GEOADD", "drivers", String(PICKUP.longitude), String(PICKUP.latitude + 0.01), noSock]);
    await redisClient.set(`driver-location:${noSock}`, JSON.stringify({ updatedAt: Date.now() }), { EX: 60 });
    const notifiedNoSock = await kickoffDriverSearch({
        bookingId: `e2e-bk-nosock-${RUN_ID}`,
        longitude: PICKUP.longitude,
        latitude: PICKUP.latitude,
        rideInfo,
    });
    assert(notifiedNoSock === 0, "driver present in GEO but with no socket yields notified=0");
    await redisClient.del(`driver-location:${noSock}`);
    await redisClient.zRem("drivers", noSock);

    await redisClient.set(flag("done"), "1", { EX: 30 });
    await sleep(800);
    await redisClient.del([flag("driver-ready"), flag("notified"), flag("done")]);

    console.log(`\n=========== ${passed} passed, ${failed} failed ===========`);
    if (failures.length) console.log("Failures:\n  - " + failures.join("\n  - "));
    cleanup();
    await disconnectRedis();
    process.exit(failed === 0 ? 0 : 1);
}

process.on("SIGINT", () => { cleanup(); process.exit(130); });
main().catch(async (e) => {
    console.error("[E2E] fatal", e);
    cleanup();
    try { await disconnectRedis(); } catch { /* ignore */ }
    process.exit(1);
});