import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WebZaLokal | Od online pretrage do posjeta lokalu",
  description:
    "Moderne web stranice i digitalni QR meniji za kafiće, restorane i barove u Zagrebu.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hr">
      <body>{children}</body>
    </html>
  );
}
