import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

type PassengerSocketState = {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  socket: Socket | null;
};

export interface RideStatusUpdateData {
  rideId: string;
  status: string;
  driverId?: string | null;
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
  const onRideStatusUpdateRef = useRef(onRideStatusUpdate);
  const onDriverLocationRef = useRef(onDriverLocation);

  // Keep the latest callbacks for handlers without reconnecting the socket.
  useEffect(() => {
    onRideStatusUpdateRef.current = onRideStatusUpdate;
    onDriverLocationRef.current = onDriverLocation;
  });

  const emitPassengerLogin = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.connected) {
      console.log("[PassengerSocket] Emitting passenger-login");
      socket.emit("passenger-login");
    }
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;
    if (state.connecting) return;

    setState((prev) => ({ ...prev, connecting: true, error: null }));

    const currentSocketUrl = import.meta.env.VITE_SOCKET_URL || "http://localhost:5002";
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
      emitPassengerLogin();
    });

    socket.on("disconnect", (reason) => {
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
    socketRef.current?.disconnect();
    socketRef.current = null;
    setState({
      connected: false,
      connecting: false,
      error: null,
      socket: null,
    });
  }, []);

  // Re-login on (re)connect once identity is available.
  useEffect(() => {
    if (passengerId && socketRef.current?.connected) {
      console.log("[PassengerSocket] passengerId available, socket connected, re-emitting passenger-login");
      socketRef.current.emit("passenger-login");
    }
  }, [passengerId]);

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