import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { components } from "./generated/api";

export type Profile = components["schemas"]["Profile"];
export type Competition = components["schemas"]["EventOut"];
export type Detail = components["schemas"]["EventDetail"];
export type Standing = components["schemas"]["Standing"];
export type Photo = components["schemas"]["PhotoOut"];
type Tokens = components["schemas"]["Tokens"];
export const BASE = (
  (Platform.OS === "web"
    ? process.env.EXPO_PUBLIC_WEB_API_URL
    : process.env.EXPO_PUBLIC_API_URL) || "http://localhost:8000"
).replace(/\/$/, "");
let tokens: Tokens | null = null;
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
  const timeout = setTimeout(() => controller.abort(), 65000);
  try {
    const response = await fetch(`${BASE}${path}`, {
      ...options,
      signal: controller.signal,
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
      "Unable to reach BEERREAL. Check your connection; the server may be waking up.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function save(value: Tokens | null) {
  // Desktop preview sessions remain in memory, never in browser storage.
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
  if (Platform.OS === "web") return !!tokens;
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
        const result: Tokens = await raw("/auth/refresh", {
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
  try {
    return await raw(path, {
      ...options,
      headers: {
        ...(options.body && !(options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
        ...(tokens ? { Authorization: `Bearer ${tokens.access_token}` } : {}),
      },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && retry && tokens) {
      await refresh();
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
  const result = await raw(`/auth/${register ? "register" : "login"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: username.trim(),
      password,
      ...(register ? { legal_age: true } : {}),
    }),
  });
  await save(result);
}

export async function logout() {
  if (tokens)
    await raw("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: tokens.refresh_token }),
    });
  await save(null);
}

export async function liveToken() {
  await request<Profile>("/me");
  return tokens?.access_token;
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
  return { uri, name, type: "image/jpeg" } as unknown as Blob;
}
