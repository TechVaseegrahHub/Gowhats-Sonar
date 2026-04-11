// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({ protocolImports: true }),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      devOptions: { enabled: true, type: 'module' }, // show PWA in dev
      includeAssets: [
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/maskable-192.png',
        'icons/maskable-512.png',
      ],
      manifest: {
        name: 'GoWhats',
        short_name: 'GoWhats',
        description: 'WhatsApp automation – fast, installable, offline-capable.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#16a34a',
        icons: [
          { src: '/icons/icon-192.png',     sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png',     sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      // 🔧 Fix for large bundle
      injectManifest: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // allow up to 10 MB
      },
    })
  ],
  resolve: {
    extensions: ['.js', '.jsx'],
    alias: {
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
      assert: 'assert'
    }
  },
  define: {
    global: {},
    'process.env': {}
  },
  optimizeDeps: {
    exclude: ['core-js'], // prevent vite from touching core-js
  },
  build: {
    commonjsOptions: {
      exclude: [/core-js/], // don’t parse core-js
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          html2canvas: ['html2canvas'],
        }
      }
    },
    chunkSizeWarningLimit: 2000, // silence warning up to 2 MB
  },
});

