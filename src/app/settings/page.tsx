"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  AppSettings,
  loadSettingsFromServer,
  saveSettings,
  clearSettings,
  DEFAULT_SETTINGS,
  getSettingsStatus,
} from "@/lib/settings";

type SaveState = "idle" | "saved" | "cleared";

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  value: string;
  type?: "text" | "password";
  placeholder?: string;
  onChange: (v: string) => void;
  status?: "ok" | "missing" | "none";
  link?: { href: string; label: string };
}

function Field({ id, label, hint, value, type = "text", placeholder, onChange, status, link }: FieldProps) {
  const [show, setShow] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <label htmlFor={id} style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {label}
          {status === "ok" && <span style={{ marginLeft: 6, color: "var(--success)", fontWeight: 400 }}>✓</span>}
          {status === "missing" && <span style={{ marginLeft: 6, color: "var(--warning)", fontWeight: 400 }}>⚠ required</span>}
        </label>
        {link && (
          <a href={link.href} target="_blank" rel="noreferrer"
            style={{ fontSize: "0.75rem", color: "var(--accent)", textDecoration: "none" }}>
            {link.label} ↗
          </a>
        )}
      </div>
      <div style={{ position: "relative" }}>
        <input
          id={id}
          type={type === "password" && !show ? "password" : "text"}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          style={{
            width: "100%",
            background: "var(--bg-primary)",
            border: `1px solid ${value ? (status === "ok" ? "rgba(34,197,94,0.4)" : "var(--border-hover)") : "var(--border)"}`,
            borderRadius: 8,
            padding: type === "password" ? "10px 44px 10px 12px" : "10px 12px",
            color: "var(--text-primary)",
            fontSize: "0.88rem",
            fontFamily: "monospace",
            outline: "none",
            transition: "border-color 0.2s",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = value ? (status === "ok" ? "rgba(34,197,94,0.4)" : "var(--border-hover)") : "var(--border)")}
        />
        {type === "password" && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>
            {show ? "🙈" : "👁"}
          </button>
        )}
      </div>
      {hint && <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.02)" }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <h2 style={{ fontWeight: 700, fontSize: "0.95rem" }}>{title}</h2>
      </div>
      <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1.1rem" }}>
        {children}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettingsFromServer().then((loaded) => {
      setSettings(loaded);
      if (loaded.channelLogoBase64) {
        setLogoPreview(`data:image/png;base64,${loaded.channelLogoBase64}`);
      }
    });
  }, []);

  const set = (key: keyof AppSettings) => (value: string) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings(settings);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (err) {
      alert(`❌ Failed to save settings to disk!\n\n${err instanceof Error ? err.message : String(err)}\n\nYour settings are cached in memory but may not survive a relaunch.`);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    if (!confirm("Clear all settings from localStorage?")) return;
    clearSettings();
    setSettings(DEFAULT_SETTINGS);
    setLogoPreview(null);
    setSaveState("cleared");
    setTimeout(() => setSaveState("idle"), 2500);
  };

  const handleLogoUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const b64 = dataUrl.split(",")[1];
      setSettings((s) => ({ ...s, channelLogoBase64: b64 }));
      setLogoPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const status = getSettingsStatus(settings);

  const redirectUri =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/auth/callback`
      : "http://localhost:3001/api/auth/callback";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* Header */}
      <header style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", padding: "0 2rem", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={() => router.back()} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", color: "var(--text-secondary)", fontSize: "0.85rem", cursor: "pointer" }}>← Back</button>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 26 }}>🎬</span>
            <span style={{ fontWeight: 800, fontSize: "1.15rem", background: "linear-gradient(135deg, #f0f4ff, #a5b4fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>SermonThumb</span>
            <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>/ Settings</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button id="clear-settings-btn" onClick={handleClear} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 16px", color: "var(--text-muted)", fontSize: "0.85rem", cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--danger)"; (e.currentTarget as HTMLElement).style.color = "#fc8181"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}>
            🗑 Clear All
          </button>
          <button id="save-settings-btn" onClick={handleSave} disabled={saving} style={{ background: saveState === "saved" ? "rgba(34,197,94,0.2)" : "linear-gradient(135deg, #5865f2, #7c3aed)", border: saveState === "saved" ? "1px solid rgba(34,197,94,0.5)" : "none", borderRadius: 8, padding: "8px 20px", color: saveState === "saved" ? "var(--success)" : "white", fontWeight: 700, fontSize: "0.88rem", cursor: saving ? "not-allowed" : "pointer", transition: "all 0.2s", minWidth: 110, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : saveState === "saved" ? "✓ Saved!" : "Save Settings"}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Status Banner */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          {[
            { label: "YouTube API", ok: status.hasYouTube },
            { label: "Gemini Vision", ok: status.hasGemini },
            { label: "BG Removal", ok: status.hasRemoveBg },
            { label: "Channel Logo", ok: status.hasLogo },
          ].map(({ label, ok }) => (
            <div key={label} style={{ background: ok ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)", border: `1px solid ${ok ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)"}`, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>{ok ? "✅" : "⚠️"}</span>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: ok ? "var(--success)" : "var(--warning)" }}>{label}</span>
            </div>
          ))}
        </div>

        {/* YouTube Section */}
        <Section title="YouTube API" icon="📺">
          <div style={{ background: "rgba(88,101,242,0.08)", border: "1px solid rgba(88,101,242,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            <strong style={{ color: "var(--text-primary)" }}>Setup:</strong> Go to Google Cloud Console → Enable YouTube Data API v3 → Credentials → OAuth 2.0 Client ID (Web App) → add this redirect URI:<br/>
            <code style={{ fontFamily: "monospace", color: "#a5b4fc", fontSize: "0.82rem" }}>{redirectUri}</code>
          </div>

          <Field id="yt-client-id" label="Client ID" type="password"
            placeholder="xxxxxxxxxxxx.apps.googleusercontent.com"
            value={settings.youtubeClientId} onChange={set("youtubeClientId")}
            status={settings.youtubeClientId ? "ok" : "missing"}
            link={{ href: "https://console.cloud.google.com/apis/credentials", label: "Open Console" }}
          />
          <Field id="yt-client-secret" label="Client Secret" type="password"
            placeholder="GOCSPX-xxxxxxxxxxxx"
            value={settings.youtubeClientSecret} onChange={set("youtubeClientSecret")}
            status={settings.youtubeClientSecret ? "ok" : "missing"}
          />
          <Field id="yt-redirect-uri" label="Redirect URI"
            hint="Must exactly match what you put in Google Console. Auto-filled from current origin."
            value={settings.youtubeRedirectUri || redirectUri}
            onChange={set("youtubeRedirectUri")}
            status={settings.youtubeRedirectUri ? "ok" : "missing"}
          />
        </Section>

        {/* Gemini Section */}
        <Section title="Gemini Vision API" icon="🤖">
          <Field id="gemini-key" label="API Key" type="password"
            placeholder="AIzaSy..."
            hint="Used to detect which direction the preacher is facing for smart layout."
            value={settings.geminiApiKey} onChange={set("geminiApiKey")}
            status={settings.geminiApiKey ? "ok" : "missing"}
            link={{ href: "https://aistudio.google.com/app/apikey", label: "Get Key" }}
          />
        </Section>

        {/* Background Removal */}
        <Section title="Background Removal (fal.ai)" icon="✂️">
          <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Uses <strong style={{ color: "var(--text-primary)" }}>fal.ai BiRefNet</strong> — best-in-class portrait cutout model. Fractions of a cent per image, no monthly cap.
          </p>
          <Field id="falai-key" label="fal.ai API Key" type="password"
            placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
            hint="Get your key at fal.ai → Dashboard → API Keys."
            value={settings.falAiApiKey} onChange={set("falAiApiKey")}
            status={settings.falAiApiKey ? "ok" : "missing"}
            link={{ href: "https://fal.ai/dashboard/keys", label: "Get Key" }}
          />
        </Section>

        {/* Branding */}
        <Section title="Branding" icon="🎨">
          {/* Logo Upload */}
          <div>
            <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase", display: "block", marginBottom: 10 }}>
              Channel Logo {status.hasLogo && <span style={{ color: "var(--success)", fontWeight: 400 }}>✓</span>}
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {/* Preview */}
              <div onClick={() => fileInputRef.current?.click()} style={{ width: 80, height: 80, borderRadius: 12, border: "2px dashed var(--border-hover)", background: "var(--bg-primary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", flexShrink: 0, transition: "border-color 0.2s" }}
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)"}
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                ) : (
                  <span style={{ fontSize: 28 }}>🏛</span>
                )}
              </div>
              <div>
                <button onClick={() => fileInputRef.current?.click()} id="logo-upload-btn" style={{ background: "transparent", border: "1px solid var(--border-hover)", borderRadius: 8, padding: "8px 14px", color: "var(--text-primary)", fontSize: "0.84rem", cursor: "pointer", display: "block", marginBottom: 6 }}>
                  {logoPreview ? "🔄 Change Logo" : "📁 Upload Logo"}
                </button>
                {logoPreview && (
                  <button onClick={() => { setLogoPreview(null); setSettings(s => ({ ...s, channelLogoBase64: "" })); }} style={{ background: "transparent", border: "none", color: "var(--text-muted)", fontSize: "0.78rem", cursor: "pointer", padding: "2px 0" }}>
                    Remove
                  </button>
                )}
                <p style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 4 }}>PNG recommended. Persisted to local settings file.</p>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }} />
          </div>

          {/* Default Gradient */}
          <div>
            <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>
              Default Gradient
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {([
                ["slate",    "#1e2a3a", "#4a90b8", "Slate"],
                ["ocean",    "#0a4a6b", "#1ad6c8", "Ocean"],
                ["royal",    "#0d1b5e", "#3b6fe8", "Royal"],
                ["midnight", "#0a0e2a", "#4338ca", "Midnight"],
                ["forest",   "#0d3b1e", "#2dd96b", "Forest"],
                ["sunset",   "#7a2000", "#f59e0b", "Sunset"],
                ["crimson",  "#4a0d1a", "#e53e6e", "Crimson"],
              ] as [string, string, string, string][]).map(([key, c1, c2, label]) => (
                <button key={key} id={`default-gradient-${key}`}
                  onClick={() => setSettings(s => ({ ...s, defaultGradient: key }))}
                  style={{ padding: "10px 4px", borderRadius: 8, border: `2px solid ${settings.defaultGradient === key ? "white" : "transparent"}`, background: `linear-gradient(135deg, ${c1}, ${c2})`, cursor: "pointer", fontSize: "0.72rem", color: "white", fontWeight: 700 }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* Storage Info */}
        <div style={{ background: "rgba(88,101,242,0.06)", border: "1px solid rgba(88,101,242,0.15)", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>🔒</span>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            All settings are stored in a <strong style={{ color: "var(--text-primary)" }}>local file on your machine</strong> (and cached in localStorage). API keys are passed as request headers to the local Next.js server routes and never leave your machine.
          </p>
        </div>

        {/* Save footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", paddingBottom: "1rem" }}>
          <button onClick={handleSave} disabled={saving} style={{ background: saveState === "saved" ? "rgba(34,197,94,0.2)" : "linear-gradient(135deg, #5865f2, #7c3aed)", border: saveState === "saved" ? "1px solid rgba(34,197,94,0.5)" : "none", borderRadius: 10, padding: "12px 28px", color: saveState === "saved" ? "var(--success)" : "white", fontWeight: 800, fontSize: "1rem", cursor: saving ? "not-allowed" : "pointer", transition: "all 0.2s", minWidth: 150, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : saveState === "saved" ? "✓ Saved!" : "Save Settings"}
          </button>
        </div>
      </main>
    </div>
  );
}
