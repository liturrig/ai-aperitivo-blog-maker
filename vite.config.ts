import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Production uses a relative base so the app keeps working even if the repo slug changes.
  // In dev (npm run dev) we still use '/' so the app works at localhost root.
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  server: {
    proxy: {
      // Local dev proxy: requests to /_aisocratic/* are forwarded to aisocratic.org/*
      // Bypasses CORS entirely without needing public proxies.
      // Only available in dev. In production (GitHub Pages) the app falls back to
      // public CORS proxies (allorigins / codetabs).
      '/_aisocratic': {
        target: 'https://aisocratic.org',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/_aisocratic/, ''),
      },
    },
  },
}))
