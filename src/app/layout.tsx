import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { NetworkSyncProvider } from "@/components/providers/NetworkSyncProvider";
import { SessionProvider } from "@/components/providers/SessionProvider";

export const metadata: Metadata = {
  title: "GitTok — Swipe through GitHub",
  description:
    "Discover GitHub repositories through an immersive TikTok-style swipe feed",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <head>
        <script defer src="https://cloud.umami.is/script.js" data-website-id="ee7cfa9d-0b32-4803-ab60-3ca70d8a822c"></script>
      </head>
      <body className="font-sans antialiased bg-black text-white">
        <SessionProvider>
          <NetworkSyncProvider>
            {children}
            <BottomNav />
          </NetworkSyncProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
