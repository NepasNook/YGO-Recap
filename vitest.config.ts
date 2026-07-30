import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts: the app config is wrapped by a preset that
// pulls in the Cloudflare and TanStack Start plugins, none of which the unit
// tests need.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
