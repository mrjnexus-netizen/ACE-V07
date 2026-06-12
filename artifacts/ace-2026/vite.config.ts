import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), nodePolyfills()],
  // Root index.html is at the monorepo root
  server: {
    port: 18956,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port: 18956,
  },
  build: {
    outDir: path.resolve(__dirname, './dist'),
    assetsDir: 'assets',
    sourcemap: false, // Disable sourcemaps in production
    minify: 'esbuild',
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('three')) {
              return 'vendor_three';
            }
            if (id.includes('framer-motion')) {
              return 'vendor_framer_motion';
            }
            if (id.includes('dnd-kit')) {
              return 'vendor_dnd_kit';
            }
            return 'vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 200,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@context': path.resolve(__dirname, './src/context'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@types': path.resolve(__dirname, './src/types'),
      '@three': path.resolve(__dirname, './src/three'),
      '/shaders': path.resolve(__dirname, '../../public/shaders'),
    },
  },
})
