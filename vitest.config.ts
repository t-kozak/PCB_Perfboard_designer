import { defineConfig } from "vitest/config";

// Tests cover the pure, DOM-free modules (see docs/autorouting.md M3 and
// docs/logical-connections.md §7) — the rest of the app is browser-coupled and
// has no test harness by design.
export default defineConfig({
  test: {
    include: [
      "src/routing/**/*.test.ts",
      "src/nets/derive.test.ts",
      "src/features/ic-geometry.test.ts",
      "src/kicad/**/*.test.ts",
    ],
    environment: "node",
  },
});
