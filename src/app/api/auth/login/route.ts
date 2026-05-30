import { NextRequest, NextResponse } from "next/server";
import { createOAuth2Client, getAuthUrl } from "@/lib/youtube";
import { cookies } from "next/headers";
import { promises as fs } from "fs";
import path from "path";

const SETTINGS_FILE = process.env.SERMONTHUMB_SETTINGS_PATH
  || path.join(/*turbopackIgnore: true*/ process.cwd(), ".thumbgen-settings.json");

export async function GET(request: NextRequest) {
  // Read creds from the persisted settings file (never from query params)
  let clientId = "";
  let clientSecret = "";
  let redirectUri = "";

  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf-8");
    const settings = JSON.parse(raw);
    clientId     = settings.youtubeClientId     || "";
    clientSecret = settings.youtubeClientSecret || "";
    redirectUri  = settings.youtubeRedirectUri  || "";
  } catch {
    // Settings file doesn't exist
  }

  // Fall back to env vars
  clientId     = clientId     || process.env.YOUTUBE_CLIENT_ID     || "";
  clientSecret = clientSecret || process.env.YOUTUBE_CLIENT_SECRET || "";
  redirectUri  = redirectUri  || process.env.YOUTUBE_REDIRECT_URI  || "";

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/settings?error=missing_credentials", request.url)
    );
  }

  if (!redirectUri) {
    redirectUri = `${request.nextUrl.origin}/api/auth/callback`;
  }

  const creds = { clientId, clientSecret, redirectUri };

  // Persist creds in short-lived cookies so callback can use them
  const cookieStore = await cookies();
  cookieStore.set("yt_client_id",      creds.clientId,     { httpOnly: true, maxAge: 600, path: "/" });
  cookieStore.set("yt_client_secret",  creds.clientSecret, { httpOnly: true, maxAge: 600, path: "/" });
  cookieStore.set("yt_redirect_uri",   creds.redirectUri,  { httpOnly: true, maxAge: 600, path: "/" });

  const oauth2Client = createOAuth2Client(creds);
  const url = getAuthUrl(oauth2Client);
  return NextResponse.redirect(url);
}
