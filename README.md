# WebZaLokal

Produkcijska početna stranica WebZaLokala: tri jasna paketa, dvanaest demonstracijskih dizajna, označeni koncept-projekti, zaštićeni kontaktni obrazac, privatna analitika, Studio Lite i autentificirani Lead Finder.

## Lokalni rad

Zahtjev: Node.js 22.13 ili noviji.

```bash
npm install
npm run dev
```

Potpuna provjera:

```bash
npm run check
```

## Što radi Cloudflare Worker

- poslužuje statički Next.js export iz `out/`;
- prima `POST /api/contact`, provjerava i ograničava upite te ih putem Resenda dostavlja na `webzalokal@gmail.com`;
- prima dopuštene događaje na `POST /api/events` i zapisuje ih u Analytics Engine bez kolačića i osobnih identifikatora;
- izlaže `GET /api/health` za monitoring;
- izlaže zaštićeni Lead Finder search, summary i archive API;
- preko Google Places Text Searcha pronalazi do 20 leadova jednim provider pozivom i u D1 deduplicira dopuštene trajne identifikatore;
- uključuje Cloudflare observability, sigurnosna zaglavlja i četiri rate-limit pravila.

## Studio Lite

`/studio/` je noindex interna radna površina. Nacrt se automatski sprema samo u `localStorage` trenutnog preglednika. Studio izrađuje generatorsku naredbu za repozitorij predložaka i izvozi strukturirani `brief.json`.

## Lead Finder

`/lead-finder/` je HTTP Basic zaštićena interna radna površina za Business Search. Traži lokaciju, vrstu poslovanja i 1–20 rezultata. Google poslovni detalji prikazuju se svježe; D1 je trajni Lead Archive za Place ID-jeve, interne identifikatore, priority/reason, workflow statuse i povijest. Ista se pretraga ne plaća ponovno bez izričitog refresha, a aplikacija ima tvrdi mjesečni provider limit.

Potrebni secreti su `GOOGLE_PLACES_API_KEY` i `LEAD_FINDER_ACCESS_TOKEN`. Potpuna arhitektura, storage granica i prvi E2E scenarij dokumentirani su u [`docs/LEAD_FINDER.md`](docs/LEAD_FINDER.md).

## Objava

Resend, Google Places i Lead Finder pristupni ključevi spremaju se kao Cloudflare secreti; nikada se ne zapisuju u repozitorij.

```bash
npm run deploy
```

Worker se objavljuje pod imenom `webzalokal`. Katalog demonstracija objavljuje se zasebno iz repozitorija WebZaLokal-Templates pod imenom `webzalokal-demo`.

## Monitoring

`scripts/monitor.mjs` provjerava početnu, health endpoint, Studio Lite, katalog i jedan potpuni koncept. GitHub Actions ga pokreće svaka 6 sata i ručno preko `workflow_dispatch`.

Detalji događaja, zaštite i operativne provjere nalaze se u [`docs/PRODUCTION.md`](docs/PRODUCTION.md).
