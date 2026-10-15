import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative asset paths, so the build works from any sub-path (e.g. GitHub Pages).
  base: './',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
