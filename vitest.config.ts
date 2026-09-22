import path from "path"
import { defineConfig } from "vitest/config"

const __dirname = import.meta.dirname

export default defineConfig({
  test: {
    environment: "node",
    include: ["api/**/*.test.ts", "shared/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
})
