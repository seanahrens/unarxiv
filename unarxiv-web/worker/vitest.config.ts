import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        // Provide test-only secrets (not committed in wrangler.toml)
        bindings: {
          ENCRYPTION_KEY: "test-encryption-key-32chars-test!",
          ADMIN_PASSWORD: "testpassword",
          MODAL_WEBHOOK_SECRET: "test-webhook-secret",
        },
      },
    }),
  ],
});
