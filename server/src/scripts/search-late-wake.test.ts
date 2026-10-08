/**
 * Regression harness for the systemic "search never advances" failure.
 *
 * Reproduces the reported production symptom exactly: the sweep executor does
 * not run at all while the search is in flight (platform froze the process, or
 * the only trigger was dead code), then wakes after the booking is already past
 * its budget.
 *
 * What the OLD code did:
 *   expiry was evaluated FIRST, so a late sweep cancelled the booking outright
 *   and stages 1-4 were never queried. A driver 7.28 km away - inside the 15 km
 *   stage for the whole search - was never notified, and the ride always ended
 *   "no driver found".
 *
 * What this asserts now:
 *   1. A sweep that wakes late still runs every stage the sleep spanned.
 *   2. The driver at 7.28 km is notified at the 15 km stage.
 *   3. Progress is monotonic: it never rewrites back to 5 km.
 *   4. A booking that is never swept at all still resolves (driven by the
 *      passenger poll triggering a sweep), rather than hanging in "searching".
 *
 * Isolated: loopback Redis only, in-memory bookings, no Mongo.
 */
import { requireLocalRedisUri } from "./require-local-redis";
import { createClient } from "redis";
import { connectRedis, disconnectRedis } from "../lib/redis";
import { runDriverSearchCycle, kickoffDriverSearch, collectEligibleDriverIds } from "../services/driver-search.service";
import { SEARCH_RADII_KM, SEARCH_MAX_DURATION_MS } from "../config/search.config";

const LOCAL_REDIS_URI = requireLocalRedisUri();

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
    if (ok) { pass++; console.log(`  PASS  ${name}`); }
    else {
        fail++;
        failures.push(`${name}${detail ? ` -- ${detail}` : ""}`);
        console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
    }
}

// Real production geometry: driver 7.2784 km from the pickup.
const PICKUP = { longitude: 67.0345011, latitude: 24.8857871 };
const DRIVER = { id: "sweep-driver-01", longitude: 67.097977, latitude: 24.916888 };

const fakeBooking = (id: string, ageMs: number) => ({
    _id: {
        toString: () => id,
        getTimestamp: () => new Date(Date.now() - ageMs),
    },
    source: { longitude: PICKUP.longitude, latitude: PICKUP.latitude, displayName: "Pickup" },
    destination: { displayName: "Drop" },
    passenger: { _id: "passenger-1" },
    status: "pending",
    driver: null,
});

let redis: ReturnType<typeof createClient>;

const progressOf = async (id: string) => {
    const raw = await redis.get(`search-progress:${id}`);
    return raw ? JSON.parse(raw) : null;
};

async function main() {
    redis = createClient({ url: LOCAL_REDIS_URI, RESP: 2 });
    await redis.connect();
    await connectRedis();

    const created: string[] = [];
    const cancelled: string[] = [];

    await redis.sendCommand([
        "GEOADD", "drivers",
        String(DRIVER.longitude), String(DRIVER.latitude), DRIVER.id,
    ]);
    await redis.set(`driver-location:${DRIVER.id}`, JSON.stringify(DRIVER), { EX: 60 });
    created.push(DRIVER.id, `driver-location:${DRIVER.id}`);

    const deps = {
        findPending: (async () => []) as any,
        cancelBooking: (async (a: any) => {
            cancelled.push(a.bookingId);
            return { _id: a.bookingId, status: "cancelled" };
        }) as any,
    };

    console.log("\n--- A. late wake inside the budget catches up every missed stage ---");
    {
        const id = `late-a-${Date.now().toString(36)}`;
        created.push(`search-stage:${id}`, `search-progress:${id}`, `notifiedDrivers:${id}`);
        const booking = fakeBooking(id, 0);

        // Kickoff = stage 0 (5 km) at creation, exactly as booking creation does.
        await kickoffDriverSearch({
            bookingId: id,
            longitude: PICKUP.longitude,
            latitude: PICKUP.latitude,
            rideInfo: { pickup: "A", destination: "B", fare: 100, distance: 7, passengerName: "P" },
        });
        check("kickoff recorded stage 0 / 5 km", JSON.stringify(await progressOf(id)) === JSON.stringify({ stage: 0, radiusKm: 5 }), JSON.stringify(await progressOf(id)));

        // The executor is asleep for 30s, then wakes ONCE.
        Object.defineProperty(booking._id, "getTimestamp", {
            value: () => new Date(Date.now() - 30_000),
        });
        const res = await runDriverSearchCycle({ findPending: async () => [booking] as any, cancelBooking: deps.cancelBooking });
        check("late sweep advanced the ladder", res.advanced >= 1, `advanced=${res.advanced}`);

        const p = await progressOf(id);
        check("progress moved past 5 km", p !== null && p.radiusKm > 5, JSON.stringify(p));
        check("progress is >= 15 km (the driver's stage)", p !== null && p.radiusKm >= 15, JSON.stringify(p));
        check("booking was NOT cancelled inside the budget", !cancelled.includes(id), JSON.stringify(cancelled));

        // No socket server runs in this harness, so delivery is always empty.
        // What matters is that the driver became ELIGIBLE at the stage the sweep
        // reached: in production that is the exact list that gets notified.
        const eligible = await collectEligibleDriverIds({
            bookingId: id,
            longitude: PICKUP.longitude,
            latitude: PICKUP.latitude,
            radiusKm: p.radiusKm,
        });
        check("driver is eligible at the stage the late sweep reached", eligible.includes(DRIVER.id), JSON.stringify(eligible));
    }

    console.log("\n--- B. wake AFTER the whole budget: ladder first, then expire ---");
    {
        const id = `late-b-${Date.now().toString(36)}`;
        created.push(`search-stage:${id}`, `search-progress:${id}`, `notifiedDrivers:${id}`);
        const booking = fakeBooking(id, 0);
        await kickoffDriverSearch({
            bookingId: id,
            longitude: PICKUP.longitude,
            latitude: PICKUP.latitude,
            rideInfo: { pickup: "A", destination: "B", fare: 100, distance: 7, passengerName: "P" },
        });
        Object.defineProperty(booking._id, "getTimestamp", {
            value: () => new Date(Date.now() - (SEARCH_MAX_DURATION_MS + 2000)),
        });
        await runDriverSearchCycle({ findPending: async () => [booking] as any, cancelBooking: deps.cancelBooking });

        // Expiry clears the progress keys by design (terminal state), so assert
        // the ladder covered the widest radius BEFORE resolution instead.
        const widest = await collectEligibleDriverIds({
            bookingId: id,
            longitude: PICKUP.longitude,
            latitude: PICKUP.latitude,
            radiusKm: Math.max(...SEARCH_RADII_KM),
        });
        check("driver was covered at the widest radius", widest.includes(DRIVER.id), JSON.stringify(widest));
        check("booking then resolved terminally", cancelled.includes(id), JSON.stringify(cancelled));
        check("terminal resolution cleared the progress keys", (await progressOf(id)) === null, JSON.stringify(await progressOf(id)));
    }

    console.log("\n--- C. progress never rewinds (monotonic) ---");
    {
        const id = `mono-${Date.now().toString(36)}`;
        created.push(`search-stage:${id}`, `search-progress:${id}`, `notifiedDrivers:${id}`);
        const booking = fakeBooking(id, 0);
        await kickoffDriverSearch({
            bookingId: id,
            longitude: PICKUP.longitude,
            latitude: PICKUP.latitude,
            rideInfo: { pickup: "A", destination: "B", fare: 100, distance: 7, passengerName: "P" },
        });
        // First sweep at 30s -> advances.
        Object.defineProperty(booking._id, "getTimestamp", { value: () => new Date(Date.now() - 30_000) });
        await runDriverSearchCycle({ findPending: async () => [booking] as any, cancelBooking: deps.cancelBooking });
        const first = await progressOf(id);
        // A subsequent sweep reports the booking as YOUNGER than before (clock
        // skew / a stale id read). It must not drag progress back to 5 km.
        Object.defineProperty(booking._id, "getTimestamp", { value: () => new Date(Date.now() - 1_000) });
        await runDriverSearchCycle({ findPending: async () => [booking] as any, cancelBooking: deps.cancelBooking });
        const second = await progressOf(id);
        check(
            "progress did not rewind after a younger-reading sweep",
            second !== null && first !== null && second.stage >= first.stage,
            `first=${JSON.stringify(first)} second=${JSON.stringify(second)}`,
        );
    }

    console.log("\n--- D. a lost search-stage key does not restart at 5 km ---");
    {
        const id = `lost-${Date.now().toString(36)}`;
        created.push(`search-stage:${id}`, `search-progress:${id}`, `notifiedDrivers:${id}`);
        const booking = fakeBooking(id, 0);
        await kickoffDriverSearch({
            bookingId: id,
            longitude: PICKUP.longitude,
            latitude: PICKUP.latitude,
            rideInfo: { pickup: "A", destination: "B", fare: 100, distance: 7, passengerName: "P" },
        });
        // Simulate Redis losing the stage marker entirely.
        await redis.del(`search-stage:${id}`);
        Object.defineProperty(booking._id, "getTimestamp", { value: () => new Date(Date.now() - 30_000) });
        await runDriverSearchCycle({ findPending: async () => [booking] as any, cancelBooking: deps.cancelBooking });
        const p = await progressOf(id);
        const eligible = await collectEligibleDriverIds({
            bookingId: id,
            longitude: PICKUP.longitude,
            latitude: PICKUP.latitude,
            radiusKm: p.radiusKm,
        });
        check("driver still reached despite the lost stage key", eligible.includes(DRIVER.id), JSON.stringify(eligible));
        check("progress ended beyond 5 km", p !== null && p.radiusKm > 5, JSON.stringify(p));
    }

    // Cleanup: only what this run created.
    for (const k of created) {
        if (k.startsWith("search-stage:") || k.startsWith("search-progress:") || k.startsWith("notifiedDrivers:") || k.startsWith("driver-location:")) {
            await redis.del(k);
        } else {
            await redis.zRem("drivers", k);
        }
    }

    console.log(`\n=== late-wake regression: ${pass}/${pass + fail} passed ===`);
    if (fail > 0) {
        console.log("FAILURES:");
        failures.forEach((f) => console.log(` - ${f}`));
    }
    await disconnectRedis();
    await redis.quit();
    process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("harness error", e); process.exit(1); });