import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          RESEND_API_KEY: "re_test_secret",
          GOOGLE_PLACES_API_KEY: "google_test_secret",
          LEAD_FINDER_ACCESS_TOKEN: "lead_test_secret",
          FIRECRAWL_API_KEY: "fc-test-secret-12345678901234567890",
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
  },
});
