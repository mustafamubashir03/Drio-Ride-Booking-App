/**
 * Driver socket login lifecycle.
 *
 * The Socket.IO connection and the driver's dispatch registration are two
 * different things: `connected` only means a websocket is open. The backend can
 * only route a ride request to a socket that completed `driver-login` with a
 * valid ticket, and it answers that explicitly with `login-success` /
 * `login-fail`. This module owns that second half.
 *
 * Why it exists: the previous implementation set "already tried this socket"
 * BEFORE the ticket request completed. A ticket failure therefore left the
 * socket marked as attempted, and because nothing ever retried, the driver sat
 * connected-but-unregistered indefinitely — visible as "online" in the UI and
 * receiving nothing. Approval timing is exactly when that happens: the portal is
 * open, `POST /socket-tickets/driver` answers 403 because the application is not
 * approved yet, and the driver must recover on their own once it is.
 *
 * Rules enforced here:
 *   - a socket is registered ONLY on the server's `login-success`
 *   - a ticketless `driver-login` is never emitted; production rejects it
 *   - one attempt in flight at a time (no duplicate concurrent logins)
 *   - one retry timer at a time, cleared on success, disconnect and dispose
 *   - bounded exponential backoff, capped, and a hard attempt ceiling
 *   - a new socket id always supersedes the previous registration
 */

export const LOGIN_RETRY_BASE_MS = 2_000;
export const LOGIN_RETRY_MAX_MS = 30_000;
/** ~5.5 minutes of retrying at the 30s ceiling before giving up. */
export const LOGIN_RETRY_MAX_ATTEMPTS = 12;

export type DriverLoginState = {
  /** True only after the server confirmed `driver-login` for this socket. */
  registered: boolean;
  /** Human-readable reason the driver is not currently registered, if any. */
  loginError: string | null;
};

export type DriverLoginDeps = {
  /** Resolves a one-time ticket, or rejects (403 while not yet approved). */
  requestTicket: () => Promise<string>;
  /** Sends `driver-login`. Never called without a ticket. */
  emitLogin: (payload: { ticket: string; driverId: string }) => void;
  /** Called whenever the externally-visible login state changes. */
  onStateChange: (state: DriverLoginState) => void;
  /** Injected for deterministic tests. */
  setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
};

export function loginRetryDelay(attempt: number): number {
  const exp = Math.max(0, attempt);
  return Math.min(LOGIN_RETRY_BASE_MS * 2 ** exp, LOGIN_RETRY_MAX_MS);
}

export class DriverLoginMachine {
  private readonly deps: Required<
    Pick<DriverLoginDeps, "requestTicket" | "emitLogin" | "onStateChange">
  > &
    Pick<DriverLoginDeps, "setTimeoutFn" | "clearTimeoutFn">;

  /** socket.id for which the server confirmed registration, else null. */
  private registeredSocketId: string | null = null;
  /** A ticket fetch or an unacknowledged `driver-login` is outstanding. */
  private inFlight = false;
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private currentSocketId: string | null = null;
  private driverId: string | null = null;

  constructor(deps: DriverLoginDeps) {
    this.deps = deps;
  }

  private get setTimeoutFn() {
    return this.deps.setTimeoutFn ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  }

  private get clearTimeoutFn() {
    return this.deps.clearTimeoutFn ?? ((h: ReturnType<typeof setTimeout>) => clearTimeout(h));
  }

  private publish(next: Partial<DriverLoginState>) {
    this.deps.onStateChange({
      registered: next.registered ?? this.registeredSocketId !== null,
      loginError: next.loginError ?? null,
    });
  }

  private clearRetry() {
    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }
  }

  /** A retry is pending; do not stack another attempt on top of it. */
  get retryPending(): boolean {
    return this.timer !== null;
  }

  get attemptCount(): number {
    return this.attempts;
  }

  private scheduleRetry() {
    if (this.disposed) return;
    if (this.timer !== null) return;
    if (this.attempts >= LOGIN_RETRY_MAX_ATTEMPTS) {
      this.publish({ registered: false });
      return;
    }
    const delay = loginRetryDelay(this.attempts);
    this.attempts += 1;
    this.timer = this.setTimeoutFn(() => {
      this.timer = null;
      void this.attempt();
    }, delay);
  }

  /** A new socket connected (including every Socket.IO auto-reconnect). */
  setSocket(socketId: string | null, driverId: string | null) {
    if (this.disposed) return;
    if (this.currentSocketId !== socketId) {
      // A brand new socket id must never inherit the previous registration.
      this.registeredSocketId = null;
      this.inFlight = false;
      this.clearRetry();
      this.attempts = 0;
    }
    this.currentSocketId = socketId;
    this.driverId = driverId;
  }

  /**
   * Attempt registration. Safe to call from any trigger (connect, driver id
   * change, explicit retry): concurrent attempts, duplicate timers and already
   * registered sockets are all no-ops.
   */
  async attempt(): Promise<void> {
    if (this.disposed) return;
    const socketId = this.currentSocketId;
    const driverId = this.driverId;
    if (!socketId || !driverId) return;
    if (this.registeredSocketId === socketId) return;
    if (this.inFlight) return;
    if (this.timer !== null) return;

    this.inFlight = true;
    this.publish({ registered: false, loginError: null });

    let ticket: string;
    try {
      ticket = await this.deps.requestTicket();
    } catch (error) {
      this.inFlight = false;
      const message =
        error instanceof Error ? error.message : "Could not obtain a driver socket ticket";
      // Deliberately NO ticketless `driver-login` here. The server rejects it
      // in production, and emitting it used to mark a dead socket as attempted.
      this.publish({ registered: false, loginError: message });
      this.scheduleRetry();
      return;
    }

    if (this.disposed || this.currentSocketId !== socketId) {
      this.inFlight = false;
      return;
    }

    this.deps.emitLogin({ ticket, driverId });
    // `inFlight` stays true until the server answers. `login-success` and
    // `login-fail` both clear it, which is what prevents a second concurrent
    // `driver-login` while the first is still unanswered.
  }

  /** Server confirmed `driver-login`. The only place registration is set. */
  acknowledgeSuccess(socketId: string) {
    if (this.disposed) return;
    if (this.currentSocketId !== socketId) return;
    this.clearRetry();
    this.attempts = 0;
    this.inFlight = false;
    this.registeredSocketId = socketId;
    this.publish({ registered: true, loginError: null });
  }

  /** Server rejected `driver-login`. Not registered; retry from scratch. */
  acknowledgeFailure(socketId: string, message: string) {
    if (this.disposed) return;
    if (this.currentSocketId !== socketId) return;
    this.clearRetry();
    this.inFlight = false;
    this.registeredSocketId = null;
    this.publish({ registered: false, loginError: message });
    this.scheduleRetry();
  }

  /** Socket closed. Its registration is void; a reconnect starts fresh. */
  socketClosed(socketId: string) {
    if (this.disposed) return;
    if (this.currentSocketId !== socketId) return;
    this.clearRetry();
    this.inFlight = false;
    this.registeredSocketId = null;
    this.attempts = 0;
    this.currentSocketId = null;
    this.publish({ registered: false });
  }

  /** Driver identity became available (session resolved / changed). */
  setDriverId(driverId: string | null) {
    if (this.disposed) return;
    if (this.driverId === driverId) return;
    this.driverId = driverId;
    this.clearRetry();
    this.attempts = 0;
  }

  /** Explicit, user- or caller-triggered retry. */
  retryNow() {
    if (this.disposed) return;
    this.clearRetry();
    this.attempts = 0;
    this.inFlight = false;
    void this.attempt();
  }

  dispose() {
    this.disposed = true;
    this.clearRetry();
    this.inFlight = false;
    this.registeredSocketId = null;
    this.currentSocketId = null;
  }
}