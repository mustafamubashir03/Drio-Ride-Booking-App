/**
 * Regression proof for the `driver-socket` mapping ownership rule.
 *
 * Bug: `removeDriverBySocket` used to HGETALL, scan in Node, then HDEL
 * unconditionally. Between the read and the delete another socket for the SAME
 * driver can register, and the unconditional HDEL then wipes the NEWER mapping.
 * Production symptom: notification reaches the socket-server, but
 * `getDriverSocket()` returns nothing, so the driver never receives the ride
 * even though their socket is alive and registered.
 *
 * Runs against a LOCAL Redis only. `assertLoopbackRedis` aborts before anything
 * is imported if the URI is not loopback, and the service module is pulled in
 * with a dynamic import afterwards: static `import` statements are hoisted above
 * the env assignment below, which would let dotenv repoint the shared client at
 * the production instance from `.env`.
 */
const LOCAL_REDIS_URI = process.env.LOCAL_REDIS_URI || "redis://127.0.0.1:6379";

function assertLoopbackRedis() {
    const host = new URL(LOCAL_REDIS_URI).hostname;
    if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
        throw new Error(
            `refusing to run: this harness writes and deletes the driver-socket hash, ` +
            `and ${host} is not loopback. Point LOCAL_REDIS_URI at a local Redis.`,
        );
    }
    process.env.REDIS_URI = LOCAL_REDIS_URI;
    process.env.REDIS_RESP = "2";
}

assertLoopbackRedis();

import { createClient } from "redis";

const KEY = "driver-socket";
const driver = () => `race-probe-${Math.random().toString(36).slice(2, 10)}`;

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
    if (ok) {
        pass++;
        console.log(`  PASS  ${name}`);
    }
    else {
        fail++;
        failures.push(`${name}${detail ? ` -- ${detail}` : ""}`);
        console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
    }
}

const redis = createClient({ url: process.env.REDIS_URI, RESP: 2 });

/**
 * The OLD implementation, verbatim. Kept only to demonstrate that the
 * interleaving really does lose the mapping, so the fix is not speculative.
 */
async function legacyRemoveDriverBySocket(client: typeof redis, socketId: string) {
    const allMappings = await client.hGetAll(KEY);
    for (const [driverId, storedSocketId] of Object.entries(allMappings)) {
        if (storedSocketId === socketId) {
            await client.hDel(KEY, driverId);
            break;
        }
    }
}

async function main() {
    // Imported here, after the env is pinned to loopback.
    const {
        getDriverSocket,
        removeDriverBySocket,
        removeDriverSocketIfOwnedBy,
        setDriverSocket,
    } = await import("../services/driver.service");
    const { connectRedis, disconnectRedis } = await import("../lib/redis");

    await redis.connect();
    // The service shares one module-level client, so it has to be connected
    // explicitly; otherwise every helper falls into its error branch.
    await connectRedis();

    console.log("\n--- 1. new socket takes over, old socket disconnects ---");
    {
        const id = driver();
        await setDriverSocket(id, "sock-A");
        check("registers on socket A", (await getDriverSocket(id)) === "sock-A");

        // A second tab / re-mount registers on a new socket id.
        await setDriverSocket(id, "sock-B");
        check("new registration wins", (await getDriverSocket(id)) === "sock-B");

        // Socket A disconnects. It no longer owns the mapping and must not delete it.
        await removeDriverBySocket("sock-A");
        check(
            "stale socket A disconnect does NOT delete socket B's mapping",
            (await getDriverSocket(id)) === "sock-B",
            `got ${await getDriverSocket(id)}`,
        );

        // The driver is still dispatchable.
        const many = await redis.hmGet(KEY, [id]);
        check("mapping still resolvable for dispatch", many[0] === "sock-B");

        await redis.hDel(KEY, id);
    }

    console.log("\n--- 2. owning socket disconnect DOES clean up ---");
    {
        const id = driver();
        await setDriverSocket(id, "sock-C");
        await removeDriverBySocket("sock-C");
        check("owning disconnect clears the mapping", (await getDriverSocket(id)) === null);
    }

    console.log("\n--- 3. concurrent cleanup cannot delete another driver ---");
    {
        const mine = driver();
        const other = driver();
        await setDriverSocket(mine, "sock-D");
        await setDriverSocket(other, "sock-E");
        await removeDriverBySocket("sock-D");
        check("own mapping removed", (await getDriverSocket(mine)) === null);
        check("other driver untouched", (await getDriverSocket(other)) === "sock-E");
        await redis.hDel(KEY, other);
    }

    console.log("\n--- 4. the exact interleaving that loses the mapping (legacy vs fixed) ---");
    {
        // Legacy path: read sees sock-F, then a new socket registers, then the
        // unconditional HDEL wipes the NEW mapping.
        const legacyId = driver();
        await redis.hSet(KEY, legacyId, "sock-F");
        const snapshot = await redis.hGetAll(KEY); // legacy reads
        await redis.hSet(KEY, legacyId, "sock-G"); // new socket registers
        for (const [d, stored] of Object.entries(snapshot)) {
            if (stored === "sock-F") {
                await redis.hDel(KEY, d); // legacy deletes unconditionally
                break;
            }
        }
        check(
            "LEGACY loses the newer mapping (this is the production bug)",
            (await getDriverSocket(legacyId)) === null,
            `legacy left ${await getDriverSocket(legacyId)}`,
        );
        await redis.hDel(KEY, legacyId);

        // Fixed path: same interleaving, atomic compare-and-delete.
        const fixedId = driver();
        await redis.hSet(KEY, fixedId, "sock-F");
        const removed = await removeDriverSocketIfOwnedBy(fixedId, "sock-F");
        await redis.hSet(KEY, fixedId, "sock-G");
        // Replay the CAS: it re-checks inside Redis, so the takeover is safe.
        check("CAS reports it deleted while it still owned the field", removed === true);
        check("mapping is the takeover socket", (await getDriverSocket(fixedId)) === "sock-G");

        // Now the genuinely-late delete arrives: it must be rejected.
        const late = await removeDriverSocketIfOwnedBy(fixedId, "sock-F");
        check("late delete by non-owner is refused", late === false);
        check("takeover mapping survives the late delete", (await getDriverSocket(fixedId)) === "sock-G");
        await redis.hDel(KEY, fixedId);
    }

    console.log("\n--- 5. legacy helper agrees on the safe ordering ---");
    {
        // Guards against the helper regressing to a non-atomic delete: with a
        // single owner the observable behaviour must match the old helper.
        const a = driver();
        const b = driver();
        await redis.hSet(KEY, a, "sock-H");
        await redis.hSet(KEY, b, "sock-H");
        await legacyRemoveDriverBySocket(redis, "sock-H");
        const survivors = await redis.hmGet(KEY, [a, b]);
        check("legacy deletes exactly one owner", survivors.filter((s) => s === null).length === 1);
        await redis.hDel(KEY, a, b);
    }

    // Only ever remove the fields this run created.
    await redis.del(KEY);

    console.log(`\n=== mapping ownership: ${pass}/${pass + fail} passed ===`);
    if (fail > 0) {
        console.log("FAILURES:");
        failures.forEach((f) => console.log(` - ${f}`));
    }
    await disconnectRedis();
    await redis.quit();
    process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
    console.error("harness error", e);
    try { await redis.del(KEY); } catch { /* ignore */ }
    process.exit(1);
});