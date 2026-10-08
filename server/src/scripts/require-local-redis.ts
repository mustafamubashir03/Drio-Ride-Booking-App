/**
 * Test-only guard: pins this process to a LOCAL Redis.
 *
 * Imported before any module that reads REDIS_URI, because ES module imports are
 * evaluated depth-first in source order, so this module's side effect lands
 * before `lib/redis` is instantiated. Throws rather than degrading, so a
 * misconfigured run fails loudly instead of quietly writing to production.
 */
const LOCAL_REDIS_URI = process.env.LOCAL_REDIS_URI || "redis://127.0.0.1:6379";

const host = new URL(LOCAL_REDIS_URI).hostname;
if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error(
        `refusing to run: LOCAL_REDIS_URI points at ${host}, not loopback. ` +
        `These tests write and delete Redis keys and must never touch a shared datastore.`,
    );
}

process.env.REDIS_URI = LOCAL_REDIS_URI;
// Local Redis is 5.x and does not implement the RESP3 HELLO handshake.
process.env.REDIS_RESP = "2";

export const requireLocalRedisUri = (): string => LOCAL_REDIS_URI;