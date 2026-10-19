import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// O esbuild (padrão do Vitest) não emite metadados de decorators, de que a injeção do Nest depende.
export default defineConfig({
  plugins: [swc.vite({ jsc: { transform: { legacyDecorator: true, decoratorMetadata: true } } })],
  test: {
    include: ['test/**/*.spec.ts', 'src/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // os testes de integração compartilham um banco: rodam em sequência
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
