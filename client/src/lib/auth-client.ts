import { createAuthClient } from "better-auth/react";

const authBaseURL =
  import.meta.env.VITE_BETTER_AUTH_URL ?? "http://localhost:3000";

export const authClient = createAuthClient({
  baseURL: authBaseURL,
  fetchOptions: {
    credentials: "include",
  },
});

export const { signIn, signUp, signOut, useSession } = authClient;
