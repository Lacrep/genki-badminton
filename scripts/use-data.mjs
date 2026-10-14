/**
 * ย้ายมาใช้ข้อมูลก๊วนจากอีกโฟลเดอร์ — ใช้คู่กับ npm run find-data
 *
 *   npm run use-data -- "C:\\Users\\ชื่อคุณ\\genki-badminton\\data"
 *
 * ของเดิมที่อยู่ตรงนี้จะถูกสำรองไว้เป็น data.backup-<เวลา> ก่อนเสมอ ไม่ลบทิ้ง
 * ถ้าย้ายแล้วไม่ถูกใจ เปลี่ยนชื่อกลับมาเองได้
 */
import fs from "node:fs"
import path from "node:path"

const src = process.argv[2]
const dest = path.resolve(process.cwd(), process.env.DATA_DIR || "./data")

if (!src) {
  console.log('\nใช้แบบนี้:  npm run use-data -- "ที่อยู่ของโฟลเดอร์ data ที่จะเอามาใช้"')
  console.log("ดูว่ามีโฟลเดอร์ไหนบ้างด้วย:  npm run find-data\n")
  process.exit(1)
}

const from = path.resolve(src)
if (!fs.existsSync(from)) {
  console.log(`\n❌ ไม่เจอโฟลเดอร์นี้:\n   ${from}\n`)
  process.exit(1)
}
if (path.resolve(from) === dest) {
  console.log("\n✅ แอปใช้โฟลเดอร์นี้อยู่แล้ว ไม่ต้องย้ายอะไร\n")
  process.exit(0)
}

const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"))
  } catch {
    return null
  }
}

/** สรุปว่าโฟลเดอร์หนึ่งมีอะไรอยู่ — เอาไว้เทียบก่อน/หลังย้าย */
function summary(dir) {
  const roster = readJson(path.join(dir, "roster.json")) ?? []
  const byId = new Map()
  let files = []
  try {
    files = fs.readdirSync(path.join(dir, "sessions"))
  } catch {
    /* ไม่มีโฟลเดอร์ sessions ก็ไม่เป็นไร */
  }
  for (const f of files) {
    if (!f.endsWith(".json")) continue // นับเฉพาะไฟล์ที่ใช้งานอยู่จริง
    const s = readJson(path.join(dir, "sessions", f))
    if (s?.id) byId.set(s.id, s)
  }
  return { roster: roster.length, sessions: [...byId.values()] }
}

const before = summary(dest)
const incoming = summary(from)

if (incoming.roster === 0 && incoming.sessions.length === 0) {
  console.log(`\n❌ โฟลเดอร์ต้นทางไม่มีข้อมูลก๊วนเลย:\n   ${from}\n`)
  process.exit(1)
}

console.log("\n📦 กำลังย้ายมาใช้ข้อมูลชุดนี้")
console.log(`   จาก : ${from}`)
console.log(`   ไป  : ${dest}\n`)
console.log(`   ชุดใหม่ที่จะได้ : ทะเบียน ${incoming.roster} คน · ก๊วน ${incoming.sessions.length} ครั้ง`)
for (const s of incoming.sessions.sort((a, b) => String(b.date).localeCompare(String(a.date)))) {
  console.log(`      • ${s.date}  ${s.name} — ${s.players?.length ?? 0} คน ${s.matches?.length ?? 0} เกม`)
}

// สำรองของเดิมไว้เสมอ ไม่ลบทิ้ง
if (fs.existsSync(dest)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const backup = `${dest}.backup-${stamp}`
  fs.renameSync(dest, backup)
  console.log(`\n   ของเดิม (ทะเบียน ${before.roster} คน · ก๊วน ${before.sessions.length} ครั้ง) เก็บไว้ที่:`)
  console.log(`      ${backup}`)
}

fs.cpSync(from, dest, { recursive: true })

const after = summary(dest)
console.log(`\n✅ ย้ายเสร็จแล้ว — ตอนนี้แอปจะเห็น ทะเบียน ${after.roster} คน · ก๊วน ${after.sessions.length} ครั้ง`)
console.log("   สั่ง npm start แล้วเปิดเว็บดูได้เลย\n")
