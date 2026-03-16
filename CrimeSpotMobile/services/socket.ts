import { io, Socket } from "socket.io-client";
import * as SecureStore from "expo-secure-store";
import { BACKEND_URL } from "@/constants/api";

console.log("🔥 socket.ts file loaded");

const SOCKET_URL = BACKEND_URL; // backend URL from centralized config

let socket: Socket | null = null;
let isConnecting = false;

export const connectSocket = async (): Promise<Socket | null> => {
  // ✅ already connected
  if (socket && socket.connected) {
    return socket;
  }

  // ⏳ connection in progress
  if (isConnecting) {
    return socket;
  }

  const token = await SecureStore.getItemAsync("token");

  if (!token) {
    console.log("⏳ Token not ready, skipping socket connect");
    return null;
  }

  isConnecting = true;

  socket = io(SOCKET_URL, {
    auth: { token },
    autoConnect: true,
  });

  socket.on("connect", () => {
    console.log("✅ Socket connected:", socket?.id);
    isConnecting = false;
  });

  socket.on("connect_error", (err) => {
    console.log("❌ Socket connect error:", err.message);
    socket = null;
    isConnecting = false;
  });

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected");
    socket = null;
  });

  return socket;
};

export const getSocket = (): Socket | null => socket;
