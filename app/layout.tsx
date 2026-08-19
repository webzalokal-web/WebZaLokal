import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WebZaLokal | Točne informacije, više poziva, manje održavanja",
  description:
    "Moderne web stranice i digitalni QR meniji za restorane, kafiće, barove i male lokalne dućane.",
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
