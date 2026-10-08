/**
 * Verifies the real sweep walks the whole configured radius ladder to 50 km and
 * then terminates the booking, using real aged bookings and real sweeps.
 *
 * Each case mints a booking whose `_id` timestamp places it at a specific point
 * in the schedule, runs one genuine `runDriverSearchCycle`, and reads back which
 * radius was actually queried (from the [DISPATCH] log the service emits and
 * from the persisted `search-stage` key).
 */
/**
 * Guarded: this suite deletes and rewrites Redis/Mongo data, so it must never
 * run against a shared or production datastore. Must be the FIRST import.
 */
import "./require-isolated-stores";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { Types } from "mongoose";
import "../config/index";
import mongoose from "mongoose";
import redisClient, { connectRedis, disconnectRedis } from "../lib/redis";
import Booking from "../models/booking.model";
import "../models/user.model";
import { runDriverSearchCycle } from "../services/driver-search.service";
import {
    getSearchStageService,
    setSearchStageService,
    setRidePassengerService,
} from "../services/location.service";
import {
    SEARCH_RADII_KM,
    SEARCH_MAX_RADIUS_KM,
    SEARCH_STAGE_INTERVAL_MS,
    SEARCH_MAX_DURATION_MS,
} from "../config/search.config";

const SOCKET_SERVER_DIR = path.resolve(__dirname, "../../../socket-server");
const TS_NODE_BIN = path.join(SOCKET_SERVER_DIR, "node_modules", "ts-node", "dist", "bin.js");
const E2E_PORT = Number(process.env.E2E_PORT || 5099);
const E2E_SOCKET_URL = `http://127.0.0.1:${E2E_PORT}`;
const REDIS_URI = process.env.REDIS_URI!;
const ORIGIN = { latitude: 24.8607, longitude: 67.0011 };

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(cond: boolean, label: string) {
    if (cond) { passed++; console.log(`  PASS ${label}`); }
    else { failed++; failures.push(label); console.error(`  FAIL ${label}`); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const children: ChildProcess[] = [];
function cleanup() { for (const c of children) { try { c.kill(); } catch { /* gone */ } } }

async function sweepAgedAt(secondsElapsed: number, passengerId: string) {
    const agedId = Types.ObjectId.createFromTime(
        Math.floor((Date.now() - secondsElapsed * 1000) / 1000),
    );
    await Booking.create({
        _id: agedId,
        passenger: new Types.ObjectId(passengerId),
        source: { name: "A", displayName: "Point A", ...ORIGIN },
        destination: { name: "B", displayName: "Point B", latitude: 24.8707, longitude: 67.0111 },
        fare: 120,
        distance: 7,
        status: "pending",
        driver: null,
    });
    const id = String(agedId);
    await setSearchStageService(id, 0);
    await setRidePassengerService(id, passengerId);
    const cycle = await runDriverSearchCycle();
    const stage = await getSearchStageService(id);
    const booking = await Booking.findById(agedId).lean();
    return { id, stage, cycle, status: booking?.status };
}

async function main() {
    console.log("[LADDER] configured radii:", JSON.stringify(SEARCH_RADII_KM));
    assert(SEARCH_MAX_RADIUS_KM === 50, `max radius is 50km (got ${SEARCH_MAX_RADIUS_KM})`);
    assert(
        Math.max(...SEARCH_RADII_KM) <= SEARCH_MAX_RADIUS_KM,
        "no ladder entry exceeds the 50km ceiling",
    );
    assert(
        SEARCH_MAX_DURATION_MS === 50_000,
        `total budget is ~50s (got ${SEARCH_MAX_DURATION_MS}ms)`,
    );
    assert(
        SEARCH_STAGE_INTERVAL_MS === 10_000,
        `stage interval is 10s (got ${SEARCH_STAGE_INTERVAL_MS}ms)`,
    );

    await connectRedis();
    await mongoose.connect(process.env.MONGO_URI!, { serverSelectionTimeoutMS: 15000 });

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
    // The [DISPATCH] radius lines are emitted by THIS process (the main API),
    // not by the socket-server, so the real stdout has to be observed.
    let currentRadii: string[] = [];
    const realWrite = process.stdout.write.bind(process.stdout);
    (process.stdout as unknown as { write: unknown }).write = (
        chunk: string | Uint8Array,
        ...rest: unknown[]
    ) => {
        const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
        for (const m of text.matchAll(/\[DISPATCH\] booking=(\S+) radius=(\d+)km/g)) {
            currentRadii.push(m[2]);
        }
        return (realWrite as (...a: unknown[]) => boolean)(chunk, ...rest);
    };
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

    // Keep the shared GEO index clear of unrelated drivers so radius assertions
    // are about the ladder, not about who else happens to be nearby.
    const preExisting = await redisClient.zRange("drivers", 0, -1);
    const preExistingLocs = await Promise.all(
        preExisting.map((id) => redisClient.get(`driver-location:${id}`)),
    );
    await redisClient.del("drivers");
    for (const id of preExisting) {
        if (preExistingLocs[preExisting.indexOf(id)]) continue;
        await redisClient.zRem("drivers", id);
    }

    const passengerDoc = (await mongoose.connection.db!
        .collection("user")
        .findOne({ role: "passenger" })) as { _id: unknown } | null;
    const passengerId = String(passengerDoc?._id);
    console.log(`[LADDER] using passengerId=${passengerId}`);

    const created: string[] = [];
    try {
        // Walk the schedule: one real sweep per stage boundary.
        const expect: Array<{ at: number; stage: number; radius: number }> = [
            { at: 11, stage: 1, radius: 15 },
            { at: 21, stage: 2, radius: 25 },
            { at: 31, stage: 3, radius: 45 },
            { at: 41, stage: 4, radius: 50 },
        ];
        for (const step of expect) {
            currentRadii = [];
            const r = await sweepAgedAt(step.at, passengerId);
            created.push(r.id);
            assert(
                r.stage === step.stage,
                `at ${step.at}s the booking sits at stage ${step.stage} (got ${r.stage})`,
            );
            assert(
                currentRadii.includes(String(step.radius)),
                `at ${step.at}s the backend actually queried ${step.radius}km (radii queried: ${JSON.stringify(currentRadii)})`,
            );
        }

        // Past the budget the booking must terminate rather than run on.
        currentRadii = [];
        const past = await sweepAgedAt(55, passengerId);
        created.push(past.id);
        assert(past.cycle.expired >= 1, `a booking aged 55s is expired by the sweep`);
        assert(
            past.status === "cancelled",
            `an over-budget booking resolves to cancelled (got ${past.status})`,
        );
    } finally {
        for (const id of created) {
            await Booking.deleteOne({ _id: new Types.ObjectId(id) });
            await redisClient.del([
                `search-stage:${id}`,
                `ride-passenger:${id}`,
                `notifiedDrivers:${id}`,
            ]);
        }
        for (const id of preExisting) await redisClient.zAdd("drivers", { score: 0, value: id });
        for (let i = 0; i < preExisting.length; i++) {
            if (preExistingLocs[i]) {
                await redisClient.set(`driver-location:${preExisting[i]}`, preExistingLocs[i]!, { EX: 30 });
            }
        }
        console.log(`\n=========== ${passed} passed, ${failed} failed ===========`);
        if (failures.length) console.log("Failures:\n  - " + failures.join("\n  - "));
        cleanup();
        await disconnectRedis();
        await mongoose.disconnect();
        process.exit(failed === 0 ? 0 : 1);
    }
}

main().catch(async (e) => {
    console.error("[LADDER] fatal", e);
    cleanup();
    try { await disconnectRedis(); } catch { /* ignore */ }
    try { await mongoose.disconnect(); } catch { /* ignore */ }
    process.exit(1);
});