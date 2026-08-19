import type { Metadata } from "next";
import StudioLite from "./studio-lite";

export const metadata: Metadata = {
  title: "Studio Lite | WebZaLokal",
  description: "Interni alat za pripremu WebZaLokal koncept-projekata.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function StudioPage() {
  return <StudioLite />;
}
