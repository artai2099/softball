import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./live.css";

export const metadata: Metadata = {
  title: { default: "GameDay Softball", template: "%s · GameDay" },
  description: "Live softball scorekeeping, team management, and game video.",
  icons:{icon:"/icon.svg"}
};

export const viewport: Viewport = { themeColor: "#041e42", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
