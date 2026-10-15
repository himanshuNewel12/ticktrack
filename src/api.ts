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
    process.env.EXPO_PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    Constants.expoConfig?.extra?.backendUrl ??
    ""
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
    // Fall back to local network IP or emulator IP
    return rawUrl ? rawUrl.replace(/localhost|127\.0\.0\.1/, "10.155.19.52") : "http://10.155.19.52:4001/api/v1";
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
if (__DEV__) {
  console.log("[TickTrack API] Target URL:", baseUrl);
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const targetUrl = (baseUrl.endsWith("/api/v1") || baseUrl.includes("/api"))
    ? `${baseUrl}${normalizedPath}`
    : `${baseUrl}/api/v1${normalizedPath}`;

  const executeFetch = () =>
    fetch(targetUrl, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}`, Cookie: `access_token=${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });

  let response: Response;
  try {
    response = await executeFetch();
  } catch (err: any) {
    const errorStr = String(err?.message || err);
    // Transient HTTP/2 stream reset or connection drop retry
    if (errorStr.includes("StreamResetException") || errorStr.includes("stream was reset") || errorStr.includes("fetch failed")) {
      await new Promise((r) => setTimeout(r, 300));
      try {
        response = await executeFetch();
      } catch (retryErr: any) {
        const isLocal = targetUrl.includes("localhost") || targetUrl.includes("127.0.0.1") || targetUrl.includes("10.") || targetUrl.includes("192.168.");
        const hint = isLocal ? " Please ensure your phone is connected to the same Wi-Fi." : "";
        const finalErr = String(retryErr?.message || retryErr || errorStr);
        throw new Error(`Unable to reach backend at ${targetUrl}. (${finalErr})${hint}`);
      }
    } else {
      const isLocal = targetUrl.includes("localhost") || targetUrl.includes("127.0.0.1") || targetUrl.includes("10.") || targetUrl.includes("192.168.");
      const hint = isLocal ? " Please ensure your phone is connected to the same Wi-Fi." : "";
      throw new Error(`Unable to reach backend at ${targetUrl}. (${errorStr})${hint}`);
    }
  }

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