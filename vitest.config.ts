import { defineConfig } from "vitest/config";

// Tests are deliberately confined to the pure routing directory (see
// docs/autorouting.md M4). Do not widen this glob — the rest of the app is
// browser-coupled and has no test harness by design.
export default defineConfig({
  test: {
    include: ["src/routing/**/*.test.ts"],
    environment: "node",
  },
});
