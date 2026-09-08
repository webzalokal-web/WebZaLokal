// Display labels only; stored enums and scoring remain unchanged.
export function reviewStatus(value: string | null | undefined) {
  const labels: Record<string, string> = { COMPLETE:"Završen",PARTIAL:"Djelomičan",FAILED:"Neuspješan",RUNNING:"U tijeku",PENDING:"Čeka",SUCCESS:"Završen",UNAVAILABLE:"Nije dostupno",UNKNOWN:"Nema dovoljno podataka",NOT_STARTED:"Nije započet",NO_WEBSITE:"Nema web-stranice",NO_WEBSITE_OPERATOR_CONFIRMED:"Potvrđeno da nema web-stranice" };
  return labels[value ?? ""] ?? "Nije dostupno";
}
export function analysisStatus(value: string) {
  return ({COMPLETE:"Završena",FAILED:"Neuspješna",RUNNING:"U tijeku",PENDING:"Čeka",PARTIAL:"Djelomična"} as Record<string,string>)[value] ?? "Nije dostupno";
}
export function priorityLabel(value: string | null | undefined) {
  return ({HIGH:"Vrlo visok",GOOD:"Visok",MEDIUM:"Srednji",LOW:"Nizak",REJECT:"Vrlo nizak",UNCLASSIFIED:"Nije procijenjen"} as Record<string,string>)[value ?? ""] ?? "Nije procijenjen";
}
export function businessLabel(name?: string | null, website?: string | null) {
  if(name?.trim()) return name.trim();
  try { if(website) return new URL(website).hostname.replace(/^www\./, ""); } catch { /* No reliable domain. */ }
  return "Naziv nije dostupan";
}
export function reviewMessage(message: string) {
  return message.replace(/website audit/gi,"pregled weba").replace(/re-audit/gi,"ponovni pregled weba").replace(/audita\b/gi,"pregleda weba").replace(/audit\b/gi,"pregled weba").replace(/UNKNOWN/g,"Nije dostupno");
}
