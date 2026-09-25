import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { apiFetch, socketUrl } from "@/lib/runtime-config";

type PassengerSocketState = {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  socket: Socket | null;
};

export type PassengerSearchProgress = {
  stage: number;
  radiusKm: number;
};

export type PassengerCancellationBy = "passenger" | "driver" | "system";

export interface RideStatusUpdateData {
  rideId: string;
  status: string | null;
  driverId?: string | null;
  searchProgress?: PassengerSearchProgress | null;
  cancelledBy?: PassengerCancellationBy | null;
  timeStamps?: string;
}

export interface DriverLocationData {
  rideId?: string;
  driverId: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp?: number;
  timeStamps?: string;
}

interface UsePassengerSocketOptions {
  passengerId?: string;
  onRideStatusUpdate?: (data: RideStatusUpdateData) => void;
  onDriverLocation?: (data: DriverLocationData) => void;
}

const requestPassengerTicket = async () => {
  const response = await apiFetch("/api/v1/socket-tickets/passenger", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Passenger ticket request failed with status ${response.status}`);
  }

  const data = (await response.json()) as { ticket?: unknown };
  if (typeof data.ticket !== "string" || data.ticket.length === 0) {
    throw new Error("Passenger ticket response did not include a ticket");
  }
  return data.ticket;
};

export function usePassengerSocket({
  passengerId,
  onRideStatusUpdate,
  onDriverLocation,
}: UsePassengerSocketOptions) {
  const [state, setState] = useState<PassengerSocketState>({
    connected: false,
    connecting: false,
    error: null,
    socket: null,
  });

  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loginSocketIdRef = useRef<string | null>(null);
  const onRideStatusUpdateRef = useRef(onRideStatusUpdate);
  const onDriverLocationRef = useRef(onDriverLocation);

  useEffect(() => {
    onRideStatusUpdateRef.current = onRideStatusUpdate;
    onDriverLocationRef.current = onDriverLocation;
  });

  const emitPassengerLogin = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected || loginSocketIdRef.current === socket.id) return;
    loginSocketIdRef.current = socket.id!;

    const request = (async () => {
      try {
        const ticket = await requestPassengerTicket();
        if (socketRef.current !== socket || !socket.connected) return;
        socket.emit("passenger-login", { ticket });
      } catch (error) {
        if (socketRef.current !== socket || !socket.connected) return;
        console.error("[PassengerSocket] Ticket request failed", error);
        socket.emit("passenger-login");
      }
    })();

    return request;
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;
    if (state.connecting) return;

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
      console.log("[PassengerSocket] Connected socketId:", socketRef.current?.id);
      setState((prev) => ({
        ...prev,
        connected: true,
        connecting: false,
        error: null,
        socket,
      }));
      void emitPassengerLogin();
    });

    socket.on("disconnect", (reason) => {
      if (socketRef.current === socket) {
        loginSocketIdRef.current = null;
      }
      console.log("[PassengerSocket] Disconnected, reason:", reason);
      setState((prev) => ({
        ...prev,
        connected: false,
        connecting: false,
      }));
    });

    socket.on("connect_error", (err) => {
      console.error("[PassengerSocket] Connection error:", err.message);
      setState((prev) => ({
        ...prev,
        connecting: false,
        error: err.message,
      }));
    });

    socket.on("login-success", () => {
      console.log("[PassengerSocket] Login success");
    });

    socket.on("login-fail", (data) => {
      console.error("[PassengerSocket] Login failed:", data);
      loginSocketIdRef.current = null;
      setState((prev) => ({ ...prev, error: data?.message || "Passenger authentication failed" }));
    });

    socket.on("ride_status_update", (data: RideStatusUpdateData) => {
      console.log("[PassengerSocket] Ride status update RECEIVED:", JSON.stringify(data, null, 2));
      onRideStatusUpdateRef.current?.(data);
    });

    socket.on("driver-location", (data: DriverLocationData) => {
      console.log("[PassengerSocket] Driver location RECEIVED:", JSON.stringify(data, null, 2));
      onDriverLocationRef.current?.(data);
    });
  }, [state.connecting, emitPassengerLogin]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    loginSocketIdRef.current = null;
    socketRef.current?.disconnect();
    socketRef.current = null;
    setState({
      connected: false,
      connecting: false,
      error: null,
      socket: null,
    });
  }, []);

  useEffect(() => {
    loginSocketIdRef.current = null;
    if (passengerId && socketRef.current?.connected) {
      void emitPassengerLogin();
    }
  }, [passengerId, emitPassengerLogin]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    ...state,
    connect,
    disconnect,
  };
}
