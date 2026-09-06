import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

/**
 * Testes de integração: sobem o AppModule inteiro contra um PostgreSQL de teste.
 * O plugin SWC é necessário para emitir os metadados de decorator do NestJS
 * (o transform padrão do esbuild/vitest não gera `design:paramtypes`).
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["test/**/*.e2e.spec.ts"],
    setupFiles: ["test/env-setup.ts"],
    environment: "node",
    globals: false,
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
