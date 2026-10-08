import crypto from "crypto";

/**
 * Credential-safe description of the Redis this process is actually talking to.
 *
 * Kept byte-identical in behaviour to the main API's copy (the two services are
 * separate packages with no shared build, so this is duplicated rather than
 * coupled). The socket server owns driver GEO, freshness and the
 * driverId -> socketId mapping, all of which the main API reads back during
 * matching, so a silent divergence here is exactly what produces
 * "no driver found" for a driver who is demonstrably online.
 *
 * Identity only - never the password.
 */
export type RedisIdentity = {
  provider: string;
  host: string;
  port: number | string;
  database: string;
  fingerprint: string;
  configured: boolean;
  error?: string;
};

const FINGERPRINT_SALT = "drio-redis-identity-v1";

export const fingerprintRedisUri = (uri: string): string =>
  crypto.createHash("sha256").update(`${FINGERPRINT_SALT}:${uri}`).digest("hex").slice(0, 16);

export const detectRedisProvider = (host: string): string => {
  const h = host.toLowerCase();
  if (h === "127.0.0.1" || h === "localhost" || h === "::1") return "local";
  if (h.endsWith(".db.redis.io") || h.endsWith(".upstash.io")) return "upstash";
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

export const formatRedisIdentity = (label: string, id: RedisIdentity): string =>
  `[REDIS] service=${label} provider=${id.provider} host=${id.host} port=${id.port} db=${id.database} fingerprint=${id.fingerprint} configured=${id.configured}`;