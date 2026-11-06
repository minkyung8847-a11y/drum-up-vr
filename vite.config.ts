import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function localKickRelay(): Plugin {
  let close: (() => Promise<void>) | undefined
  return {
    name: 'drum-up-local-kick',
    apply: 'serve',
    async configureServer(vite) {
      if (!vite.httpServer) throw new Error('LAN kick testing requires the Vite HTTP server')
      const relayModule = new URL('./server/relay.mjs', import.meta.url)
      const { createRelay } = await import(relayModule.href)
      const relay = createRelay({
        httpServer: vite.httpServer,
        allowOrigin(req: { headers: { origin?: string; host?: string } }) {
          if (!req.headers.origin) return false
          try {
            const origin = new URL(req.headers.origin)
            const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
            return origin.origin === req.headers.origin && origin.host === req.headers.host
              && (origin.protocol === 'https:' || (loopback && origin.protocol === 'http:'))
          } catch { return false }
        },
      })
      close = relay.close
    },
    async closeBundle() { await close?.() },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const lanKick = command === 'serve' && process.env.VITE_DRUMUP_LAN_KICK === '1'
  const cert = process.env.DRUMUP_TLS_CERT
  const key = process.env.DRUMUP_TLS_KEY
  if (command === 'serve' && !!cert !== !!key) throw new Error('Set both DRUMUP_TLS_CERT and DRUMUP_TLS_KEY')
  return {
    base: './',
    plugins: lanKick ? [react(), localKickRelay()] : [react()],
    server: command === 'serve' && cert && key ? {
      https: { cert: readFileSync(cert), key: readFileSync(key) },
    } : undefined,
  }
})
