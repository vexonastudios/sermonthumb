/**
 * Frame extraction from YouTube video using ffmpeg
 */
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Resolve the ffmpeg binary path, handling both dev and packaged Electron app.
 * In production, the binary is bundled via extraResources to
 * resources/app/.next/standalone/node_modules/@ffmpeg-installer/
 */
function getFfmpegPath(): string {
  // First try the standard require() path (works in dev)
  try {
    const pkg = require("@ffmpeg-installer/ffmpeg");
    if (pkg.path && existsSync(pkg.path)) return pkg.path;
  } catch {
    // Module not found at default location — try production path
  }

  // Production: check relative to the standalone server's node_modules
  const prodPath = path.join(
    process.cwd(),
    "node_modules", "@ffmpeg-installer", "ffmpeg", "platforms",
    `${process.platform}-${process.arch}`,
    process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
  );
  if (existsSync(prodPath)) return prodPath;

  // Last resort: hope it's on PATH
  return process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
}

/**
 * Extract frames from a video URL at specified timestamps
 * Returns base64-encoded JPEG frames
 */
export async function extractFrames(
  videoUrl: string,
  timestamps: number[] = [30, 60, 120, 180, 240]
): Promise<string[]> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "thumb-"));

  try {
    const ffmpegPath = getFfmpegPath();
    
    const frames: string[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      const outputPath = path.join(tmpDir, `frame_${i}.jpg`);

      // No shell-specific stderr redirect — use windowsHide + ignore stderr via options
      const cmd = `"${ffmpegPath}" -ss ${ts} -i "${videoUrl}" -vframes 1 -q:v 2 -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720" "${outputPath}" -y`;

      try {
        await execAsync(cmd, { timeout: 30000, windowsHide: true });
        const buffer = await fs.readFile(outputPath);
        frames.push(buffer.toString("base64"));
      } catch {
        // Frame at this timestamp might not exist (video too short), skip
      }
    }

    return frames;
  } finally {
    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Download an image from URL and return as Buffer
 */
export async function fetchImageBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Get YouTube video stream URL for frame extraction
 * NOTE: This uses the maxres thumbnail as a fallback since
 * direct video download requires ytdl-core or similar
 */
export function getVideoThumbnailUrls(videoId: string): string[] {
  return [
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  ];
}
