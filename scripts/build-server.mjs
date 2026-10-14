/**
 * คอมไพล์ฝั่งเซิร์ฟเวอร์ — แยกออกมาเป็นไฟล์เพราะต้องฝัง "เวลาที่ build" เข้าไปด้วย
 * เขียนยัดใน package.json บรรทัดเดียวแล้วอ่านไม่ออกและ escape ยากบน Windows
 */
import { build } from "esbuild"

await build({
  entryPoints: ["api/boot.ts"],
  platform: "node",
  bundle: true,
  packages: "external",
  alias: { "@shared": "./shared" },
  format: "esm",
  outdir: "dist",
  define: { __BUILD_STAMP__: JSON.stringify(new Date().toISOString()) },
})
