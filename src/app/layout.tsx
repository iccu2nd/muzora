import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Muzora",
  description: "Fast music streaming — inspired by SimpMusic",
  themeColor: "#0a0a0a",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Muzora",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
      </head>
      <body className="antialiased bg-[var(--bg)] text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
