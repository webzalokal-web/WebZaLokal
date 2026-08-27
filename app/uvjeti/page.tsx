import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Uvjeti korištenja | WebZaLokal",
  description: "Uvjeti korištenja stranice WebZaLokal i povezanih internih alata.",
};

export default function TermsPage() {
  return (
    <main className="legal-shell">
      <header className="legal-header">
        <Link className="brand" href="/"><span className="brand-mark">WZL</span><span>WebZaLokal</span></Link>
        <Link href="/">← Povratak na početnu</Link>
      </header>

      <article className="legal-card">
        <p className="section-kicker">Uvjeti korištenja · verzija 1.0</p>
        <h1>Jasna pravila za javnu stranicu i interne alate.</h1>
        <p className="legal-lead">Ovi uvjeti odnose se na webzalokal.webzalokal.workers.dev. Zadnje ažuriranje: 27. kolovoza 2026.</p>

        <section>
          <h2>1. O projektu</h2>
          <p>WebZaLokal je naziv studentskog projekta i usluge, a ne registrirana tvrtka. Sadržaj stranice predstavlja informativnu ponudu; konkretan opseg, cijena i rok potvrđuju se zasebnim dogovorom.</p>
        </section>

        <section>
          <h2>2. Dopušteno korištenje</h2>
          <p>Javnu stranicu smijete koristiti za pregled usluga, demonstracija i slanje legitimnog poslovnog upita. Nije dopušteno ometati rad stranice, zaobilaziti zaštite, automatizirano slati neželjene zahtjeve ili pokušavati pristupiti internim alatima bez odobrenja.</p>
        </section>

        <section>
          <h2>3. Demonstracije i sadržaj</h2>
          <p>Demonstracijski dizajni služe kao primjeri mogućeg smjera. Fotografije, nazivi, tekstovi i podaci u konceptima mogu biti ilustrativni te ne predstavljaju nužno stvarno poslovanje ni završni proizvod.</p>
        </section>

        <section>
          <h2>4. Google Maps Platform</h2>
          <p>Autentificirani interni Lead Finder koristi Google Places API za prikaz poslovnih lokacija povezanih s prodajnim prilikama. Korištenje Google Maps sadržaja podliježe <a href="https://cloud.google.com/maps-platform/terms" target="_blank" rel="noreferrer">Google Maps Platform uvjetima ↗</a>, uključujući posebne <a href="https://cloud.google.com/terms/maps-platform/eea" target="_blank" rel="noreferrer">uvjete za EEA korisnike ↗</a>.</p>
          <p>Google Maps sadržaj pripada svojim davateljima. WebZaLokal trajno sprema Google Place ID, ali ne izrađuje vlastitu trajnu kopiju naziva, adrese, ratinga, telefona ili website podataka dobivenih iz Places API-ja.</p>
        </section>

        <section>
          <h2>5. Dostupnost i odgovornost</h2>
          <p>Nastojimo održavati stranicu dostupnom i podatke točnima, ali ne jamčimo neprekidan rad ni potpunost podataka trećih strana. Provider može vratiti nepotpune, promijenjene ili nula rezultata. Važne poslovne odluke uvijek treba potvrditi iz izvornog profila ili izravno s poslovanjem.</p>
        </section>

        <section>
          <h2>6. Kontakt</h2>
          <p>Za pitanja o ovim uvjetima javite se na <a href="mailto:webzalokal@gmail.com">webzalokal@gmail.com</a>. Na obradu podataka primjenjuju se i naša <Link href="/privatnost/">pravila privatnosti</Link>.</p>
        </section>

        <aside>
          <strong>English summary</strong>
          <p>The public site may be used to review services and send legitimate enquiries. Unauthorized access to internal tools is prohibited. The authenticated Lead Finder uses Google Places API and is subject to Google Maps Platform terms, including the EEA terms where applicable.</p>
        </aside>
      </article>
    </main>
  );
}
