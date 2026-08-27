import type {
  LeadFinderSummary,
  LeadSearchInput,
  ProviderLead,
  RecentLeadSearch,
  SearchPersistenceSummary,
} from "./types";

export const leadFinderSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS lead_finder_leads (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    provider_place_id TEXT NOT NULL,
    business_type_hint TEXT NOT NULL,
    email TEXT,
    website_quality_score INTEGER CHECK (website_quality_score BETWEEN 0 AND 100),
    opportunity_score INTEGER CHECK (opportunity_score BETWEEN 0 AND 100),
    audit_status TEXT,
    email_status TEXT,
    lead_status TEXT NOT NULL DEFAULT 'NEW',
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
    provider_request_count INTEGER NOT NULL CHECK (provider_request_count >= 0),
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
  "CREATE INDEX IF NOT EXISTS idx_lead_finder_leads_last_seen ON lead_finder_leads(last_seen_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_lead_finder_searches_created ON lead_finder_searches(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_lead_finder_search_leads_lead ON lead_finder_search_leads(lead_id)",
] as const;

type ExistingLeadRow = {
  provider: string;
  provider_place_id: string;
  created_at: string;
};

type CountRow = {
  total: number;
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

function existingLeadKey(provider: string, providerPlaceId: string) {
  return `${provider}\u0000${providerPlaceId}`;
}

async function deterministicLeadId(provider: string, providerPlaceId: string) {
  const value = new TextEncoder().encode(existingLeadKey(provider, providerPlaceId));
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest).slice(0, 16), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function ensureLeadFinderSchema(db: D1Database) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM sqlite_master
       WHERE type IN ('table', 'index')
         AND name IN (
           'lead_finder_leads',
           'lead_finder_searches',
           'lead_finder_search_leads',
           'idx_lead_finder_leads_last_seen',
           'idx_lead_finder_searches_created',
           'idx_lead_finder_search_leads_lead'
         )`,
    )
    .first<CountRow>();

  if (row?.total === 6) return;
  await db.batch(leadFinderSchemaStatements.map((statement) => db.prepare(statement)));
}

async function findExistingLeads(db: D1Database, leads: ProviderLead[]) {
  if (leads.length === 0) return new Map<string, ExistingLeadRow>();

  const values = leads.map(() => "(?, ?)").join(", ");
  const parameters = leads.flatMap((lead) => [lead.provider, lead.providerPlaceId]);
  const result = await db
    .prepare(
      `WITH requested(provider, provider_place_id) AS (VALUES ${values})
       SELECT lead.provider, lead.provider_place_id, lead.created_at
       FROM lead_finder_leads AS lead
       INNER JOIN requested
         ON requested.provider = lead.provider
        AND requested.provider_place_id = lead.provider_place_id`,
    )
    .bind(...parameters)
    .all<ExistingLeadRow>();

  return new Map(
    result.results.map((row) => [
      existingLeadKey(row.provider, row.provider_place_id),
      row,
    ]),
  );
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
            id, provider, provider_place_id, business_type_hint,
            created_at, updated_at, last_seen_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(provider, provider_place_id) DO UPDATE SET
            business_type_hint = excluded.business_type_hint,
            updated_at = excluded.updated_at,
            last_seen_at = excluded.last_seen_at`,
        )
        .bind(
          leadId,
          lead.provider,
          lead.providerPlaceId,
          input.businessType,
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

export async function getLeadFinderSummary(db: D1Database): Promise<LeadFinderSummary> {
  await ensureLeadFinderSchema(db);

  const storedLeadCount =
    (await db.prepare("SELECT COUNT(*) AS total FROM lead_finder_leads").first<CountRow>())?.total ?? 0;
  const searchCount =
    (await db.prepare("SELECT COUNT(*) AS total FROM lead_finder_searches").first<CountRow>())?.total ?? 0;
  const recent = await db
    .prepare(
      `SELECT id, location_query, business_type_query, requested_limit,
              returned_count, provider_request_count, created_at
       FROM lead_finder_searches
       ORDER BY created_at DESC
       LIMIT 5`,
    )
    .all<RecentSearchRow>();

  const recentSearches: RecentLeadSearch[] = recent.results.map((row) => ({
    id: row.id,
    location: row.location_query,
    businessType: row.business_type_query,
    requestedLimit: row.requested_limit,
    returnedCount: row.returned_count,
    providerRequestCount: row.provider_request_count,
    createdAt: row.created_at,
  }));

  return { storedLeadCount, searchCount, recentSearches };
}
