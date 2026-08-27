import { GooglePlacesProvider } from "./lead-finder/google-places-provider";
import { getLeadFinderSummary } from "./lead-finder/repository";
import { runLeadSearch } from "./lead-finder/service";
import { BusinessSearchProviderError } from "./lead-finder/types";
import { validateLeadSearchInput } from "./lead-finder/validation";

type ContactPayload = {
  businessName?: unknown;
  email?: unknown;
  packageName?: unknown;
  website?: unknown;
  message?: unknown;
  consent?: unknown;
  companySite?: unknown;
  language?: unknown;
  startedAt?: unknown;
};

type EventPayload = {
  event?: unknown;
  path?: unknown;
  language?: unknown;
  referrer?: unknown;
  detail?: unknown;
};

const allowedPackages = new Set([
  "Besplatni pregled postojeće stranice ili menija",
  "Digitalni meni",
  "Web za lokal",
  "Web + meni",
  "Samostalno uređivanje weba i menija",
  "A free review of your current website or menu",
  "Digital menu",
  "Venue website",
  "Website + menu",
  "Self-editable website and menu",
]);

const allowedEvents = new Set([
  "page_view",
  "language_change",
  "demo_open",
  "concept_open",
  "package_select",
  "audit_select",
  "contact_success",
  "contact_error",
  "contact_received",
  "contact_upstream_error",
  "contact_blocked",
]);

const apiHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function json(data: unknown, status = 200, extraHeaders?: HeadersInit) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...apiHeaders,
      ...extraHeaders,
    },
  });
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validWebsite(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function singleLine(value: string) {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  return origin !== null && origin === new URL(request.url).origin;
}

async function timingSafeStringEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const subtle: SubtleCrypto & {
    timingSafeEqual?: (left: ArrayBuffer, right: ArrayBuffer) => boolean;
  } = crypto.subtle;
  const [leftDigest, rightDigest] = await Promise.all([
    subtle.digest("SHA-256", encoder.encode(left)),
    subtle.digest("SHA-256", encoder.encode(right)),
  ]);

  if (typeof subtle.timingSafeEqual === "function") {
    return subtle.timingSafeEqual(leftDigest, rightDigest);
  }

  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function basicCredentials(request: Request) {
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Basic ")) return null;

  try {
    const decoded = atob(authorization.slice(6));
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function leadFinderConfigured(env: Env) {
  return Boolean(env.LEAD_FINDER_USERNAME && env.LEAD_FINDER_ACCESS_TOKEN);
}

async function leadFinderAuthorized(request: Request, env: Env) {
  const credentials = basicCredentials(request);
  if (!credentials || !leadFinderConfigured(env)) return false;
  const [usernameMatches, passwordMatches] = await Promise.all([
    timingSafeStringEqual(credentials.username, env.LEAD_FINDER_USERNAME),
    timingSafeStringEqual(credentials.password, env.LEAD_FINDER_ACCESS_TOKEN),
  ]);
  return usernameMatches && passwordMatches;
}

function leadFinderChallenge(apiRequest: boolean) {
  const headers = {
    "WWW-Authenticate": 'Basic realm="WebZaLokal Lead Finder", charset="UTF-8"',
  };
  if (apiRequest) {
    return json(
      { success: false, code: "UNAUTHORIZED", message: "Potreban je interni Lead Finder pristup." },
      401,
      headers,
    );
  }
  return new Response("Potreban je interni WebZaLokal Lead Finder pristup.", {
    status: 401,
    headers: {
      ...apiHeaders,
      ...headers,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function referrerHost(value: string) {
  if (!value) return "direct";
  try {
    return new URL(value).hostname.slice(0, 120) || "direct";
  } catch {
    return "invalid";
  }
}

async function hashKey(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value.toLowerCase()));
  return Array.from(new Uint8Array(digest).slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function writeAnalytics(
  env: Env,
  event: string,
  path: string,
  language: string,
  referrer: string,
  detail: string,
) {
  if (!allowedEvents.has(event)) return;
  env.ANALYTICS.writeDataPoint({
    blobs: [event, path.slice(0, 160), language.slice(0, 8), referrerHost(referrer), detail.slice(0, 80)],
    doubles: [1],
    indexes: [event],
  });
}

async function parseJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("unsupported_content_type");
  }
  return (await request.json()) as T;
}

async function handleEvent(request: Request, env: Env) {
  if (!sameOrigin(request)) return json({ success: false }, 403);
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > 4096) return json({ success: false }, 413);

  const rate = await env.EVENT_LIMITER.limit({ key: "public-events" });
  if (!rate.success) return json({ success: false }, 429, { "Retry-After": "60" });

  let payload: EventPayload;
  try {
    payload = await parseJson<EventPayload>(request);
  } catch {
    return json({ success: false }, 400);
  }

  const event = text(payload.event, 40);
  if (!allowedEvents.has(event) || event.startsWith("contact_")) return json({ success: false }, 400);

  writeAnalytics(
    env,
    event,
    text(payload.path, 160) || "/",
    text(payload.language, 8) || "hr",
    text(payload.referrer, 500),
    text(payload.detail, 80),
  );

  return json({ success: true }, 202);
}

async function handleContact(request: Request, env: Env) {
  if (!sameOrigin(request)) {
    writeAnalytics(env, "contact_blocked", "/api/contact", "unknown", "", "origin");
    return json({ success: false, message: "Zahtjev nije dopušten." }, 403);
  }

  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > 24_000) return json({ success: false, message: "Upit je prevelik." }, 413);

  const globalRate = await env.CONTACT_GLOBAL_LIMITER.limit({ key: "contact-form-global" });
  if (!globalRate.success) {
    writeAnalytics(env, "contact_blocked", "/api/contact", "unknown", "", "global-rate");
    return json({ success: false, message: "Previše pokušaja. Pokušajte ponovno za minutu." }, 429, { "Retry-After": "60" });
  }

  let payload: ContactPayload;
  try {
    payload = await parseJson<ContactPayload>(request);
  } catch {
    return json({ success: false, message: "Podaci obrasca nisu ispravni." }, 400);
  }

  const businessName = text(payload.businessName, 100);
  const email = text(payload.email, 254);
  const packageName = text(payload.packageName, 120);
  const website = text(payload.website, 500);
  const message = text(payload.message, 3000);
  const language = text(payload.language, 8) === "en" ? "en" : "hr";
  const honeypot = text(payload.companySite, 200);
  const startedAt = typeof payload.startedAt === "number" ? payload.startedAt : 0;
  const elapsed = Date.now() - startedAt;

  if (honeypot) {
    writeAnalytics(env, "contact_blocked", "/api/contact", language, "", "honeypot");
    return json({ success: true }, 202);
  }

  if (elapsed < 2_000 || elapsed > 86_400_000) {
    writeAnalytics(env, "contact_blocked", "/api/contact", language, "", "timing");
    return json({ success: false, message: "Osvježite stranicu i pokušajte ponovno." }, 400);
  }

  if (
    businessName.length < 2 ||
    !validEmail(email) ||
    !allowedPackages.has(packageName) ||
    !validWebsite(website) ||
    message.length < 10 ||
    payload.consent !== true
  ) {
    return json({ success: false, message: "Provjerite unesene podatke." }, 400);
  }

  const emailRateKey = await hashKey(email);
  const emailRate = await env.CONTACT_LIMITER.limit({ key: emailRateKey });
  if (!emailRate.success) {
    writeAnalytics(env, "contact_blocked", "/api/contact", language, "", "email-rate");
    return json({ success: false, message: "Previše pokušaja. Pokušajte ponovno za minutu." }, 429, { "Retry-After": "60" });
  }

  const submissionId = crypto.randomUUID();
  if (!env.RESEND_API_KEY) {
    console.error("contact_delivery_not_configured", { submissionId, provider: "resend" });
    writeAnalytics(env, "contact_upstream_error", "/api/contact", language, "", "configuration");
    return json({ success: false, message: "Dostava trenutačno nije dostupna. Pošaljite e-mail izravno." }, 503);
  }

  const emailText = [
    "Novi upit putem WebZaLokal kontakt-forme",
    "",
    `ID upita: ${submissionId}`,
    `Naziv poslovanja: ${businessName}`,
    `Kontakt e-mail: ${email}`,
    `Odabrana usluga: ${packageName}`,
    `Postojeći web ili meni: ${website || "Nije navedeno"}`,
    `Jezik obrasca: ${language.toUpperCase()}`,
    "",
    "Poruka:",
    message,
  ].join("\n");

  let upstream: Response;
  try {
    upstream = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": submissionId,
      },
      body: JSON.stringify({
        from: env.CONTACT_FROM,
        to: [env.CONTACT_EMAIL],
        reply_to: email,
        subject: `Novi WebZaLokal upit · ${singleLine(businessName)}`,
        text: emailText,
      }),
    });
  } catch (error) {
    console.error("contact_upstream_unreachable", { submissionId, provider: "resend", error: String(error) });
    writeAnalytics(env, "contact_upstream_error", "/api/contact", language, "", "network");
    return json({ success: false, message: "Dostava trenutačno nije dostupna. Pošaljite e-mail izravno." }, 502);
  }

  if (!upstream.ok) {
    console.error("contact_upstream_error", { submissionId, provider: "resend", status: upstream.status });
    writeAnalytics(env, "contact_upstream_error", "/api/contact", language, "", String(upstream.status));
    return json({ success: false, message: "Dostava trenutačno nije dostupna. Pošaljite e-mail izravno." }, 502);
  }

  console.log("contact_received", { submissionId, provider: "resend" });
  writeAnalytics(env, "contact_received", "/api/contact", language, "", packageName);
  return json({ success: true, submissionId }, 201);
}

async function handleHealth(request: Request, env: Env) {
  const faviconUrl = new URL("/favicon.svg", request.url);
  const asset = await env.ASSETS.fetch(new Request(faviconUrl, { method: "HEAD" }));
  const healthy = asset.ok;
  const payload = {
    status: healthy ? "ok" : "degraded",
    service: "webzalokal",
    version: env.APP_VERSION,
    staticAssets: healthy ? "ok" : "unavailable",
    timestamp: new Date().toISOString(),
  };
  if (request.method === "HEAD") return new Response(null, { status: healthy ? 200 : 503, headers: apiHeaders });
  return json(payload, healthy ? 200 : 503);
}

async function handleLeadFinderSearch(request: Request, env: Env) {
  if (!sameOrigin(request)) {
    return json(
      { success: false, code: "ORIGIN_REJECTED", message: "Zahtjev nije dopušten." },
      403,
    );
  }

  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > 8_192) {
    return json(
      { success: false, code: "PAYLOAD_TOO_LARGE", message: "Zahtjev je prevelik." },
      413,
    );
  }

  const rate = await env.LEAD_SEARCH_LIMITER.limit({ key: "lead-finder-search" });
  if (!rate.success) {
    return json(
      {
        success: false,
        code: "SEARCH_RATE_LIMITED",
        message: "Dosegnut je sigurnosni limit pretrage. Pokušajte ponovno za minutu.",
      },
      429,
      { "Retry-After": "60" },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = await parseJson<Record<string, unknown>>(request);
  } catch {
    return json(
      { success: false, code: "INVALID_JSON", message: "Podaci pretrage nisu ispravni." },
      400,
    );
  }

  const validation = validateLeadSearchInput(payload);
  if (!validation.success) {
    return json(
      {
        success: false,
        code: "VALIDATION_ERROR",
        message: "Provjerite podatke pretrage.",
        fieldErrors: validation.fieldErrors,
      },
      400,
    );
  }

  if (!env.GOOGLE_PLACES_API_KEY) {
    console.error(JSON.stringify({ event: "lead_search_not_configured", provider: "google-places" }));
    return json(
      {
        success: false,
        code: "PROVIDER_NOT_CONFIGURED",
        message: "Google Places pristup još nije konfiguriran.",
      },
      503,
    );
  }

  try {
    const result = await runLeadSearch(
      env.LEADS_DB,
      new GooglePlacesProvider(env.GOOGLE_PLACES_API_KEY),
      validation.value,
    );
    console.log(JSON.stringify({
      event: "lead_search_completed",
      searchId: result.search.id,
      provider: result.provider.name,
      providerRequestCount: result.search.providerRequestCount,
      returnedCount: result.search.returnedCount,
      createdCount: result.search.createdCount,
      updatedCount: result.search.updatedCount,
    }));
    return json(result, 201);
  } catch (error) {
    if (error instanceof BusinessSearchProviderError) {
      console.error(JSON.stringify({
        event: "lead_search_provider_error",
        provider: "google-places",
        code: error.code,
        status: error.httpStatus,
      }));
      return json(
        { success: false, code: error.code, message: error.message },
        error.httpStatus,
        error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : undefined,
      );
    }

    console.error(JSON.stringify({
      event: "lead_search_internal_error",
      error: error instanceof Error ? error.message : String(error),
    }));
    return json(
      {
        success: false,
        code: "LEAD_SEARCH_FAILED",
        message: "Pretragu nije moguće dovršiti. Pokušajte ponovno.",
      },
      500,
    );
  }
}

async function handleLeadFinderSummary(env: Env) {
  try {
    const summary = await getLeadFinderSummary(env.LEADS_DB);
    return json({ success: true, ...summary });
  } catch (error) {
    console.error(JSON.stringify({
      event: "lead_summary_internal_error",
      error: error instanceof Error ? error.message : String(error),
    }));
    return json(
      {
        success: false,
        code: "LEAD_SUMMARY_FAILED",
        message: "Sažetak spremljenih leadova trenutačno nije dostupan.",
      },
      500,
    );
  }
}

async function handleLeadFinderApi(request: Request, env: Env, pathname: string) {
  if (!leadFinderConfigured(env)) {
    return json(
      {
        success: false,
        code: "LEAD_FINDER_NOT_CONFIGURED",
        message: "Interni Lead Finder pristup još nije konfiguriran.",
      },
      503,
    );
  }
  if (!(await leadFinderAuthorized(request, env))) return leadFinderChallenge(true);

  if (pathname === "/api/lead-finder/search" && request.method === "POST") {
    return handleLeadFinderSearch(request, env);
  }
  if (pathname === "/api/lead-finder/summary" && request.method === "GET") {
    return handleLeadFinderSummary(env);
  }
  return json(
    { success: false, code: "NOT_FOUND", message: "Lead Finder endpoint nije pronađen." },
    404,
  );
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/lead-finder" || url.pathname.startsWith("/lead-finder/")) {
      if (!leadFinderConfigured(env)) {
        return new Response("Lead Finder još nije konfiguriran.", {
          status: 503,
          headers: { ...apiHeaders, "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      if (!(await leadFinderAuthorized(request, env))) return leadFinderChallenge(false);
      return env.ASSETS.fetch(request);
    }

    if (url.pathname.startsWith("/api/lead-finder/")) {
      return handleLeadFinderApi(request, env, url.pathname);
    }

    if (url.pathname === "/api/health" && (request.method === "GET" || request.method === "HEAD")) {
      return handleHealth(request, env);
    }
    if (url.pathname === "/api/contact" && request.method === "POST") {
      return handleContact(request, env);
    }
    if (url.pathname === "/api/events" && request.method === "POST") {
      return handleEvent(request, env);
    }
    if (url.pathname.startsWith("/api/")) {
      return json({ success: false, message: "Endpoint nije pronađen." }, 404);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

export default worker;
