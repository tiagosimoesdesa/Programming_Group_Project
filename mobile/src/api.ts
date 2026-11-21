import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { File as DeviceFile } from "expo-file-system";
import type { components } from "./generated/api";

export type Profile = components["schemas"]["Profile"];
export type Competition = components["schemas"]["EventOut"];
export type Detail = components["schemas"]["EventDetail"];
export type Standing = components["schemas"]["Standing"];
export type Photo = components["schemas"]["PhotoOut"];
export type Party = components["schemas"]["PartyOut"];
export type PartyRound = components["schemas"]["PartyRoundOut"];
type Tokens = components["schemas"]["Tokens"];
type AccessToken = components["schemas"]["AccessToken"];
type Session = AccessToken & { refresh_token?: string };
export const BASE = (
  (Platform.OS === "web"
    ? process.env.EXPO_PUBLIC_WEB_API_URL
    : process.env.EXPO_PUBLIC_API_URL) || "http://localhost:8000"
).replace(/\/$/, "");
let tokens: Session | null = null;
let refreshing: Promise<void> | null = null;
let authLost = () => {};
export const onAuthLost = (fn: () => void) => {
  authLost = fn;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function raw(path: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort);
  if (options.signal?.aborted) abort();
  const timeout = setTimeout(() => controller.abort(), 65000);
  try {
    const response = await fetch(`${BASE}${path}`, {
      ...options,
      signal: controller.signal,
      credentials: Platform.OS === "web" ? "include" : options.credentials,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        typeof body.detail === "string"
          ? body.detail
          : "Check your details and try again.",
      );
    }
    return response.status === 204 ? undefined : await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new Error(
      "Unable to reach COUNT THE JOLS. Check your connection; the server may be waking up.",
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

async function save(value: Session | null) {
  // Browser refresh tokens remain in an HttpOnly cookie, never in JavaScript storage.
  if (Platform.OS === "web") {
    tokens = value;
    return;
  }
  if (value)
    await SecureStore.setItemAsync("beerreal.session", JSON.stringify(value));
  else await SecureStore.deleteItemAsync("beerreal.session");
  tokens = value;
}

export async function restoreSession() {
  if (Platform.OS === "web") {
    try {
      const value: AccessToken = await raw("/auth/web/refresh", {
        method: "POST",
      });
      await save(value);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await save(null);
        return false;
      }
      throw error;
    }
  }
  const value = await SecureStore.getItemAsync("beerreal.session");
  if (!value) return false;
  try {
    tokens = JSON.parse(value);
  } catch {
    await save(null);
    return false;
  }
  return true;
}

async function refresh() {
  if (!refreshing)
    refreshing = (async () => {
      if (!tokens) throw new ApiError(401, "Please sign in again.");
      try {
        const result: Session =
          Platform.OS === "web"
            ? await raw("/auth/web/refresh", { method: "POST" })
            : await raw("/auth/refresh", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refresh_token: tokens.refresh_token }),
              });
        await save(result);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          await save(null);
          authLost();
        }
        throw e;
      }
    })().finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const sentTokens = tokens;
  try {
    return await raw(path, {
      ...options,
      headers: {
        ...(options.body && !(options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
        ...(sentTokens
          ? { Authorization: `Bearer ${sentTokens.access_token}` }
          : {}),
      },
    });
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 401 &&
      retry &&
      tokens &&
      !options.signal?.aborted
    ) {
      if (tokens === sentTokens) await refresh();
      return request(path, options, false);
    }
    throw error;
  }
}

export async function authenticate(
  username: string,
  password: string,
  register: boolean,
) {
  const prefix = Platform.OS === "web" ? "/auth/web" : "/auth";
  const result: Session = await raw(
    `${prefix}/${register ? "register" : "login"}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: username.trim(),
        password,
        ...(register ? { legal_age: true } : {}),
      }),
    },
  );
  await save(result);
}

export async function logout() {
  if (Platform.OS === "web") {
    await raw("/auth/web/logout", { method: "POST" });
  } else if (tokens?.refresh_token) {
    await raw("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: tokens.refresh_token }),
    });
  }
  await save(null);
}

export async function liveToken(verify: boolean) {
  if (verify) await request<Profile>("/me");
  if (!tokens) throw new ApiError(401, "Please sign in again.");
  return tokens.access_token;
}
export const post = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
export async function imagePart(uri: string, name: string) {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    return new File([await response.blob()], name, { type: "image/jpeg" });
  }
  // SDK 58 uses standards-based fetch: native URI descriptor objects are not
  // file bodies. DeviceFile implements Blob and supplies the actual image bytes.
  const file = new DeviceFile(uri);
  if (!file.exists || file.size === 0)
    throw new Error(
      "This photo is no longer available. Please retake both photos.",
    );
  return file;
}
