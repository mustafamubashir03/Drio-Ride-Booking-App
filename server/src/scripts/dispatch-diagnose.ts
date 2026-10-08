/**
 * PRODUCTION dispatch diagnostic.
 *
 * Run this WHILE the driver portal is open on the driver account. It inserts a
 * throwaway booking at the driver's own last known position, then reports —
 * every 2 seconds — exactly where the dispatch chain is standing:
 *
 *   search-stage   which radius stage the sweeper has actually reached
 *   notifiedDrivers  did the bridge reach a LIVE driver socket
 *   driver-socket  is this driver currently registered
 *   driver-location is this driver's GPS freshness key still alive
 *   status         did the booking resolve (claimed / expired)
 *
 * It only ever touches its own booking and never notifies a real driver other
 * than the single driver it is positioned on. Deletes itself at the end.
 *
 *   npx ts-node src/scripts/dispatch-diagnose.ts
 *
 * Optional: probe a specific driver position instead of the GEO index:
 *   E2E_DRIVER_LAT=24.8901885 E2E_DRIVER_LNG=67.0453407 npx ts-node ...
 */
import { Types } from "mongoose";
import "../config/index";
import mongoose from "mongoose";
import redisClient, { connectRedis, disconnectRedis } from "../lib/redis";

const POLL_MS = 2000;
const DURATION_MS = Number(process.env.DIAG_MS || 60000);

const stamp = () => new Date().toISOString().slice(11, 19);
const log = (s: string) => console.log(`${stamp()}  ${s}`);

async function main() {
    console.log("=== Drio production dispatch diagnostic ===");
    console.log(`redis:  ${(process.env.REDIS_URI || "").replace(/:[^:@]+@/, ":***@")}`);
    console.log(`bridge: ${process.env.SOCKET_SERVER_URL}`);

    await connectRedis();
    await mongoose.connect(process.env.MONGO_URI!, { serverSelectionTimeoutMS: 15000 });

    const driverIds = await redisClient.zRange("drivers", 0, -1);
    console.log(`\nGEO 'drivers' members: ${JSON.stringify(driverIds)}\n`);

    if (driverIds.length === 0) {
        console.log("!! The GEO index is EMPTY. No driver has ever sent a location fix.");
        console.log("   Fix that first: open the driver portal and go online.");
    }
    for (const id of driverIds) {
        const ttl = await redisClient.ttl(`driver-location:${id}`);
        const socketId = await redisClient.hGet("driver-socket", id);
        const activeRide = await redisClient.get(`driver-active-ride:${id}`);
        const pos = await redisClient.sendCommand(["GEOPOS", "drivers", id]);
        console.log(`driver ${id}`);
        console.log(`   position        ${JSON.stringify(pos)}`);
        console.log(`   GEO freshness   ttl=${ttl} ${ttl > 0 ? "ALIVE" : "EXPIRED/absent -> EXCLUDED from every search"}`);
        console.log(`   socket mapping  ${socketId ?? "NONE -> ride requests will be dropped"}`);
        console.log(`   active ride     ${activeRide ?? "none"}`);
    }

    // Number("") is 0 and is finite, so an unset variable must be filtered on the
// raw string before it can be mistaken for a real coordinate of 0,0.
const explicitLat = process.env.E2E_DRIVER_LAT?.trim();
const explicitLng = process.env.E2E_DRIVER_LNG?.trim();
let targetLat = explicitLat && explicitLng ? Number(explicitLat) : null;
let targetLng = explicitLat && explicitLng ? Number(explicitLng) : null;
if (targetLat !== null && (!Number.isFinite(targetLat) || !Number.isFinite(targetLng))) {
    console.log(`!! E2E_DRIVER_LAT/LNG are not numbers: "${explicitLat}","${explicitLng}"`);
    return;
}
    if (targetLat === null || targetLng === null) {
        const first = driverIds[0];
        const pos = first
            ? ((await redisClient.sendCommand(["GEOPOS", "drivers", first])) as string[][])
            : null;
        // GEOPOS answers [lng, lat].
        if (!pos || !pos[0] || pos[0].length < 2) {
            console.log("\n!! No driver position available to probe from. Re-run with E2E_DRIVER_LAT/LNG.");
            await disconnectRedis();
            await mongoose.disconnect();
            return;
        }
        targetLng = Number(pos[0][0]);
        targetLat = Number(pos[0][1]);
        console.log(`\nusing first GEO member position ${targetLng},${targetLat}`);
    } else {
        console.log(`\nusing explicit probe position ${targetLng},${targetLat}`);
    }
    const pickup = {
        name: "DIAG",
        displayName: "DIAG",
        latitude: targetLat!,
        longitude: targetLng!,
    };

    const passengerDoc = (await mongoose.connection.db!
        .collection("user")
        .findOne({ role: "passenger" })) as { _id: unknown } | null;
    if (!passengerDoc) {
        console.log("!! No passenger account found to attach the probe booking to.");
        return;
    }

    const id = new Types.ObjectId();
    await mongoose.connection.db!.collection("bookings").insertOne({
        _id: id,
        passenger: new Types.ObjectId(String(passengerDoc._id)),
        source: pickup,
        destination: {
            name: "DIAG2",
            displayName: "DIAG2",
            latitude: pickup.latitude + 0.01,
            longitude: pickup.longitude,
        },
        fare: 1,
        distance: 1.1,
        status: "pending",
        driver: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    const key = String(id);
    console.log(`\nprobe booking ${key} inserted at ${pickup.longitude},${pickup.latitude}`);
    console.log("watching (a real driver on screen should now receive a ride request):\n");

    const deadline = Date.now() + DURATION_MS;
    let lastLine = "";
    while (Date.now() < deadline) {
        const [stage, notified] = await Promise.all([
            redisClient.get(`search-stage:${key}`),
            redisClient.sMembers(`notifiedDrivers:${key}`),
        ]);
        const booking = await mongoose.connection.db!
            .collection("bookings")
            .findOne({ _id: id });
        const line =
            `stage=${stage ?? "-"} notified=${notified.length}` +
            (notified.length ? ` -> ${JSON.stringify(notified)}` : "") +
            ` status=${booking?.status}`;
        if (line !== lastLine) {
            log(line);
            lastLine = line;
        }
        if (booking?.status && booking.status !== "pending") {
            console.log(`\nresolved as ${booking.status}.`);
            break;
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
    }

    console.log("\nhow to read this:");
    console.log("  stage grows 5->15->25->45->50 km : the sweeper is widening (backend healthy)");
    console.log("  notified stays 0                : the main API found no ELIGIBLE driver");
    console.log("  GEO freshness EXPIRED           : driver stopped sending GPS -> excluded");
    console.log("  socket mapping NONE             : driver not connected -> emit dropped");
    console.log("  notified > 0                    : bridge reached a live driver socket = delivery OK");

    await mongoose.connection.db!.collection("bookings").deleteOne({ _id: id });
    await redisClient.del([`search-stage:${key}`, `ride-passenger:${key}`, `notifiedDrivers:${key}`]);
    console.log("\nprobe booking removed.");
    await disconnectRedis();
    await mongoose.disconnect();
}

main().catch(async (e) => {
    console.error("diagnostic failed:", e.message);
    try { await disconnectRedis(); } catch { /* ignore */ }
    try { await mongoose.disconnect(); } catch { /* ignore */ }
    process.exit(1);
});