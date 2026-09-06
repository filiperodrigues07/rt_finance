import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Só testes unitários aqui. Os de integração rodam com vitest.integration.config.ts (pnpm test:int).
    include: ["src/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
});
