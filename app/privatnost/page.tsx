import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pravila privatnosti | WebZaLokal",
  description: "Kako WebZaLokal obrađuje podatke iz kontaktnog obrasca i osnovnu analitiku korištenja.",
};

export default function PrivacyPage() {
  return (
    <main className="legal-shell">
      <header className="legal-header">
        <Link className="brand" href="/"><span className="brand-mark">WZL</span><span>WebZaLokal</span></Link>
        <Link href="/">← Povratak na početnu</Link>
      </header>

      <article className="legal-card">
        <p className="section-kicker">Pravila privatnosti · verzija 1.2</p>
        <h1>Vaš upit koristimo samo da bismo vam odgovorili.</h1>
        <p className="legal-lead">Ova pravila opisuju podatke koje obrađuje webzalokal.webzalokal.workers.dev. Zadnje ažuriranje: 27. kolovoza 2026.</p>

        <section>
          <h2>1. Tko obrađuje podatke</h2>
          <p>WebZaLokal je naziv studentskog projekta i usluge, a ne registrirana tvrtka. Za pitanja o privatnosti ili brisanje podataka javite se na <a href="mailto:webzalokal@gmail.com">webzalokal@gmail.com</a>.</p>
        </section>

        <section>
          <h2>2. Kontaktni obrazac</h2>
          <p>Kada pošaljete upit, obrađuju se naziv poslovanja, e-mail, odabrana usluga, eventualna poveznica i sadržaj poruke. Podaci se koriste isključivo za procjenu zahtjeva, odgovor i eventualni dogovor projekta.</p>
          <p>Obrazac prolazi kroz Cloudflare Worker i zatim se dostavlja na WebZaLokal e-mail putem servisa Resend. Ne prodajemo podatke niti ih koristimo za newsletter. Za tehničku dostavu vrijede i <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noreferrer">pravila privatnosti Resenda ↗</a>.</p>
        </section>

        <section>
          <h2>3. Rok čuvanja</h2>
          <p>Upiti koji ne prerastu u projekt brišu se najkasnije 12 mjeseci nakon posljednje komunikacije. Ako se projekt ugovori, nužni dijelovi komunikacije mogu se čuvati dulje radi provedbe dogovora i zakonskih obveza.</p>
        </section>

        <section>
          <h2>4. Analitika bez kolačića</h2>
          <p>Bilježimo osnovne događaje poput otvaranja stranice, izbora paketa ili otvaranja demonstracije. Spremaju se naziv događaja, putanja stranice, jezik, domena izvora i općeniti detalj odabira. Ne postavljamo analitičke kolačiće, ne stvaramo korisničke profile i u analitički skup ne spremamo ime, e-mail ni IP adresu.</p>
        </section>

        <section>
          <h2>5. Zaštita obrasca</h2>
          <p>Za smanjenje neželjenih poruka koristimo provjeru podrijetla zahtjeva, skriveno polje, vremensku provjeru, validaciju sadržaja i ograničenje učestalosti. Sigurnosni zapisi ne sadrže tekst vaše poruke.</p>
        </section>

        <section>
          <h2>6. Interni Lead Finder i Google Places</h2>
          <p>Autentificirani interni Lead Finder koristi Google Places API za pronalaženje javno objavljenih poslovnih lokacija povezanih s prodajnim prilikama. Google u tom procesu prima lokaciju i vrstu poslovanja iz pretrage. Primjenjuju se <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Googleova pravila privatnosti ↗</a>.</p>
          <p>U WebZaLokal D1 bazi trajno se spremaju interni ID, provider, Google Place ID, unesena kategorija, statusi i povijest pretrage. Naziv poslovanja, adresa, rating, broj recenzija, telefon i website iz Google odgovora prikazuju se u aktivnom rezultatu, ali se ne spremaju u bazu.</p>
        </section>

        <section>
          <h2>7. Vaša prava</h2>
          <p>Možete zatražiti pristup, ispravak ili brisanje svojih podataka te povući privolu za daljnju komunikaciju. Zahtjev pošaljite s iste e-mail adrese koju ste koristili u obrascu kako bismo mogli potvrditi da se odnosi na vas.</p>
        </section>

        <aside>
          <strong>English summary</strong>
          <p>Enquiry data is used only to assess and answer your request. The form is processed by a Cloudflare Worker and delivered by Resend. First-party analytics are cookieless. The authenticated Lead Finder uses Google Places; it stores Place IDs and internal workflow data, not a permanent copy of Google business details. Contact <a href="mailto:webzalokal@gmail.com">webzalokal@gmail.com</a> to request access, correction or deletion.</p>
        </aside>
      </article>
    </main>
  );
}
