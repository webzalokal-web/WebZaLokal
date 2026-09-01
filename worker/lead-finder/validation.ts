import {
  LEAD_SEARCH_MAX_LIMIT,
  type LeadSearchInput,
} from "./types";

type SearchPayload = {
  location?: unknown;
  businessType?: unknown;
  limit?: unknown;
  refresh?: unknown;
};

export type LeadSearchValidationResult =
  | { success: true; value: LeadSearchInput }
  | { success: false; fieldErrors: Record<string, string> };

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength + 1);
}

function containsControlCharacters(value: string) {
  return /[\u0000-\u001f\u007f]/.test(value);
}

export function validateLeadSearchInput(payload: SearchPayload): LeadSearchValidationResult {
  const location = cleanText(payload.location, 120);
  const businessType = cleanText(payload.businessType, 80);
  const limit = payload.limit;
  const refresh = payload.refresh ?? false;
  const fieldErrors: Record<string, string> = {};

  if (location.length < 2 || location.length > 120 || containsControlCharacters(location)) {
    fieldErrors.location = "Unesite valjanu lokaciju (2–120 znakova).";
  }
  if (businessType.length < 2 || businessType.length > 80 || containsControlCharacters(businessType)) {
    fieldErrors.businessType = "Unesite valjanu vrstu poslovanja (2–80 znakova).";
  }
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > LEAD_SEARCH_MAX_LIMIT) {
    fieldErrors.limit = `Broj rezultata mora biti cijeli broj od 1 do ${LEAD_SEARCH_MAX_LIMIT}.`;
  }
  if (typeof refresh !== "boolean") {
    fieldErrors.refresh = "Refresh mora biti true ili false.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, fieldErrors };
  }

  return {
    success: true,
    value: {
      location,
      businessType,
      limit: limit as number,
      refresh: refresh as boolean,
    },
  };
}
