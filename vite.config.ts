import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      /**
       * Two HTML entries, same app.
       *
       * monopoly.html carries the partnership page's own title, description
       * and og: image, and vercel.json serves it for monopoly.trackstar.art.
       * A link preview never runs the JavaScript, so the meta the app sets at
       * runtime is invisible to iMessage and Slack; without a second entry the
       * page unfurls as the fulfillment dashboard.
       */
      input: {
        main: resolve(__dirname, 'index.html'),
        monopoly: resolve(__dirname, 'monopoly.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
