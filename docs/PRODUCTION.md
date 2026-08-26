# WebZaLokal — proizvodni tok v1

## Tok novog upita

1. Potencijalni klijent bira besplatni pregled ili jedan od tri plaćena paketa.
2. Obrazac šalje JSON isključivo na isti origin, `/api/contact`.
3. Worker provjerava origin, veličinu zahtjeva, skriveno polje, vrijeme ispunjavanja, obavezna polja, URL i privolu.
4. Globalni limiter ograničava nagle valove, a hash e-maila ograničava ponovljene pokušaje bez spremanja e-maila u limiter.
5. Potvrđeni upit dobiva UUID i šalje se na službeni e-mail preko Resenda. Adresa pošiljatelja obrasca postavlja se kao `Reply-To` kako bi odgovor iz Gmaila stigao izravno potencijalnom klijentu.
6. Analitika bilježi samo rezultat dostave i odabranu uslugu, bez imena, e-maila, poruke ili IP adrese.
7. Za stvarni projekt otvara se Studio Lite, popunjava brief i pokreće generator iz WebZaLokal-Templates repozitorija.

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
- u Cloudflare Analytics Engineu potvrditi dolazak prvih događaja;
- ručno pokrenuti GitHub Actions monitoring;
- izvesti probni Studio Lite brief i pokrenuti generatorsku naredbu;
- dogovoriti rok brisanja upita ako se operativna praksa promijeni.

## Granica verzije 1

Studio Lite namjerno nema udaljenu bazu, korisničke račune ni zajedničko uređivanje. Podaci ostaju u pregledniku i izvoze se ručno. Time je prva verzija odmah upotrebljiva bez javne pohrane klijentskih briefova. Sljedeći opravdani korak je autentificirani Studio s bazom tek kada volumen stvarnih upita pokaže da je potreban.
