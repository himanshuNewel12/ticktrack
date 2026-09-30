import Constants from "expo-constants";
import { Platform } from "react-native";

function getHostIp(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost ||
    "";
  if (hostUri) {
    const ip = hostUri.split(":")[0];
    if (ip && ip !== "localhost" && ip !== "127.0.0.1") {
      return ip;
    }
  }
  return null;
}

function resolveBaseUrl(): string {
  const rawUrl = (
    Constants.expoConfig?.extra?.backendUrl ?? process.env.EXPO_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? ""
  ).replace(/\/$/, "");

  const detectedIp = getHostIp();

  // If a non-localhost remote URL is explicitly configured, respect it
  if (rawUrl && !rawUrl.includes("localhost") && !rawUrl.includes("127.0.0.1")) {
    return rawUrl;
  }

  if (Platform.OS !== "web") {
    if (detectedIp) {
      if (rawUrl) {
        return rawUrl.replace(/localhost|127\.0\.0\.1/, detectedIp);
      }
      return `http://${detectedIp}:4001/api/v1`;
    }
    return rawUrl || "http://10.0.2.2:4001/api/v1";
  }

  if (rawUrl.includes("localhost") || rawUrl.includes("127.0.0.1")) {
    if (detectedIp) {
      return rawUrl.replace(/localhost|127\.0\.0\.1/, detectedIp);
    }
    return rawUrl;
  }

  return rawUrl || "http://localhost:4001/api/v1";
}

const baseUrl = resolveBaseUrl();

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const targetUrl = (baseUrl.endsWith("/api/v1") || baseUrl.includes("/api"))
    ? `${baseUrl}${normalizedPath}`
    : `${baseUrl}/api/v1${normalizedPath}`;

  let response = await fetch(targetUrl, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}`, Cookie: `access_token=${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(body.message)
      ? body.message.join(", ")
      : (body.message || body.detail || body.error || "Something went wrong. Please try again.");
    throw new Error(message);
  }

  if (typeof body === "object" && body !== null) {
    if (!body.access_token && !body.token && !body.accessToken) {
      const setCookie = response.headers.get("set-cookie") || "";
      const getSetCookieList = (response.headers as any).getSetCookie
        ? (response.headers as any).getSetCookie()
        : [setCookie];
      const combined = Array.isArray(getSetCookieList) ? getSetCookieList.join("; ") : String(setCookie);
      const match = combined.match(/access_token=([^;]+)/);
      if (match && match[1]) {
        body.access_token = match[1];
      }
    }
  }

  return body as T;
}

export function postJson<T>(path: string, payload: unknown, token?: string) {
  return api<T>(path, { method: "POST", body: JSON.stringify(payload) }, token);
}