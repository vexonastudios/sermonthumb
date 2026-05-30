"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { YouTubeVideo } from "@/lib/types";
import { loadSettingsFromServer, saveSettings, buildApiHeaders } from "@/lib/settings";
import VideoCard from "@/components/VideoCard";
import ThumbnailEditor from "@/components/ThumbnailEditor";

interface ChannelInfo {
  id?: string;
  title?: string;
  thumbnailUrl?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "missing" | "has">("all");
  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  // Local tracking: video IDs ThumbGen has uploaded thumbnails for.
  // This is more reliable than YouTube's API-based hasThumbnail detection.
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  // Manual video ID lookup
  const [showAddById, setShowAddById] = useState(false);
  const [manualId, setManualId] = useState("");
  const [manualIdLoading, setManualIdLoading] = useState(false);
  const [manualIdError, setManualIdError] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const settings = await loadSettingsFromServer();
      const res = await fetch(`/api/videos?t=${Date.now()}`, {
        headers: buildApiHeaders(settings),
        cache: "no-store",
      });
      if (res.status === 401) { router.push("/"); return; }
      if (!res.ok) throw new Error("Failed to fetch videos");
      const data = await res.json();
      setVideos(data.videos || []);
      setChannel(data.channel || null);
      if (settings.channelLogoBase64) {
        setLogoBase64(settings.channelLogoBase64);
      } else if (data.channel?.thumbnailUrl) {
        fetchLogoBase64(data.channel.thumbnailUrl);
      }
      // Load completed IDs from persisted settings
      setCompletedIds(new Set(settings.completedVideoIds || []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const fetchLogoBase64 = async (url: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        const b64 = (reader.result as string).split(",")[1];
        setLogoBase64(b64);
      };
      reader.readAsDataURL(blob);
    } catch {
      console.warn("Could not fetch channel logo");
    }
  };

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  };

  /** Toggle a video's completed status and persist to disk */
  const toggleComplete = useCallback(async (id: string) => {
    // Update UI immediately
    setCompletedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      
      // Persist: just send the updated array, server will merge
      saveSettings({ completedVideoIds: [...next] }).catch(() => {});
      
      return next;
    });
  }, []);

  /** Fetch a single video by ID and open it in the editor */
  const handleAddById = useCallback(async () => {
    const raw = manualId.trim();
    if (!raw) return;

    setManualIdLoading(true);
    setManualIdError(null);
    try {
      const settings = await loadSettingsFromServer();
      const res = await fetch(`/api/videos/by-id?id=${encodeURIComponent(raw)}`, {
        headers: buildApiHeaders(settings),
      });
      const data = await res.json();
      if (!res.ok) {
        setManualIdError(data.error || "Video not found");
        return;
      }
      setShowAddById(false);
      setSelectedVideo(data.video);
    } catch {
      setManualIdError("Network error — please try again");
    } finally {
      setManualIdLoading(false);
    }
  }, [manualId]);

  const filteredVideos = videos.filter((v) => {
    const q = search.trim().toLowerCase();
    if (q) return v.title.toLowerCase().includes(q);
    // Use local completion tracking for reliable missing/has detection
    const done = completedIds.has(v.id);
    if (filter === "missing") return !done;
    if (filter === "has")     return done;
    return true;
  });

  const missingCount = videos.filter(v => !completedIds.has(v.id)).length;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-primary)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <header
        style={{
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border)",
          padding: "0 2rem",
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 100,
          backdropFilter: "blur(12px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 28 }}>🎬</span>
          <span
            style={{
              fontWeight: 800,
              fontSize: "1.2rem",
              background: "linear-gradient(135deg, #f0f4ff, #a5b4fc)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            SermonThumb
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {channel && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 14px 6px 8px" }}>
              {channel.thumbnailUrl && (
                <img src={channel.thumbnailUrl} alt={channel.title} style={{ width: 28, height: 28, borderRadius: "50%" }} />
              )}
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>{channel.title}</span>
            </div>
          )}

          <button id="settings-nav-btn" onClick={() => router.push("/settings")}
            style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 14px", color: "var(--text-secondary)", fontSize: "0.85rem", cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}>
            ⚙️ Settings
          </button>

          <button onClick={handleLogout}
            style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 14px", color: "var(--text-secondary)", fontSize: "0.85rem", cursor: "pointer", transition: "all 0.2s" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--danger)"; (e.currentTarget as HTMLElement).style.color = "#fc8181"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}>
            Disconnect
          </button>
        </div>

      </header>

      <div style={{ display: "flex", flex: 1 }}>
        {/* Main Content */}
        <main style={{ flex: 1, padding: "2rem", overflowY: "auto" }}>
          {/* Stats Bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1.5rem",
              marginBottom: "1.5rem",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: "1.6rem",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                }}
              >
                Video Library
              </h1>
              {!loading && (
                <p
                  style={{
                    fontSize: "0.88rem",
                    color: "var(--text-secondary)",
                    marginTop: 2,
                  }}
                >
                  {videos.length} videos · {" "}
                  <span style={{ color: "#f59e0b", fontWeight: 600 }}>
                    {missingCount} need thumbnails
                  </span>
                </p>
              )}
            </div>

            <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
              {/* Refresh */}
              <button id="refresh-videos-btn" onClick={fetchVideos} disabled={loading}
                style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", color: "var(--text-secondary)", fontSize: "0.85rem", cursor: loading ? "not-allowed" : "pointer", transition: "all 0.2s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}>
                {loading ? "⏳" : "🔄"} Refresh
              </button>
              {/* Add by YouTube ID */}
              <button id="add-by-id-btn" onClick={() => { setShowAddById(true); setManualId(""); setManualIdError(null); }}
                style={{ background: "linear-gradient(135deg, rgba(88,101,242,0.2), rgba(124,58,237,0.2))", border: "1px solid rgba(88,101,242,0.4)", borderRadius: 8, padding: "8px 14px", color: "#a5b4fc", fontSize: "0.85rem", cursor: "pointer", transition: "all 0.2s", fontWeight: 600 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(88,101,242,0.8)"; (e.currentTarget as HTMLElement).style.color = "white"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(88,101,242,0.4)"; (e.currentTarget as HTMLElement).style.color = "#a5b4fc"; }}>
                🔗 Add by ID
              </button>
              {/* Search */}
              <input
                id="search-videos"
                type="text"
                placeholder="Search videos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "8px 14px",
                  color: "var(--text-primary)",
                  fontSize: "0.88rem",
                  width: 220,
                  outline: "none",
                }}
              />

              {/* Filter Tabs */}
              <div
                style={{
                  display: "flex",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                {(
                  [
                    { key: "missing", label: "⚠️ Missing" },
                    { key: "all", label: "All" },
                    { key: "has", label: "✅ Has Thumb" },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    id={`filter-${key}`}
                    onClick={() => setFilter(key)}
                    style={{
                      background:
                        filter === key ? "var(--accent)" : "transparent",
                      border: "none",
                      padding: "8px 14px",
                      color:
                        filter === key
                          ? "white"
                          : "var(--text-secondary)",
                      fontSize: "0.82rem",
                      fontWeight: filter === key ? 600 : 400,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: "1rem",
              }}
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="skeleton"
                  style={{ height: 110, borderRadius: 12 }}
                />
              ))}
            </div>
          ) : error ? (
            <div
              style={{
                textAlign: "center",
                padding: "4rem",
                color: "var(--text-secondary)",
              }}
            >
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚠️</div>
              <p style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>{error}</p>
              <button
                onClick={fetchVideos}
                style={{
                  background: "var(--accent)",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 20px",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            </div>
          ) : filteredVideos.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "4rem",
                color: "var(--text-secondary)",
              }}
            >
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔍</div>
              <p>No videos match your search/filter.</p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
                gap: "1rem",
              }}
            >
              {filteredVideos.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  isCompleted={completedIds.has(video.id)}
                  onGenerate={() => setSelectedVideo(video)}
                  onToggleComplete={() => toggleComplete(video.id)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Thumbnail Editor Modal */}
      {selectedVideo && (
        <ThumbnailEditor
          video={selectedVideo}
          logoBase64={logoBase64}
          onClose={() => setSelectedVideo(null)}
          onUploaded={async () => {
            const id = selectedVideo.id;
            // Mark complete locally + persist
            setCompletedIds(prev => {
              const next = new Set(prev);
              next.add(id);
              saveSettings({ completedVideoIds: [...next] }).catch(() => {});
              return next;
            });
            setSelectedVideo(null);
          }}
        />
      )}

      {/* Add by YouTube ID Modal */}
      {showAddById && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddById(false); }}>
          <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-hover)", borderRadius: 16, padding: "2rem", width: "100%", maxWidth: 480, boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: "0.4rem" }}>Add Video by YouTube ID</h2>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.25rem", lineHeight: 1.5 }}>
              Paste a YouTube video ID (e.g. <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: 4 }}>dQw4w9WgXcQ</code>) or full URL to load it directly into the thumbnail editor.
            </p>

            <input
              id="manual-video-id-input"
              type="text"
              placeholder="Video ID or YouTube URL..."
              value={manualId}
              autoFocus
              onChange={(e) => { setManualId(e.target.value); setManualIdError(null); }}
              onKeyDown={async (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  await handleAddById();
                }
              }}
              style={{ width: "100%", background: "var(--bg-card)", border: `1px solid ${manualIdError ? "rgba(239,68,68,0.6)" : "var(--border-hover)"}`, borderRadius: 10, padding: "10px 14px", color: "var(--text-primary)", fontSize: "0.95rem", outline: "none", boxSizing: "border-box", marginBottom: "0.75rem" }}
            />

            {manualIdError && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "0.6rem 0.9rem", color: "#fc8181", fontSize: "0.83rem", marginBottom: "0.75rem" }}>
                ⚠️ {manualIdError}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowAddById(false)}
                style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 18px", color: "var(--text-secondary)", fontSize: "0.88rem", cursor: "pointer" }}>
                Cancel
              </button>
              <button id="add-by-id-submit" onClick={handleAddById} disabled={manualIdLoading || !manualId.trim()}
                style={{ background: manualIdLoading ? "rgba(88,101,242,0.5)" : "linear-gradient(135deg, #5865f2, #7c3aed)", border: "none", borderRadius: 8, padding: "9px 22px", color: "white", fontSize: "0.88rem", fontWeight: 700, cursor: manualIdLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                {manualIdLoading ? (<><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Looking up...</>) : "Open in Editor →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
