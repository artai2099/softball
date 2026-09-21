import "server-only";
import { z } from "zod";

const schema=z.object({
  NEXT_PUBLIC_APP_URL:z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL:z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY:z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY:z.string().min(20),
  LIVEKIT_URL:z.string().url().refine(value=>value.startsWith("wss://"),"LIVEKIT_URL must use wss://"),
  LIVEKIT_PUBLIC_URL:z.string().url().refine(value=>value.startsWith("wss://"),"LIVEKIT_PUBLIC_URL must use wss://").optional(),
  LIVEKIT_API_KEY:z.string().min(3),
  LIVEKIT_API_SECRET:z.string().min(16)
});

export const env=schema.parse({
  NEXT_PUBLIC_APP_URL:process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL:process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY,
  LIVEKIT_URL:process.env.LIVEKIT_URL,
  LIVEKIT_PUBLIC_URL:process.env.LIVEKIT_PUBLIC_URL || undefined,
  LIVEKIT_API_KEY:process.env.LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET:process.env.LIVEKIT_API_SECRET
});

const livekitClientUrl = env.LIVEKIT_PUBLIC_URL || env.LIVEKIT_URL;
if (process.env.NODE_ENV === "production" && /\bwss:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::|\/|$)/i.test(livekitClientUrl)) {
  throw new Error("LIVEKIT_PUBLIC_URL/LIVEKIT_URL cannot point to localhost in production. Configure a public wss:// LiveKit endpoint for Vercel.");
}
