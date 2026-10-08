import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { apiFetch, socketUrl } from "@/lib/runtime-config";
import { DriverLoginMachine, type DriverLoginState } from "@/lib/driver-login";

type DriverSocketState = {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  socket: Socket | null;
  /** True only after the socket-server confirmed `driver-login`. */
  registered: boolean;
  /** Why the driver is connected but not registered, if that is the case. */
  loginError: string | null;
};

interface DriverLocationData {
  driverId: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

interface RideNotificationData {
  rideId: string;
  rideInfo: {
    pickup: string;
    destination: string;
    fare: number;
    distance?: number;
    passengerName?: string;
    passengerImage?: string | null;
  };
  timeStamps: string;
}

export interface DriverRideStatusUpdateData {
  rideId: string;
  status: string;
  driverId?: string | null;
  timeStamps?: string;
}

const requestDriverTicket = async () => {
  const response = await apiFetch("/api/v1/socket-tickets/driver", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Driver ticket request failed with status ${response.status}`);
  }

  const data = (await response.json()) as { ticket?: unknown };
  if (typeof data.ticket !== "string" || data.ticket.length === 0) {
    throw new Error("Driver ticket response did not include a ticket");
  }
  return data.ticket;
};

export function useDriverSocket(
  driverId?: string,
  onNewRideNotification?: (data: RideNotificationData) => void,
  onRemoveRideNotification?: (rideId: string) => void,
  onRideStatusUpdate?: (data: DriverRideStatusUpdateData) => void,
) {
  const [state, setState] = useState<DriverSocketState>({
    connected: false,
    connecting: false,
    error: null,
    socket: null,
    registered: false,
    loginError: null,
  });

  const socketRef = useRef<Socket | null>(null);
  const connectingRef = useRef(false);
  const driverIdRef = useRef(driverId);
  /**
   * Owns the driver-login lifecycle: ticket acquisition, the wait for the
   * server's `login-success`, and bounded retry. "Registered" is only ever set
   * by that server acknowledgement, so `connected` can no longer be mistaken for
   * "dispatchable".
   *
   * Held in a REF, deliberately not state. `connect` is invoked by
   * DriverLayout's mount effect (`deps: []`), so it is the render-1 instance
   * that binds the socket listeners. With the machine in state, those listeners
   * closed over the render-1 value `login = null`, so every
   * `login?.setSocket()` / `login?.attempt()` inside them was a permanent
   * no-op: a portal mounting while already online never requested a ticket and
   * never emitted `driver-login`, and sat on "Connecting" forever until an
   * Offline -> Online toggle, whose `retryLogin` happened to carry the current
   * machine. A ref is read at call time, so the handlers always see the live
   * instance.
   */
  const loginRef = useRef<DriverLoginMachine | null>(null);

  useEffect(() => {
    const machine = new DriverLoginMachine({
      requestTicket: requestDriverTicket,
      emitLogin: (payload) => {
        socketRef.current?.emit("driver-login", payload);
      },
      onStateChange: (next: DriverLoginState) => {
        setState((prev) => ({ ...prev, registered: next.registered, loginError: next.loginError }));
      },
    });
    machine.setDriverId(driverIdRef.current ?? null);
    loginRef.current = machine;
    return () => {
      machine.dispose();
      if (loginRef.current === machine) loginRef.current = null;
    };
  }, []);

  useEffect(() => {
    driverIdRef.current = driverId;
    const machine = loginRef.current;
    machine?.setDriverId(driverId ?? null);
    // A driver id arriving late (session resolved, or approval just granted) is
    // the trigger for a login attempt — no page reload required.
    if (driverId) void machine?.attempt();
  }, [driverId]);

  const connect = useCallback(() => {
    if (socketRef.current || connectingRef.current) return;
    connectingRef.current = true;

    setState((prev) => ({ ...prev, connecting: true, error: null }));

    const currentSocketUrl = socketUrl || window.location.origin;
    const socket = io(currentSocketUrl, {
      transports: ["websocket", "polling"],
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      connectingRef.current = false;
      console.log("[DriverSocket] Connected socketId:", socket.id);
      setState((prev) => ({
        ...prev,
        connected: true,
        connecting: false,
        error: null,
        socket,
      }));
      // Every connect — first one and every auto-reconnect — re-attempts the
      // login for the new socket id, against the CURRENT machine.
      const machine = loginRef.current;
      if (!machine) return;
      machine.setSocket(socket.id ?? null, driverIdRef.current ?? null);
      void machine.attempt();
    });

    socket.on("disconnect", (reason) => {
      connectingRef.current = false;
      console.log("[DriverSocket] Disconnected, reason:", reason);
      loginRef.current?.socketClosed(socket.id ?? "");
      setState((prev) => ({
        ...prev,
        connected: false,
        connecting: false,
      }));
    });

    socket.on("connect_error", (err) => {
      connectingRef.current = false;
      console.error("[DriverSocket] Connection error:", err.message);
      setState((prev) => ({
        ...prev,
        connecting: false,
        error: err.message,
      }));
    });

    socket.on("login-success", () => {
      console.log("[DriverSocket] Login success");
      loginRef.current?.acknowledgeSuccess(socket.id ?? "");
    });

    socket.on("login-fail", (data) => {
      console.error("[DriverSocket] Login failed:", data?.message);
      loginRef.current?.acknowledgeFailure(
        socket.id ?? "",
        data?.message || "Driver authentication failed",
      );
    });

    socket.on("new_ride_notification", (data: RideNotificationData) => {
      console.log("[DriverSocket] New ride notification RECEIVED:", JSON.stringify(data, null, 2));
      onNewRideNotification?.(data);
    });

    socket.on("remove_ride_notification", (rideId: string) => {
      console.log("[DriverSocket] Remove ride notification:", rideId);
      onRemoveRideNotification?.(rideId);
    });

    socket.on("ride_status_update", (data: DriverRideStatusUpdateData) => {
      console.log("[DriverSocket] Ride status update RECEIVED:", JSON.stringify(data, null, 2));
      onRideStatusUpdate?.(data);
    });

  }, [onNewRideNotification, onRemoveRideNotification, onRideStatusUpdate]);

  /** Force a fresh login attempt now. Safe to call at any time. */
  const retryLogin = useCallback(() => {
    const machine = loginRef.current;
    if (!machine) return;
    machine.setSocket(socketRef.current?.id ?? null, driverIdRef.current ?? null);
    machine.retryNow();
  }, []);

  const disconnect = useCallback(() => {
    connectingRef.current = false;
    loginRef.current?.socketClosed(socketRef.current?.id ?? "");
    socketRef.current?.disconnect();
    socketRef.current = null;
    setState({
      connected: false,
      connecting: false,
      error: null,
      socket: null,
      registered: false,
      loginError: null,
    });
  }, []);

  // Deliberately NOT gated on `registered`: GPS streaming and socket
  // registration are independent signals, and the socket-server decides
  // whether it can accept a `driver-location`. Coupling them here would hide
  // which of the two is unhealthy.
  const emitLocation = useCallback((location: DriverLocationData) => {
    if (!socketRef.current?.connected) return;
    if (!driverIdRef.current) return;

    socketRef.current.emit("driver-location", location);
  }, []);

  // The login machine disposes itself in its own creation effect's cleanup.
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    retryLogin,
    emitLocation,
  };
}
