import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // zahtjev.html = ista aplikacija, ali s vlastitim naslovom/opisom za pregled linka /zahtjev
      input: {
        main: resolve(__dirname, 'index.html'),
        zahtjev: resolve(__dirname, 'zahtjev.html'),
      },
    },
  },
})
