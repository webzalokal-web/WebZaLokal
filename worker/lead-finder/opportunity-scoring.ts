import type { AuditSignalCollection } from "./audit-types";
import type { Opportunity } from "./analysis-types";
const clamp = (n: number) => Math.max(0, Math.min(100,n));
export function businessQuality(rating: number | null, reviewCount: number | null): number | null {
  const r = rating !== null && Number.isFinite(rating) && rating >= 0 && rating <= 5 ? clamp((rating-3)/2*100) : null;
  const n = reviewCount !== null && Number.isInteger(reviewCount) && reviewCount >= 0 ? clamp(25*Math.log10(reviewCount+1)) : null;
  if (r === null) return n === null ? null : Math.round(n);
  if (n === null) return Math.round(r);
  return Math.round(.7*r+.3*n);
}
export function contactability(signals: AuditSignalCollection | null, email: string | null): number | null {
  const passed = (key: string) => signals?.[key]?.status === "PASS";
  if (email || passed("email")) return 100;
  if (passed("contactForm")) return 90;
  if (passed("phone")) return 75;
  if (passed("messaging") || passed("socialProfiles")) return 55;
  if (passed("contactPage")) return 50;
  // Crawler UNKNOWN does not establish that no contact exists.
  return null;
}
export function opportunityScore(need: number | null, business: number | null, fixability: number | null, contact: number | null): Opportunity {
  const entries = [[need,.4],[business,.3],[fixability,.15],[contact,.15]] as const;
  const known = entries.filter(([v]) => v !== null);
  const weight = known.reduce((sum,[,w]) => sum+w,0);
  const score = need === null || !weight ? null : Math.round(known.reduce((sum,[v,w]) => sum+v!*w,0)/weight);
  const provisional = known.length !== 4;
  const priority = score === null ? "UNCLASSIFIED" : score >= 85 ? "HIGH" : score >= 70 ? "GOOD" : score >= 50 ? "MEDIUM" : score >= 25 ? "LOW" : "REJECT";
  return { websiteNeed:need,businessQuality:business,fixability,contactability:contact,score,provisional,coverage:Math.round(weight*100),priority,
    reason: score === null ? "Nedovoljno evidencea za Website Need; prioritet nije procijenjen." : `${priority}: ${score}/100. ${provisional ? `Privremena procjena: dostupno ${Math.round(weight*100)}% pondera, UNKNOWN komponente izostavljene i ponderi normalizirani.` : "Sve četiri komponente dostupne."} Website Need ${need}, Business Quality ${business ?? "UNKNOWN"}, Fixability ${fixability ?? "UNKNOWN"}, Contactability ${contact ?? "UNKNOWN"}.` };
}
