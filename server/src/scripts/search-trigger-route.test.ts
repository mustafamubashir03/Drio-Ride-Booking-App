/**
 * Verifies the search-sweep traffic trigger against REAL Express routing.
 *
 * This exists because the previous trigger was written from an assumption about
 * `req.path` and silently matched nothing: an app-level middleware sees the full
 * path ("/api/v1/passenger/bookings"), not the router-relative path, so every
 * search silently depended on the sweeper interval alone.
 *
 * Rather than assert the regex by inspection, this builds an Express app with the
 * SAME mount layout as the real one (app.use('/api/v1', router)), records the
 * actual `req.path` observed at the app root, and checks the trigger against it.
 * If Express' mount semantics ever differ from what the matcher assumes, this
 * fails.
 */
import express from "express";
import type { AddressInfo } from "net";
import { shouldTriggerSearchSweep } from "../lib/search-trigger";

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

async function main() {
    const observed: { path: string; url: string; baseUrl: string }[] = [];

    // Mirrors the real layout in src/app.ts.
    const app = express();
    app.use((req, _res, next) => {
        observed.push({ path: req.path, url: req.url, baseUrl: req.baseUrl });
        next();
    });
    const v1 = express.Router();
    v1.get("/passenger/bookings", (_req, res) => res.end());
    v1.get("/passenger/bookings/:id/cancel", (_req, res) => res.end());
    v1.get("/driver/status", (_req, res) => res.end());
    v1.get("/driver/rides/active", (_req, res) => res.end());
    v1.post("/socket-tickets/driver", (_req, res) => res.end());
    v1.get("/auth/me", (_req, res) => res.end());
    const v2 = express.Router();
    v2.get("/passenger/bookings", (_req, res) => res.end());
    app.use('/api/v1', v1);
    app.use('/api/v2', v2);
    app.use('/api/places', express.Router());
    app.get("/api/health/auth", (_req, res) => res.end());
    app.get("/api/v1/ping/health", (_req, res) => res.end());

    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const port = (server.address() as AddressInfo).port;

    const PATHS = [
        "/api/v1/passenger/bookings",
        "/api/v1/passenger/bookings/abc/cancel",
        "/api/v1/driver/status",
        "/api/v1/driver/rides/active",
        "/api/v2/passenger/bookings",
        // must NOT trigger
        "/api/v1/socket-tickets/driver",
        "/api/v1/auth/me",
        "/api/v1/ping/health",
        "/api/health/auth",
        "/api/places/search",
        "/api/v1/passenger",
        "/api/v1/driver",
        "/api/v1/driverman/foo",
        "/passenger/bookings",
    ];

    for (const p of PATHS) {
        try {
            await fetch(`http://127.0.0.1:${port}${p}`);
        } catch { /* route may not exist; middleware still ran */ }
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));

    console.log("\n--- what Express actually hands an app-level middleware ---");
    const sample = observed.find((o) => o.url === "/api/v1/passenger/bookings");
    check("app-level middleware sees the FULL path", sample?.path === "/api/v1/passenger/bookings", `path=${sample?.path} url=${sample?.url}`);
    const insideRouterSample = { baseUrl: "(n/a at app level)" };
    void insideRouterSample;

    console.log("\n--- routes that MUST trigger a sweep ---");
    for (const p of ["/api/v1/passenger/bookings", "/api/v1/passenger/bookings/abc/cancel", "/api/v1/driver/status", "/api/v1/driver/rides/active", "/api/v2/passenger/bookings"]) {
        check(`triggers: ${p}`, shouldTriggerSearchSweep(p));
    }

    console.log("\n--- routes that MUST NOT trigger ---");
    for (const p of ["/api/v1/socket-tickets/driver", "/api/v1/auth/me", "/api/v1/ping/health", "/api/health/auth", "/api/places/search", "/api/v1/driverman/foo", "/passenger/bookings"]) {
        check(`does not trigger: ${p}`, !shouldTriggerSearchSweep(p));
    }

    console.log("\n--- bare family roots (no trailing segment) ---");
    // `/api/v1/passenger` with no sub-path is not a real endpoint, but the matcher
    // accepts it deliberately: a future collection route must not silently lose
    // its trigger.
    check("triggers: /api/v1/passenger", shouldTriggerSearchSweep("/api/v1/passenger"));
    check("triggers: /api/v1/driver", shouldTriggerSearchSweep("/api/v1/driver"));

    console.log(`\n=== traffic trigger: ${pass}/${pass + fail} passed ===`);
    if (fail > 0) {
        console.log("FAILURES:");
        failures.forEach((f) => console.log(` - ${f}`));
    }
    process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("harness error", e); process.exit(1); });