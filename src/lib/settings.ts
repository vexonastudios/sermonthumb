"use client";

/**
 * Settings persistence strategy:
 *
 *  1. ELECTRON (production & dev with electron): All reads/writes go through
 *     window.electronAPI.readSettings() / writeSettings() via Electron IPC.
 *     The main process always resolves the correct userdata path, so settings
 *     survive updates and reinstalls.
 *
 *  2. WEB DEV (plain `next dev` without electron): Falls back to /api/settings
 *     (reads/writes .thumbgen-settings.json in the project root).
 *
 *  localStorage is used as a fast in-session cache in both cases.
 */

export interface AppSettings {
  youtubeClientId: string;
  youtubeClientSecret: string;
  youtubeRedirectUri: string;
  geminiApiKey: string;
  falAiApiKey: string;
  defaultGradient: string;
  channelLogoBase64: string;
  /** Video IDs that have had a thumbnail uploaded via ThumbGen */
  completedVideoIds: string[];
  /** Custom speaker names added by the user */
  customSpeakerNames: string[];
  /** Persisted font selections */
  defaultFontStyle?: string;
  defaultFontSize?: number;
}

const LS_KEY = "thumbgen_settings";

export const DEFAULT_SETTINGS: AppSettings = {
  youtubeClientId: "",
  youtubeClientSecret: "",
  youtubeRedirectUri: "http://localhost:3001/api/auth/callback",
  geminiApiKey: "",
  falAiApiKey: "",
  defaultGradient: "slate",
  channelLogoBase64: "",
  completedVideoIds: [],
  customSpeakerNames: [],
};

// ─── Detect Electron IPC ──────────────────────────────────────────────────────
function getElectronAPI() {
  if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).electronAPI) {
    return (window as unknown as { electronAPI: {
      readSettings:  () => Promise<Record<string, unknown>>;
      writeSettings: (data: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
    }}).electronAPI;
  }
  return null;
}

// ─── localStorage cache (fast, session-only) ──────────────────────────────────
export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function cacheSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_KEY, JSON.stringify(settings));
}

// ─── Persistent read (survives Electron relaunches) ───────────────────────────
export async function loadSettingsFromServer(): Promise<AppSettings> {
  const api = getElectronAPI();

  if (api) {
    // ── Electron: read directly from userdata via IPC ──────────────────────
    try {
      const data = await api.readSettings();
      const merged = { ...DEFAULT_SETTINGS, ...data } as AppSettings;
      cacheSettings(merged);
      return merged;
    } catch (err) {
      console.warn("[settings] IPC read failed, using localStorage cache:", err);
      return loadSettings();
    }
  }

  // ── Web dev fallback: use the Next.js API route ────────────────────────────
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) return loadSettings();
    const data = await res.json();
    const merged = { ...DEFAULT_SETTINGS, ...data } as AppSettings;
    cacheSettings(merged);
    return merged;
  } catch {
    return loadSettings();
  }
}

// ─── Persistent write ─────────────────────────────────────────────────────────
export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  // Update localStorage cache immediately (merge on top of current cache)
  const current = loadSettings();
  const merged = { ...current, ...settings };
  cacheSettings(merged as AppSettings);

  // Strip empty sensitive values so a partial save never clobbers API keys on disk
  const SENSITIVE: (keyof AppSettings)[] = [
    "youtubeClientId", "youtubeClientSecret", "geminiApiKey",
    "falAiApiKey", "channelLogoBase64", "youtubeRedirectUri",
  ];
  const payload: Partial<AppSettings> = {};
  for (const [k, v] of Object.entries(settings) as [keyof AppSettings, unknown][]) {
    if (SENSITIVE.includes(k) && (v === "" || v === undefined || v === null)) continue;
    if (v !== undefined) (payload as Record<string, unknown>)[k] = v;
  }

  if (Object.keys(payload).length === 0) return; // nothing safe to write

  const api = getElectronAPI();

  if (api) {
    // ── Electron: write directly to userdata via IPC ───────────────────────
    const result = await api.writeSettings(payload as Record<string, unknown>);
    if (!result.ok) {
      throw new Error(result.error || "IPC write-settings failed");
    }
    return;
  }

  // ── Web dev fallback: use the Next.js API route ────────────────────────────
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Server returned ${res.status}: ${text}`);
  }
}

// ─── Clear ────────────────────────────────────────────────────────────────────
export function clearSettings(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LS_KEY);

  const api = getElectronAPI();
  if (api) {
    // Write an empty-ish object — IPC handler merges, so this resets to defaults
    api.writeSettings({
      youtubeClientId: "", youtubeClientSecret: "", youtubeRedirectUri: "",
      geminiApiKey: "", falAiApiKey: "", channelLogoBase64: "",
      defaultGradient: "slate", completedVideoIds: [], customSpeakerNames: [],
    } as Record<string, unknown>).catch(() => {});
    return;
  }

  fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }).catch(() => {});
}

/** Build headers to attach API keys to server requests */
export function buildApiHeaders(settings?: AppSettings): Record<string, string> {
  // If a settings object was passed in, use it — but if any sensitive key is
  // missing, try to fill the gap from the localStorage cache (server-warmed).
  const cached = loadSettings();
  const s: AppSettings = settings
    ? {
        ...settings,
        // Fall back to cached value if the passed-in value is empty
        geminiApiKey:        settings.geminiApiKey        || cached.geminiApiKey,
        falAiApiKey:         settings.falAiApiKey         || cached.falAiApiKey,
        youtubeClientId:     settings.youtubeClientId     || cached.youtubeClientId,
        youtubeClientSecret: settings.youtubeClientSecret || cached.youtubeClientSecret,
        youtubeRedirectUri:  settings.youtubeRedirectUri  || cached.youtubeRedirectUri,
        channelLogoBase64:   settings.channelLogoBase64   || cached.channelLogoBase64,
      }
    : cached;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (s.geminiApiKey)        headers["x-gemini-key"]       = s.geminiApiKey;
  if (s.falAiApiKey)         headers["x-falai-key"]        = s.falAiApiKey;
  if (s.youtubeClientId)     headers["x-yt-client-id"]     = s.youtubeClientId;
  if (s.youtubeClientSecret) headers["x-yt-client-secret"] = s.youtubeClientSecret;
  if (s.youtubeRedirectUri)  headers["x-yt-redirect-uri"]  = s.youtubeRedirectUri;
  return headers;
}

/**
 * Async version — re-fetches from disk to guarantee fresh API keys.
 * Use this in any flow where keys might not be in localStorage yet.
 */
export async function buildApiHeadersAsync(): Promise<Record<string, string>> {
  const settings = await loadSettingsFromServer();
  return buildApiHeaders(settings);
}

/** Check which services are configured */
export function getSettingsStatus(settings: AppSettings) {
  return {
    hasYouTube:  !!(settings.youtubeClientId && settings.youtubeClientSecret),
    hasGemini:   !!settings.geminiApiKey,
    hasRemoveBg: !!settings.falAiApiKey,
    hasLogo:     !!settings.channelLogoBase64,
  };
}
