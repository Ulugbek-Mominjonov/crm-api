import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

/** E2E: haqiqiy HTTP + haqiqiy baza. Ketma-ket ishlaydi — bitta baza ulashiladi. */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    setupFiles: [resolve(__dirname, 'test/setup-env.ts')],
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
