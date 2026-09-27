import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Muzora",
  description: "Fast music streaming — inspired by SimpMusic",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Muzora",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-[var(--bg)] text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
