const normalizeOrigin = (value: string | undefined): string => {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  try {
    return new URL(trimmed).origin;
  } catch {
    return "";
  }
};

const configuredApiUrl = normalizeOrigin(import.meta.env.VITE_API_URL);
const configuredSocketUrl = normalizeOrigin(import.meta.env.VITE_SOCKET_URL);
const isLocalBuild = import.meta.env.VITE_DEPLOY_ENV === "local";
const isLocalOrigin = (origin: string) =>
  origin.includes("localhost") || origin.includes("127.0.0.1");

if (import.meta.env.PROD && !isLocalBuild && (!configuredApiUrl || isLocalOrigin(configuredApiUrl))) {
  throw new Error("VITE_API_URL must be set to the deployed web API origin for a production build");
}

if (import.meta.env.PROD && !isLocalBuild && (!configuredSocketUrl || isLocalOrigin(configuredSocketUrl))) {
  throw new Error("VITE_SOCKET_URL must be set to the deployed socket-server origin for a production build");
}

export const apiUrl = configuredApiUrl;

export const socketUrl = configuredSocketUrl;

export const apiFetch = (
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> => {
  const requestUrl =
    apiUrl && typeof input === "string" && input.startsWith("/")
      ? `${apiUrl}${input}`
      : input;

  return fetch(requestUrl, {
    ...init,
    credentials: init.credentials ?? "include",
  });
};
