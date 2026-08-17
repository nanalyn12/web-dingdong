// Vitest runs standalone — it must NOT load vite.config.ts, because that config
// pulls in the TanStack Start / nitro plugin chain which needs a full app build
// context. Tests here only exercise pure logic, so a plain node environment plus
// the "@" alias is everything they need.
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
