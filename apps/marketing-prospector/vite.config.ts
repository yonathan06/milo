import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { isAllowedLocalMutation, isMutationMethod } from './src/server/security'

function localMutationGuard(): Plugin {
  const guard = (request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse, next: () => void) => {
    if (!isMutationMethod(request.method ?? 'GET')) return next()
    if (isAllowedLocalMutation(request.headers.origin, request.headers.host)) return next()
    response.statusCode = 403
    response.end('Local origin required')
  }

  return {
    name: 'local-mutation-guard',
    configureServer(server) {
      server.middlewares.use(guard)
    },
    configurePreviewServer(server) {
      server.middlewares.use(guard)
    },
  }
}

export default defineConfig({
  plugins: [tailwindcss(), tanstackStart(), react(), localMutationGuard()],
  server: { host: '127.0.0.1', strictPort: true, allowedHosts: ['parents-managers-had-cons.trycloudflare.com'] },
  preview: { host: '127.0.0.1', strictPort: true, allowedHosts: ['parents-managers-had-cons.trycloudflare.com'] },
  optimizeDeps: { exclude: ['playwright', 'playwright-core'] },
  ssr: { external: ['playwright', 'playwright-core'] },
})
