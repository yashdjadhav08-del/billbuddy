import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Allow any host so the app can be reached from mobile via a tunnel
    // (e.g. *.trycloudflare.com) or a LAN IP without Vite's host check
    // rejecting the request with a 403.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.MOCK_SERVER_URL ?? 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['@stellar/stellar-sdk'],
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          'stellar-sdk': ['@stellar/stellar-sdk'],
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'radix-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-progress',
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
