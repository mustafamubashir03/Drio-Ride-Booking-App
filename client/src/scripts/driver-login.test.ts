/**
 * Focused tests for the driver socket login lifecycle.
 *
 * These cover the exact failure that was confirmed in
 * client/src/hooks/use-driver-socket.ts: the "already attempted this socket"
 * marker used to be set BEFORE the ticket request completed, so a failed ticket
 * left the socket permanently marked as attempted with no retry — connected,
 * never registered, receiving nothing.
 *
 * Run: npx ts-node src/scripts/driver-login.test.ts
 */
import {
    DriverLoginMachine,
    loginRetryDelay,
    LOGIN_RETRY_MAX_ATTEMPTS,
    LOGIN_RETRY_MAX_MS,
    type DriverLoginState,
} from "../lib/driver-login";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(cond: boolean, label: string) {
    if (cond) { passed++; console.log(`  PASS ${label}`); }
    else { failed++; failures.push(label); console.error(`  FAIL ${label}`); }
}

const DRIVER = "6ac76ff70f18e9d65bd20478";
const flush = () => new Promise((r) => setImmediate(r));

/** Deterministic timer queue so backoff can be stepped without real waiting. */
function makeClock() {
    let now = 0;
    let seq = 0;
    const queue = new Map<number, { at: number; fn: () => void }>();
    return {
        setTimeoutFn: (fn: () => void, ms: number) => {
            const id = ++seq;
            queue.set(id, { at: now + ms, fn });
            return id as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimeoutFn: (h: ReturnType<typeof setTimeout>) => { queue.delete(h as unknown as number); },
        get pending() { return queue.size; },
        /** Advance virtual time, firing everything due in order. */
        async advance(ms: number) {
            const target = now + ms;
            for (;;) {
                const due = [...queue.entries()]
                    .filter(([, t]) => t.at <= target)
                    .sort((a, b) => a[1].at - b[1].at);
                if (due.length === 0) break;
                const [id, t] = due[0]!;
                queue.delete(id);
                now = t.at;
                t.fn();
                await flush();
            }
            now = target;
            await flush();
        },
    };
}

type Harness = {
    machine: DriverLoginMachine;
    emits: Array<{ ticket: string; driverId: string }>;
    states: DriverLoginState[];
    clock: ReturnType<typeof makeClock>;
    latest: () => DriverLoginState;
    ticketCalls: () => number;
};

function harness(ticket: () => Promise<string>): Harness {
    const clock = makeClock();
    const emits: Array<{ ticket: string; driverId: string }> = [];
    const states: DriverLoginState[] = [];
    let ticketCalls = 0;
    const machine = new DriverLoginMachine({
        requestTicket: () => { ticketCalls += 1; return ticket(); },
        emitLogin: (p) => { emits.push(p); },
        onStateChange: (s) => { states.push(s); },
        setTimeoutFn: clock.setTimeoutFn,
        clearTimeoutFn: clock.clearTimeoutFn,
    });
    return {
        machine,
        emits,
        states,
        clock,
        latest: () => states[states.length - 1] ?? { registered: false, loginError: null },
        ticketCalls: () => ticketCalls,
    };
}

async function main() {
    console.log("\n[backoff-policy]");
    assert(loginRetryDelay(0) === 2_000, "first retry waits 2s");
    assert(loginRetryDelay(1) === 4_000, "second retry waits 4s");
    assert(loginRetryDelay(2) === 8_000, "third retry waits 8s");
    assert(loginRetryDelay(3) === 16_000, "fourth retry waits 16s");
    assert(loginRetryDelay(4) === LOGIN_RETRY_MAX_MS, "backoff is capped at 30s");
    assert(loginRetryDelay(50) === LOGIN_RETRY_MAX_MS, "backoff never exceeds the cap");

    console.log("\n[A] THE CONFIRMED BUG: ticket fails -> must NOT look registered, must retry, must recover]");
    {
        let ticketOk = false;
        const h = harness(() =>
            ticketOk ? Promise.resolve("ticket-abc") : Promise.reject(new Error("Driver ticket request failed with status 403")),
        );
        h.machine.setSocket("sock-A", DRIVER);
        await h.machine.attempt();
        await flush();

        assert(h.emits.length === 0, "no driver-login emitted when the ticket request fails");
        assert(h.latest().registered === false, "driver is NOT reported as registered after a failed ticket");
        assert(h.latest().loginError !== null, "a login error is surfaced");
        assert(h.clock.pending === 1, "exactly one retry timer is scheduled");
        assert(h.ticketCalls() === 1, "no duplicate concurrent ticket requests");

        // The ticket starts succeeding — the approval-timing scenario.
        ticketOk = true;
        await h.clock.advance(2_000);
        assert(h.ticketCalls() === 2, "retry re-requests the ticket after the backoff");
        assert(h.emits.length === 1, "driver-login emitted once the ticket succeeds");
        assert(h.emits[0]?.ticket === "ticket-abc", "the ticket is included in driver-login");
        assert(h.latest().registered === false, "still NOT registered until the server confirms");

        h.machine.acknowledgeSuccess("sock-A");
        assert(h.latest().registered === true, "registered only after the server's login-success");
        assert(h.latest().loginError === null, "login error cleared on success");
        assert(h.clock.pending === 0, "retry timer cleared once registered");
    }

    console.log("\n[B] NEVER emits a ticketless driver-login");
    {
        const h = harness(() => Promise.reject(new Error("network down")));
        h.machine.setSocket("sock-A", DRIVER);
        await h.machine.attempt();
        await flush();
        for (let i = 0; i < 6; i++) await h.clock.advance(30_000);
        assert(h.emits.length === 0, "zero driver-login emissions across 6 failed attempts");
        assert(
            h.emits.every((e) => typeof e.ticket === "string" && e.ticket.length > 0),
            "every emitted login carries a real ticket",
        );
    }

    console.log("\n[C] permanent failure -> bounded retry, then stops (no storm, no infinite loop)");
    {
        const h = harness(() => Promise.reject(new Error("403")));
        h.machine.setSocket("sock-A", DRIVER);
        await h.machine.attempt();
        await flush();
        let total = 0;
        for (let i = 0; i < LOGIN_RETRY_MAX_ATTEMPTS + 6; i++) {
            await h.clock.advance(30_000);
            total = h.ticketCalls();
        }
        // One initial attempt plus at most LOGIN_RETRY_MAX_ATTEMPTS retries.
        assert(
            total === LOGIN_RETRY_MAX_ATTEMPTS + 1,
            `ticket requests stop at the ceiling (initial + ${LOGIN_RETRY_MAX_ATTEMPTS} retries, got ${total})`,
        );
        assert(h.clock.pending === 0, "no timer left dangling after giving up");
        assert(h.latest().registered === false, "never falsely reports registered");
    }

    console.log("\n[D] RECONNECT: socket A registered -> disconnect -> socket B registers");
    {
        const h = harness(() => Promise.resolve("t1"));
        h.machine.setSocket("sock-A", DRIVER);
        await h.machine.attempt();
        await flush();
        h.machine.acknowledgeSuccess("sock-A");
        assert(h.latest().registered === true, "socket A registered");

        h.machine.socketClosed("sock-A");
        assert(h.latest().registered === false, "socket A closing clears its registration");

        h.machine.setSocket("sock-B", DRIVER);
        await h.machine.attempt();
        await flush();
        assert(h.emits.length === 2, "socket B performs its own driver-login");
        h.machine.acknowledgeSuccess("sock-B");
        assert(h.latest().registered === true, "socket B registered");

        // A late acknowledgement for the dead socket A must not resurrect it.
        h.machine.acknowledgeSuccess("sock-A");
        h.machine.setSocket("sock-B", DRIVER);
        await h.machine.attempt();
        await flush();
        assert(h.emits.length === 2, "old socket id cannot block or duplicate the new login");
    }

    console.log("\n[E] server login-fail -> clears registration and retries");
    {
        const ok = true;
        const h = harness(() => (ok ? Promise.resolve("t1") : Promise.reject(new Error("403"))));
        h.machine.setSocket("sock-A", DRIVER);
        await h.machine.attempt();
        await flush();
        h.machine.acknowledgeSuccess("sock-A");
        assert(h.latest().registered === true, "registered before the failure");

        h.machine.acknowledgeFailure("sock-A", "Driver authentication failed");
        assert(h.latest().registered === false, "server rejection clears registration");
        assert(h.latest().loginError === "Driver authentication failed", "rejection reason surfaced");
        assert(h.clock.pending === 1, "rejection schedules a retry");

        await h.clock.advance(2_000);
        assert(h.ticketCalls() === 2, "retry issued after rejection");
        h.machine.acknowledgeSuccess("sock-A");
        assert(h.latest().registered === true, "recovers automatically after a rejection");
    }

    console.log("\n[F] no duplicate concurrent logins while an attempt is unanswered]");
    {
        let release: (() => void) | undefined;
        const h = harness(() => new Promise<string>((res) => { release = () => res("t1"); }));
        h.machine.setSocket("sock-A", DRIVER);
        const a = h.machine.attempt();
        await h.machine.attempt();
        await h.machine.attempt();
        release?.();
        await a;
        await flush();
        assert(h.emits.length === 1, "three concurrent triggers produce exactly one driver-login");
    }

    console.log("\n[G] dispose stops all timers and further attempts]");
    {
        const h = harness(() => Promise.reject(new Error("403")));
        h.machine.setSocket("sock-A", DRIVER);
        await h.machine.attempt();
        await flush();
        assert(h.clock.pending === 1, "retry pending before dispose");
        h.machine.dispose();
        assert(h.clock.pending === 0, "dispose clears the pending retry");
        const before = h.ticketCalls();
        await h.clock.advance(60_000);
        await h.machine.attempt();
        assert(h.ticketCalls() === before, "no ticket requests after dispose");
    }

    console.log("\n[H] driver id arriving late (approval timing) triggers a login without reload]");
    {
        const h = harness(() => Promise.resolve("t1"));
        h.machine.setSocket("sock-A", null);
        await h.machine.attempt();
        await flush();
        assert(h.emits.length === 0, "no login without a driver id");
        h.machine.setDriverId(DRIVER);
        await h.machine.attempt();
        await flush();
        assert(h.emits.length === 1, "login runs as soon as the driver id is known");
    }

    console.log(`\n=========== ${passed} passed, ${failed} failed ===========`);
    if (failures.length) console.log("Failures:\n  - " + failures.join("\n  - "));
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error("fatal", e);
    process.exit(1);
});