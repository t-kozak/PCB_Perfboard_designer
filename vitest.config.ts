import { defineConfig } from "vitest/config";

// Tests are deliberately confined to pure, DOM-free modules (see
// docs/autorouting.md M3 and docs/logical-connections.md §7). Do not widen
// this glob further — the rest of the app is browser-coupled and has no test
// harness by design.
export default defineConfig({
  test: {
    include: [
      "src/routing/**/*.test.ts",
      "src/nets/derive.test.ts",
      "src/features/ic-geometry.test.ts",
    ],
    environment: "node",
  },
});
