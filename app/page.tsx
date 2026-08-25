"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  categoryLabels,
  defaultDemoBaseUrl,
  demoDesigns,
  demoUrl,
} from "@/lib/demo-catalog";

type Language = "hr" | "en";

type AnalyticsEvent =
  | "page_view"
  | "language_change"
  | "demo_open"
  | "package_select"
  | "audit_select"
  | "contact_success"
  | "contact_error";

function trackEvent(event: AnalyticsEvent, detail = "") {
  if (typeof window === "undefined") return;

  const payload = JSON.stringify({
    event,
    path: window.location.pathname,
    language: document.documentElement.lang,
    referrer: document.referrer,
    detail: detail.slice(0, 80),
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/events", new Blob([payload], { type: "application/json" }));
    return;
  }

  void fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
  });
}

const content = {
  hr: {
    nav: [
      ["Usluge", "#usluge"],
      ["Dizajni", "#dizajni"],
      ["Paketi", "#paketi"],
      ["Proces", "#proces"],
    ],
    contact: "Pošaljite upit",
    eyebrow: "Web stranice i digitalni meniji za lokalna poslovanja",
    headline: "Jednostavna stranica koja gostima odmah daje ono što traže.",
    intro:
      "Brze i jasne web stranice za restorane, kafiće, barove i male lokalne dućane — izrađene da gost ili kupac odmah pronađe razlog, vrijeme i način dolaska.",
    primaryCta: "Zatražite besplatan pregled",
    secondaryCta: "Pogledajte pakete",
    trust: ["HR + EN", "Prilagođeno mobitelu", "Fiksan opseg i cijena"],
    previewLabel: "Primjer početne stranice",
    previewOpen: "OTVORENO DANAS",
    previewTitle: "Kava koja uspori dan.",
    previewBody: "Kvartovski specialty coffee bar u srcu Zagreba.",
    previewButton: "Pogledaj meni",
    qrLabel: "Digitalni meni",
    qrNote: "Skeniraj. Odaberi. Uživaj.",
    servicesKicker: "Što izrađujem",
    servicesTitle: "Digitalna prisutnost skrojena za vaše poslovanje.",
    servicesIntro:
      "Polazim od provjerenih predložaka za svaku kategoriju, a sadržaj, boje i karakter prilagođavam vašem prostoru.",
    services: [
      {
        number: "01",
        title: "Web stranica",
        body: "Jasan prikaz ponude, atmosfere, lokacije, radnog vremena i kontakta — brz na svakom uređaju.",
      },
      {
        number: "02",
        title: "Digitalni meni",
        body: "Meni koji se otvara QR kodom, lako čita na mobitelu i može biti na hrvatskom i engleskom.",
      },
      {
        number: "03",
        title: "Osvježenje sadržaja",
        body: "Uređivanje postojećih tekstova, fotografija i strukture kako bi gosti brže pronašli bitno.",
      },
    ],
    categoriesKicker: "Predlošci po kategoriji",
    categoriesTitle: "Poznata struktura. Vaš vlastiti karakter.",
    categories: [
      ["Kafić", "Topla atmosfera, ponuda kave, lokacija i radno vrijeme."],
      ["Restoran", "Jelovnik, rezervacije, priča kuhinje i ključne informacije."],
      ["Bar", "Program, signature pića, galerija i večernji identitet."],
      ["Lokalni dućan", "Proizvodi, atmosfera, lokacija i jednostavan put do kupnje."],
    ],
    designsKicker: "12 demo-dizajna",
    designsTitle: "Ovo je početni okvir. Vaša stranica tek treba zaživjeti.",
    designsIntro: "Demo-dizajni pokazuju mogući smjer — nisu gotove stranice koje samo preslikavamo. Svaki projekt prilagođavamo vašim fotografijama, ponudi, tonu, bojama i stvarnim potrebama.",
    designsNoteTitle: "Nijedan klijent ne dobiva kopiju demo-stranice.",
    designsNoteBody: "Provjerena struktura ubrzava izradu, a identitet gradimo oko konkretnog lokala i ljudi kojima se obraća.",
    openDemo: "Otvori cijeli demo",
    viewAllDemos: "Otvori pregled svih dizajna",
    pricingKicker: "Fiksni paketi",
    pricingTitle: "Odaberite dobru početnu točku.",
    pricingIntro:
      "Cijena se potvrđuje prije početka. Ako projekt traži više sadržaja ili posebnu funkcionalnost, dobit ćete izmijenjenu ponudu unaprijed.",
    compensation: "Studentska naknada",
    clientTotal: "Procijenjeni ukupni trošak naručitelja",
    freePriceLabel: "Besplatno",
    freeTotalLabel: "Ukupni trošak",
    featured: "Najčešći izbor",
    choose: "Odaberite i nastavite",
    packages: [
      {
        name: "Digitalni meni",
        price: "149 €",
        total: "175,82 €",
        free: false,
        featured: false,
        description: "Za lokal kojem treba čist i brz meni dostupan QR kodom.",
        features: ["HR ili HR + EN", "QR kod za stolove", "Mobilni prikaz", "Neograničene dorade prije objave"],
      },
      {
        name: "Web za lokal",
        price: "349 €",
        total: "411,82 €",
        free: false,
        description: "Kompaktna web stranica koja gostu odmah daje ono što traži.",
        features: ["Početna stranica", "Ponuda i galerija", "Lokacija i radno vrijeme", "HR ili HR + EN", "Neograničene dorade prije objave"],
        featured: true,
      },
      {
        name: "Web + meni",
        price: "449 €",
        total: "529,82 €",
        free: false,
        featured: false,
        description: "Cjelovita početna digitalna prisutnost za novi ili obnovljeni lokal.",
        features: ["Sve iz Web paketa", "Digitalni QR meni", "Usklađen dizajn", "Osnovna SEO postavka", "Neograničene dorade prije objave"],
      },
    ],
    auditLabel: "Niste sigurni odakle krenuti?",
    auditTitle: "Besplatni pregled postojeće stranice ili menija",
    auditBody: "Dobivate kratku procjenu mobilnog prikaza, jasnoće ponude, kontakta, osnovnog SEO-a i tri konkretna prijedloga — bez obveze.",
    auditCta: "Zatražite besplatni pregled",
    revisionPromise: "Neograničene dorade znače da završnu verziju prilagođavamo dok niste zadovoljni, unutar prvotno dogovorenog opsega. Nove stranice ili funkcionalnosti dogovaraju se zasebno.",
    addonLabel: "Dodatna mogućnost",
    addonTitle: "Samostalno uređivanje weba i menija",
    addonDescription: "Jednostavno sučelje u kojem sami mijenjate cijene, stavke menija, radno vrijeme, odabrane tekstove i fotografije — bez čekanja na mene.",
    addonPrice: "+149 €",
    addonTotal: "+175,82 €",
    addonFeatures: ["Uređivanje bez programiranja", "Kratke video upute", "Vlasnički pristup za lokal", "Početno postavljanje uključeno"],
    addonCta: "Dodaj paketu",
    supportLine: "Nakon objave: tehničke pogreške ispravljam besplatno 30 dana. Kasnija manja izmjena iznosi 50 € studentske naknade, odnosno približno 59 € ukupnog troška naručitelja.",
    pricingNote:
      "Prikazani ukupni trošak uključuje približno 18% davanja i naknada Student servisa na studentsku naknadu. Domena, hosting i eventualne plaćene licence nisu uključeni te ih naručitelj plaća izravno pružatelju usluge.",
    processKicker: "Kako radimo",
    processTitle: "Od kratkog razgovora do gotove stranice.",
    process: [
      ["Kratki pregled", "Pošaljete postojeći link, meni ili nekoliko fotografija i kažete što vam treba."],
      ["Dogovor", "Potvrđujemo sadržaj, paket, rok i konačnu cijenu prije početka rada."],
      ["Izrada", "Dobivate radnu verziju, šaljete komentare i zajedno završavamo detalje."],
      ["Objava", "Stranicu postavljamo na domenu koja ostaje u vlasništvu vašeg lokala."],
    ],
    symbolic:
      "Ako nemate vlastite fotografije, mogu se privremeno koristiti odgovarajuće ilustrativne fotografije uz jasnu oznaku „ilustrativna fotografija”. Ne predstavljaju se kao stvarna ponuda lokala.",
    paymentKicker: "Plaćanje preko Student servisa",
    paymentTitle: "Uredno za vas, sigurno za obje strane.",
    paymentIntro:
      "Plaćanje usluga obavlja se preko Student servisa SCZG.",
    paymentSteps: [
      ["1", "Dogovaramo projekt", "Pisano potvrđujemo opseg, studentsku naknadu i očekivani ukupni trošak."],
      ["2", "Otvara se ugovor", "Vaš lokal registrira se kao naručitelj i prije početka otvara studentski ugovor."],
      ["3", "Predajem dogovoreno", "Nakon vašeg pregleda i prihvaćanja projekt se zaključuje prema dogovoru."],
      ["4", "SCZG izdaje račun", "Naručitelj plaća račun Student servisu, a Student servis isplaćuje izvođača."],
    ],
    officialInfo: "Službene upute za naručitelje — SCZG",
    faqKicker: "Kratki odgovori",
    faqTitle: "Prije nego što se javite.",
    faqs: [
      ["Je li WebZaLokal registrirana tvrtka?", "Ne. WebZaLokal je naziv projekta i usluge."],
      ["Moram li imati spremne tekstove i fotografije?", "Ne. Mogu pomoći složiti tekstove iz vaših postojećih materijala. Za stvarne fotografije najbolje je koristiti vaše fotografije ili dogovoriti fotografiranje."],
      ["Može li paket biti drugačiji?", "Da. Paketi su fiksne početne opcije. Dodatne stranice, jezici ili funkcionalnosti procjenjuju se i potvrđuju prije početka."],
    ],
    contactKicker: "Imate lokalno poslovanje?",
    contactTitle: "Pogledajmo što vašim kupcima nedostaje online.",
    contactBody:
      "Pošaljite naziv lokala i postojeći link, ako ga imate. Odgovorit ću kratkim prijedlogom bez obveze.",
    selectedOfferLabel: "Odabrani paket",
    selectedOfferHint: "Paket je automatski odabran u obrascu.",
    formTitle: "Pošaljite upit",
    formVenue: "Naziv poslovanja",
    formVenuePlaceholder: "npr. Kavana Centar",
    formEmail: "Kontakt e-mail",
    formPackage: "Paket",
    formPackagePlaceholder: "Odaberite paket",
    formWebsite: "Postojeći web ili meni",
    formWebsitePlaceholder: "Poveznica, ako postoji",
    formMessage: "Što vam treba?",
    formMessagePlaceholder: "U nekoliko rečenica opišite lokal i što biste željeli poboljšati.",
    formConsent: "Slažem se da se uneseni podaci koriste isključivo za obradu i odgovor na moj upit.",
    formPrivacy: "Pravila privatnosti",
    formSubmit: "Pošaljite upit",
    formSubmitting: "Šalje se…",
    formSuccess: "Hvala! Upit je poslan. Odgovorit ću na navedeni e-mail.",
    formError: "Upit nije poslan. Pokušajte ponovno ili pošaljite e-mail izravno.",
    emailLabel: "Ili pošaljite izravno na",
    footerLine: "Web stranice i digitalni meniji za lokalna poslovanja.",
    footerLegal: "Usluge se ugovaraju putem Student servisa SCZG.",
  },
  en: {
    nav: [
      ["Services", "#usluge"],
      ["Designs", "#dizajni"],
      ["Packages", "#paketi"],
      ["Process", "#proces"],
    ],
    contact: "Send an enquiry",
    eyebrow: "Websites and digital menus for local businesses",
    headline: "A simple website that gives customers what they need, right away.",
    intro:
      "Fast, clear websites for restaurants, cafés, bars and small local shops — built so every guest or customer can immediately see why, when and how to visit.",
    primaryCta: "Request a free review",
    secondaryCta: "View packages",
    trust: ["HR + EN", "Mobile-friendly", "Fixed scope and price"],
    previewLabel: "Homepage example",
    previewOpen: "OPEN TODAY",
    previewTitle: "Coffee that slows the day.",
    previewBody: "A neighbourhood specialty coffee bar in the heart of Zagreb.",
    previewButton: "View menu",
    qrLabel: "Digital menu",
    qrNote: "Scan. Choose. Enjoy.",
    servicesKicker: "What I create",
    servicesTitle: "A digital presence tailored to your business.",
    servicesIntro:
      "I start with proven structures for each category, then adapt the content, colours and personality to your space.",
    services: [
      {
        number: "01",
        title: "Website",
        body: "A clear presentation of your offer, atmosphere, location, opening hours and contact details — fast on every device.",
      },
      {
        number: "02",
        title: "Digital menu",
        body: "A menu opened by QR code, easy to read on a phone and available in Croatian and English.",
      },
      {
        number: "03",
        title: "Content refresh",
        body: "Improved copy, images and structure so guests can find the essentials more quickly.",
      },
    ],
    categoriesKicker: "Category templates",
    categoriesTitle: "A familiar structure. Your own character.",
    categories: [
      ["Café", "Warm atmosphere, coffee offer, location and opening hours."],
      ["Restaurant", "Menu, reservations, culinary story and essential information."],
      ["Bar", "Events, signature drinks, gallery and an evening identity."],
      ["Local shop", "Products, atmosphere, location and a simple path to purchase."],
    ],
    designsKicker: "12 demo designs",
    designsTitle: "This is a starting framework. Your website is still waiting to come alive.",
    designsIntro: "The demos show possible directions — they are not finished websites that we simply copy. Every project is adapted to your photography, offer, tone, colours and real business needs.",
    designsNoteTitle: "No client receives a copy of a demo website.",
    designsNoteBody: "A proven structure speeds up the build, while the identity is shaped around the actual business and the people it serves.",
    openDemo: "Open full demo",
    viewAllDemos: "View every design",
    pricingKicker: "Fixed packages",
    pricingTitle: "Choose a strong starting point.",
    pricingIntro:
      "The price is confirmed before work begins. If a project needs more content or special functionality, you receive a revised quote in advance.",
    compensation: "Student compensation",
    clientTotal: "Estimated total client cost",
    freePriceLabel: "Free",
    freeTotalLabel: "Total cost",
    featured: "Most popular",
    choose: "Select and continue",
    packages: [
      {
        name: "Digital menu",
        price: "€149",
        total: "€175.82",
        free: false,
        featured: false,
        description: "For a venue that needs a clean, fast menu accessed by QR code.",
        features: ["HR or HR + EN", "QR code for tables", "Mobile layout", "Unlimited pre-launch revisions"],
      },
      {
        name: "Venue website",
        price: "€349",
        total: "€411.82",
        free: false,
        description: "A compact website that immediately gives guests what they need.",
        features: ["Homepage", "Offer and gallery", "Location and opening hours", "HR or HR + EN", "Unlimited pre-launch revisions"],
        featured: true,
      },
      {
        name: "Website + menu",
        price: "€449",
        total: "€529.82",
        free: false,
        featured: false,
        description: "A complete first digital presence for a new or refreshed venue.",
        features: ["Everything in Website", "Digital QR menu", "Consistent design", "Basic SEO setup", "Unlimited pre-launch revisions"],
      },
    ],
    auditLabel: "Not sure where to start?",
    auditTitle: "A free review of your current website or menu",
    auditBody: "You receive a concise review of the mobile experience, offer, contact details and basic SEO, plus three practical recommendations — with no obligation.",
    auditCta: "Request a free review",
    revisionPromise: "Unlimited revisions mean the final version is refined until you are satisfied, within the originally agreed scope. New pages or functionality are quoted separately.",
    addonLabel: "Optional add-on",
    addonTitle: "Self-editable website and menu",
    addonDescription: "A simple interface for changing prices, menu items, opening hours, selected copy and photographs yourself — without waiting for me.",
    addonPrice: "+€149",
    addonTotal: "+€175.82",
    addonFeatures: ["No-code editing", "Short video guide", "Venue-owned access", "Initial setup included"],
    addonCta: "Add to package",
    supportLine: "After launch: technical defects are corrected free for 30 days. A later small update costs €50 in student compensation, or approximately €59 total client cost.",
    pricingNote:
      "The displayed total client cost includes approximately 18% in Student Service charges and contributions on top of the student compensation. Domain, hosting and any paid licences are not included and are paid directly by the client to the provider.",
    processKicker: "How it works",
    processTitle: "From a short conversation to a finished website.",
    process: [
      ["Quick review", "Send your current link, menu or a few photos and tell me what you need."],
      ["Agreement", "We confirm the content, package, deadline and final price before work begins."],
      ["Build", "You receive a working version, send feedback and we finish the details together."],
      ["Launch", "The website is connected to a domain that remains owned by your venue."],
    ],
    symbolic:
      "If you do not have your own photographs, suitable illustrative images can be used temporarily with a clear “illustrative image” label. They are never presented as the venue’s actual dishes or products.",
    paymentKicker: "Payment through Student Service",
    paymentTitle: "Straightforward for you, secure for both sides.",
    paymentIntro:
      "Services are paid through SCZG Student Service.",
    paymentSteps: [
      ["1", "We agree the project", "The scope, student compensation and expected total cost are confirmed in writing."],
      ["2", "The contract is opened", "Your venue registers as the client and opens a student contract before work begins."],
      ["3", "I deliver the work", "After your review and acceptance, the project is completed as agreed."],
      ["4", "SCZG issues the invoice", "The client pays Student Service, and Student Service pays the contractor."],
    ],
    officialInfo: "Official information for clients — SCZG",
    faqKicker: "Quick answers",
    faqTitle: "Before you get in touch.",
    faqs: [
      ["Is WebZaLokal a registered company?", "No. WebZaLokal is the project and service name."],
      ["Do I need finished copy and photographs?", "No. I can help structure copy from your existing material. For authentic photographs, it is best to use your own or arrange a photo shoot."],
      ["Can a package be changed?", "Yes. Packages are fixed starting options. Additional pages, languages or functionality are estimated and confirmed before work begins."],
    ],
    contactKicker: "Do you run a local business?",
    contactTitle: "Let’s see what your customers are missing online.",
    contactBody:
      "Send the name of your venue and an existing link, if you have one. I’ll reply with a short, no-obligation suggestion.",
    selectedOfferLabel: "Selected package",
    selectedOfferHint: "The package is automatically selected in the form.",
    formTitle: "Send an enquiry",
    formVenue: "Business name",
    formVenuePlaceholder: "e.g. Central Café",
    formEmail: "Contact email",
    formPackage: "Package",
    formPackagePlaceholder: "Choose a package",
    formWebsite: "Current website or menu",
    formWebsitePlaceholder: "Link, if available",
    formMessage: "What do you need?",
    formMessagePlaceholder: "Briefly describe your venue and what you would like to improve.",
    formConsent: "I agree that the submitted data may be used solely to process and respond to my enquiry.",
    formPrivacy: "Privacy policy",
    formSubmit: "Send enquiry",
    formSubmitting: "Sending…",
    formSuccess: "Thank you! Your enquiry has been sent. I’ll reply to the email provided.",
    formError: "The enquiry was not sent. Please try again or email me directly.",
    emailLabel: "Or email directly",
    footerLine: "Websites and digital menus for local businesses.",
    footerLegal: "Services are contracted through SCZG Student Service.",
  },
} as const;

export default function Home() {
  const [language, setLanguage] = useState<Language>("hr");
  const [selectedOffer, setSelectedOffer] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const formStartedAt = useRef(0);
  const t = content[language];
  const mailSubject = encodeURIComponent(
    language === "hr" ? "Upit za WebZaLokal" : "WebZaLokal enquiry",
  );
  const mailHref = `mailto:webzalokal@gmail.com?subject=${mailSubject}`;
  const packageMailHref = (packageName: string) => {
    const subject = encodeURIComponent(
      language === "hr" ? `Upit za paket — ${packageName}` : `Package enquiry — ${packageName}`,
    );
    const body = encodeURIComponent(
      language === "hr"
        ? `Pozdrav,\n\nzanima me paket „${packageName}”.\n\nNaziv lokala:\nPostojeća web stranica ili meni:\nDodatne napomene:\n`
        : `Hello,\n\nI am interested in the “${packageName}” package.\n\nVenue name:\nCurrent website or menu:\nAdditional notes:\n`,
    );

    return `mailto:webzalokal@gmail.com?subject=${subject}&body=${body}`;
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    formStartedAt.current = Date.now();
    trackEvent("page_view");
  }, []);

  const submitEnquiry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setFormStatus("submitting");

    try {
      const data = new FormData(form);
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          businessName: data.get("businessName"),
          email: data.get("email"),
          packageName: data.get("packageName"),
          website: data.get("website"),
          message: data.get("message"),
          consent: data.get("privacyConsent") === "yes",
          companySite: data.get("companySite"),
          language,
          startedAt: formStartedAt.current,
        }),
      });
      const result = (await response.json()) as { success?: boolean };

      if (!response.ok || result.success !== true) {
        throw new Error("Form submission failed");
      }

      form.reset();
      formStartedAt.current = Date.now();
      setSelectedOffer(null);
      setFormStatus("success");
      trackEvent("contact_success");
    } catch {
      setFormStatus("error");
      trackEvent("contact_error");
    }
  };

  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="#vrh" aria-label="WebZaLokal — početna">
          <span className="brand-mark" aria-hidden="true">WZL</span>
          <span>WebZaLokal</span>
        </a>

        <nav className="desktop-nav" aria-label={language === "hr" ? "Glavna navigacija" : "Main navigation"}>
          {t.nav.map(([label, href]) => (
            <a href={href} key={href}>{label}</a>
          ))}
        </nav>

        <div className="header-actions">
          <div className="language-switch" aria-label={language === "hr" ? "Odabir jezika" : "Choose language"}>
            <button type="button" aria-pressed={language === "hr"} onClick={() => { setLanguage("hr"); setSelectedOffer(null); trackEvent("language_change", "hr"); }}>HR</button>
            <button type="button" aria-pressed={language === "en"} onClick={() => { setLanguage("en"); setSelectedOffer(null); trackEvent("language_change", "en"); }}>EN</button>
          </div>
          <a className="small-cta" href="#kontakt">{t.contact}</a>
        </div>
      </header>

      <main>
        <section className="hero section-wrap" id="vrh">
          <div className="hero-copy">
            <p className="eyebrow"><span />{t.eyebrow}</p>
            <h1>{t.headline}</h1>
            <p className="hero-intro">{t.intro}</p>
            <div className="hero-actions">
              <a className="button button-primary" href="#kontakt" onClick={() => { setSelectedOffer(t.auditTitle); trackEvent("audit_select"); }}>{t.primaryCta}<span aria-hidden="true">↓</span></a>
              <a className="button button-ghost" href="#paketi">{t.secondaryCta}<span aria-hidden="true">↓</span></a>
            </div>
            <ul className="trust-list" aria-label={language === "hr" ? "Prednosti" : "Benefits"}>
              {t.trust.map((item) => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}
            </ul>
          </div>

          <div className="hero-visual" aria-label={t.previewLabel}>
            <div className="visual-orbit orbit-one" aria-hidden="true" />
            <div className="visual-orbit orbit-two" aria-hidden="true" />
            <div className="browser-card">
              <div className="browser-top"><i /><i /><i /><span>lokal-zagreb.hr</span></div>
              <div className="sample-site">
                <div className="sample-nav"><strong>mrvica.</strong><span>MENU&nbsp;&nbsp; INFO</span></div>
                <div className="sample-content">
                  <span className="sample-open">{t.previewOpen}</span>
                  <h2>{t.previewTitle}</h2>
                  <p>{t.previewBody}</p>
                  <button type="button" tabIndex={-1}>{t.previewButton}</button>
                </div>
                <div className="sample-cup" aria-hidden="true"><span /></div>
              </div>
            </div>
            <div className="qr-card">
              <div className="qr-code" aria-hidden="true">
                <span /><span /><span /><span /><span /><span /><span /><span /><span />
              </div>
              <div><strong>{t.qrLabel}</strong><small>{t.qrNote}</small></div>
            </div>
          </div>
        </section>

        <section className="services section-wrap" id="usluge">
          <div className="section-heading split-heading">
            <div><p className="section-kicker">{t.servicesKicker}</p><h2>{t.servicesTitle}</h2></div>
            <p>{t.servicesIntro}</p>
          </div>
          <div className="service-grid">
            {t.services.map((service) => (
              <article className="service-card" key={service.number}>
                <span className="service-number">{service.number}</span>
                <div className="service-icon" aria-hidden="true"><span /></div>
                <h3>{service.title}</h3>
                <p>{service.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="categories">
          <div className="section-wrap categories-inner">
            <div className="section-heading">
              <p className="section-kicker light">{t.categoriesKicker}</p>
              <h2>{t.categoriesTitle}</h2>
            </div>
            <div className="category-grid">
              {t.categories.map(([title, body], index) => (
                <article className={`category-card category-${index + 1}`} key={title}>
                  <div className="category-art" aria-hidden="true">
                    <span className="art-disc" /><span className="art-line" /><span className="art-dot" />
                  </div>
                  <div><span>0{index + 1}</span><h3>{title}</h3><p>{body}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="designs section-wrap" id="dizajni">
          <div className="section-heading split-heading designs-heading">
            <div><p className="section-kicker">{t.designsKicker}</p><h2>{t.designsTitle}</h2></div>
            <p>{t.designsIntro}</p>
          </div>
          <aside className="designs-note">
            <span aria-hidden="true">↳</span>
            <div><strong>{t.designsNoteTitle}</strong><p>{t.designsNoteBody}</p></div>
          </aside>
          <div className="demo-grid">
            {demoDesigns.map((design, index) => (
              <a
                className="demo-card"
                href={demoUrl(design.slug)}
                target="_blank"
                rel="noreferrer"
                onClick={() => trackEvent("demo_open", design.slug)}
                key={design.slug}
              >
                <div className="demo-preview" style={{ background: design.colors[0], color: design.colors[2] }}>
                  <span className="demo-browser"><i /><i /><i /></span>
                  <small>{categoryLabels[design.category][language]}</small>
                  <strong>{design.sampleName}</strong>
                  <span className="demo-palette" aria-hidden="true">
                    {design.colors.map((color) => <i style={{ background: color }} key={color} />)}
                  </span>
                  <b>0{index + 1}</b>
                </div>
                <div className="demo-copy">
                  <span>{design.name}</span>
                  <h3>{design.sampleName}</h3>
                  <p>{language === "hr" ? design.description : design.descriptionEn}</p>
                  <strong>{t.openDemo}<span aria-hidden="true">↗</span></strong>
                </div>
              </a>
            ))}
          </div>
          <div className="designs-action">
            <a className="button button-outline" href={defaultDemoBaseUrl} target="_blank" rel="noreferrer" onClick={() => trackEvent("demo_open", "catalog")}>{t.viewAllDemos}<span aria-hidden="true">↗</span></a>
          </div>
        </section>

        <section className="pricing section-wrap" id="paketi">
          <div className="section-heading centered-heading">
            <p className="section-kicker">{t.pricingKicker}</p>
            <h2>{t.pricingTitle}</h2>
            <p>{t.pricingIntro}</p>
          </div>
          <article className="audit-banner">
            <div>
              <span>{t.auditLabel}</span>
              <h3>{t.auditTitle}</h3>
              <p>{t.auditBody}</p>
            </div>
            <a className="button button-outline" href="#kontakt" onClick={() => { setSelectedOffer(t.auditTitle); trackEvent("audit_select"); }}>{t.auditCta}<span aria-hidden="true">↓</span></a>
          </article>
          <div className="pricing-grid">
            {t.packages.map((item) => (
              <a
                className={`price-card ${item.featured ? "featured" : ""} ${item.free ? "free" : ""}`}
                href="#kontakt"
                onClick={() => { setSelectedOffer(item.name); trackEvent("package_select", item.name); }}
                aria-label={`${t.choose}: ${item.name}`}
                key={item.name}
              >
                {item.featured && <span className="featured-label">{t.featured}</span>}
                <h3>{item.name}</h3>
                <p className="price-description">{item.description}</p>
                <div className="price-row"><strong>{item.price}</strong><span>{item.free ? t.freePriceLabel : t.compensation}</span></div>
                <div className="client-total"><span>{item.free ? t.freeTotalLabel : t.clientTotal}</span><strong>{item.total}</strong></div>
                <ul>{item.features.map((feature) => <li key={feature}><span aria-hidden="true">✓</span>{feature}</li>)}</ul>
                <span className={`button ${item.featured ? "button-primary" : "button-outline"}`}>{t.choose}<span aria-hidden="true">↓</span></span>
              </a>
            ))}
          </div>
          <div className="revision-promise"><span aria-hidden="true">∞</span><p>{t.revisionPromise}</p></div>
          <article className="pricing-addon">
            <div className="addon-copy">
              <p className="addon-label">{t.addonLabel}</p>
              <h3>{t.addonTitle}</h3>
              <p>{t.addonDescription}</p>
              <ul>{t.addonFeatures.map((feature) => <li key={feature}><span aria-hidden="true">✓</span>{feature}</li>)}</ul>
            </div>
            <div className="addon-price">
              <div><strong>{t.addonPrice}</strong><span>{t.compensation}</span></div>
              <div className="client-total"><span>{t.clientTotal}</span><strong>{t.addonTotal}</strong></div>
              <a className="button button-primary" href="#kontakt" onClick={() => setSelectedOffer(t.addonTitle)}>{t.addonCta}<span aria-hidden="true">↓</span></a>
            </div>
          </article>
          <p className="support-line"><span aria-hidden="true">↻</span>{t.supportLine}</p>
          <p className="pricing-note"><span aria-hidden="true">i</span>{t.pricingNote}</p>
        </section>

        <section className="process section-wrap" id="proces">
          <div className="process-intro">
            <p className="section-kicker">{t.processKicker}</p>
            <h2>{t.processTitle}</h2>
            <div className="symbolic-note"><span aria-hidden="true">✦</span><p>{t.symbolic}</p></div>
          </div>
          <ol className="process-list">
            {t.process.map(([title, body], index) => (
              <li key={title}>
                <span className="process-number">0{index + 1}</span>
                <div><h3>{title}</h3><p>{body}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section className="payment" id="placanje">
          <div className="section-wrap payment-inner">
            <div className="payment-copy">
              <p className="section-kicker light">{t.paymentKicker}</p>
              <h2>{t.paymentTitle}</h2>
              <p>{t.paymentIntro}</p>
              <a className="text-link" href="https://www.sczg.unizg.hr/prijava-poslodavac" target="_blank" rel="noreferrer">{t.officialInfo}<span aria-hidden="true">↗</span></a>
            </div>
            <ol className="payment-steps">
              {t.paymentSteps.map(([number, title, body]) => (
                <li key={number}><span>{number}</span><div><h3>{title}</h3><p>{body}</p></div></li>
              ))}
            </ol>
          </div>
        </section>

        <section className="faq section-wrap">
          <div className="section-heading">
            <p className="section-kicker">{t.faqKicker}</p>
            <h2>{t.faqTitle}</h2>
          </div>
          <div className="faq-list">
            {t.faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}<span aria-hidden="true">+</span></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="contact-section section-wrap" id="kontakt">
          <div className="contact-panel">
            <div>
              <p className="section-kicker light">{t.contactKicker}</p>
              <h2>{t.contactTitle}</h2>
              <p>{t.contactBody}</p>
            </div>
            <div className="contact-action">
              {formStatus === "success" && <div className="form-success" role="status">{t.formSuccess}</div>}
              {formStatus === "error" && <div className="form-error" role="alert">{t.formError}</div>}
              {selectedOffer && (
                <div className="selected-offer" aria-live="polite">
                  <span>{t.selectedOfferLabel}</span>
                  <strong>{selectedOffer}</strong>
                  <small>{t.selectedOfferHint}</small>
                </div>
              )}
              <form
                className="contact-form"
                action="/api/contact"
                method="POST"
                onSubmit={submitEnquiry}
                aria-busy={formStatus === "submitting"}
              >
                <input className="form-honey" type="text" name="companySite" tabIndex={-1} autoComplete="off" aria-hidden="true" />
                <h3>{t.formTitle}</h3>
                <div className="form-grid">
                  <label className="form-field">
                    <span>{t.formVenue}</span>
                    <input type="text" name="businessName" placeholder={t.formVenuePlaceholder} autoComplete="organization" minLength={2} maxLength={100} required />
                  </label>
                  <label className="form-field">
                    <span>{t.formEmail}</span>
                    <input type="email" name="email" placeholder="ime@lokal.hr" autoComplete="email" required />
                  </label>
                  <label className="form-field form-field-full">
                    <span>{t.formPackage}</span>
                    <select name="packageName" value={selectedOffer ?? ""} onChange={(event) => setSelectedOffer(event.target.value || null)} required>
                      <option value="">{t.formPackagePlaceholder}</option>
                      <option value={t.auditTitle}>{t.auditTitle}</option>
                      {t.packages.map((item) => <option value={item.name} key={item.name}>{item.name}</option>)}
                      <option value={t.addonTitle}>{t.addonTitle}</option>
                    </select>
                  </label>
                  <label className="form-field form-field-full">
                    <span>{t.formWebsite}</span>
                    <input type="url" name="website" placeholder={t.formWebsitePlaceholder} inputMode="url" />
                  </label>
                  <label className="form-field form-field-full">
                    <span>{t.formMessage}</span>
                    <textarea name="message" placeholder={t.formMessagePlaceholder} rows={4} minLength={10} maxLength={3000} required />
                  </label>
                </div>
                <label className="form-consent">
                  <input type="checkbox" name="privacyConsent" value="yes" required />
                  <span>{t.formConsent} <a href="/privatnost/">{t.formPrivacy}</a>.</span>
                </label>
                <button className="button button-primary" type="submit" disabled={formStatus === "submitting"}>
                  {formStatus === "submitting" ? t.formSubmitting : t.formSubmit}
                  <span aria-hidden="true">{formStatus === "submitting" ? "…" : "→"}</span>
                </button>
              </form>
              <a className="contact-email" href={selectedOffer ? packageMailHref(selectedOffer) : mailHref}>
                <span>{t.emailLabel}</span>
                <strong>webzalokal@gmail.com</strong>
                <i aria-hidden="true">✉</i>
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer section-wrap">
        <a className="brand" href="#vrh"><span className="brand-mark" aria-hidden="true">WZL</span><span>WebZaLokal</span></a>
        <div><p>{t.footerLine}</p><small>{t.footerLegal}</small><nav className="footer-links" aria-label={language === "hr" ? "Dodatne poveznice" : "Additional links"}><a href="/privatnost/">{t.formPrivacy}</a><a href="/studio/" rel="nofollow">Studio Lite</a></nav></div>
        <p className="copyright">© {new Date().getFullYear()} WebZaLokal</p>
      </footer>
    </div>
  );
}
