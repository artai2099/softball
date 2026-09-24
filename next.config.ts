import type { NextConfig } from "next";

const configuredLiveKitUrl = process.env.LIVEKIT_PUBLIC_URL || process.env.LIVEKIT_URL;
let configuredLiveKitOrigin = "";
try {
  configuredLiveKitOrigin = configuredLiveKitUrl ? new URL(configuredLiveKitUrl).origin : "";
} catch {
  configuredLiveKitOrigin = "";
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
        { key: "Content-Security-Policy", value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          `connect-src 'self' https://*.supabase.co wss://*.supabase.co wss://*.livekit.cloud https://*.livekit.cloud https://vercel.live${configuredLiveKitOrigin ? ` ${configuredLiveKitOrigin}` : ""}`,
          "media-src 'self' blob: data:",
          "worker-src 'self' blob:",
          "font-src 'self' data:",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'"
        ].join("; ") }
      ]
    }];
  }
};

export default nextConfig;
