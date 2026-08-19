"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  categoryLabels,
  demoDesigns,
  demoUrl,
  type BusinessCategory,
} from "@/lib/demo-catalog";

type StudioDraft = {
  businessName: string;
  slug: string;
  category: BusinessCategory;
  themeSlug: string;
  languages: "hr" | "hr-en";
  primaryGoal: string;
  currentProblem: string;
  firstImpression: string;
  shortDescription: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  instagram: string;
  requestedFeatures: string;
  designNotes: string;
  assetNotes: string;
};

const storageKey = "webzalokal-studio-lite-v1";

const initialDraft: StudioDraft = {
  businessName: "",
  slug: "",
  category: "restaurant",
  themeSlug: "restaurant-fine-dining",
  languages: "hr-en",
  primaryGoal: "Rezervacija / poziv / dolazak",
  currentProblem: "",
  firstImpression: "",
  shortDescription: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  instagram: "",
  requestedFeatures: "",
  designNotes: "",
  assetNotes: "",
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function quoteShell(value: string) {
  return JSON.stringify(value).replace(/\$/g, "\\$").replace(/\x60/g, "\\`");
}

export default function StudioLite() {
  const [draft, setDraft] = useState<StudioDraft>(initialDraft);
  const [status, setStatus] = useState("Novi nacrt");
  const [loaded, setLoaded] = useState(false);

  const availableThemes = useMemo(
    () => demoDesigns.filter((theme) => theme.category === draft.category),
    [draft.category],
  );
  const selectedTheme = demoDesigns.find((theme) => theme.slug === draft.themeSlug) ?? availableThemes[0];
  const generatedSlug = draft.slug || slugify(draft.businessName) || "naziv-klijenta";
  const generatorCommand = `npm run new-client -- --theme ${draft.themeSlug} --slug ${generatedSlug} --name ${quoteShell(draft.businessName || "Naziv poslovanja")}`;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) {
          setDraft({ ...initialDraft, ...(JSON.parse(saved) as Partial<StudioDraft>) });
          setStatus("Lokalni nacrt učitan");
        }
      } catch {
        setStatus("Nacrt nije bilo moguće učitati");
      } finally {
        setLoaded(true);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timeout = window.setTimeout(() => {
      window.localStorage.setItem(storageKey, JSON.stringify(draft));
      setStatus("Spremljeno u ovom pregledniku");
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [draft, loaded]);

  const update = <Key extends keyof StudioDraft>(key: Key, value: StudioDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setStatus("Nespremljene promjene…");
  };

  const changeBusinessName = (value: string) => {
    setDraft((current) => ({
      ...current,
      businessName: value,
      slug: current.slug && current.slug !== slugify(current.businessName) ? current.slug : slugify(value),
    }));
    setStatus("Nespremljene promjene…");
  };

  const changeCategory = (category: BusinessCategory) => {
    const firstTheme = demoDesigns.find((theme) => theme.category === category);
    setDraft((current) => ({
      ...current,
      category,
      themeSlug: firstTheme?.slug ?? current.themeSlug,
    }));
  };

  const copyCommand = async () => {
    await navigator.clipboard.writeText(generatorCommand);
    setStatus("Generatorska naredba kopirana");
  };

  const exportBrief = () => {
    const output = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      project: {
        ...draft,
        slug: generatedSlug,
        themeName: selectedTheme?.name,
        demoUrl: selectedTheme ? demoUrl(selectedTheme.slug) : null,
      },
      production: {
        generatorCommand,
        checklist: [
          "Potvrditi sve tekstove, cijene i radno vrijeme",
          "Potvrditi prava na fotografije i logotip",
          "Provjeriti kontakt, kartu i primarnu radnju",
          "Provjeriti mobilni prikaz i oba jezika",
          "Testirati obrazac, analitiku i health endpoint",
        ],
      },
    };
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${generatedSlug}-brief.json`;
    anchor.click();
    URL.revokeObjectURL(href);
    setStatus("Brief izvezen");
  };

  const resetDraft = () => {
    if (!window.confirm("Obrisati lokalni nacrt i krenuti ispočetka?")) return;
    window.localStorage.removeItem(storageKey);
    setDraft(initialDraft);
    setStatus("Novi nacrt");
  };

  return (
    <main className="studio-shell">
      <header className="studio-header">
        <Link className="brand" href="/"><span className="brand-mark">WZL</span><span>WebZaLokal</span></Link>
        <div><span className="studio-badge">Interno · v0.1</span><strong>Studio Lite</strong></div>
        <Link className="studio-back" href="/">← Povratak na web</Link>
      </header>

      <section className="studio-intro">
        <div>
          <p className="section-kicker">Od upita do početnog repozitorija</p>
          <h1>Pripremi klijenta bez rada od nule.</h1>
          <p>Ispuni brief, odaberi smjer i izvezi strukturirani projektni zapis. Podaci ostaju samo u ovom pregledniku dok ih ne izvezeš.</p>
        </div>
        <div className="studio-status"><i aria-hidden="true" /><span>{status}</span></div>
      </section>

      <div className="studio-layout">
        <form className="studio-form" onSubmit={(event) => event.preventDefault()}>
          <fieldset>
            <legend><span>01</span> Osnova projekta</legend>
            <div className="studio-fields two-columns">
              <label><span>Naziv poslovanja</span><input value={draft.businessName} onChange={(event) => changeBusinessName(event.target.value)} placeholder="npr. Bistro Tavola" /></label>
              <label><span>Slug projekta</span><input value={draft.slug} onChange={(event) => update("slug", slugify(event.target.value))} placeholder="bistro-tavola" /></label>
              <label><span>Kategorija</span><select value={draft.category} onChange={(event) => changeCategory(event.target.value as BusinessCategory)}>{(Object.keys(categoryLabels) as BusinessCategory[]).map((category) => <option value={category} key={category}>{categoryLabels[category].hr}</option>)}</select></label>
              <label><span>Jezici</span><select value={draft.languages} onChange={(event) => update("languages", event.target.value as StudioDraft["languages"])}><option value="hr-en">HR + EN</option><option value="hr">Samo HR</option></select></label>
            </div>
          </fieldset>

          <fieldset>
            <legend><span>02</span> Cilj i problem</legend>
            <div className="studio-fields">
              <label><span>Glavna radnja posjetitelja</span><input value={draft.primaryGoal} onChange={(event) => update("primaryGoal", event.target.value)} /></label>
              <label><span>Najveći trenutačni problem</span><textarea rows={3} value={draft.currentProblem} onChange={(event) => update("currentProblem", event.target.value)} placeholder="Što danas zbunjuje goste ili stvara nepotreban ručni rad?" /></label>
              <label><span>Što posjetitelj mora razumjeti u prvih pet sekundi?</span><textarea rows={3} value={draft.firstImpression} onChange={(event) => update("firstImpression", event.target.value)} /></label>
              <label><span>Kratki opis poslovanja</span><textarea rows={4} value={draft.shortDescription} onChange={(event) => update("shortDescription", event.target.value)} /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend><span>03</span> Kontakt i postojeće stanje</legend>
            <div className="studio-fields two-columns">
              <label className="span-two"><span>Adresa</span><input value={draft.address} onChange={(event) => update("address", event.target.value)} /></label>
              <label><span>Telefon</span><input value={draft.phone} onChange={(event) => update("phone", event.target.value)} /></label>
              <label><span>E-mail za goste / kupce</span><input type="email" value={draft.email} onChange={(event) => update("email", event.target.value)} /></label>
              <label><span>Postojeći web</span><input type="url" value={draft.website} onChange={(event) => update("website", event.target.value)} /></label>
              <label><span>Instagram</span><input value={draft.instagram} onChange={(event) => update("instagram", event.target.value)} /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend><span>04</span> Dizajn i sadržaj</legend>
            <div className="studio-fields">
              <label><span>Odabrani smjer</span><select value={draft.themeSlug} onChange={(event) => update("themeSlug", event.target.value)}>{availableThemes.map((theme) => <option value={theme.slug} key={theme.slug}>{theme.name} — {theme.sampleName}</option>)}</select></label>
              <label><span>Posebne funkcionalnosti i zahtjevi</span><textarea rows={3} value={draft.requestedFeatures} onChange={(event) => update("requestedFeatures", event.target.value)} /></label>
              <label><span>WebZaLokal dizajnerski komentar</span><textarea rows={5} value={draft.designNotes} onChange={(event) => update("designNotes", event.target.value)} placeholder="npr. Elegantniji serifni font, ozbiljnija paleta, fotografije prostora važnije od velike količine teksta…" /></label>
              <label><span>Fotografije, logotip i ostali materijali</span><textarea rows={3} value={draft.assetNotes} onChange={(event) => update("assetNotes", event.target.value)} /></label>
            </div>
          </fieldset>
        </form>

        <aside className="studio-output">
          <div className="studio-preview" style={{ background: selectedTheme?.colors[0], color: selectedTheme?.colors[2] }}>
            <span>{categoryLabels[draft.category].hr}</span>
            <strong>{draft.businessName || "Naziv poslovanja"}</strong>
            <p>{selectedTheme?.name}</p>
            <div>{selectedTheme?.colors.map((color) => <i style={{ background: color }} key={color} />)}</div>
          </div>

          <section>
            <span className="studio-output-label">Početni demo</span>
            <h2>{selectedTheme?.sampleName}</h2>
            <p>{selectedTheme?.description}</p>
            {selectedTheme && <a href={demoUrl(selectedTheme.slug)} target="_blank" rel="noreferrer">Otvori demonstraciju ↗</a>}
          </section>

          <section>
            <span className="studio-output-label">Generatorska naredba</span>
            <code>{generatorCommand}</code>
            <button type="button" onClick={copyCommand}>Kopiraj naredbu</button>
          </section>

          <div className="studio-output-actions">
            <button className="studio-export" type="button" onClick={exportBrief}>Izvezi brief.json <span>↓</span></button>
            <button className="studio-reset" type="button" onClick={resetDraft}>Očisti nacrt</button>
          </div>
        </aside>
      </div>
    </main>
  );
}
