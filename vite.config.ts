import devServer from "@hono/vite-dev-server"
import react from "@vitejs/plugin-react"
import path from "path"
import { defineConfig } from "vite"

const __dirname = import.meta.dirname

export default defineConfig({
  plugins: [
    // Serve the Hono API from the same origin in dev, so the phone on the
    // gym Wi-Fi only ever needs one address.
    devServer({ entry: "api/boot.ts", exclude: [/^\/(?!api\/).*$/] }),
    react(),
  ],
  server: {
    port: 3100,
    host: true, // 0.0.0.0 — ลูกก๊วนเปิดดูจากมือถือในวง Wi-Fi เดียวกันได้
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
})
