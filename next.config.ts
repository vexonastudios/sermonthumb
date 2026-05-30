import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "yt3.ggpht.com" },
      { protocol: "https", hostname: "img.youtube.com" },
    ],
  },
  serverExternalPackages: ["canvas", "sharp", "@ffmpeg-installer/ffmpeg"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
