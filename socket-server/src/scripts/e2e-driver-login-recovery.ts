/**
 * Runtime proof that driver socket registration is now SELF-HEALING.
 *
 * Drives the REAL `DriverLoginMachine` (the same module the browser hook uses)
 * against a REAL socket-server and the REAL Redis:
 *
 *   Phase 1  socket connects while the driver ticket endpoint is FAILING
 *            -> must NOT register, must NOT fake success, must keep retrying
 *   Phase 2  ticket starts succeeding (approval granted)
 *            -> must register with no page reload, no manual action
 *   Phase 3  socket drops and Socket.IO reconnects
 *            -> must re-register, and Redis must end up on the NEW socket id
 *   Phase 4  a real driver-location fix makes the driver GEO-eligible
 *
 * Requires DRIVER_LOGIN_MODULE to point at the compiled driver-login module.
 */
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { io, type Socket } from "socket.io-client";
import { createClient } from "redis";

const REDIS_URI = process.env.REDIS_URI!;
const SOCKET_URL = process.env.E2E_SOCKET_URL!;
const DRIVER_ID = process.env.E2E_DRIVER_ID!;
const LAT = Number(process.env.E2E_LAT!);
const LNG = Number(process.env.E2E_LNG!);
const RUN_ID = process.env.E2E_RUN_ID!;
const TICKET_HOLDS_MS = Number(process.env.E2E_TICKET_HOLDS_MS || 7000);
const DRIVER_LOGIN_MODULE = process.env.DRIVER_LOGIN_MODULE!;

const flag = (n: string) => `e2elogin:${RUN_ID}:${n}`;

const TS_NODE_BIN = path.join(__dirname, "..", "..", "node_modules", "ts-node", "dist", "bin.js");
const children: ChildProcess[] = [];
function cleanup() { for (const c of children) { try { c.kill(); } catch { /* gone */ } } }

function startSocketServer() {
    const child = spawn(process.execPath, [TS_NODE_BIN, "src/server.ts"], {
        cwd: path.join(__dirname, "..", ".."),
        env: {
            ...process.env,
            PORT: String(new URL(SOCKET_URL).port || 5099),
            NODE_ENV: "development",
            REDIS_URI,
            MAIN_API_URL: "http://127.0.0.1:3000",
            TRUSTED_ORIGINS: "http://localhost:5173",
            TS_NODE_TRANSPILE_ONLY: "true",
        },
        stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (d: Buffer) => {
        const s = d.toString();
        if (/Driver registered|driver-login|login-fail|NO EMIT|emitted new_ride/.test(s)) {
            console.log(`[socket-server] ${s.trim().slice(0, 210)}`);
        }
    });
    child.stderr?.on("data", (d: Buffer) => {
        if (process.env.E2E_VERBOSE) console.log(`[socket-server:err] ${d.toString().trimEnd()}`);
    });
    children.push(child);
    return child;
}

async function waitForSocketServer() {
    for (let i = 0; i < 60; i++) {
        try {
            const res = await fetch(`${SOCKET_URL}/api/v1/notification/notify-drivers`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rideId: "p", driverIds: [], rideInfo: {} }),
            });
            if (res.ok) return true;
        } catch { /* not up yet */ }
        await sleep(500);
    }
    return false;
}

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(cond: boolean, label: string) {
    if (cond) { passed++; console.log(`  PASS ${label}`); }
    else { failed++; failures.push(label); console.error(`  FAIL ${label}`); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const flush = () => new Promise((r) => setImmediate(r));

async function main() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(DRIVER_LOGIN_MODULE) as typeof import("../../client/src/lib/driver-login");
    const { DriverLoginMachine } = mod;
    if (!DriverLoginMachine) throw new Error("DriverLoginMachine not exported from module");

    const redis = createClient({ url: REDIS_URI });
    redis.on("error", () => undefined);
    await redis.connect();

    startSocketServer();
    if (!(await waitForSocketServer())) {
        console.error("[driver] socket-server did not come up");
        cleanup();
        process.exit(1);
    }

    const states: Array<{ registered: boolean; loginError: string | null }> = [];
    const emits: Array<{ ticket: string; driverId: string }> = [];
    let ticketAttempts = 0;

    // Simulates POST /api/v1/socket-tickets/driver. It REFUSES until
    // TICKET_HOLDS_MS has elapsed, which is exactly what a not-yet-approved
    // driver sees as a 403.
    const requestTicket = async () => {
        ticketAttempts += 1;
        if (Date.now() - startedAt < TICKET_HOLDS_MS) {
            throw new Error("Driver ticket request failed with status 403");
        }
        const ticket = `e2eloginticket${Date.now()}${Math.floor(Math.random() * 1e6)}`;
        await redis.set(
            `socket-ticket:${ticket}`,
            JSON.stringify({ userId: DRIVER_ID, role: "passenger", purpose: "driver", expiry: Date.now() + 60_000 }),
            { EX: 60 },
        );
        return ticket;
    };

    const startedAt = Date.now();
    const socket: Socket = io(SOCKET_URL, { transports: ["websocket"], reconnection: true, reconnectionDelay: 300, reconnectionAttempts: 20 });

    const machine = new DriverLoginMachine({
        requestTicket,
        emitLogin: (payload) => {
            emits.push(payload);
            socket.emit("driver-login", payload);
        },
        onStateChange: (s) => states.push(s),
    });

    socket.on("connect", () => {
        console.log(`[driver] connected socketId=${socket.id}`);
        machine.setSocket(socket.id ?? null, DRIVER_ID);
        void machine.attempt();
    });
    socket.on("login-success", () => {
        console.log(`[driver] login-success socketId=${socket.id}`);
        machine.acknowledgeSuccess(socket.id ?? "");
    });
    socket.on("login-fail", (d) => {
        console.log(`[driver] login-fail ${JSON.stringify(d)}`);
        machine.acknowledgeFailure(socket.id ?? "", d?.message || "failed");
    });
    socket.on("driver-location", () => { /* ignore */ });

    // ── Phase 1: ticket is failing ────────────────────────────────────────
    console.log("\n--- PHASE 1: ticket endpoint failing (driver not yet approved) ---");
    await sleep(6_000);
    const reg1 = states[states.length - 1];
    console.log(`[driver] ticketAttempts=${ticketAttempts} registered=${reg1?.registered} emits=${emits.length}`);
    assert(emits.length === 0, "PHASE1: no driver-login emitted while the ticket is refused");
    assert(reg1?.registered === false, "PHASE1: NOT reported as registered while the ticket is refused");
    assert(ticketAttempts >= 2, `PHASE1: kept retrying the ticket (attempts=${ticketAttempts})`);
    assert(machine.retryPending, "PHASE1: a retry is still pending (self-healing armed)");
    assert((await redis.hGet("driver-socket", DRIVER_ID)) === null, "PHASE1: no driverId->socketId mapping written");

    // ── Phase 2: ticket starts succeeding (approval granted) ───────────────
    console.log("\n--- PHASE 2: ticket endpoint now succeeding (approval granted) ---");
    await sleep(14_000);
    const mapped = await redis.hGet("driver-socket", DRIVER_ID);
    const reg2 = states[states.length - 1];
    console.log(`[driver] ticketAttempts=${ticketAttempts} emits=${emits.length} registered=${reg2?.registered} mapped=${mapped} socketId=${socket.id}`);
    assert(emits.length >= 1, "PHASE2: driver-login emitted after the ticket began succeeding");
    assert(emits.every((e) => typeof e.ticket === "string" && e.ticket.length > 0), "PHASE2: every login carried a real ticket");
    assert(reg2?.registered === true, "PHASE2: registered=true only after the server's login-success");
    assert(mapped === socket.id, `PHASE2: Redis maps driverId -> the current socketId (${mapped})`);
    assert(!machine.retryPending, "PHASE2: retry timer cleared once registered");
    const firstSocketId = socket.id;

    // ── Phase 3: disconnect + reconnect ────────────────────────────────────
    console.log("\n--- PHASE 3: socket drops, Socket.IO reconnects ---");
    socket.io.engine.close();
    await sleep(400);
    await redis.hDel("driver-socket", DRIVER_ID);
    await sleep(6_000);
    const mapped2 = await redis.hGet("driver-socket", DRIVER_ID);
    const reg3 = states[states.length - 1];
    console.log(`[driver] after reconnect socketId=${socket.id} (was ${firstSocketId}) mapped=${mapped2} registered=${reg3?.registered} emits=${emits.length}`);
    assert(socket.id !== firstSocketId, "PHASE3: Socket.IO produced a new socket id");
    assert(reg3?.registered === true, "PHASE3: registered again on the new socket without a page reload");
    assert(mapped2 === socket.id, "PHASE3: Redis holds the NEW socketId, not the stale one");

    // ── Phase 4: location heartbeat makes the driver GEO-eligible ──────────
    console.log("\n--- PHASE 4: location heartbeat ---");
    socket.emit("driver-location", { latitude: LAT, longitude: LNG, accuracy: 5, heading: 0, speed: 0, timestamp: Date.now() });
    await sleep(1500);
    const members = await redis.zRange("drivers", 0, -1);
    const ttl = await redis.ttl(`driver-location:${DRIVER_ID}`);
    console.log(`[driver] inGeo=${members.includes(DRIVER_ID)} freshnessTtl=${ttl}`);
    assert(members.includes(DRIVER_ID), "PHASE4: driver present in the GEO index");
    assert(ttl > 0, `PHASE4: location freshness key alive (ttl=${ttl})`);

    await redis.set(flag("done"), "1", { EX: 10 });
    console.log(`\n=========== ${passed} passed, ${failed} failed ===========`);
    if (failures.length) console.log("Failures:\n  - " + failures.join("\n  - "));

    socket.close();
    await redis.del([`driver-location:${DRIVER_ID}`]);
    await redis.zRem("drivers", DRIVER_ID);
    await redis.hDel("driver-socket", DRIVER_ID);
    await redis.del(flag("done"));
    await redis.quit();
    cleanup();
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error("[driver] fatal", e);
    cleanup();
    process.exit(1);
});