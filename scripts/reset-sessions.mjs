/**
 * ล้างประวัติก๊วนทั้งหมด แต่ "เก็บทะเบียนลูกก๊วนไว้"
 *
 * มีไว้เพราะเดิมวิธีล้างข้อมูลเดียวที่บอกไว้คือลบโฟลเดอร์ data/ ทั้งก้อน
 * ซึ่งลบทะเบียนคนไปด้วย แล้วต้องมานั่งเพิ่มสมาชิกใหม่ทุกครั้ง — ไม่ควรต้องทำ
 *
 * ใช้:  npm run reset-sessions          (ถามยืนยันก่อน)
 *       npm run reset-sessions -- --yes (ไม่ต้องถาม)
 */

import fs from "node:fs"
import path from "node:path"
import readline from "node:readline/promises"

const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data")
const SESSION_DIR = path.join(DATA_DIR, "sessions")
const ROSTER_FILE = path.join(DATA_DIR, "roster.json")
const POINTER_FILE = path.join(DATA_DIR, "current.json")

const roster = (() => {
  try {
    return JSON.parse(fs.readFileSync(ROSTER_FILE, "utf8"))
  } catch {
    return []
  }
})()

const sessions = (() => {
  try {
    return fs.readdirSync(SESSION_DIR).filter((f) => f.endsWith(".json"))
  } catch {
    return []
  }
})()

if (sessions.length === 0) {
  console.log(`\nไม่มีประวัติก๊วนให้ล้าง (ทะเบียนลูกก๊วน ${roster.length} คน ยังอยู่ครบ)\n`)
  process.exit(0)
}

console.log(`
จะล้างประวัติก๊วน ${sessions.length} ครั้ง ที่ ${DATA_DIR}

  ✓ ทะเบียนลูกก๊วน ${roster.length} คน — เก็บไว้ ไม่แตะ
  ✗ ประวัติก๊วนทุกครั้ง ค่าก๊วน และสถิติ — ล้างทิ้ง
`)

if (!process.argv.includes("--yes")) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question("พิมพ์ ok แล้วกด Enter เพื่อยืนยัน: ")
  rl.close()
  if (answer.trim().toLowerCase() !== "ok") {
    console.log("ยกเลิกแล้ว ไม่ได้ลบอะไร")
    process.exit(0)
  }
}

// ย้ายไปเป็นโฟลเดอร์สำรองก่อน ไม่ลบทิ้งจริง — เผื่อเปลี่ยนใจ
const backup = path.join(DATA_DIR, `sessions.cleared-${Date.now()}`)
fs.renameSync(SESSION_DIR, backup)
fs.mkdirSync(SESSION_DIR, { recursive: true })
fs.writeFileSync(POINTER_FILE, JSON.stringify({ id: null }, null, 2))

console.log(`
✅ ล้างประวัติก๊วนแล้ว — ทะเบียนลูกก๊วน ${roster.length} คน ยังอยู่ครบ

   ของเก่าย้ายไปไว้ที่  ${backup}
   ไม่ต้องการแล้วค่อยลบโฟลเดอร์นั้นทีหลังได้
`)
