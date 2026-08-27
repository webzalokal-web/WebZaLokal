# Lead Finder v1 — Milestone 1 / Business Search

Lead Finder je autentificirani interni modul koji implementira:

`SEARCH → NORMALIZE → STORE → DISPLAY`

Milestone namjerno ne radi website audit, AI scoring, pronalazak e-maila ni slanje poruka.

## Arhitektura

```text
/lead-finder UI
  → POST /api/lead-finder/search
  → GooglePlacesProvider
  → Places API Text Search (New)
  → normalizirani rezultat
  → D1 deduplikacija
  → odgovor i tablični prikaz
```

Provider je iza sučelja `BusinessSearchProvider`. Googleov raw format ne prolazi u servis, repozitorij ni UI.

## Granica Google podataka

Za EEA billing račun Places sadržaj koristi se za prikaz i upravljanje prodajnim prilikama. Place ID smije se trajno spremati, dok se ostali Google detalji ne kopiraju u D1.

D1 sprema:

- interni lead ID;
- provider i provider Place ID;
- korisnički unesenu kategoriju;
- interne buduće statuse i score stupce;
- vrijeme prvog i zadnjeg pronalaska;
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
  "limit": 20
}
```

Pravila:

- `location`: 2–120 znakova;
- `businessType`: 2–80 znakova;
- `limit`: cijeli broj 1–20;
- jedan Google Text Search zahtjev;
- bez paginacije i automatskog retryja;
- najviše pet pretraga u 60 sekundi na Worker lokaciji.

### `GET /api/lead-finder/summary`

Vraća ukupan broj trajno spremljenih lead ID-jeva, broj pretraga i pet zadnjih parametara pretrage. Ne dohvaća niti vraća Google poslovne detalje.

## D1

Binding: `LEADS_DB`

Naziv baze: `webzalokal-leads`

Migracija: `migrations/0001_lead_finder.sql`

Wrangler može automatski provisionirati bazu pri prvom deployu. Worker prije prve uporabe idempotentno provjerava i po potrebi izrađuje tablice, pa deploy iz Git integracije ne ovisi o zasebnom ručnom migration koraku. Migracija ostaje kanonski zapis sheme i koristi se za lokalne/testne baze.

Deduplication ključ je `provider + provider_place_id`. Ponovljena pretraga ažurira `updated_at`, `last_seen_at` i kategoriju umjesto stvaranja drugog leada.

## Produkcijska konfiguracija

Potrebni Cloudflare secreti:

- `GOOGLE_PLACES_API_KEY` — ključ ograničen samo na Places API (New);
- `LEAD_FINDER_ACCESS_TOKEN` — duga, jedinstvena interna lozinka;
- postojeći `RESEND_API_KEY`.

Nesecret varijabla `LEAD_FINDER_USERNAME` zadano je `webzalokal`.

Google Cloud projekt treba imati uključen Places API (New), billing, API restriction samo na Places API te postavljene budžetne/quota obavijesti. Ključ nikada ne ide u frontend ili Git.

Nakon deploya otvorite `/lead-finder/`. Browser traži:

- korisničko ime: `webzalokal`;
- lozinku: vrijednost secreta `LEAD_FINDER_ACCESS_TOKEN`.

## Prvi end-to-end test

1. Unijeti `Rijeka, Croatia`, `restaurant`, `20`.
2. Potvrditi da odgovor prikazuje stvarne riječke restorane.
3. Provjeriti naziv, adresu, rating, recenzije, website i telefon gdje postoje.
4. Potvrditi da `API poziv` pokazuje `1`.
5. Zabilježiti broj leadova s webom i bez weba.
6. Ponoviti istu pretragu i potvrditi da su zapisi `Ažurirano`, a ne `Novo`.
7. U Cloudflare logovima provjeriti strukturirani događaj `lead_search_completed`.

Tek rezultat tog testa koristi se za tehničke odluke Milestonea 2 — Automated Website Audit.
