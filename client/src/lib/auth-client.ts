import { createAuthClient } from "better-auth/react";
import { apiUrl } from "./runtime-config";

const defaultApiOrigin = typeof window !== "undefined" ? window.location.origin : undefined;

export const authClient = createAuthClient({
  baseURL: apiUrl || defaultApiOrigin,
  fetchOptions: {
    credentials: "include",
  },
});

export const { signIn, signUp, signOut, useSession } = authClient;