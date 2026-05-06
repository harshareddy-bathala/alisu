import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { 
        target: 'http://127.0.0.1:3000', 
        changeOrigin: true, 
        rewrite: path => path.replace(/^\/api/, '') 
      },
      '/dashboard-ws': { 
        target: 'ws://127.0.0.1:3000', 
        ws: true 
      },
      '/media-stream': {
        target: 'ws://127.0.0.1:3000',
        ws: true
      }
    }
  }
})
