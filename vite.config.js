import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Use root path for static hosting (Cloudflare Pages)
export default defineConfig({
  plugins: [react()],
  base: '/',
})
