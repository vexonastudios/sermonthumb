import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getChannelVideos } from "@/lib/youtube";
import { YouTubeVideo } from "@/lib/types";

/** Parse ISO 8601 duration (PT1M30S) → total seconds */
function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1]||"0") * 3600) + (parseInt(m[2]||"0") * 60) + parseInt(m[3]||"0");
}

export async function GET() {
  const cookieStore = await cookies();
  const accessToken  = cookieStore.get("yt_access_token")?.value;
  const refreshToken = cookieStore.get("yt_refresh_token")?.value;
  const clientId     = cookieStore.get("yt_client_id")?.value;
  const clientSecret = cookieStore.get("yt_client_secret")?.value;
  const redirectUri  = cookieStore.get("yt_redirect_uri")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { videos, channel } = await getChannelVideos(
      accessToken,
      refreshToken,
      500, // fetch up to 500 videos
      undefined,
      { clientId: clientId || "", clientSecret: clientSecret || "", redirectUri: redirectUri || "" },
      (tokens) => {
        if (tokens.access_token) {
          cookieStore.set("yt_access_token", tokens.access_token, {
            httpOnly: true, secure: process.env.NODE_ENV === "production", path: "/",
            maxAge: tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600
          });
        }
        if (tokens.refresh_token) {
          cookieStore.set("yt_refresh_token", tokens.refresh_token, {
            httpOnly: true, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30
          });
        }
      }
    );

    // Filter rules:
    //   - Skip active live streams (liveBroadcastContent === "live")
    //   - Skip Shorts (< 90 s) — but EXEMPT upcoming/scheduled videos
    //     because they have P0D duration before they're published
    const longVideos = videos.filter(v => {
      const live = v.snippet?.liveBroadcastContent ?? "none";
      const dur  = parseDuration(v.contentDetails?.duration || "");
      // Debug: log anything non-standard
      if (live !== "none") console.log(`[videos] id=${v.id} live=${live} dur=${v.contentDetails?.duration} title=${v.snippet?.title?.slice(0,40)}`);
      if (live === "live") return false;           // always skip active streams
      if (live === "upcoming") return true;        // always include scheduled
      return dur >= 90;                            // skip Shorts
    });

    // Log ALL upcoming/scheduled that were found for debugging
    const upcomingFound = videos.filter(v => v.snippet?.liveBroadcastContent === "upcoming");
    console.log(`[videos] upcoming/scheduled found in playlist: ${upcomingFound.length}`);
    upcomingFound.forEach(v => console.log(`  -> scheduled: id=${v.id} title=${v.snippet?.title?.slice(0,60)}`));


    console.log(`[videos] fetched=${videos.length} afterFilter=${longVideos.length}`);

    const mapped: YouTubeVideo[] = longVideos.map((v) => {
      const thumbs = v.snippet?.thumbnails;

      /**
       * Custom thumbnail detection:
       * `maxres` (1280×720) is ONLY present when the creator has uploaded
       * a custom thumbnail. `standard` also appears on many auto-generated
       * thumbnails and cannot be used as a reliable signal.
       */
      const hasCustomThumb = !!(thumbs?.maxres?.url);

      // Use the best available thumbnail URL for display
      const thumbnailUrl =
        thumbs?.maxres?.url ||
        thumbs?.standard?.url ||
        thumbs?.high?.url ||
        thumbs?.medium?.url ||
        null;

      return {
        id: v.id || "",
        title: v.snippet?.title || "Untitled",
        // Omit description — can be 10KB+ per video (transcripts/bible verses)
        // which causes the JSON response to balloon to several MB for 400+ videos
        description: "",
        publishedAt: v.snippet?.publishedAt || "",
        duration: v.contentDetails?.duration || "",
        thumbnailUrl,
        hasThumbnail: hasCustomThumb,
        channelTitle: v.snippet?.channelTitle || "",
        viewCount: v.statistics?.viewCount ?? undefined,
        likeCount: v.statistics?.likeCount ?? undefined,
      };
    });

    // Deduplicate by video ID (YouTube API can return the same video across pages)
    const seen = new Set<string>();
    const unique = mapped.filter(v => { if (!v.id || seen.has(v.id)) return false; seen.add(v.id); return true; });

    console.log(`[videos] unique=${unique.length} (from ${longVideos.length} filtered, ${videos.length} fetched)`);

    // Sort: videos without custom thumbnails first, then newest first within each group
    unique.sort((a, b) => {
      if (a.hasThumbnail === b.hasThumbnail) {
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      }
      return a.hasThumbnail ? 1 : -1;
    });

    const channelInfo = {
      id: channel?.id,
      title: channel?.snippet?.title,
      thumbnailUrl:
        channel?.snippet?.thumbnails?.default?.url ||
        channel?.snippet?.thumbnails?.medium?.url,
    };

    return NextResponse.json(
      { videos: unique, channel: channelInfo },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err) {
    console.error("Videos fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch videos" },
      { status: 500 }
    );
  }
}

