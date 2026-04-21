import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import viteTsConfigPaths from "vite-tsconfig-paths"
import tailwindcss from "@tailwindcss/vite"
import { nitro } from "nitro/vite"

// The orchestrator exposes TWO host ports mapped into this container:
//   PREVIEW_PORT → container 5173 (Caddy HTTPS, HTTP/2, announced to users)
//   (internal)   → container 5180 (Caddy HTTP passthrough — escape hatch)
//
// Vite itself listens on the container's port 5174. Browser traffic goes
// through Caddy → Vite. But Vite's HMR client script is rendered into the
// served HTML and defaults to ws://<host>:<server.port> — i.e. port 5174,
// which the browser cannot reach (only 5173 is mapped to the host).
//
// Fix: tell Vite's HMR client to connect to the EXTERNAL host port (the
// one the browser sees), using wss:// so Caddy terminates TLS and upgrades
// the WebSocket to Vite. Caddy's `reverse_proxy` supports WS upgrades
// natively, so nothing extra is needed in Caddyfile.agent.
//
// Outside the sandbox (e.g. when a human runs `pnpm dev` locally), the
// env var isn't set and we fall through to Vite's default HMR behavior.
const previewPort = process.env.PREVIEW_PORT ? Number(process.env.PREVIEW_PORT) : undefined

const config = defineConfig({
  plugins: [
    devtools(),
    nitro(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  server: {
    host: "0.0.0.0",
    port: 5174,
    strictPort: true,
    // Allow arbitrary Host headers so Caddy can forward the browser's
    // Host ("localhost:<previewPort>") without Vite rejecting it.
    // Without this, Vite 7+ rejects reverse-proxied requests with
    // "Blocked request. This host is not allowed."
    allowedHosts: ["localhost", ".localhost", "127.0.0.1"],
    hmr: previewPort
      ? {
          // Browser connects to wss://localhost:<previewPort>/ (Caddy),
          // Caddy forwards the WebSocket upgrade to Vite on 5174.
          protocol: "wss",
          host: "localhost",
          clientPort: previewPort,
        }
      : true,
  },
})

export default config
