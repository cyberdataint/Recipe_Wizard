import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// replace REPO_NAME with your repo name (case-sensitive)
export default defineConfig({
  plugins: [react()],
  base: '/Recipe_Wizard/',
})
