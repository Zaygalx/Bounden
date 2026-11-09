import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Tests must never reach a live network: every chain interaction is
    // mocked, every vault lives in a temp dir or in memory.
    environment: "node",
  },
});
