import type { EvidenceItem, Finding } from "../../worker/lead-finder/analysis-types";

export const findingLevels = { HIGH: "Visoka", MEDIUM: "Srednja", LOW: "Niska" } as const;
type Explanation = { problem: string; whyItMatters: string; improvement: string };

// Presentation only: never change saved findings, confidence or scoring.
// These explanations apply only when the referenced M2 check explicitly failed.
const explanations: Record<string, Explanation> = {
  "signal:technical:mobileViewport": {
    problem: "Nedostaje standardna postavka za mobilni prikaz",
    whyItMatters: "Stranica nema jednu od standardnih postavki za prikaz na mobitelima. Zbog toga se na nekim uređajima sadržaj može prikazivati nepravilno i biti teži za čitanje.",
    improvement: "Dodati postavku za prilagodbu širini zaslona i provjeriti prikaz na mobitelu.",
  },
  "signal:seo:h1": {
    problem: "Glavni naslov nije jasno označen u strukturi početne stranice",
    whyItMatters: "Pregled nije pronašao oznaku glavnog naslova, iako vidljivi naslov može postojati. Jasno označen naslov pomaže alatima koji čitaju stranicu naglas da prenesu što lokal nudi.",
    improvement: "Provjeriti postojeći naslov, jasno navesti što lokal nudi i označiti ga kao glavni naslov stranice.",
  },
  "signal:seo:title": {
    problem: "Na pregledanoj stranici nije pronađen naziv koji se prikazuje na kartici preglednika.",
    whyItMatters: "Jasan naziv može pomoći posjetiteljima da prepoznaju lokal među otvorenim stranicama i rezultatima pretrage.",
    improvement: "Dodati kratak naziv s imenom lokala i njegovom glavnom ponudom.",
  },
  "signal:seo:metaDescription": {
    problem: "Na pregledanoj stranici nije pronađen kratak opis namijenjen rezultatima pretrage.",
    whyItMatters: "Takav opis može pomoći ljudima da prije otvaranja stranice razumiju što lokal nudi.",
    improvement: "Dodati kratak, jasan opis lokala, ponude i lokacije.",
  },
  "signal:technical:https": {
    problem: "Zabilježena završna adresa pregledane stranice koristi nezaštićenu vezu.",
    whyItMatters: "Nezaštićena veza može smanjiti povjerenje posjetitelja i ne štiti prijenos podataka na isti način kao zaštićena veza.",
    improvement: "Omogućiti zaštićenu vezu i provjeriti vodi li postojeća adresa na nju.",
  },
  "signal:technical:availability": {
    problem: "Pri provjeri je pregledana stranica vratila grešku.",
    whyItMatters: "Posjetitelj koji naiđe na istu grešku možda neće moći doći do ponude ili kontakta.",
    improvement: "Otvoriti adresu iz dokaza i provjeriti te ukloniti uzrok greške.",
  },
};

function plainLanguage(text: string) {
  return text
    .replace(/\bCTA\b/g, "poziv na radnju")
    .replace(/\bviewport meta (?:tag|oznaka)\b/gi, "postavka za prikaz na mobitelima")
    .replace(/\bmeta description\b/gi, "kratak opis za rezultate pretrage")
    .replace(/\bH1\b/g, "posebno označen glavni naslov")
    .replace(/\bSEO\b/g, "pronalazak putem tražilica")
    .replace(/\bHTML\b/g, "kod stranice");
}

export function presentFinding(finding: Finding, evidence: EvidenceItem[]): Explanation {
  // For multiple refs, prefer generic copy to incorrectly extending a single
  // technical finding into a claim about the whole website.
  if (finding.evidenceRefs.length === 1) {
    const ref = finding.evidenceRefs[0];
    const source = evidence.find(item => item.id === ref);
    if (source?.kind === "signal" && source.status === "FAIL" && explanations[ref]) return explanations[ref];
  }
  return {
    problem: plainLanguage(finding.problem),
    whyItMatters: "Ako se nalaz potvrdi u korištenju stranice, poboljšanje može posjetiteljima olakšati razumijevanje ponude ili sljedeći korak.",
    improvement: plainLanguage(finding.suggestedFix),
  };
}
