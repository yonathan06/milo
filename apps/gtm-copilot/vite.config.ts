import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/solid-start/plugin/vite';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/vite';
import { nitro } from 'nitro/vite';

export default defineConfig({
  server: {
    port: 3000,
    host: '127.0.0.1',
    allowedHosts: ['expenses-parameter-representations-spies.trycloudflare.com'],
    // SQLite sidecars change during reads/writes; they are data, not HMR inputs.
    watch: {
      ignored: ['**/data/**', '**/*.sqlite', '**/*.sqlite-*', '**/*.db', '**/*.db-*'],
    },
  },
  plugins: [tailwindcss(), tanstackStart({ srcDirectory: 'web' }), solid({ ssr: true }), nitro({ preset: 'node-server' })],
});
