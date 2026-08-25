import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

/**
 * NestJS DI `emitDecoratorMetadata` ga tayanadi — esbuild uni qo'llab-
 * quvvatlamaydi, shuning uchun SWC transformatsiyasi ishlatiladi.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts', 'src/**/*.module.ts', 'src/**/dto/**'],
    },
  },
})
