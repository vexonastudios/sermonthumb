import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createYouTubeClient } from "@/lib/youtube";
import { YouTubeVideo } from "@/lib/types";

/** Parse ISO 8601 duration (PT1M30S) → total seconds */
function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1]||"0") * 3600) + (parseInt(m[2]||"0") * 60) + parseInt(m[3]||"0");
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("yt_access_token")?.value;
  const refreshToken = cookieStore.get("yt_refresh_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const videoId = req.nextUrl.searchParams.get("id");
  if (!videoId || videoId.trim() === "") {
    return NextResponse.json({ error: "Missing video ID" }, { status: 400 });
  }

  // Extract the video ID from whatever the user pasted:
  //   https://youtu.be/UJ-XMdbg75M
  //   https://youtu.be/UJ-XMdbg75M?si=abc123
  //   https://www.youtube.com/watch?v=UJ-XMdbg75M
  //   https://www.youtube.com/watch?v=UJ-XMdbg75M&t=30s
  //   https://www.youtube.com/shorts/UJ-XMdbg75M
  //   https://www.youtube.com/embed/UJ-XMdbg75M
  //   UJ-XMdbg75M  (bare ID)
  function extractVideoId(input: string): string {
    const s = input.trim();
    try {
      const url = new URL(s);
      // youtu.be/<id>
      if (url.hostname === "youtu.be") {
        return url.pathname.slice(1).split("?")[0];
      }
      // youtube.com/watch?v=<id>
      const v = url.searchParams.get("v");
      if (v) return v;
      // youtube.com/shorts/<id>  or  youtube.com/embed/<id>
      const pathMatch = url.pathname.match(/\/(shorts|embed|v)\/([^/?&]+)/);
      if (pathMatch) return pathMatch[2];
    } catch {
      // Not a URL — treat as bare ID
    }
    return s;
  }

  const cleanId = extractVideoId(videoId);

  try {
    const youtube = createYouTubeClient(accessToken, refreshToken);
    const res = await youtube.videos.list({
      part: ["snippet", "contentDetails", "statistics"],
      id: [cleanId],
    });

    const v = res.data.items?.[0];
    if (!v) {
      return NextResponse.json({ error: `No video found with ID: ${cleanId}` }, { status: 404 });
    }

    const thumbs = v.snippet?.thumbnails;
    const hasCustomThumb = !!(thumbs?.maxres?.url);
    const thumbnailUrl =
      thumbs?.maxres?.url ||
      thumbs?.standard?.url ||
      thumbs?.high?.url ||
      thumbs?.medium?.url ||
      null;

    const video: YouTubeVideo = {
      id: v.id || cleanId,
      title: v.snippet?.title || "Untitled",
      description: "",
      publishedAt: v.snippet?.publishedAt || "",
      duration: v.contentDetails?.duration || "",
      thumbnailUrl,
      hasThumbnail: hasCustomThumb,
      channelTitle: v.snippet?.channelTitle || "",
      viewCount: v.statistics?.viewCount ?? undefined,
      likeCount: v.statistics?.likeCount ?? undefined,
    };

    return NextResponse.json({ video });
  } catch (err) {
    console.error("[by-id] fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch video" }, { status: 500 });
  }
}
