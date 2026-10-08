import crypto from "crypto";

/**
 * Credential-safe description of the Redis this process is actually talking to.
 *
 * Ride matching is split across three processes (Vercel API creates the booking
 * and runs stage 0, the Render sweeper runs stages 1-4 and expiry, the socket
 * server writes GEO/freshness/mapping). All three must share one Redis, but
 * nothing in the codebase made that visible, so a misconfigured deployment
 * silently degraded into "no driver found" instead of failing loudly.
 *
 * This exposes identity only - never the password. `fingerprint` is a salted
 * hash of the full URI: comparing two services' fingerprints answers "is this
 * the same datastore?" without revealing (or making it possible to recover) the
 * credential.
 */
export type RedisIdentity = {
  provider: string;
  host: string;
  port: number | string;
  database: string;
  /** Stable, non-reversible equality check for the full URI incl. credential. */
  fingerprint: string;
  configured: boolean;
  error?: string;
};

const FINGERPRINT_SALT = "drio-redis-identity-v1";

export const fingerprintRedisUri = (uri: string): string =>
  crypto.createHash("sha256").update(`${FINGERPRINT_SALT}:${uri}`).digest("hex").slice(0, 16);

/**
 * Best-effort provider label. Only ever derived from the hostname, never from
 * the credential, so it is safe to log.
 */
export const detectRedisProvider = (host: string): string => {
  const h = host.toLowerCase();
  if (h === "127.0.0.1" || h === "localhost" || h === "::1") return "local";
  if (h.endsWith(".db.redis.io") || h.endsWith(".upstash.io")) return "upstash";
  // Render Key Value instances are reachable internally by their service name.
  if (h === "drio-redis" || h.endsWith(".render.internal")) return "render-kv";
  if (h.endsWith(".cache.redis.windows.net")) return "azure";
  return "other";
};

export const describeRedisUri = (uri: string | undefined | null): RedisIdentity => {
  if (!uri) {
    return {
      provider: "none",
      host: "(unset)",
      port: "(unset)",
      database: "(unset)",
      fingerprint: "(unset)",
      configured: false,
      error: "REDIS_URI is not set",
    };
  }
  try {
    const u = new URL(uri);
    const database = u.pathname.replace(/^\//, "") || "0";
    return {
      provider: detectRedisProvider(u.hostname),
      host: u.hostname,
      port: u.port || (u.protocol === "rediss:" ? 6380 : 6379),
      database,
      fingerprint: fingerprintRedisUri(uri),
      configured: true,
    };
  } catch {
    return {
      provider: "unparseable",
      host: "(unparseable)",
      port: "(unparseable)",
      database: "(unparseable)",
      fingerprint: fingerprintRedisUri(uri),
      configured: true,
      error: "REDIS_URI could not be parsed as a URL",
    };
  }
};

/** Single-line log form. Contains no credential material by construction. */
export const formatRedisIdentity = (label: string, id: RedisIdentity): string =>
  `[REDIS] service=${label} provider=${id.provider} host=${id.host} port=${id.port} db=${id.database} fingerprint=${id.fingerprint} configured=${id.configured}`;