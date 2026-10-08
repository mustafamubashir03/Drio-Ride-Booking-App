/**
 * Regression test for the driver socket lifecycle.
 *
 * Reproduces the CONFIRMED production bug: a driver portal that mounted while
 * availability was already "online" never requested a ticket and never emitted
 * `driver-login`, because the socket listeners had been bound by the render-1
 * `connect()` while the login machine was still `null`.
 *
 * The harness models React honestly:
 *   - every render produces a FRESH scope, so a closure captures that render's
 *     values, not the latest ones;
 *   - refs are stable across renders;
 *   - effects run with the closures of the render that declared them.
 *
 * It mounts the hook in two wirings:
 *   mode "ref"    - the fix: machine held in a ref, absent from callback deps
 *   mode "legacy" - the bug: machine held in state and present in callback deps
 *
 * The "legacy" assertions are expected to FAIL. They exist so this test provably
 * discriminates: if someone reintroduces the state+deps wiring, Case A fails.
 *
 * Run: compile to a neutral dir then `node <out>/scripts/driver-login-lifecycle.test.js`
 */
import { DriverLoginMachine, type DriverLoginState } from "../lib/driver-login";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(cond: boolean, label: string) {
    if (cond) { passed++; console.log(`  PASS ${label}`); }
    else { failed++; failures.push(label); console.error(`  FAIL ${label}`); }
}
const flush = () => new Promise((r) => setImmediate(r));
const DRIVER = "6ab59048d0b14cd60cd48cad";

type Listener = (arg?: unknown) => void;

class FakeSocket {
    id: string;
    connected = false;
    listenerCount = 0;
    private handlers = new Map<string, Listener[]>();
    constructor(id: string) { this.id = id; }
    on(ev: string, fn: Listener) {
        const list = this.handlers.get(ev) ?? [];
        list.push(fn);
        this.handlers.set(ev, list);
        this.listenerCount += 1;
    }
    fire(ev: string, arg?: unknown) { for (const fn of [...(this.handlers.get(ev) ?? [])]) fn(arg); }
    countFor(ev: string) { return (this.handlers.get(ev) ?? []).length; }
    static seq = 0;
    static nextId() { return `sock-${++FakeSocket.seq}`; }
}

/** Stands in for the socket-server's `driver-socket` Redis hash. */
const driverSocketRegistry = new Map<string, string>();
let ticketCounter = 0;

/** Stands in for the real socket-server: validates the ticket, then registers. */
function serverHandleDriverLogin(socket: FakeSocket, payload: { ticket?: string; driverId?: string }) {
    if (!payload.ticket || !payload.driverId) {
        socket.fire("login-fail", { message: "Driver authentication failed" });
        return;
    }
    if (!validTickets.has(payload.ticket)) {
        socket.fire("login-fail", { message: "Driver authentication failed" });
        return;
    }
    driverSocketRegistry.set(payload.driverId, socket.id);
    socket.fire("login-success", { message: "ok" });
}
const validTickets = new Set<string>();

type Mode = "ref" | "legacy";

function mountHook(opts: { mode: Mode; availability: "online" | "offline"; driverId?: string }) {
    const emitted: Array<{ ticket?: string; driverId?: string }> = [];
    let ticketRequests = 0;
    let ticketFails = false;
    const state = { registered: false, loginError: null as string | null, connected: false };

    // ---- stable across renders, like real refs ----
    const socketRef = { current: null as FakeSocket | null };
    const connectingRef = { current: false };
    const driverIdRef = { current: opts.driverId };
    const loginRef = { current: null as DriverLoginMachine | null };          // the FIX
    const loginState = { current: null as DriverLoginMachine | null };        // the BUG's shape

    const makeMachine = () => {
        const m = new DriverLoginMachine({
            requestTicket: async () => {
                ticketRequests += 1;
                if (ticketFails) throw new Error("Driver ticket request failed with status 403");
                const t = `tkt-${++ticketCounter}`;
                validTickets.add(t);
                return t;
            },
            emitLogin: (p) => { emitted.push(p); serverHandleDriverLogin(socketRef.current!, p); },
            onStateChange: (s: DriverLoginState) => {
                state.registered = s.registered;
                state.loginError = s.loginError;
            },
        });
        m.setDriverId(driverIdRef.current ?? null);
        return m;
    };

    /** ONE render. `machine` is that render's VIEW of the machine. */
    const render = (machine: DriverLoginMachine | null) => {
        // The decisive difference between the two wirings:
        //   "ref"    -> read the stable container at CALL time (always current)
        //   "legacy" -> the value this render captured (frozen, like a closure)
        const live = () => (opts.mode === "ref" ? loginRef.current : machine);
        const dependsOnMachine = opts.mode === "legacy";

        const connect = () => {
            if (socketRef.current || connectingRef.current) return;
            connectingRef.current = true;
            const socket = new FakeSocket(FakeSocket.nextId());
            socketRef.current = socket;
            socket.on("connect", () => {
                connectingRef.current = false;
                state.connected = true;
                const m = live();
                if (!m) return;
                m.setSocket(socket.id ?? null, driverIdRef.current ?? null);
                void m.attempt();
            });
            socket.on("disconnect", () => {
                connectingRef.current = false;
                state.connected = false;
                live()?.socketClosed(socket.id ?? "");
            });
            socket.on("login-success", () => { live()?.acknowledgeSuccess(socket.id ?? ""); });
            socket.on("login-fail", (d) => {
                live()?.acknowledgeFailure(socket.id ?? "", (d as { message?: string })?.message ?? "failed");
            });
        };

        const retryLogin = () => {
            const m = live();
            if (!m) return;
            m.setSocket(socketRef.current?.id ?? null, driverIdRef.current ?? null);
            m.retryNow();
        };

        // effect B: [driverId]
        const effectB = () => {
            const m = live();
            m?.setDriverId(opts.driverId ?? null);
            if (opts.driverId) void m?.attempt();
        };

        // effect A: [] — create the machine and publish it the way this mode does
        const effectA = () => {
            const m = makeMachine();
            if (opts.mode === "ref") loginRef.current = m;
            else loginState.current = m;
            return m;
        };

        const unmount = () => {
            socketRef.current?.fire("disconnect", "unmount");
            socketRef.current?.disconnect?.();
            socketRef.current = null;
            connectingRef.current = false;
            live()?.dispose?.();
            if (opts.mode === "ref") loginRef.current = null;
            else loginState.current = null;
        };

        return { connect, retryLogin, effectB, effectA, unmount, dependsOnMachine };
    };

    // ---- commit render 1: the login machine does not exist yet ----
    const r1 = render(null);
    r1.effectA();                              // machine created
    r1.effectB();                              // render-1 closure
    // DriverLayout's mount effect has deps [], so it captures render 1's connect.
    const connectFromMount = r1.connect;

    // ---- render 2: `login` state changed (legacy) / ref unchanged (fix) ----
    const r2 = render(opts.mode === "legacy" ? loginState.current : loginRef.current);
    r2.effectB();                              // deps [driverId, login] changed -> re-runs

    return {
        state, emitted, socketRef,
        ticketRequests: () => ticketRequests,
        mountLayout: async () => { if (opts.availability === "online") connectFromMount(); },
        fireConnect: () => socketRef.current?.fire("connect"),
        fireDisconnect: () => socketRef.current?.fire("disconnect", "transport close"),
        // DriverHome calls retryLogin from the CURRENT render
        retryLogin: () => r2.retryLogin(),
        toggleOnline: () => { r2.connect(); r2.retryLogin(); },
        setDriverId: (v: string) => {
            opts.driverId = v;
            driverIdRef.current = v;
            const m = r2.dependsOnMachine ? loginState.current : loginRef.current;
            m?.setDriverId(v);
            void m?.attempt();
        },
        setTicketFails: (v: boolean) => { ticketFails = v; },
        unmount: () => r1.unmount(),
        reset: () => { driverSocketRegistry.clear(); validTickets.clear(); },
    };
}

async function main() {
    console.log("\n================ CASE A (FIXED WIRING): mount while already online ================");
    {
        const h = mountHook({ mode: "ref", availability: "online", driverId: DRIVER });
        await h.mountLayout();
        h.fireConnect();
        await flush(); await flush();
        console.log(`   tickets=${h.ticketRequests()} emitted=${h.emitted.length} registered=${h.state.registered} redisDriverSocket=${driverSocketRegistry.get(DRIVER)}`);
        assert(h.ticketRequests() >= 1, "A: driver ticket WAS requested");
        assert(h.emitted.length >= 1, "A: driver-login WAS emitted");
        assert(h.emitted.every((e) => Boolean(e.ticket)), "A: every login carried a ticket");
        assert(h.state.registered === true, "A: registered=true (no Offline->Online toggle needed)");
        assert(
            driverSocketRegistry.get(DRIVER) === h.socketRef.current?.id,
            "A: registry holds the CURRENT socket id",
        );
        h.reset(); h.unmount();
    }

    console.log("\n================ CASE A' (LEGACY WIRING): same scenario, old code shape ================");
    {
        const h = mountHook({ mode: "legacy", availability: "online", driverId: DRIVER });
        await h.mountLayout();
        h.fireConnect();
        await flush(); await flush();
        console.log(`   tickets=${h.ticketRequests()} emitted=${h.emitted.length} registered=${h.state.registered}`);
        assert(h.ticketRequests() === 0, "A': legacy wiring requests NO ticket (the bug)");
        assert(h.emitted.length === 0, "A': legacy wiring emits NO driver-login (the bug)");
        assert(h.state.registered === false, "A': legacy wiring stays registered=false -> 'Connecting' forever");
        console.log("   (A' assertions are EXPECTED failures for the old code — they prove the test discriminates)");
        h.reset(); h.unmount();
    }

    console.log("\n================ CASE B: mount while offline, then Go Online ================");
    {
        const h = mountHook({ mode: "ref", availability: "offline", driverId: DRIVER });
        await h.mountLayout();
        await flush();
        assert(h.socketRef.current === null, "B: no socket created while offline");
        assert(h.ticketRequests() === 0, "B: no ticket requested while offline");
        h.toggleOnline();
        await flush(); await flush();
        console.log(`   after Go Online: tickets=${h.ticketRequests()} emitted=${h.emitted.length} registered=${h.state.registered}`);
        assert(h.ticketRequests() >= 1, "B: Go Online triggers a login");
        assert(h.state.registered === true, "B: registration succeeds after Go Online");
        h.reset(); h.unmount();
    }

    console.log("\n================ CASE C: passenger -> driver (mount after unmount) ================");
    {
        const first = mountHook({ mode: "ref", availability: "online", driverId: DRIVER });
        await first.mountLayout();
        first.fireConnect();
        await flush(); await flush();
        const firstSocketId = first.socketRef.current?.id;
        assert(first.state.registered === true, "C: first mount registered");
        first.unmount();
        assert(first.socketRef.current === null, "C: old socket cleaned up on unmount");

        const second = mountHook({ mode: "ref", availability: "online", driverId: DRIVER });
        await second.mountLayout();
        second.fireConnect();
        await flush(); await flush();
        const secondSocketId = second.socketRef.current?.id;
        console.log(`   socket1=${firstSocketId} socket2=${secondSocketId} registered=${second.state.registered}`);
        assert(secondSocketId !== firstSocketId, "C: remount creates a NEW socket");
        assert(second.state.registered === true, "C: remount registers with the current machine");
        assert(driverSocketRegistry.get(DRIVER) === secondSocketId, "C: registry holds the NEW socket id");
        second.reset(); second.unmount();
    }

    console.log("\n================ CASE D: repeated driver <-> passenger switching ================");
    {
        const sockets: string[] = [];
        let last: ReturnType<typeof mountHook> | null = null;
        for (let i = 0; i < 4; i++) {
            last = mountHook({ mode: "ref", availability: "online", driverId: DRIVER });
            await last.mountLayout();
            last.fireConnect();
            await flush(); await flush();
            const s = last.socketRef.current!;
            sockets.push(s.id);
            assert(s.countFor("connect") === 1, `D[${i}]: exactly one 'connect' listener, no duplicates`);
            assert(last.state.registered === true, `D[${i}]: registered on switch ${i}`);
            last.unmount();
        }
        const unique = new Set(sockets);
        assert(unique.size === sockets.length, "D: every switch produced a distinct socket id");
        console.log(`   sockets=${JSON.stringify(sockets)}`);
        last!.reset(); last!.unmount();
    }

    console.log("\n================ CASE E: Socket.IO auto-reconnect ================");
    {
        const h = mountHook({ mode: "ref", availability: "online", driverId: DRIVER });
        await h.mountLayout();
        h.fireConnect();
        await flush(); await flush();
        const firstId = h.socketRef.current!.id;
        assert(driverSocketRegistry.get(DRIVER) === firstId, "E: registered on first socket");

        // Socket.IO reuses the same client instance across a reconnect but gives
        // it a NEW id. No fresh render is required: the listener reads the
        // machine through the ref at call time.
        h.fireDisconnect();
        h.socketRef.current!.id = FakeSocket.nextId();
        h.fireConnect();
        await flush(); await flush();
        const newId = h.socketRef.current!.id;
        console.log(`   old=${firstId} new=${newId} registered=${h.state.registered} redis=${driverSocketRegistry.get(DRIVER)}`);
        assert(newId !== firstId, "E: reconnect produced a new socket id");
        assert(h.state.registered === true, "E: re-registered after reconnect");
        assert(driverSocketRegistry.get(DRIVER) === newId, "E: registry holds the NEW socket id, not the stale one");
        assert(h.emitted.length >= 2, "E: a fresh driver-login was emitted for the new socket");
        h.reset(); h.unmount();
    }

    console.log("\n================ CASE F: ticket fails, then recovers ================");
    {
        const h = mountHook({ mode: "ref", availability: "online", driverId: DRIVER });
        h.setTicketFails(true);
        await h.mountLayout();
        h.fireConnect();
        await flush(); await flush();
        console.log(`   while failing: tickets=${h.ticketRequests()} emitted=${h.emitted.length} registered=${h.state.registered}`);
        assert(h.emitted.length === 0, "F: no ticketless driver-login emitted");
        assert(h.state.registered === false, "F: not registered while the ticket fails");

        h.setTicketFails(false);
        // the machine schedules its own bounded retry; drive the clock
        await new Promise((r) => setTimeout(r, 2500));
        await flush(); await flush();
        console.log(`   after recovery: tickets=${h.ticketRequests()} emitted=${h.emitted.length} registered=${h.state.registered}`);
        assert(h.ticketRequests() >= 2, "F: the ticket was retried");
        assert(h.emitted.length >= 1, "F: driver-login emitted once the ticket succeeded");
        assert(h.state.registered === true, "F: registered after recovery");
        h.reset(); h.unmount();
    }

    console.log("\n================ CASE G: driver id arrives late ================");
    {
        const h = mountHook({ mode: "ref", availability: "online", driverId: undefined });
        await h.mountLayout();
        h.fireConnect();
        await flush(); await flush();
        assert(h.ticketRequests() === 0, "G: no login without a driver id");
        h.setDriverId(DRIVER);
        await flush(); await flush();
        console.log(`   after driverId: tickets=${h.ticketRequests()} emitted=${h.emitted.length} registered=${h.state.registered}`);
        assert(h.state.registered === true, "G: registers once the driver id resolves (session/approval timing)");
        h.reset(); h.unmount();
    }

    console.log(`\n=========== ${passed} passed, ${failed} failed ===========`);
    if (failures.length) console.log("Failures:\n  - " + failures.join("\n  - "));
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error("fatal", e);
    process.exit(1);
});