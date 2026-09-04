import type { WebsiteAuditInput } from "./audit-types";

type AuditPayload = {
  leadId?: unknown;
  websiteUrl?: unknown;
  refresh?: unknown;
};

export type WebsiteAuditValidationResult =
  | { success: true; value: WebsiteAuditInput }
  | { success: false; fieldErrors: Record<string, string> };

const forbiddenHostnames = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
]);

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part > 255)) return true;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isForbiddenHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (
    forbiddenHostnames.has(normalized) ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    return true;
  }
  if (isPrivateIpv4(normalized)) return true;
  if (normalized.includes(":")) {
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
  }
  return false;
}

export function normalizePublicWebsiteUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > 2_000 || /[\u0000-\u001f\u007f]/.test(candidate)) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || isForbiddenHostname(url.hostname)) return null;
    if (url.port && url.port !== "80" && url.port !== "443") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function validateWebsiteAuditInput(payload: AuditPayload): WebsiteAuditValidationResult {
  const leadId = typeof payload.leadId === "string" ? payload.leadId.trim() : "";
  const refresh = payload.refresh ?? false;
  const rawWebsiteUrl = payload.websiteUrl;
  const websiteUrl = rawWebsiteUrl === null ? null : normalizePublicWebsiteUrl(rawWebsiteUrl);
  const fieldErrors: Record<string, string> = {};

  if (!/^[a-f0-9]{32}$/.test(leadId)) {
    fieldErrors.leadId = "Lead ID nije valjan.";
  }
  if (rawWebsiteUrl !== null && websiteUrl === null) {
    fieldErrors.websiteUrl = "Website mora biti javna HTTP(S) adresa.";
  }
  if (typeof refresh !== "boolean") {
    fieldErrors.refresh = "Refresh mora biti true ili false.";
  }

  if (Object.keys(fieldErrors).length > 0) return { success: false, fieldErrors };
  return { success: true, value: { leadId, websiteUrl, refresh: refresh as boolean } };
}
