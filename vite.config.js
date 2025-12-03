import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build'
  },
  server: {
    host: true, // Allows access from mobile (network IP)
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // Redirects /api to your local backend
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
