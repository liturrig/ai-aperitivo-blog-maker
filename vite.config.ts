import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // For GitHub Pages: site lives at /<repo-name>/ so the base must match.
  // In dev (npm run dev) we still use '/' so the app works at localhost root.
  base: command === 'build' ? '/ai-aperitivo-blog-maker/' : '/',
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
