import {
  AUDIT_MAX_SECONDARY_PAGES,
  type AnalyzedAuditPage,
  type AuditEvidence,
  type AuditHeading,
  type AuditLink,
  type AuditPageKind,
  type AuditSignal,
  type AuditSignalCollection,
  type FirecrawlPage,
} from "./audit-types";
import { normalizePublicWebsiteUrl } from "./audit-validation";

const maximumStoredMarkdownCharacters = 50_000;
const maximumStoredTextCharacters = 25_000;
const maximumStoredLinks = 100;

const linkTokens: Record<Exclude<AuditPageKind, "homepage">, RegExp> = {
  contact: /(?:^|[\s/_-])(contact|kontakt|contatti|contacts?|reach-us|find-us)(?:$|[\s/?#_-])/i,
  services: /(?:^|[\s/_-])(menu|meni|jelovnik|cjenik|price-list|pricing|services?|usluge|ponuda)(?:$|[\s/?#_-])/i,
  about: /(?:^|[\s/_-])(about|o-nama|chi-siamo|story|priča|prica|team)(?:$|[\s/?#_-])/i,
  commercial: /(?:^|[\s/_-])(book|booking|reserve|reservation|rezervacija|rezerviraj|prenotazione|order|naruci|naruči|shop|store|delivery|dostava)(?:$|[\s/?#_-])/i,
};

const ctaPattern = /\b(book|booking|reserve|reservation|rezerviraj|rezervacija|contact|kontakt|call|nazovi|order|naruči|naruci|menu|meni|directions?|upute|karta)\b/i;

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanInline(value: string, maxLength: number) {
  return decodeEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function canonicalHost(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return "";
  }
}

function canonicalPageKey(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return value;
  }
}

function categoryForLink(url: string, text: string | null): Exclude<AuditPageKind, "homepage"> | null {
  const haystack = `${new URL(url).pathname} ${new URL(url).search} ${text ?? ""}`;
  const ordered: Exclude<AuditPageKind, "homepage">[] = ["contact", "services", "about", "commercial"];
  return ordered.find((kind) => linkTokens[kind].test(haystack)) ?? null;
}

function htmlLinks(html: string | null, baseUrl: string) {
  if (!html) return [] as AuditLink[];
  const links: AuditLink[] = [];
  const anchorPattern = /<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    if (links.length >= 500) break;
    const href = match[1] ?? match[2] ?? match[3] ?? "";
    let resolved: string;
    try {
      resolved = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    const url = normalizePublicWebsiteUrl(resolved);
    if (!url) continue;
    links.push({ url, text: cleanInline(match[4] ?? "", 200) || null, kind: "other" });
  }
  return links;
}

function allPageLinks(page: FirecrawlPage) {
  const baseUrl = page.finalUrl ?? page.requestedUrl;
  const combined = [...page.links, ...htmlLinks(page.html, baseUrl)];
  const seen = new Set<string>();
  return combined.filter((link) => {
    const key = canonicalPageKey(link.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function selectSecondaryPages(homepage: FirecrawlPage): AuditLink[] {
  if (homepage.status !== "SUCCESS") return [];
  const baseUrl = homepage.finalUrl ?? homepage.requestedUrl;
  const baseHost = canonicalHost(baseUrl);
  const homepageKey = canonicalPageKey(baseUrl);
  const candidates = allPageLinks(homepage)
    .filter((link) => canonicalHost(link.url) === baseHost)
    .filter((link) => canonicalPageKey(link.url) !== homepageKey)
    .filter((link) => !/\.(?:jpe?g|png|gif|webp|svg|pdf|zip|mp4|mp3|xml)(?:$|\?)/i.test(new URL(link.url).pathname))
    .map((link) => {
      const kind = categoryForLink(link.url, link.text);
      return kind ? { ...link, kind } : null;
    })
    .filter((link): link is AuditLink & { kind: Exclude<AuditPageKind, "homepage"> } => link !== null);

  const selected: AuditLink[] = [];
  const selectedKeys = new Set<string>();
  for (const kind of ["contact", "services", "about", "commercial"] as const) {
    const match = candidates.find((candidate) => candidate.kind === kind);
    if (!match) continue;
    const key = canonicalPageKey(match.url);
    selected.push(match);
    selectedKeys.add(key);
  }
  for (const candidate of candidates) {
    if (selected.length >= AUDIT_MAX_SECONDARY_PAGES) break;
    const key = canonicalPageKey(candidate.url);
    if (selectedKeys.has(key)) continue;
    selected.push(candidate);
    selectedKeys.add(key);
  }
  return selected.slice(0, AUDIT_MAX_SECONDARY_PAGES);
}

function headingsFromHtml(html: string | null): AuditHeading[] {
  if (!html) return [];
  const headings: AuditHeading[] = [];
  const pattern = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  for (const match of html.matchAll(pattern)) {
    if (headings.length >= 80) break;
    const text = cleanInline(match[2], 500);
    if (text) headings.push({ level: Number(match[1]) as 1 | 2 | 3, text });
  }
  return headings;
}

function headingsFromMarkdown(markdown: string | null): AuditHeading[] {
  if (!markdown) return [];
  const headings: AuditHeading[] = [];
  for (const line of markdown.split("\n")) {
    const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    headings.push({ level: match[1].length as 1 | 2 | 3, text: cleanInline(match[2], 500) });
    if (headings.length >= 80) break;
  }
  return headings.filter((heading) => heading.text);
}

function htmlMetaContent(html: string | null, selector: "description" | "viewport") {
  if (!html) return null;
  const metaPattern = /<meta\b[^>]*>/gi;
  for (const [tag] of html.matchAll(metaPattern)) {
    const name = /\bname\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    if ((name?.[1] ?? name?.[2] ?? name?.[3] ?? "").toLowerCase() !== selector) continue;
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    return cleanInline(content?.[1] ?? content?.[2] ?? content?.[3] ?? "", 1_000) || null;
  }
  return null;
}

function htmlTitle(html: string | null) {
  const match = html ? /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html) : null;
  return match ? cleanInline(match[1], 500) || null : null;
}

function cleanedText(html: string | null, markdown: string | null) {
  if (markdown) {
    return markdown
      .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
      .replace(/[`*_>#~-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maximumStoredTextCharacters) || null;
  }
  if (!html) return null;
  return cleanInline(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, " "),
    maximumStoredTextCharacters,
  ) || null;
}

function evidence(pageUrl: string | null, detail: string, value?: string | number | boolean | null): AuditEvidence[] {
  return [{ pageUrl, detail, ...(value === undefined ? {} : { value }) }];
}

function signal(status: AuditSignal["status"], pageUrl: string | null, detail: string, value?: string | number | boolean | null): AuditSignal {
  return { status, evidence: evidence(pageUrl, detail, value) };
}

function foundLink(links: AuditLink[], pattern: RegExp) {
  return links.find((link) => pattern.test(`${link.url} ${link.text ?? ""}`));
}

function titleAndDescription(page: FirecrawlPage) {
  return {
    title: page.title ?? htmlTitle(page.html),
    metaDescription: page.metaDescription ?? htmlMetaContent(page.html, "description"),
  };
}

export function analyzeFirecrawlPage(page: FirecrawlPage): AnalyzedAuditPage {
  const pageUrl = page.finalUrl ?? page.requestedUrl;
  const links: AuditLink[] = allPageLinks(page).slice(0, maximumStoredLinks).map((link): AuditLink => ({
    ...link,
    kind: categoryForLink(link.url, link.text) ?? "other",
  }));
  const headings = headingsFromHtml(page.html);
  if (headings.length === 0) headings.push(...headingsFromMarkdown(page.markdown));
  const { title, metaDescription } = titleAndDescription(page);
  const successful = page.status === "SUCCESS" && page.httpStatus !== null && page.httpStatus < 400;
  const viewport = htmlMetaContent(page.html, "viewport");
  const normalizedText = cleanedText(page.html, page.markdown);
  const phone = page.html?.match(/href\s*=\s*["']tel:([^"']+)["']/i)?.[1]?.trim() ?? null;
  const email = page.html?.match(/href\s*=\s*["']mailto:([^?"']+)/i)?.[1]?.trim()
    ?? normalizedText?.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0]
    ?? null;
  const formFound = Boolean(page.html && /<form\b/i.test(page.html));
  const booking = foundLink(links, /\b(book|booking|reserve|reservation|rezervacija|rezerviraj|prenotazione)\b/i);
  const ordering = foundLink(links, /\b(order|naruci|naruči|delivery|dostava|glovo|wolt)\b/i);
  const messaging = foundLink(links, /(?:wa\.me|whatsapp|m\.me|messenger|viber)/i);
  const social = links.filter((link) => /(?:instagram\.com|facebook\.com|tiktok\.com|linkedin\.com|youtube\.com)/i.test(link.url)).slice(0, 10);
  const maps = foundLink(links, /(?:google\.[^/]+\/maps|maps\.google|goo\.gl\/maps|apple\.com\/maps)/i);
  const menuServices = links.find((link) => link.kind === "services");
  const contact = links.find((link) => link.kind === "contact") ?? (page.pageKind === "contact" ? { url: pageUrl } : undefined);
  const cta = links.find((link) => ctaPattern.test(link.text ?? ""));

  const unavailableSignal = (detail: string) => signal("UNKNOWN", pageUrl, detail);
  const foundOrUnknown = (value: unknown, foundDetail: string, unknownDetail: string, evidenceValue?: string | number | boolean | null) =>
    value ? signal("PASS", pageUrl, foundDetail, evidenceValue) : unavailableSignal(unknownDetail);

  return {
    ...page,
    title,
    metaDescription,
    headings,
    relevantLinks: links,
    markdown: page.markdown?.slice(0, maximumStoredMarkdownCharacters) || null,
    cleanedText: normalizedText,
    technicalSignals: {
      availability: successful
        ? signal("PASS", pageUrl, "Pregledana stranica vratila je uspješan HTTP status.", page.httpStatus)
        : page.httpStatus !== null && page.httpStatus >= 400
          ? signal("FAIL", pageUrl, "Pregledana stranica vratila je HTTP grešku.", page.httpStatus)
          : unavailableSignal("Dohvat stranice nije dao pouzdan HTTP rezultat."),
      https: page.finalUrl
        ? signal(page.finalUrl.startsWith("https:") ? "PASS" : "FAIL", pageUrl, page.finalUrl.startsWith("https:") ? "Finalni URL koristi HTTPS." : "Finalni URL koristi HTTP.", page.finalUrl)
        : unavailableSignal("Finalni URL nije dostupan."),
      mobileViewport: successful && page.html
        ? signal(viewport ? "PASS" : "FAIL", pageUrl, viewport ? "Pronađen je mobile viewport meta signal." : "U dohvaćenom HTML-u nema viewport meta oznake.", viewport)
        : unavailableSignal("Viewport nije moguće potvrditi iz dostupnog sadržaja."),
    },
    seoSignals: {
      title: successful && (page.html || title)
        ? signal(title ? "PASS" : "FAIL", pageUrl, title ? "Pronađen je title element." : "U dohvaćenom HTML-u title nije pronađen.", title)
        : unavailableSignal("Title nije moguće pouzdano provjeriti bez HTML-a ili metadata vrijednosti."),
      metaDescription: successful && (page.html || metaDescription)
        ? signal(metaDescription ? "PASS" : "FAIL", pageUrl, metaDescription ? "Pronađen je meta description." : "U dohvaćenom HTML-u meta description nije pronađen.", metaDescription)
        : unavailableSignal("Meta description nije moguće pouzdano provjeriti bez HTML-a ili metadata vrijednosti."),
      h1: successful && (page.html || page.markdown)
        ? signal(headings.some((heading) => heading.level === 1) ? "PASS" : "FAIL", pageUrl, headings.some((heading) => heading.level === 1) ? "Pronađen je H1." : "U dohvaćenom sadržaju H1 nije pronađen.", headings.filter((heading) => heading.level === 1).length)
        : unavailableSignal("H1 nije moguće pouzdano provjeriti bez HTML-a ili markdowna."),
    },
    conversionSignals: {
      phone: foundOrUnknown(phone, "Pronađen je javni tel: kontakt.", "Telefon nije potvrđen u pregledanom sadržaju.", phone),
      email: foundOrUnknown(email, "Pronađen je javni mailto: kontakt.", "Email nije potvrđen u pregledanom sadržaju.", email),
      contactPage: foundOrUnknown(contact, "Pronađena je kontakt stranica.", "Kontakt stranica nije potvrđena među pronađenim linkovima.", contact?.url),
      contactForm: foundOrUnknown(formFound, "Pronađen je form element.", "Kontakt forma nije potvrđena; može biti učitana JavaScriptom.", formFound || null),
      booking: foundOrUnknown(booking, "Pronađen je booking/reservation link.", "Booking nije potvrđen među pregledanim linkovima.", booking?.url),
      onlineOrdering: foundOrUnknown(ordering, "Pronađen je online ordering link.", "Online ordering nije potvrđen među pregledanim linkovima.", ordering?.url),
      primaryCta: foundOrUnknown(cta, "Pronađen je deterministički prepoznat CTA.", "Glavni CTA nije moguće pouzdano potvrditi.", cta?.text ?? cta?.url),
      messaging: foundOrUnknown(messaging, "Pronađen je messaging kontaktni link.", "Messaging link nije potvrđen.", messaging?.url),
      socialProfiles: foundOrUnknown(social.length, "Pronađeni su social profile linkovi.", "Social profili nisu potvrđeni.", social.length),
      mapsDirections: foundOrUnknown(maps, "Pronađen je Maps/directions link.", "Maps/directions link nije potvrđen.", maps?.url),
      menuServicesPricing: foundOrUnknown(menuServices, "Pronađen je menu/services/pricing link.", "Menu/services/pricing link nije potvrđen.", menuServices?.url),
    },
  };
}

function mergeSignals(pages: AnalyzedAuditPage[], key: keyof AnalyzedAuditPage): AuditSignalCollection {
  const collections = pages.map((page) => page[key]).filter((value): value is AuditSignalCollection => {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  });
  const names = new Set(collections.flatMap((collection) => Object.keys(collection)));
  const merged: AuditSignalCollection = {};
  for (const name of names) {
    const signals = collections.map((collection) => collection[name]).filter(Boolean);
    const passing = signals.filter((candidate) => candidate.status === "PASS");
    const failing = signals.filter((candidate) => candidate.status === "FAIL");
    const selected = passing.length ? passing : failing.length ? failing : signals;
    merged[name] = {
      status: passing.length ? "PASS" : failing.length ? "FAIL" : "UNKNOWN",
      evidence: selected.flatMap((candidate) => candidate.evidence).slice(0, 20),
    };
  }
  return merged;
}

export function aggregateAuditSignals(pages: AnalyzedAuditPage[]) {
  const httpErrorPages = pages.filter((page) => page.httpStatus !== null && page.httpStatus >= 400);
  const indeterminatePages = pages.filter((page) => page.status === "FAILED" && page.httpStatus === null);
  const reviewedPagesSignal: AuditSignal = pages.length === 0
    ? { status: "UNKNOWN", evidence: [{ pageUrl: null, detail: "Nijedna stranica nije pregledana." }] }
    : httpErrorPages.length > 0
      ? {
          status: "FAIL",
          evidence: httpErrorPages.map((page) => ({
            pageUrl: page.finalUrl ?? page.requestedUrl,
            detail: "Pregledana stranica vratila je HTTP grešku.",
            value: page.httpStatus,
          })),
        }
      : indeterminatePages.length > 0
        ? {
            status: "UNKNOWN",
            evidence: indeterminatePages.map((page) => ({
              pageUrl: page.requestedUrl,
              detail: "Provider nije uspio dohvatiti stranicu; nije dokazano da je URL neispravan.",
              value: page.errorCode,
            })),
          }
      : {
          status: "PASS",
          evidence: [{ pageUrl: pages[0].finalUrl ?? pages[0].requestedUrl, detail: "Među stvarno pregledanim stranicama nema HTTP/crawl greške.", value: pages.length }],
        };
  const technicalSignals = mergeSignals(pages, "technicalSignals");
  technicalSignals.reviewedPages = reviewedPagesSignal;
  return {
    technicalSignals,
    conversionSignals: mergeSignals(pages, "conversionSignals"),
    seoSignals: mergeSignals(pages.filter((page) => page.pageKind === "homepage"), "seoSignals"),
    contentSignals: {
      pageKinds: pages.filter((page) => page.status === "SUCCESS").map((page) => page.pageKind),
      languages: [...new Set(pages.map((page) => page.language).filter(Boolean))],
      storedMarkdownCharacters: pages.reduce((total, page) => total + (page.markdown?.length ?? 0), 0),
      storedTextCharacters: pages.reduce((total, page) => total + (page.cleanedText?.length ?? 0), 0),
    },
  };
}
