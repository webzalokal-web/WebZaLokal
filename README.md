# WebZaLokal

Produkcijska početna stranica WebZaLokala: tri jasna paketa, dvanaest demonstracijskih dizajna, označeni koncept-projekti, zaštićeni kontaktni obrazac, privatna analitika i interni Studio Lite.

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
- prima `POST /api/contact`, provjerava i ograničava upite te ih dostavlja na `webzalokal@gmail.com`;
- prima dopuštene događaje na `POST /api/events` i zapisuje ih u Analytics Engine bez kolačića i osobnih identifikatora;
- izlaže `GET /api/health` za monitoring;
- uključuje Cloudflare observability, sigurnosna zaglavlja i tri rate-limit pravila.

## Studio Lite

`/studio/` je noindex interna radna površina. Nacrt se automatski sprema samo u `localStorage` trenutnog preglednika. Studio izrađuje generatorsku naredbu za repozitorij predložaka i izvozi strukturirani `brief.json`.

## Objava

```bash
npm run deploy
```

Worker se objavljuje pod imenom `webzalokal`. Katalog demonstracija objavljuje se zasebno iz repozitorija WebZaLokal-Templates pod imenom `webzalokal-demo`.

## Monitoring

`scripts/monitor.mjs` provjerava početnu, health endpoint, Studio Lite, katalog i jedan potpuni koncept. GitHub Actions ga pokreće svaka 6 sata i ručno preko `workflow_dispatch`.

Detalji događaja, zaštite i operativne provjere nalaze se u [`docs/PRODUCTION.md`](docs/PRODUCTION.md).
