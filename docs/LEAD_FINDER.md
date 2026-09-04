# Lead Finder v1 — Business Search i Automated Website Audit

Lead Finder je autentificirani interni modul koji implementira:

`SEARCH → NORMALIZE → STORE → DISPLAY`

Milestone 2 dodaje evidence-first website audit. Sustav i dalje namjerno ne radi AI scoring, sales scoring, dodatni contact discovery, Gmail Draft ni slanje poruka.

## Arhitektura

```text
/lead-finder UI
  → POST /api/lead-finder/search
  → provjera postojeće D1 pretrage
  → mjesečna rezervacija jednog provider zahtjeva
  → GooglePlacesProvider
  → Places API Text Search (New)
  → normalizirani rezultat
  → D1 deduplikacija
  → odgovor i tablični prikaz
```

Provider je iza sučelja `BusinessSearchProvider`. Googleov raw format ne prolazi u servis, repozitorij ni UI.

Website audit koristi odvojena sučelja `WebsiteContentProvider` i `WebsitePerformanceProvider`:

```text
D1 Lead Archive + svježi website kandidat
  → archive-first provjera postojećeg audita
  → Firecrawl homepage
  → odabir stvarnih relevantnih internih linkova
  → najviše četiri dodatna Firecrawl scrapea
  → jedan PageSpeed mobile/performance run za homepage
  → deterministički PASS / FAIL / UNKNOWN signali
  → D1 audit run + zasebni zapisi pregledanih stranica
```

## Granica Google podataka

Za EEA billing račun Places sadržaj koristi se za prikaz i upravljanje prodajnim prilikama. Place ID smije se trajno spremati, dok se ostali Google detalji ne kopiraju u D1.

D1 je trajni Lead Archive i sprema:

- interni lead ID;
- provider i provider Place ID;
- korisnički unesenu lokaciju i kategoriju kao interne hintove;
- prioritet `UNCLASSIFIED`, `HIGH`, `GOOD`, `MEDIUM`, `LOW` ili `REJECT` te budući razlog odluke;
- lead, audit, contact i email statuse te buduće score stupce;
- `discovered_at` i `last_checked_at`;
- korisničke parametre i metapodatke pretrage.

D1 ne sprema Googleov naziv, adresu, koordinate, rating, broj recenzija, website ni telefon. Ti podaci postoje samo u svježem API odgovoru i trenutačnom prikazu. UI prikazuje obaveznu oznaku `Google Maps` i dodatne atribucije ako ih provider vrati.

Relevantni izvori:

- [Places API EEA dopuštene uporabe](https://cloud.google.com/terms/maps-platform/eea-places-api-permitted-uses)
- [Places API pravila i atribucija](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Google Place ID pravila](https://developers.google.com/maps/documentation/places/web-service/place-id)

## API

### `POST /api/lead-finder/search`

Zahtijeva HTTP Basic autentikaciju i isti origin.

```json
{
  "location": "Rijeka, Croatia",
  "businessType": "restaurant",
  "limit": 20,
  "refresh": false
}
```

Pravila:

- `location`: 2–120 znakova;
- `businessType`: 2–80 znakova;
- `limit`: cijeli broj 1–20;
- jedan Google Text Search zahtjev;
- bez paginacije i automatskog retryja;
- minimalni FieldMask: ID, naziv, formatirana adresa, rating, broj recenzija, website, nacionalni telefon i obavezne dodatne atribucije;
- ponovljena ista pretraga zadano se zaustavlja na D1 arhivi s `409 ARCHIVE_MATCH_FOUND` i nula provider poziva;
- samo izričiti `refresh: true` dopušta novi provider poziv za već poznatu pretragu;
- najviše 100 provider zahtjeva po UTC mjesecu, kontrolirano varijablom `LEAD_SEARCH_MONTHLY_REQUEST_LIMIT` i atomskim D1 brojačem;
- najviše pet pretraga u 60 sekundi na Worker lokaciji.

### `GET /api/lead-finder/summary`

Vraća ukupan broj trajno spremljenih lead ID-jeva, broj pretraga, pet zadnjih parametara i potrošnju mjesečnog provider limita. Ne dohvaća niti vraća Google poslovne detalje.

### `GET /api/lead-finder/archive`

Vraća do 200 najnovijih trajnih D1 zapisa: provider ID, interne hintove, prioritet, razlog, workflow statuse te vrijeme discoveryja i zadnje provjere. Ne radi Google poziv.

### `POST /api/lead-finder/audits`

Zahtijeva istu HTTP Basic autentikaciju i isti origin kao Business Search.

```json
{
  "leadId": "32-znamenkasti-interni-id",
  "websiteUrl": "https://example.com/",
  "refresh": false
}
```

Pravila resursa i dokaza:

- lead mora već postojati u D1 Archiveu;
- bez website kandidata nema Firecrawl ni PageSpeed poziva;
- postojeći audit uz `refresh: false` vraća D1 podatke i radi nula vanjskih poziva;
- samo izričiti `refresh: true` stvara novi povijesni audit run;
- jedan run radi najviše pet Firecrawl `/scrape` pokušaja i jedan PageSpeed mobile/performance pokušaj;
- homepage je prvi i obavezan Firecrawl URL, a ostali URL-ovi biraju se samo iz stvarno pronađenih internih linkova;
- nema Firecrawl AI/LLM extractiona, crawl paginacije, automatskog retryja ni PageSpeed API ključa;
- Firecrawl payload koristi `proxy: basic`, `maxAge: 0`, `onlyCleanContent: false` i eksplicitni timeout;
- unconfirmed conversion signali ostaju `UNKNOWN`; odsutnost se označava `FAIL` samo gdje je negativnu činjenicu moguće izravno dokazati iz uspješno dohvaćenog HTML-a/statusa.

### `GET /api/lead-finder/audits`

Vraća zadnji spremljeni audit sažetak za svaki auditirani lead. Ne radi vanjske pozive.

### `GET /api/lead-finder/audits/:leadId`

Vraća zadnji audit, pregledane stranice i normalizirane evidence signale iz D1. Ograničeni markdown/očišćeni tekst ostaju server-side u D1 i ne šalju se browseru. Ne radi vanjske pozive.

## D1

Binding: `LEADS_DB`

Naziv baze: `webzalokal-leads`

Migracije: `migrations/0001_lead_finder.sql`, `migrations/0002_lead_archive.sql` i `migrations/0003_website_audits.sql`

Wrangler može automatski provisionirati bazu pri prvom deployu. Worker prije prve uporabe idempotentno provjerava i po potrebi izrađuje tablice, pa deploy iz Git integracije ne ovisi o zasebnom ručnom migration koraku. Migracija ostaje kanonski zapis sheme i koristi se za lokalne/testne baze.

Deduplication ključ je `provider + provider_place_id`. Izričiti refresh ažurira `updated_at`, `last_seen_at`, `last_checked_at` i hintove umjesto stvaranja drugog leada. Postojeći prioritet, razlog, workflow statusi i izvorni `discovered_at` ostaju sačuvani. `LOW` i `REJECT` nikada ne znače brisanje.

Audit evidence je normaliziran u dvije povezane tablice:

- `lead_finder_website_audits` čuva run status, vremena, URL/provenance, stroge request brojače, agregirane signale, PageSpeed subset i sigurne error kodove;
- `lead_finder_audit_pages` čuva do pet pregledanih stranica, HTTP/final URL/metadata/headings/linkove, ograničeni markdown i očišćeni tekst te page-level signale.

Svaki refresh stvara novi audit run; stari evidence se ne briše. `COMPLETE`, `PARTIAL` i `FAILED` rezultati ostaju u D1. Provider response bodyji i secreti se ne spremaju.

## Produkcijska konfiguracija

Potrebni Cloudflare secreti:

- `GOOGLE_PLACES_API_KEY` — ključ ograničen samo na Places API (New);
- `FIRECRAWL_API_KEY` — server-side Firecrawl ključ;
- `LEAD_FINDER_ACCESS_TOKEN` — duga, jedinstvena interna lozinka;
- postojeći `RESEND_API_KEY`.

Nesecret varijabla `LEAD_FINDER_USERNAME` zadano je `webzalokal`.
Nesecret `LEAD_SEARCH_MONTHLY_REQUEST_LIMIT` zadano je `100`, a kod nikada ne dopušta konfiguraciju iznad 1000.

Google Cloud projekt treba imati uključen Places API (New), billing, API restriction samo na Places API te postavljene budžetne/quota obavijesti. Google i Firecrawl ključevi nikada ne idu u frontend, API odgovor, logove ili Git.

Nakon deploya otvorite `/lead-finder/`. Browser traži:

- korisničko ime: `webzalokal`;
- lozinku: vrijednost secreta `LEAD_FINDER_ACCESS_TOKEN`.

## Prvi end-to-end test

1. Unijeti `Rijeka, Croatia`, `restaurant`, `20`.
2. Potvrditi da odgovor prikazuje stvarne riječke restorane.
3. Provjeriti naziv, adresu, rating, recenzije, website i telefon gdje postoje.
4. Potvrditi da `API poziv` pokazuje `1`.
5. Zabilježiti broj leadova s webom i bez weba.
6. Ponoviti istu pretragu i potvrditi `ARCHIVE_MATCH_FOUND`, nula novih Google poziva i ponuđen izričiti refresh.
7. Pokrenuti izričiti refresh i potvrditi da su zapisi `Ažurirano`, a ne `Novo`.
8. U Cloudflare logovima provjeriti strukturirani događaj `lead_search_completed` i mjesečni brojač.

## Website audit E2E

1. Iz svježeg Business Search rezultata odabrati jedan lead s websiteom.
2. Pokrenuti `Auditiraj` i potvrditi stvarne Firecrawl/PageSpeed brojače, D1 status i do pet stranica.
3. Otvoriti isti audit iz Lead Archivea i potvrditi da se samo čita D1.
4. Tek kroz `Refresh / Re-audit` i zasebnu browser potvrdu pokrenuti novi audit run.
5. Provjeriti da lead bez websitea nema audit akciju i ne troši vanjske pozive.
6. Na namjerno djelomičnom provider rezultatu potvrditi `PARTIAL`, sačuvane uspješne stranice i sigurne error kodove.
7. U browser bundleu i API odgovorima potvrditi da nema `FIRECRAWL_API_KEY` vrijednosti niti spremljenog page markdowna.
