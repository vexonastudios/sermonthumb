"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadSettings, getSettingsStatus } from "@/lib/settings";

function LandingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [isConnecting, setIsConnecting] = useState(false);
  const [missingKeys, setMissingKeys] = useState(false);

  const handleConnect = () => {
    const settings = loadSettings();
    const status = getSettingsStatus(settings);

    if (!status.hasYouTube) {
      setMissingKeys(true);
      return;
    }

    setIsConnecting(true);
    // Creds are read server-side from the settings file — no secrets in URL
    router.push("/api/auth/login");
  };

  return (
    <main style={{
      minHeight: "100vh",
      background: "radial-gradient(ellipse at 20% 50%, rgba(88,101,242,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(229,62,110,0.1) 0%, transparent 40%), var(--bg-primary)",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "2rem", gap: "2.5rem",
    }}>
      {/* Logo */}
      <div style={{ textAlign: "center", animation: "fadeIn 0.6s ease-out" }}>
        <div style={{ width: 80, height: 80, borderRadius: 20, background: "linear-gradient(135deg, #5865f2, #e53e6e)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem", fontSize: 40, boxShadow: "0 0 40px rgba(88,101,242,0.4)" }}>🎬</div>
        <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", fontWeight: 900, letterSpacing: "-0.03em", background: "linear-gradient(135deg, #f0f4ff 0%, #a5b4fc 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: "1rem" }}>SermonThumb</h1>
        <p style={{ fontSize: "1.1rem", color: "var(--text-secondary)", maxWidth: 520, lineHeight: 1.6, margin: "0 auto 0.4rem" }}>
          Automatically generate professional YouTube thumbnails for sermon videos using AI.
        </p>
        <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", maxWidth: 460, lineHeight: 1.6, margin: "0 auto" }}>
          Detects face direction · Smart layout · Background removal · One-click upload
        </p>
      </div>

      {/* Feature Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", maxWidth: 760, width: "100%" }}>
        {[
          { icon: "🤖", title: "AI Face Detection", desc: "Gemini Vision detects which way the preacher looks" },
          { icon: "🎨", title: "Smart Layout",      desc: "Title & logo placed on the opposite side from the face" },
          { icon: "✂️", title: "BG Removal",        desc: "Clean subject isolation via fal.ai BiRefNet" },
          { icon: "📤", title: "One-Click Upload",  desc: "Push the thumbnail directly to YouTube" },
        ].map((f) => (
          <div key={f.title} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.1rem", transition: "border-color 0.2s, transform 0.2s" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";       (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>{f.icon}</div>
            <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 4 }}>{f.title}</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{f.desc}</div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "0.75rem 1.25rem", color: "#fc8181", fontSize: "0.88rem" }}>
            ⚠️ {error.replace(/_/g, " ")}
          </div>
        )}

        {missingKeys && (
          <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 10, padding: "0.9rem 1.25rem", color: "#fcd34d", fontSize: "0.88rem", textAlign: "center", maxWidth: 380 }}>
            ⚠️ YouTube API credentials not set.<br/>
            <button onClick={() => router.push("/settings")} style={{ marginTop: 8, background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 7, padding: "6px 16px", color: "#fcd34d", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" }}>
              Open Settings →
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <button id="settings-btn" onClick={() => router.push("/settings")}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-card)", border: "1px solid var(--border-hover)", borderRadius: 12, padding: "0.9rem 1.5rem", color: "var(--text-secondary)", fontSize: "0.95rem", fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}>
            ⚙️ Settings
          </button>

          <button id="connect-youtube-btn" onClick={handleConnect} disabled={isConnecting}
            style={{ display: "flex", alignItems: "center", gap: 12, background: isConnecting ? "rgba(88,101,242,0.5)" : "linear-gradient(135deg, #5865f2, #7c3aed)", border: "none", borderRadius: 12, padding: "0.9rem 2rem", color: "white", fontSize: "0.95rem", fontWeight: 700, cursor: isConnecting ? "not-allowed" : "pointer", boxShadow: "0 4px 24px rgba(88,101,242,0.4)", transition: "all 0.2s" }}
            onMouseEnter={(e) => { if (!isConnecting) { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(88,101,242,0.6)"; } }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 24px rgba(88,101,242,0.4)"; }}>
            {isConnecting ? <div className="spinner" /> : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/>
              </svg>
            )}
            {isConnecting ? "Connecting..." : "Connect YouTube Channel"}
          </button>
        </div>

        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
          Requires YouTube channel ownership &amp; Google account
        </p>
      </div>
    </main>
  );
}

export default function HomePage() {
  return <Suspense><LandingContent /></Suspense>;
}
