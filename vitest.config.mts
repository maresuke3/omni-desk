import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['{apps,packages,connectors,features}/*/src/**/*.test.ts']
  }
})
