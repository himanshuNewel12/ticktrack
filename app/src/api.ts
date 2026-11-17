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

const DEFAULT_REMOTE_URL = "https://newelplanner-revamp-api-prod.neweltechnologies.in/api/v1";

function resolveBaseUrl(): string {
  const rawUrl = (
    process.env.EXPO_PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    Constants.expoConfig?.extra?.backendUrl ??
    ""
  ).replace(/\/$/, "");

  // In release APK builds (!__DEV__), always use the remote UAT backend
  // to ensure the app works on 5G/LTE and any Wi-Fi network
  if (!__DEV__) {
    if (rawUrl && !rawUrl.includes("localhost") && !rawUrl.includes("127.0.0.1") && !rawUrl.startsWith("http://10.") && !rawUrl.startsWith("http://192.168.")) {
      return rawUrl;
    }
    return DEFAULT_REMOTE_URL;
  }

  // --- Development Mode (__DEV__) ---
  // If explicitly configured with a remote URL, use it
  if (rawUrl && !rawUrl.includes("localhost") && !rawUrl.includes("127.0.0.1")) {
    return rawUrl;
  }

  const detectedIp = getHostIp();

  if (Platform.OS !== "web") {
    if (detectedIp) {
      if (rawUrl) {
        return rawUrl.replace(/localhost|127\.0\.0\.1/, detectedIp);
      }
      return `http://${detectedIp}:4001/api/v1`;
    }
    // Fall back to current local network IP
    return rawUrl ? rawUrl.replace(/localhost|127\.0\.0\.1/, "10.34.136.52") : "http://10.34.136.52:4001/api/v1";
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

export type AuthErrorHandler = () => void;
let globalAuthErrorHandler: AuthErrorHandler | null = null;

export function setOnUnauthorized(handler: AuthErrorHandler | null) {
  globalAuthErrorHandler = handler;
}

function xhrRequest(
  url: string,
  options: RequestInit = {},
  token?: string
): Promise<{ ok: boolean; status: number; body: any; headers: { get: (name: string) => string | null } }> {
  return new Promise((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      const method = (options.method || "GET").toUpperCase();
      xhr.open(method, url, true);
      xhr.timeout = 20000;

      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("Accept", "application/json");
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("Cookie", `access_token=${token}`);
      }
      if (options.headers) {
        const h = options.headers as Record<string, string>;
        for (const k of Object.keys(h)) {
          xhr.setRequestHeader(k, h[k]);
        }
      }

      xhr.onload = () => {
        let parsed: any = {};
        try {
          parsed = JSON.parse(xhr.responseText);
        } catch {
          parsed = xhr.responseText ? { message: xhr.responseText } : {};
        }
        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          body: parsed,
          headers: {
            get: (name: string) => xhr.getResponseHeader(name),
          },
        });
      };

      xhr.onerror = () => {
        reject(new Error(`XHR network error connecting to ${url}`));
      };

      xhr.ontimeout = () => {
        reject(new Error(`Request timed out after 20s connecting to ${url}`));
      };

      const payload = typeof options.body === "string" ? options.body : options.body ? JSON.stringify(options.body) : null;
      xhr.send(payload);
    } catch (e: any) {
      reject(e);
    }
  });
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const targetUrl = (baseUrl.endsWith("/api/v1") || baseUrl.includes("/api"))
    ? `${baseUrl}${normalizedPath}`
    : `${baseUrl}/api/v1${normalizedPath}`;

  if (__DEV__) {
    console.log(`[TickTrack API] -> ${options.method || "GET"} ${targetUrl}`);
  }

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

  let body: any;
  let status: number;
  let ok: boolean;
  let getHeader: (name: string) => string | null;

  try {
    const response = await executeFetch();
    status = response.status;
    ok = response.ok;
    body = await response.json().catch(() => ({}));
    getHeader = (n) => response.headers.get(n);
  } catch (fetchErr: any) {
    const errorStr = String(fetchErr?.message || fetchErr);
    // If fetch failed (e.g. StreamResetException in expo/fetch or connection drop), fall back to XMLHttpRequest
    try {
      const xhrRes = await xhrRequest(targetUrl, options, token);
      status = xhrRes.status;
      ok = xhrRes.ok;
      body = xhrRes.body;
      getHeader = xhrRes.headers.get;
    } catch (xhrErr: any) {
      const isLocal = targetUrl.includes("localhost") || targetUrl.includes("127.0.0.1") || targetUrl.includes("10.") || targetUrl.includes("192.168.");
      const hint = isLocal ? " Please ensure your phone is connected to the same Wi-Fi." : "";
      const finalErr = String(xhrErr?.message || xhrErr || errorStr);
      throw new Error(`Unable to reach backend at ${targetUrl}. (${finalErr})${hint}`);
    }
  }

  if (!ok) {
    if (status === 401 && globalAuthErrorHandler) {
      globalAuthErrorHandler();
    }
    const message = Array.isArray(body.message)
      ? body.message.join(", ")
      : (body.message || body.detail || body.error || "Something went wrong. Please try again.");
    if (__DEV__) {
      console.warn(`[TickTrack API Error] ${options.method || "GET"} ${targetUrl} (${status}):`, message);
    }
    throw new Error(message);
  }

  if (typeof body === "object" && body !== null) {
    if (!body.access_token && !body.token && !body.accessToken) {
      const setCookie = getHeader("set-cookie") || "";
      const match = String(setCookie).match(/access_token=([^;]+)/);
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

export function buildUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return baseUrl.endsWith("/api/v1") || baseUrl.includes("/api")
    ? `${baseUrl}${normalizedPath}`
    : `${baseUrl}/api/v1${normalizedPath}`;
}

/** Authenticated stream URL for a voice note previously uploaded with uploadVoiceNote. */
export function voiceNoteUrl(file: string) {
  return buildUrl(`/activities/voice/${encodeURIComponent(file)}`);
}

/** Uploads a locally recorded voice note and returns the server file name to attach to a remark / description. */
export async function uploadVoiceNote(uri: string, token: string): Promise<string> {
  const form = new FormData();
  const ext = (uri.split("?")[0].split(".").pop() || "m4a").toLowerCase();
  form.append("file", { uri, name: `voice.${ext}`, type: ext === "3gp" ? "audio/3gpp" : "audio/mp4" } as any);

  let res: Response;
  try {
    // No Content-Type here: fetch must add the multipart boundary itself.
    res = await fetch(buildUrl("/activities/voice"), {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch (err: any) {
    throw new Error("Could not upload the voice note. Check your connection and try again.");
  }
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    throw new Error(message || "Could not upload the voice note.");
  }
  return String(body.file);
}

export type UploadedFile = { key: string; name: string; size: number; mimeType: string };

/** Uploads any local file (document, image…) to S3 through the backend; keep the returned `key` on the record. */
export async function uploadFile(file: { uri: string; name: string; mimeType?: string }, token: string): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", { uri: file.uri, name: file.name, type: file.mimeType || "application/octet-stream" } as any);

  let res: Response;
  try {
    res = await fetch(buildUrl("/files/upload"), {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch (err: any) {
    console.error("[uploadFile] network error", { url: buildUrl("/files/upload"), file, error: err?.message, err });
    throw new Error(`Could not upload the file: ${err?.message || "network error"} (${buildUrl("/files/upload")})`);
  }
  const raw = await res.text().catch(() => "");
  let body: any = {};
  try { body = JSON.parse(raw); } catch {}
  if (!res.ok) {
    console.error("[uploadFile] server error", { url: buildUrl("/files/upload"), status: res.status, response: raw });
    const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    throw new Error(`Could not upload the file (HTTP ${res.status}): ${message || raw.slice(0, 200) || "no response body"}`);
  }
  return body as UploadedFile;
}

/**
 * Uploads files one after another. Running up to five (25 MB each) multipart uploads at once
 * spikes native memory on low-RAM phones, which is a likely cause of the app being killed mid-upload.
 */
export async function uploadFiles(
  files: { uri: string; name: string; mimeType?: string }[],
  token: string,
): Promise<UploadedFile[]> {
  const uploaded: UploadedFile[] = [];
  for (const file of files) uploaded.push(await uploadFile(file, token));
  return uploaded;
}

/** Fetches a short-lived download URL for an uploaded file key. */
export async function getFileUrl(key: string, token: string): Promise<string> {
  const res = await fetch(buildUrl(`/files/url?key=${encodeURIComponent(key)}`), {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || "Could not open the file.");
  return String(body.url);
}
