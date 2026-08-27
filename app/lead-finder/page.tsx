import type { Metadata } from "next";
import LeadFinder from "./lead-finder";

export const metadata: Metadata = {
  title: "Lead Finder | WebZaLokal",
  description: "Interni WebZaLokal alat za pronalaženje i spremanje potencijalnih poslovnih leadova.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

export default function LeadFinderPage() {
  return <LeadFinder />;
}
