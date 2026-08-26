import assert from "node:assert/strict";
import worker from "../.tmp/worker-bundle/index.js";

const analytics = [];
const env = {
  ASSETS: {
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/favicon.svg") return new Response(null, { status: 200 });
      return new Response("static-asset", { status: 200 });
    },
  },
  ANALYTICS: {
    writeDataPoint(point) {
      analytics.push(point);
    },
  },
  CONTACT_LIMITER: { async limit() { return { success: true }; } },
  CONTACT_GLOBAL_LIMITER: { async limit() { return { success: true }; } },
  EVENT_LIMITER: { async limit() { return { success: true }; } },
  RESEND_API_KEY: "re_test_secret",
  CONTACT_EMAIL: "webzalokal@gmail.com",
  CONTACT_FROM: "WebZaLokal <onboarding@resend.dev>",
  APP_VERSION: "test",
};

function request(path, init = {}) {
  return new Request(`https://webzalokal.test${path}`, init);
}

function validContactRequest() {
  return request("/api/contact", {
    method: "POST",
    headers: { Origin: "https://webzalokal.test", "Content-Type": "application/json" },
    body: JSON.stringify({
      businessName: "Test lokal",
      email: "test@example.com",
      packageName: "Web za lokal",
      website: "https://example.com",
      message: "Ovo je dovoljno duga testna poruka.",
      consent: true,
      companySite: "",
      language: "hr",
      startedAt: Date.now() - 5000,
    }),
  });
}

const health = await worker.fetch(request("/api/health"), env);
assert.equal(health.status, 200);
assert.equal((await health.json()).status, "ok");

const event = await worker.fetch(request("/api/events", {
  method: "POST",
  headers: { Origin: "https://webzalokal.test", "Content-Type": "application/json" },
  body: JSON.stringify({ event: "demo_open", path: "/", language: "hr", detail: "restaurant-fine-dining" }),
}), env);
assert.equal(event.status, 202);
assert.equal(analytics.at(-1)?.blobs?.[0], "demo_open");

const wrongOrigin = await worker.fetch(request("/api/events", {
  method: "POST",
  headers: { Origin: "https://example.test", "Content-Type": "application/json" },
  body: JSON.stringify({ event: "page_view" }),
}), env);
assert.equal(wrongOrigin.status, 403);

const honeypot = await worker.fetch(request("/api/contact", {
  method: "POST",
  headers: { Origin: "https://webzalokal.test", "Content-Type": "application/json" },
  body: JSON.stringify({ companySite: "spam.example", startedAt: Date.now() - 5000, language: "hr" }),
}), env);
assert.equal(honeypot.status, 202);
assert.equal((await honeypot.json()).success, true);

const tooFast = await worker.fetch(request("/api/contact", {
  method: "POST",
  headers: { Origin: "https://webzalokal.test", "Content-Type": "application/json" },
  body: JSON.stringify({
    businessName: "Test lokal",
    email: "test@example.com",
    packageName: "Web za lokal",
    message: "Ovo je dovoljno duga testna poruka.",
    consent: true,
    startedAt: Date.now(),
  }),
}), env);
assert.equal(tooFast.status, 400);

const originalFetch = globalThis.fetch;
let upstreamRequest;
globalThis.fetch = async (input, init) => {
  upstreamRequest = new Request(input, init);
  return Response.json({ id: "resend-test-id" });
};

try {
  const contact = await worker.fetch(validContactRequest(), env);

  assert.equal(contact.status, 201);
  assert.equal((await contact.json()).success, true);
  assert.equal(upstreamRequest?.url, "https://api.resend.com/emails");
  assert.equal(upstreamRequest?.method, "POST");
  assert.equal(upstreamRequest?.headers.get("Accept"), "application/json");
  assert.equal(upstreamRequest?.headers.get("Authorization"), "Bearer re_test_secret");
  assert.match(upstreamRequest?.headers.get("Idempotency-Key") ?? "", /^[0-9a-f-]{36}$/);
  const upstreamBody = await upstreamRequest.json();
  assert.equal(upstreamBody.from, "WebZaLokal <onboarding@resend.dev>");
  assert.deepEqual(upstreamBody.to, ["webzalokal@gmail.com"]);
  assert.equal(upstreamBody.reply_to, "test@example.com");
  assert.match(upstreamBody.text, /Ovo je dovoljno duga testna poruka\./);

  globalThis.fetch = async () => Response.json({ message: "rate limited" }, { status: 429 });
  const rejected = await worker.fetch(validContactRequest(), env);
  assert.equal(rejected.status, 502);
  assert.equal((await rejected.json()).success, false);
  assert.equal(analytics.at(-1)?.blobs?.[0], "contact_upstream_error");

  const notConfigured = await worker.fetch(validContactRequest(), { ...env, RESEND_API_KEY: "" });
  assert.equal(notConfigured.status, 503);
  assert.equal((await notConfigured.json()).success, false);
} finally {
  globalThis.fetch = originalFetch;
}

const unknownApi = await worker.fetch(request("/api/unknown"), env);
assert.equal(unknownApi.status, 404);

const staticAsset = await worker.fetch(request("/studio/"), env);
assert.equal(await staticAsset.text(), "static-asset");

console.log(`Worker tests passed (${analytics.length} analytics events captured).`);
