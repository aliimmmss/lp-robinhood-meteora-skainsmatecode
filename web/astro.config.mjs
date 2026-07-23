// @ts-check
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

// Static output (default). Deployed to Cloudflare Pages as plain files.
export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },
})
