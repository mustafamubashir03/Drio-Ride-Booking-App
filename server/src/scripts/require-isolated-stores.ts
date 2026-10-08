/**
 * Test-only guard: refuse to run against any shared/production datastore.
 *
 * The suites in this directory clear the GEO index, delete bookings and rewrite
 * driver state. They previously took REDIS_URI and MONGO_URI straight from
 * `.env`, which in this repo points at production - so running them could
 * destroy live ride history and driver presence.
 *
 * Both must now resolve to loopback. Set ALLOW_SHARED_STORES=1 to deliberately
 * run against a throwaway shared instance (never production).
 */

const LOCAL_HOSTS = ["127.0.0.1", "localhost", "::1"];

function assertLoopback(name: string, value: string | undefined, what: string) {
    if (!value) {
        throw new Error(`${what} is not set; cannot prove this is an isolated instance`);
    }
    let host: string;
    try {
        host = new URL(value).hostname;
    } catch {
        throw new Error(`${what} is not a parseable URL`);
    }
    if (!LOCAL_HOSTS.includes(host)) {
        throw new Error(
            `refusing to run: ${what} points at ${host}. This suite mutates and deletes ` +
            `data. Point ${name} at a local instance, or set ALLOW_SHARED_STORES=1 for a ` +
            `deliberately disposable shared instance.`,
        );
    }
}

if (process.env.ALLOW_SHARED_STORES !== "1") {
    assertLoopback("REDIS_URI", process.env.REDIS_URI, "REDIS_URI");
    assertLoopback("MONGO_URI", process.env.MONGO_URI, "MONGO_URI");
}

const LOCAL_REDIS_URI = process.env.LOCAL_REDIS_URI || "redis://127.0.0.1:6379";
process.env.REDIS_URI = LOCAL_REDIS_URI;
// Local Redis is 5.x and does not implement the RESP3 HELLO handshake.
process.env.REDIS_RESP = "2";

export const isolatedRedisUri = LOCAL_REDIS_URI;