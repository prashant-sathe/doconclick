import { defineConfig } from "vitest/config";
import path from "path";

// Scoped to the new mobile bearer-auth code only — the rest of the app has
// no existing test convention to extend, so this stays additive.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
