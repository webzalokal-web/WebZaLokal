# WebZaLokal — proizvodni tok v1

## Tok novog upita

1. Potencijalni klijent bira besplatni pregled ili jedan od tri plaćena paketa.
2. Obrazac šalje JSON isključivo na isti origin, `/api/contact`.
3. Worker provjerava origin, veličinu zahtjeva, skriveno polje, vrijeme ispunjavanja, obavezna polja, URL i privolu.
4. Globalni limiter ograničava nagle valove, a hash e-maila ograničava ponovljene pokušaje bez spremanja e-maila u limiter.
5. Potvrđeni upit dobiva UUID i šalje se na službeni e-mail preko Resenda. Adresa pošiljatelja obrasca postavlja se kao `Reply-To` kako bi odgovor iz Gmaila stigao izravno potencijalnom klijentu.
6. Analitika bilježi samo rezultat dostave i odabranu uslugu, bez imena, e-maila, poruke ili IP adrese.
7. Za stvarni projekt otvara se Studio Lite, popunjava brief i pokreće generator iz WebZaLokal-Templates repozitorija.

## Lead Finder v1

Interna ruta `/lead-finder/` i svi `/api/lead-finder/*` endpointi zaključani su HTTP Basic autentikacijom. Korisničko ime dolazi iz `LEAD_FINDER_USERNAME`, a lozinka iz Cloudflare secreta `LEAD_FINDER_ACCESS_TOKEN`.

Jedna pretraga:

1. validira lokaciju, kategoriju i limit 1–20;
2. prolazi kroz `LEAD_SEARCH_LIMITER` (5 zahtjeva/60 s);
3. prvo provjerava postoji li ista pretraga u trajnom D1 Lead Archiveu;
4. atomski primjenjuje mjesečni limit od 100 provider zahtjeva;
5. radi najviše jedan Google Places Text Search poziv bez paginacije i retryja;
6. koristi samo FieldMask potreban za Milestone 1;
7. normalizira djelomične podatke i pouzdano određuje `hasWebsite`;
8. deduplicira po `provider + provider_place_id`;
9. trajno čuva svaki otkriveni Place ID, discovery/check vremena, prioritet i workflow statuse;
10. vraća svježe detalje tabličnom UI-ju uz Google Maps atribuciju.

Ponovljena pretraga zadano ne troši Google poziv. Novi refresh za poznati upit zahtijeva izričitu potvrdu u UI-ju. `LOW` i `REJECT` leadovi ostaju u D1 arhivi.

Website audit za odabrani lead s webom:

1. prvo provjerava postoji li spremljeni D1 audit;
2. za novi run dohvaća homepage preko Firecrawla i iz stvarnih internih linkova bira do četiri relevantne stranice;
3. radi najviše jedan PageSpeed mobile/performance poziv za homepage;
4. sprema page-level sadržaj, metadata/linkove i `PASS` / `FAIL` / `UNKNOWN` evidence;
5. zadržava djelomično uspješne podatke pod statusom `PARTIAL`;
6. ponovno otvaranje samo čita D1, dok novi provider pozivi zahtijevaju izričiti `Refresh / Re-audit`.

Firecrawl i PageSpeed nemaju crawl petlje ni automatske retryje. Firecrawl je ograničen na pet pokušaja po audit runu, a PageSpeed na jedan. Svi audit endpointi ostaju iza iste interne autentikacije.

Operativna dokumentacija: [`LEAD_FINDER.md`](LEAD_FINDER.md).

## Analytics Engine shema

Dataset: `WEBZALOKAL_EVENTS`

| Polje | Sadržaj |
| --- | --- |
| `blob1` | naziv događaja |
| `blob2` | putanja stranice |
| `blob3` | jezik |
| `blob4` | domena izvora ili `direct` |
| `blob5` | ograničeni detalj, npr. tema ili paket |
| `double1` | vrijednost `1` za brojanje |
| `index1` | naziv događaja kao sampling ključ |

Dopušteni javni događaji: `page_view`, `language_change`, `demo_open`, `concept_open`, `package_select`, `audit_select`, `contact_success`, `contact_error`.

Worker dodatno zapisuje operativne događaje: `contact_received`, `contact_upstream_error`, `contact_blocked`.

## Monitoring

Automatski smoke test provjerava:

- produkcijsku početnu stranicu;
- `/api/health` i status statičkih asseta;
- `/studio/`;
- katalog svih dizajna;
- fine-dining koncept kao reprezentativnu potpunu rutu.

GitHub Actions workflow: `.github/workflows/monitor.yml`. Raspored: svaka 6 sata u 17. minuti.

## Prije prve stvarne narudžbe

- poslati probni upit i potvrditi dostavu na službeni e-mail;
- potvrditi da je Resend račun otvoren adresom `webzalokal@gmail.com` i da je Cloudflare secret `RESEND_API_KEY` postavljen;
- potvrditi da su `GOOGLE_PLACES_API_KEY`, `FIRECRAWL_API_KEY` i `LEAD_FINDER_ACCESS_TOKEN` postavljeni kao Cloudflare secreti;
- ograničiti Google ključ na Places API (New) i postaviti billing/quota obavijesti;
- izvesti prvi `Rijeka, Croatia + restaurant + 20` test, potvrditi archive block pri ponavljanju te zatim izričiti refresh radi provjere deduplikacije;
- u Cloudflare Analytics Engineu potvrditi dolazak prvih događaja;
- ručno pokrenuti GitHub Actions monitoring;
- izvesti probni Studio Lite brief i pokrenuti generatorsku naredbu;
- dogovoriti rok brisanja upita ako se operativna praksa promijeni.

## Granica verzije 1

Studio Lite namjerno nema udaljenu bazu, korisničke račune ni zajedničko uređivanje. Podaci ostaju u pregledniku i izvoze se ručno. Time je prva verzija odmah upotrebljiva bez javne pohrane klijentskih briefova. Sljedeći opravdani korak je autentificirani Studio s bazom tek kada volumen stvarnih upita pokaže da je potreban.
