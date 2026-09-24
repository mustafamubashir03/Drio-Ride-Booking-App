import { createAuthClient } from "better-auth/react";

const defaultApiOrigin = typeof window !== "undefined" ? window.location.origin : undefined;

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_BETTER_AUTH_URL ?? defaultApiOrigin,
  fetchOptions: {
    credentials: "include",
  },
});

export const { signIn, signUp, signOut, useSession } = authClient;