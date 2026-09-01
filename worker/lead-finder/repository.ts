import {
  BusinessSearchProviderError,
  GOOGLE_PLACES_PROVIDER,
  type ArchivedSearchMatch,
  type LeadArchiveRecord,
  type LeadFinderSummary,
  type LeadPriority,
  type LeadSearchInput,
  type ProviderLead,
  type ProviderUsage,
  type RecentLeadSearch,
  type SearchPersistenceSummary,
} from "./types";

const schemaObjectNames = [
  "lead_finder_leads",
  "lead_finder_searches",
  "lead_finder_search_leads",
  "lead_finder_provider_usage",
  "idx_lead_finder_leads_last_seen",
  "idx_lead_finder_searches_created",
  "idx_lead_finder_search_leads_lead",
  "idx_lead_finder_leads_last_checked",
  "idx_lead_finder_leads_priority",
  "idx_lead_finder_searches_lookup",
] as const;

const leadFinderTableStatements = [
  `CREATE TABLE IF NOT EXISTS lead_finder_leads (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    provider_place_id TEXT NOT NULL,
    location_hint TEXT NOT NULL,
    business_type_hint TEXT NOT NULL,
    email TEXT,
    website_quality_score INTEGER CHECK (website_quality_score BETWEEN 0 AND 100),
    opportunity_score INTEGER CHECK (opportunity_score BETWEEN 0 AND 100),
    audit_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
    contact_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
    email_status TEXT,
    lead_status TEXT NOT NULL DEFAULT 'NEW',
    priority TEXT NOT NULL DEFAULT 'UNCLASSIFIED'
      CHECK (priority IN ('UNCLASSIFIED', 'HIGH', 'GOOD', 'MEDIUM', 'LOW', 'REJECT')),
    priority_reason TEXT,
    discovered_at TEXT NOT NULL,
    last_checked_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    UNIQUE (provider, provider_place_id)
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS lead_finder_searches (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    location_query TEXT NOT NULL,
    business_type_query TEXT NOT NULL,
    requested_limit INTEGER NOT NULL CHECK (requested_limit BETWEEN 1 AND 20),
    returned_count INTEGER NOT NULL CHECK (returned_count >= 0),
    provider_request_count INTEGER NOT NULL CHECK (provider_request_count BETWEEN 0 AND 1),
    created_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS lead_finder_search_leads (
    search_id TEXT NOT NULL,
    lead_id TEXT NOT NULL,
    result_position INTEGER NOT NULL CHECK (result_position >= 0),
    PRIMARY KEY (search_id, lead_id),
    FOREIGN KEY (search_id) REFERENCES lead_finder_searches(id) ON DELETE CASCADE,
    FOREIGN KEY (lead_id) REFERENCES lead_finder_leads(id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS lead_finder_provider_usage (
    provider TEXT NOT NULL,
    period_key TEXT NOT NULL,
    request_count INTEGER NOT NULL CHECK (request_count >= 0),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (provider, period_key)
  ) STRICT`,
] as const;

const leadFinderIndexStatements = [
  "CREATE INDEX IF NOT EXISTS idx_lead_finder_leads_last_seen ON lead_finder_leads(last_seen_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_lead_finder_searches_created ON lead_finder_searches(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_lead_finder_search_leads_lead ON lead_finder_search_leads(lead_id)",
  "CREATE INDEX IF NOT EXISTS idx_lead_finder_leads_last_checked ON lead_finder_leads(last_checked_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_lead_finder_leads_priority ON lead_finder_leads(priority, discovered_at DESC)",
  `CREATE INDEX IF NOT EXISTS idx_lead_finder_searches_lookup
    ON lead_finder_searches(provider, location_query, business_type_query, requested_limit, created_at DESC)`,
] as const;

export const leadFinderSchemaStatements = [
  ...leadFinderTableStatements,
  ...leadFinderIndexStatements,
] as const;

const leadArchiveColumnDefinitions = {
  location_hint: "TEXT",
  discovered_at: "TEXT",
  last_checked_at: "TEXT",
  priority: `TEXT NOT NULL DEFAULT 'UNCLASSIFIED'
    CHECK (priority IN ('UNCLASSIFIED', 'HIGH', 'GOOD', 'MEDIUM', 'LOW', 'REJECT'))`,
  priority_reason: "TEXT",
  contact_status: "TEXT NOT NULL DEFAULT 'NOT_STARTED'",
} as const;

type ExistingLeadRow = {
  provider: string;
  provider_place_id: string;
  priority: LeadPriority;
  priority_reason: string | null;
  lead_status: string;
  audit_status: string | null;
  contact_status: string;
  discovered_at: string | null;
  last_checked_at: string | null;
  created_at: string;
};

type CountRow = {
  total: number;
};

type ColumnRow = {
  name: string;
};

type UsageRow = {
  provider: string;
  period_key: string;
  request_count: number;
};

type RecentSearchRow = {
  id: string;
  location_query: string;
  business_type_query: string;
  requested_limit: number;
  returned_count: number;
  provider_request_count: number;
  created_at: string;
};

type ArchivedSearchRow = RecentSearchRow & {
  provider: string;
};

type LeadArchiveRow = {
  id: string;
  provider: string;
  provider_place_id: string;
  location_hint: string | null;
  business_type_hint: string;
  priority: LeadPriority;
  priority_reason: string | null;
  lead_status: string;
  audit_status: string | null;
  contact_status: string;
  email_status: string | null;
  website_quality_score: number | null;
  opportunity_score: number | null;
  discovered_at: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
};

function existingLeadKey(provider: string, providerPlaceId: string) {
  return `${provider}\u0000${providerPlaceId}`;
}

function currentPeriodKey(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

async function deterministicLeadId(provider: string, providerPlaceId: string) {
  const value = new TextEncoder().encode(existingLeadKey(provider, providerPlaceId));
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest).slice(0, 16), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function ensureLeadFinderSchema(db: D1Database) {
  const placeholders = schemaObjectNames.map(() => "?").join(", ");
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM sqlite_master
       WHERE name IN (${placeholders})`,
    )
    .bind(...schemaObjectNames)
    .first<CountRow>();

  if (row?.total === schemaObjectNames.length) return;

  await db.batch(leadFinderTableStatements.map((statement) => db.prepare(statement)));

  const columns = await db
    .prepare("PRAGMA table_info(lead_finder_leads)")
    .all<ColumnRow>();
  const existingColumns = new Set(columns.results.map((column) => column.name));
  const alterations = Object.entries(leadArchiveColumnDefinitions)
    .filter(([name]) => !existingColumns.has(name))
    .map(([name, definition]) =>
      db.prepare(`ALTER TABLE lead_finder_leads ADD COLUMN ${name} ${definition}`),
    );
  if (alterations.length > 0) await db.batch(alterations);

  await db.prepare(
    `UPDATE lead_finder_leads
     SET location_hint = COALESCE(
           location_hint,
           (
             SELECT searches.location_query
             FROM lead_finder_search_leads AS search_leads
             INNER JOIN lead_finder_searches AS searches
               ON searches.id = search_leads.search_id
             WHERE search_leads.lead_id = lead_finder_leads.id
             ORDER BY searches.created_at ASC
             LIMIT 1
           ),
           'unknown'
         ),
         discovered_at = COALESCE(discovered_at, created_at),
         last_checked_at = COALESCE(last_checked_at, last_seen_at),
         audit_status = COALESCE(audit_status, 'NOT_STARTED')
     WHERE location_hint IS NULL
        OR discovered_at IS NULL
        OR last_checked_at IS NULL
        OR audit_status IS NULL`,
  ).run();

  await db.batch(leadFinderIndexStatements.map((statement) => db.prepare(statement)));
}

async function findExistingLeads(db: D1Database, leads: ProviderLead[]) {
  if (leads.length === 0) return new Map<string, ExistingLeadRow>();

  const values = leads.map(() => "(?, ?)").join(", ");
  const parameters = leads.flatMap((lead) => [lead.provider, lead.providerPlaceId]);
  const result = await db
    .prepare(
      `WITH requested(provider, provider_place_id) AS (VALUES ${values})
       SELECT lead.provider, lead.provider_place_id, lead.priority, lead.priority_reason,
              lead.lead_status, lead.audit_status, lead.contact_status,
              lead.discovered_at, lead.last_checked_at, lead.created_at
       FROM lead_finder_leads AS lead
       INNER JOIN requested
         ON requested.provider = lead.provider
        AND requested.provider_place_id = lead.provider_place_id`,
    )
    .bind(...parameters)
    .all<ExistingLeadRow>();

  return new Map(
    result.results.map((lead) => [
      existingLeadKey(lead.provider, lead.provider_place_id),
      lead,
    ]),
  );
}

export async function findArchivedSearch(
  db: D1Database,
  provider: string,
  input: LeadSearchInput,
): Promise<ArchivedSearchMatch | null> {
  await ensureLeadFinderSchema(db);
  const row = await db.prepare(
    `SELECT id, provider, location_query, business_type_query, requested_limit,
            returned_count, provider_request_count, created_at
     FROM lead_finder_searches
     WHERE provider = ?
       AND lower(trim(location_query)) = lower(trim(?))
       AND lower(trim(business_type_query)) = lower(trim(?))
       AND requested_limit >= ?
     ORDER BY created_at DESC
     LIMIT 1`,
  ).bind(provider, input.location, input.businessType, input.limit).first<ArchivedSearchRow>();

  if (!row) return null;
  return {
    searchId: row.id,
    provider: row.provider,
    location: row.location_query,
    businessType: row.business_type_query,
    requestedLimit: row.requested_limit,
    returnedCount: row.returned_count,
    createdAt: row.created_at,
  };
}

export async function reserveProviderRequest(
  db: D1Database,
  provider: string,
  monthlyRequestLimit: number,
): Promise<ProviderUsage> {
  await ensureLeadFinderSchema(db);
  const now = new Date().toISOString();
  const periodKey = currentPeriodKey();
  const row = await db.prepare(
    `INSERT INTO lead_finder_provider_usage (
       provider, period_key, request_count, updated_at
     ) VALUES (?, ?, 1, ?)
     ON CONFLICT(provider, period_key) DO UPDATE SET
       request_count = request_count + 1,
       updated_at = excluded.updated_at
     WHERE request_count < ?
     RETURNING provider, period_key, request_count`,
  ).bind(provider, periodKey, now, monthlyRequestLimit).first<UsageRow>();

  if (!row) {
    throw new BusinessSearchProviderError(
      "MONTHLY_PROVIDER_LIMIT_REACHED",
      `Dosegnut je mjesečni sigurnosni limit od ${monthlyRequestLimit} Google zahtjeva.`,
      429,
    );
  }

  return {
    provider: row.provider,
    periodKey: row.period_key,
    requestCount: row.request_count,
  };
}

export async function persistLeadSearch(
  db: D1Database,
  input: LeadSearchInput,
  leads: ProviderLead[],
  providerName: string,
  providerRequestCount: number,
): Promise<SearchPersistenceSummary> {
  await ensureLeadFinderSchema(db);

  const now = new Date().toISOString();
  const searchId = crypto.randomUUID();
  const existing = await findExistingLeads(db, leads);
  const leadIds = await Promise.all(
    leads.map((lead) => deterministicLeadId(lead.provider, lead.providerPlaceId)),
  );

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO lead_finder_searches (
          id, provider, location_query, business_type_query, requested_limit,
          returned_count, provider_request_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        searchId,
        providerName,
        input.location,
        input.businessType,
        input.limit,
        leads.length,
        providerRequestCount,
        now,
      ),
  ];

  for (let index = 0; index < leads.length; index += 1) {
    const lead = leads[index];
    const leadId = leadIds[index];
    statements.push(
      db
        .prepare(
          `INSERT INTO lead_finder_leads (
            id, provider, provider_place_id, location_hint, business_type_hint,
            audit_status, contact_status, lead_status, priority,
            discovered_at, last_checked_at, created_at, updated_at, last_seen_at
          ) VALUES (?, ?, ?, ?, ?, 'NOT_STARTED', 'NOT_STARTED', 'NEW', 'UNCLASSIFIED', ?, ?, ?, ?, ?)
          ON CONFLICT(provider, provider_place_id) DO UPDATE SET
            location_hint = excluded.location_hint,
            business_type_hint = excluded.business_type_hint,
            updated_at = excluded.updated_at,
            last_seen_at = excluded.last_seen_at,
            last_checked_at = excluded.last_checked_at`,
        )
        .bind(
          leadId,
          lead.provider,
          lead.providerPlaceId,
          input.location,
          input.businessType,
          now,
          now,
          now,
          now,
          now,
        ),
      db
        .prepare(
          `INSERT INTO lead_finder_search_leads (search_id, lead_id, result_position)
           VALUES (?, ?, ?)`,
        )
        .bind(searchId, leadId, index),
    );
  }

  await db.batch(statements);

  const storedLeadCount =
    (await db.prepare("SELECT COUNT(*) AS total FROM lead_finder_leads").first<CountRow>())?.total ?? 0;
  const persistedLeads = leads.map((lead, index) => {
    const prior = existing.get(existingLeadKey(lead.provider, lead.providerPlaceId));
    return {
      ...lead,
      id: leadIds[index],
      persistenceStatus: prior ? ("updated" as const) : ("created" as const),
      priority: prior?.priority ?? ("UNCLASSIFIED" as const),
      priorityReason: prior?.priority_reason ?? null,
      leadStatus: prior?.lead_status ?? "NEW",
      auditStatus: prior?.audit_status ?? "NOT_STARTED",
      contactStatus: prior?.contact_status ?? "NOT_STARTED",
      discoveredAt: prior?.discovered_at ?? prior?.created_at ?? now,
      lastCheckedAt: now,
      createdAt: prior?.created_at ?? now,
      updatedAt: now,
    };
  });
  const createdCount = persistedLeads.filter((lead) => lead.persistenceStatus === "created").length;

  return {
    searchId,
    createdCount,
    updatedCount: persistedLeads.length - createdCount,
    storedLeadCount,
    leads: persistedLeads,
  };
}

export async function getLeadArchive(db: D1Database, requestedLimit = 100) {
  await ensureLeadFinderSchema(db);
  const limit = Math.min(Math.max(Math.trunc(requestedLimit), 1), 200);
  const result = await db.prepare(
    `SELECT id, provider, provider_place_id, location_hint, business_type_hint,
            priority, priority_reason, lead_status, audit_status, contact_status,
            email_status, website_quality_score, opportunity_score,
            discovered_at, last_checked_at, created_at, updated_at, last_seen_at
     FROM lead_finder_leads
     ORDER BY discovered_at DESC, created_at DESC
     LIMIT ?`,
  ).bind(limit).all<LeadArchiveRow>();

  return result.results.map((lead): LeadArchiveRecord => ({
    id: lead.id,
    provider: lead.provider,
    providerPlaceId: lead.provider_place_id,
    locationHint: lead.location_hint ?? "unknown",
    businessTypeHint: lead.business_type_hint,
    priority: lead.priority,
    priorityReason: lead.priority_reason,
    leadStatus: lead.lead_status,
    auditStatus: lead.audit_status ?? "NOT_STARTED",
    contactStatus: lead.contact_status,
    emailStatus: lead.email_status,
    websiteQualityScore: lead.website_quality_score,
    opportunityScore: lead.opportunity_score,
    discoveredAt: lead.discovered_at ?? lead.created_at,
    lastCheckedAt: lead.last_checked_at ?? lead.last_seen_at,
    updatedAt: lead.updated_at,
  }));
}

async function getProviderUsage(
  db: D1Database,
  provider = GOOGLE_PLACES_PROVIDER,
): Promise<ProviderUsage> {
  const periodKey = currentPeriodKey();
  const row = await db.prepare(
    `SELECT provider, period_key, request_count
     FROM lead_finder_provider_usage
     WHERE provider = ? AND period_key = ?`,
  ).bind(provider, periodKey).first<UsageRow>();

  return {
    provider,
    periodKey,
    requestCount: row?.request_count ?? 0,
  };
}

export async function getLeadFinderSummary(db: D1Database): Promise<LeadFinderSummary> {
  await ensureLeadFinderSchema(db);

  const storedLeadCount =
    (await db.prepare("SELECT COUNT(*) AS total FROM lead_finder_leads").first<CountRow>())?.total ?? 0;
  const searchCount =
    (await db.prepare("SELECT COUNT(*) AS total FROM lead_finder_searches").first<CountRow>())?.total ?? 0;
  const [recent, providerUsage] = await Promise.all([
    db
      .prepare(
        `SELECT id, location_query, business_type_query, requested_limit,
                returned_count, provider_request_count, created_at
         FROM lead_finder_searches
         ORDER BY created_at DESC
         LIMIT 5`,
      )
      .all<RecentSearchRow>(),
    getProviderUsage(db),
  ]);

  const recentSearches: RecentLeadSearch[] = recent.results.map((search) => ({
    id: search.id,
    location: search.location_query,
    businessType: search.business_type_query,
    requestedLimit: search.requested_limit,
    returnedCount: search.returned_count,
    providerRequestCount: search.provider_request_count,
    createdAt: search.created_at,
  }));

  return { storedLeadCount, searchCount, recentSearches, providerUsage };
}
