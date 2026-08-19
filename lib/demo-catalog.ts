export type BusinessCategory = "restaurant" | "cafe" | "bar" | "shop";

export type DemoDesign = {
  slug: string;
  sampleSlug: string;
  category: BusinessCategory;
  name: string;
  sampleName: string;
  description: string;
  descriptionEn: string;
  colors: [string, string, string];
};

export const demoDesigns: DemoDesign[] = [
  {
    slug: "restaurant-fine-dining",
    sampleSlug: "aurelia",
    category: "restaurant",
    name: "Fine dining",
    sampleName: "Aurelia",
    description: "Elegantna tipografija, tamna paleta i miran urednički ritam.",
    descriptionEn: "Elegant typography, a dark palette and a calm editorial rhythm.",
    colors: ["#171411", "#c9a76b", "#f3eadb"],
  },
  {
    slug: "restaurant-neighborhood-bistro",
    sampleSlug: "tavola",
    category: "restaurant",
    name: "Kvartovski bistro",
    sampleName: "Tavola",
    description: "Topla, pristupačna estetika s maslinastim i terakota tonovima.",
    descriptionEn: "A warm, approachable aesthetic with olive and terracotta tones.",
    colors: ["#f4eddf", "#bd5b3d", "#263129"],
  },
  {
    slug: "restaurant-fast-food",
    sampleSlug: "brzi-zalogaj",
    category: "restaurant",
    name: "Fast food / štand",
    sampleName: "Brzi Zalogaj",
    description: "Snažan kontrast, veliki naslovi i brz put do narudžbe.",
    descriptionEn: "Bold contrast, large headlines and a fast path to ordering.",
    colors: ["#f4ed34", "#e6452f", "#171717"],
  },
  {
    slug: "cafe-specialty-minimal",
    sampleSlug: "kadar-kava",
    category: "cafe",
    name: "Specialty minimal",
    sampleName: "Kadar Kava",
    description: "Čist, prozračan sustav s espresso i kadulja detaljima.",
    descriptionEn: "A clean, airy system with espresso and sage details.",
    colors: ["#f4f2ec", "#5f765f", "#272721"],
  },
  {
    slug: "cafe-neighborhood-cozy",
    sampleSlug: "dnevni-boravak",
    category: "cafe",
    name: "Kvartovski cozy",
    sampleName: "Dnevni Boravak",
    description: "Mekani oblici, karamel tonovi i osjećaj dnevnog boravka.",
    descriptionEn: "Soft shapes, caramel tones and a comfortable living-room feel.",
    colors: ["#f5e8d7", "#a8583e", "#3c2c23"],
  },
  {
    slug: "cafe-brunch-patisserie",
    sampleSlug: "mimoza",
    category: "cafe",
    name: "Brunch / slastičarnica",
    sampleName: "Mimoza",
    description: "Vedra pastelna paleta i razigrani editorialni detalji.",
    descriptionEn: "A bright pastel palette with playful editorial details.",
    colors: ["#fff4ee", "#dc657f", "#432d35"],
  },
  {
    slug: "bar-cocktail-lounge",
    sampleSlug: "nocturne",
    category: "bar",
    name: "Cocktail lounge",
    sampleName: "Nocturne",
    description: "Filmska crna, bordo i zlatna s fokusom na atmosferu.",
    descriptionEn: "Cinematic black, burgundy and gold with a focus on atmosphere.",
    colors: ["#100c12", "#d8b779", "#f3e9df"],
  },
  {
    slug: "bar-craft-pub",
    sampleSlug: "stari-lager",
    category: "bar",
    name: "Craft pub",
    sampleName: "Stari Lager",
    description: "Industrijski karakter, bakreni detalji i robusna tipografija.",
    descriptionEn: "Industrial character, copper details and robust typography.",
    colors: ["#1d211f", "#d07a39", "#eee4cf"],
  },
  {
    slug: "bar-night-event",
    sampleSlug: "pulse",
    category: "bar",
    name: "Night / event",
    sampleName: "PULSE",
    description: "Neonski naglasci, oštra geometrija i snažna najava programa.",
    descriptionEn: "Neon accents, sharp geometry and a programme-led structure.",
    colors: ["#070611", "#b8ff3d", "#76f7ff"],
  },
  {
    slug: "shop-vintage-second-hand",
    sampleSlug: "drugi-krug",
    category: "shop",
    name: "Vintage / second hand",
    sampleName: "Drugi Krug",
    description: "Papirnata paleta, odvažni detalji i editorialni vintage karakter.",
    descriptionEn: "A tactile paper palette, bold details and editorial vintage character.",
    colors: ["#efe2c7", "#c83f30", "#211e1a"],
  },
  {
    slug: "shop-plant-botanical",
    sampleSlug: "list-i-zemlja",
    category: "shop",
    name: "Biljke / botanical",
    sampleName: "List & Zemlja",
    description: "Organski oblici, prirodna zelena paleta i mirna tipografija.",
    descriptionEn: "Organic shapes, a natural green palette and calm typography.",
    colors: ["#e8efdf", "#337357", "#193127"],
  },
  {
    slug: "shop-local-boutique",
    sampleSlug: "malo-dobro",
    category: "shop",
    name: "Concept / lokalni butik",
    sampleName: "Malo Dobro",
    description: "Čista galerijska mreža i suvremen, samouvjeren vizualni identitet.",
    descriptionEn: "A clean gallery grid and a confident contemporary identity.",
    colors: ["#f1f2ef", "#304ffe", "#111216"],
  },
];

export const categoryLabels: Record<BusinessCategory, { hr: string; en: string }> = {
  restaurant: { hr: "Restoran", en: "Restaurant" },
  cafe: { hr: "Kafić", en: "Café" },
  bar: { hr: "Bar", en: "Bar" },
  shop: { hr: "Lokalni dućan", en: "Local shop" },
};

export const conceptDesignSlugs = [
  "restaurant-fine-dining",
  "cafe-specialty-minimal",
  "bar-cocktail-lounge",
] as const;

export const defaultDemoBaseUrl =
  process.env.NEXT_PUBLIC_DEMO_BASE_URL ??
  "https://webzalokal-demo.webzalokal.workers.dev";

export function demoUrl(slug: string): string {
  return `${defaultDemoBaseUrl}/templates/${slug}/`;
}
