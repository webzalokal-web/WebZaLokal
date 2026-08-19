const siteUrl = (process.env.SITE_URL ?? "https://webzalokal.webzalokal.workers.dev").replace(/\/$/, "");
const demoUrl = (process.env.DEMO_URL ?? "https://webzalokal-demo.webzalokal.workers.dev").replace(/\/$/, "");

const checks = [
  { name: "WebZaLokal početna", url: `${siteUrl}/`, contains: "WebZaLokal" },
  { name: "WebZaLokal health", url: `${siteUrl}/api/health`, jsonStatus: "ok" },
  { name: "Studio Lite", url: `${siteUrl}/studio/`, contains: "Studio Lite" },
  { name: "Katalog dizajna", url: `${demoUrl}/`, contains: "Dvanaest različitih karaktera" },
  { name: "Koncept restorana", url: `${demoUrl}/templates/restaurant-fine-dining/`, contains: "Aurelia" },
];

let failed = false;

for (const check of checks) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const startedAt = Date.now();

  try {
    const response = await fetch(check.url, {
      headers: { "User-Agent": "WebZaLokal-Monitor/1.0" },
      redirect: "follow",
      signal: controller.signal,
    });
    const body = await response.text();
    let valid = response.ok;

    if (valid && check.contains) valid = body.includes(check.contains);
    if (valid && check.jsonStatus) {
      const parsed = JSON.parse(body);
      valid = parsed.status === check.jsonStatus;
    }

    if (!valid) {
      failed = true;
      console.error(`FAIL ${check.name}: status=${response.status} duration=${Date.now() - startedAt}ms`);
    } else {
      console.log(`OK   ${check.name}: status=${response.status} duration=${Date.now() - startedAt}ms`);
    }
  } catch (error) {
    failed = true;
    console.error(`FAIL ${check.name}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

if (failed) process.exitCode = 1;
