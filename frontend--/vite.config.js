import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8080'
  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: '0.0.0.0',
      allowedHosts: true,
      proxy: {
        '/v1': { target: apiTarget, changeOrigin: true },
        '/health': { target: apiTarget, changeOrigin: true }
      }
    }
  }
})
