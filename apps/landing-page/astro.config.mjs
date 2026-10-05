// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: process.env.SITE_URL || 'http://localhost:4321',
  devToolbar: { enabled: false },
  server: { host: '127.0.0.1', strictPort: true, allowedHosts: ['budapest-concept-refused-submissions.trycloudflare.com'] },
  preview: { host: '127.0.0.1', strictPort: true, allowedHosts: ['budapest-concept-refused-submissions.trycloudflare.com'] },
});
