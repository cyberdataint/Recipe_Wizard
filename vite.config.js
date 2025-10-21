import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Use root path for Netlify deployment
export default defineConfig({
  plugins: [react()],
  base: '/',
})
