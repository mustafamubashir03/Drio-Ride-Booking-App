import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { apiFetch, socketUrl } from "@/lib/runtime-config";

type DriverSocketState = {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  socket: Socket | null;
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
  });

  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectingRef = useRef(false);
  const driverIdRef = useRef(driverId);
  const loginSocketIdRef = useRef<string | null>(null);

  useEffect(() => {
    driverIdRef.current = driverId;
    loginSocketIdRef.current = null;
  }, [driverId]);

  const emitDriverLogin = useCallback(() => {
    const socket = socketRef.current;
    const currentDriverId = driverIdRef.current;
    if (!socket?.connected || !currentDriverId) return;
    if (loginSocketIdRef.current === socket.id) return;
    loginSocketIdRef.current = socket.id!;

    const request = (async () => {
      try {
        const ticket = await requestDriverTicket();
        if (socketRef.current !== socket || !socket.connected) return;
        socket.emit("driver-login", { ticket, driverId: currentDriverId });
      } catch (error) {
        if (socketRef.current !== socket || !socket.connected) return;
        console.error("[DriverSocket] Ticket request failed", error);
        socket.emit("driver-login", { driverId: currentDriverId });
      }
    })();

    return request;
  }, []);

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
      console.log("[DriverSocket] Connected socketId:", socketRef.current?.id);
      setState((prev) => ({
        ...prev,
        connected: true,
        connecting: false,
        error: null,
        socket,
      }));
      void emitDriverLogin();
    });

    socket.on("disconnect", (reason) => {
      connectingRef.current = false;
      if (socketRef.current === socket) {
        loginSocketIdRef.current = null;
      }
      console.log("[DriverSocket] Disconnected, reason:", reason);
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
    });

    socket.on("login-fail", (data) => {
      console.error("[DriverSocket] Login failed:", data);
      loginSocketIdRef.current = null;
      setState((prev) => ({ ...prev, error: data?.message || "Login failed" }));
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

  }, [onNewRideNotification, onRemoveRideNotification, onRideStatusUpdate, emitDriverLogin]);

  const disconnect = useCallback(() => {
    connectingRef.current = false;
    loginSocketIdRef.current = null;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    socketRef.current?.disconnect();
    socketRef.current = null;
    setState({
      connected: false,
      connecting: false,
      error: null,
      socket: null,
    });
  }, []);

  const emitLocation = useCallback((location: DriverLocationData) => {
    if (!socketRef.current?.connected) return;
    if (!driverIdRef.current) return;

    socketRef.current.emit("driver-location", location);
  }, []);

  useEffect(() => {
    if (driverId && socketRef.current?.connected) {
      void emitDriverLogin();
    }
  }, [driverId, emitDriverLogin]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    emitLocation,
  };
}
