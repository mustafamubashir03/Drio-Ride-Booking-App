/**
 * Focused proof: does a socketless (but otherwise eligible) driver block
 * progressive radius expansion?
 *
 * Hypothesis under test, from driver-search.service.ts advanceStage():
 *   if (notifiedDriverIds.length < driverIds.length) return false;
 * and runDriverSearchCycle():
 *   if (!didAdvance) break;
 *
 * => a single eligible-but-not-notifiable candidate permanently stalls the
 *    radius ladder at that stage, even though larger radii are available.
 *
 * Run with SOCKET_SERVER_URL pointing at the local socket-server harness.
 */
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { Types } from "mongoose";
import "../config/index";
import mongoose from "mongoose";
import redisClient, { connectRedis, disconnectRedis } from "../lib/redis";
import Booking from "../models/booking.model";
import "../models/user.model";
import { runDriverSearchCycle } from "../services/driver-search.service";
import { cancelPassengerRideService } from "../services/passenger-ride.service";
import { acceptDriverRideService } from "../services/driver-ride.service";
import {
    addDriverLocationToRedisService,
    getSearchStageService,
    setSearchStageService,
    setRidePassengerService,
} from "../services/location.service";

const ROOT = path.resolve(__dirname, "../../..");
const SOCKET_SERVER_DIR = path.join(ROOT, "socket-server");
const TS_NODE_BIN = path.join(SOCKET_SERVER_DIR, "node_modules", "ts-node", "dist", "bin.js");
const E2E_PORT = Number(process.env.E2E_PORT || 5099);
const E2E_SOCKET_URL = `http://127.0.0.1:${E2E_PORT}`;
const REDIS_URI = process.env.REDIS_URI!;
const RUN_ID = `stall${Date.now()}`;

const PICKUP = { latitude: 24.8607, longitude: 67.0011 };
const KM_PER_DEG_LAT = 111.32;

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
const children: ChildProcess[] = [];
function cleanup() { for (const c of children) { try { c.kill(); } catch { /* gone */ } } }

/** One real driver over a real socket, so `driver-socket` is genuinely mapped. */
function startConnectedDriver(driverId: string, km: number) {
    const child = spawn(process.execPath, [TS_NODE_BIN, "src/scripts/e2e-driver.ts"], {
        cwd: SOCKET_SERVER_DIR,
        env: {
            ...process.env,
            REDIS_URI,
            E2E_SOCKET_URL,
            E2E_DRIVER_ID: driverId,
            E2E_LAT: String(PICKUP.latitude + km / KM_PER_DEG_LAT),
            E2E_LNG: String(PICKUP.longitude),
            E2E_RUN_ID: RUN_ID,
            TS_NODE_TRANSPILE_ONLY: "true",
        },
        stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (d: Buffer) => console.log(`[driver] ${d.toString().trimEnd()}`));
    children.push(child);
    return child;
}

async function waitFlag(key: string, ms: number) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
        const v = await redisClient.get(key);
        if (v) return JSON.parse(v);
        await sleep(300);
    }
    return null;
}

/**
 * Creates a real pending booking aged `secondsAgo` so the sweeper's elapsed-time
 * math puts it deep into the ladder, then runs one real sweep cycle.
 */
async function sweepForStage(target: number, passengerId: string) {
    // The sweeper derives elapsed time from the booking's ObjectId timestamp, so
    // the document must be CREATED with an aged _id (not patched in memory).
    const agedId = Types.ObjectId.createFromTime(
        Math.floor((Date.now() - (target + 1) * 5 * 1000) / 1000),
    );
    await Booking.create({
        _id: agedId,
        passenger: new Types.ObjectId(passengerId),
        source: { ...PICKUP, name: "Pickup", displayName: "Pickup" },
        destination: { latitude: 24.8707, longitude: 67.0111, name: "Drop", displayName: "Drop" },
        fare: 250,
        distance: 3.2,
        status: "pending",
    });
    const bookingId = String(agedId);
    await setSearchStageService(bookingId, 0);
    await setRidePassengerService(bookingId, passengerId);
    const cycle = await runDriverSearchCycle();
    const stage = await getSearchStageService(bookingId);
    return { bookingId, stage, cycle };
}

async function main() {
    console.log(`[STALL-TEST] run=${RUN_ID}`);
    await connectRedis();
    await mongoose.connect(process.env.MONGO_URI!, { serverSelectionTimeoutMS: 15000 });
    await redisClient.del(`e2e:${RUN_ID}:driver-ready`);

    // Remove orphan pending bookings left by earlier harness runs: a booking
    // whose passenger no longer exists makes the sweeper bail with "passenger
    // missing" and it can never be expired, so it would pollute every sweep.
    const orphans = await Booking.find({ status: "pending" }).populate("passenger", "name");
    for (const b of orphans) {
        if (!b.passenger) {
            await Booking.deleteOne({ _id: b._id });
            await redisClient.del([`search-stage:${b._id}`, `ride-passenger:${b._id}`]);
        }
    }

    // socket-server must be up for the driver to register
    const ss = spawn(process.execPath, [TS_NODE_BIN, "src/server.ts"], {
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
    });
    ss.stdout?.on("data", (d: Buffer) => {
        const s = d.toString();
        if (process.env.E2E_VERBOSE) console.log(`[socket-server] ${s.trimEnd()}`);
    });
    children.push(ss);
    for (let i = 0; i < 60; i++) {
        try {
            const r = await fetch(`${E2E_SOCKET_URL}/api/v1/notification/notify-drivers`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rideId: "p", driverIds: [], rideInfo: {} }),
            });
            if (r.ok) break;
        } catch { /* not up */ }
        await sleep(500);
    }

    // A real passenger so `.populate("passenger")` resolves and the stage
    // machine does not bail out with "passenger missing".
    const passengerDoc = (await mongoose.connection.db!
        .collection("user")
        .findOne({ role: "passenger" })) as { _id: unknown } | null;
    const passengerId = String(passengerDoc?._id);
    console.log(`[STALL-TEST] using real passengerId=${passengerId}`);

    const connectedId = `e2e-stall-connected-${RUN_ID}`;
    const socketlessId = `e2e-stall-socketless-${RUN_ID}`;
    const farId = `e2e-stall-far-${RUN_ID}`;

    // 1. A genuinely connected driver at 3 km.
    startConnectedDriver(connectedId, 3);
    const ready = await waitFlag(`e2e:${RUN_ID}:driver-ready`, 30_000);
    assert(ready !== null, "connected driver registered via real socket login");
    if (!ready) { cleanup(); await disconnectRedis(); await mongoose.disconnect(); process.exit(1); }

    // 2. A driver in GEO with FRESH location but NO socket (browser closed).
    await addDriverLocationToRedisService(
        socketlessId,
        PICKUP.latitude + 4 / KM_PER_DEG_LAT,
        PICKUP.longitude,
    );

    // 3. A driver only findable at 30 km, with a socket, to prove the ladder
    //    *could* have reached it.
    startConnectedDriver(farId, 28);
    await sleep(4000);

    console.log("\n─── CASE 1: socketless driver present at 5 km stage ───");
    const c1 = await sweepForStage(1, passengerId);
    console.log(`   stage=${c1.stage} advanced=${c1.cycle.advanced} expired=${c1.cycle.expired}`);
    assert(
        c1.stage > 0,
        `radius ladder advanced past stage 0 despite a socketless driver (stage=${c1.stage})`,
    );

    console.log("\n─── CASE 2: control, no socketless driver ───");
    await redisClient.del(`driver-location:${socketlessId}`);
    await redisClient.zRem("drivers", socketlessId);
    const c2 = await sweepForStage(1, passengerId);
    console.log(`   stage=${c2.stage} advanced=${c2.cycle.advanced} expired=${c2.cycle.expired}`);
    assert(c2.stage > 0, `control also advances (stage=${c2.stage})`);

    console.log("\n─── CASE 3: passenger cancellation stops further dispatch ───");
    // A real pending booking, aged past stage 0, with a connected driver nearby.
    const cancelId = Types.ObjectId.createFromTime(
        Math.floor((Date.now() - 11_000) / 1000),
    );
    await Booking.create({
        _id: cancelId,
        passenger: new Types.ObjectId(passengerId),
        source: { ...PICKUP, name: "Pickup", displayName: "Pickup" },
        destination: { latitude: 24.8707, longitude: 67.0111, name: "Drop", displayName: "Drop" },
        fare: 250,
        distance: 3.2,
        status: "pending",
        driver: null,
    });
    const cancelKey = String(cancelId);
    await setSearchStageService(cancelKey, 0);
    await setRidePassengerService(cancelKey, passengerId);
    await runDriverSearchCycle();
    const stageBefore = await getSearchStageService(cancelKey);
    assert(stageBefore >= 1, `booking advanced to stage ${stageBefore} before cancelling`);

    // The passenger cancels mid-search.
    const cancelled = await cancelPassengerRideService({
        bookingId: cancelKey,
        passengerId,
        reason: "other",
    });
    assert(cancelled.status === "cancelled", "passenger cancellation applies to a searching booking");
    assert(
        (await redisClient.get(`search-stage:${cancelKey}`)) === null,
        "cancellation clears the search-stage key",
    );
    assert(
        (await redisClient.get(`ride-passenger:${cancelKey}`)) === null,
        "cancellation clears the ride-passenger map",
    );

    // Later sweeps must ignore it entirely: cancelled is no longer a pending,
    // driver-less booking, so no further radius is queried for it.
    let radiiAfterCancel = 0;
    const realWrite2 = process.stdout.write.bind(process.stdout);
    (process.stdout as unknown as { write: unknown }).write = (
        chunk: string | Uint8Array,
        ...rest: unknown[]
    ) => {
        const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
        radiiAfterCancel += (text.match(new RegExp(`\\[DISPATCH\\] booking=${cancelKey} radius`, "g")) ?? []).length;
        return (realWrite2 as (...a: unknown[]) => boolean)(chunk, ...rest);
    };
    await runDriverSearchCycle();
    await runDriverSearchCycle();
    (process.stdout as unknown as { write: unknown }).write = realWrite2;
    assert(
        radiiAfterCancel === 0,
        `no further radius is searched after cancellation (saw ${radiiAfterCancel})`,
    );

    // And nobody can claim it afterwards. A cancelled booking is terminal
    // (cancelled: [] in DRIVER_RIDE_TRANSITIONS) and was never assigned to this
    // driver, so the transition is refused — as a 409 on the illegal transition,
    // a 404, or a 403 on ownership. All three are refusals; what matters is
    // that the ride cannot be claimed and the booking stays cancelled.
    let acceptError: string | null = null;
    try {
        await acceptDriverRideService(connectedId, cancelKey);
    } catch (e) {
        acceptError = `${(e as Error)?.constructor?.name}: ${(e as Error)?.message}`;
    }
    assert(
        acceptError !== null &&
            /^(ConflictError|NotFoundError|ForbiddenError)/.test(acceptError),
        `a driver cannot accept a cancelled booking (got ${acceptError ?? "SUCCESS — BUG"})`,
    );
    assert(
        (await Booking.findById(cancelId).lean())?.status === "cancelled",
        "the booking is still cancelled after the refused accept attempt",
    );
    await Booking.deleteOne({ _id: cancelId });

    for (const id of [connectedId, farId]) {
        await redisClient.del(`driver-location:${id}`);
        await redisClient.zRem("drivers", id);
        await redisClient.hDel("driver-socket", id);
    }
    await redisClient.del(`e2e:${RUN_ID}:driver-ready`);
    await redisClient.set(`e2e:${RUN_ID}:done`, "1", { EX: 10 });
    await sleep(800);

    console.log(`\n=========== ${passed} passed, ${failed} failed ===========`);
    if (failures.length) console.log("Failures:\n  - " + failures.join("\n  - "));
    cleanup();
    await disconnectRedis();
    await mongoose.disconnect();
    process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
    console.error("[STALL-TEST] fatal", e);
    cleanup();
    try { await disconnectRedis(); } catch { /* ignore */ }
    try { await mongoose.disconnect(); } catch { /* ignore */ }
    process.exit(1);
});