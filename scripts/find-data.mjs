/**
 * หาไฟล์ข้อมูลก๊วนในเครื่อง — ใช้ตอน "เปิดเว็บแล้วก๊วนเก่าหาย"
 *
 * ข้อมูลเก็บในโฟลเดอร์ data/ ที่อยู่ "ข้าง ๆ ที่สั่งรัน" ไม่ได้ผูกกับตัวโค้ด
 * ถ้าโคลนโปรเจกต์ใหม่ไว้อีกที่ แล้วรันจากที่ใหม่ แอปจะสร้าง data/ เปล่าขึ้นมา
 * ก๊วนเก่าทั้งหมดยังอยู่ครบในโฟลเดอร์เดิม แค่แอปไม่ได้มองไปทางนั้น
 *
 *   node scripts/find-data.mjs
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const HERE = path.resolve(process.cwd(), process.env.DATA_DIR || "./data")

/** ที่ที่คนมักวางโปรเจกต์ไว้ — ไล่หาลึกไม่เกิน 6 ชั้น กันค้างนาน */
const ROOTS = [
  process.cwd(),
  path.resolve(process.cwd(), ".."),
  path.resolve(process.cwd(), "../.."),
  os.homedir(),
  path.join(os.homedir(), "Desktop"),
  path.join(os.homedir(), "Documents"),
  path.join(os.homedir(), "Downloads"),
  path.join(os.homedir(), "OneDrive"),
  path.join(os.homedir(), "OneDrive", "Desktop"),
  path.join(os.homedir(), "OneDrive", "เอกสาร"),
]

const SKIP = new Set(["node_modules", ".git", "dist", "AppData", "Library", ".cache", "Windows", "Program Files", "Program Files (x86)", "$Recycle.Bin"])
const found = new Map()

function scan(dir, depth) {
  if (depth > 6) return
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return // ไม่มีสิทธิ์อ่านก็ข้ามไป
  }
  const names = new Set(entries.filter((e) => e.isDirectory() || e.isFile()).map((e) => e.name))
  // โฟลเดอร์ข้อมูลคือโฟลเดอร์ที่มี roster.json หรือ sessions/ อยู่ข้างใน
  if (names.has("roster.json") || names.has("sessions")) found.set(path.resolve(dir), true)

  for (const e of entries) {
    if (!e.isDirectory() || SKIP.has(e.name) || e.name.startsWith(".")) continue
    scan(path.join(dir, e.name), depth + 1)
  }
}

for (const r of ROOTS) scan(r, 0)

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch {
    return null
  }
}

/** อ่านไฟล์ก๊วนทุกแบบ รวมที่ถูกพักไว้ (.bak / .broken-* / .deleted-*) */
function sessionsIn(dir) {
  const sdir = path.join(dir, "sessions")
  let files
  try {
    files = fs.readdirSync(sdir)
  } catch {
    return []
  }
  // ก๊วนเดียวกันมีได้หลายไฟล์ (ตัวจริง + .bak + .broken-*) นับเป็นครั้งเดียว
  // เลือกไฟล์ที่มีเกมเยอะสุดของ id นั้นมาแสดง จะได้ไม่รายงานตัวเลขเกินจริง
  const byId = new Map()
  for (const f of files) {
    const s = readJson(path.join(sdir, f))
    if (!s?.name || !s?.id) continue
    const kind = f.endsWith(".json")
      ? "ใช้งานอยู่"
      : f.includes(".broken-")
        ? "ไฟล์ถูกพักไว้ (เคยอ่านไม่ออก)"
        : f.includes(".deleted-")
          ? "เคยกดลบ"
          : "ไฟล์สำรอง"
    const row = {
      file: f,
      kind,
      name: s.name,
      date: s.date,
      status: s.status,
      players: s.players?.length ?? 0,
      matches: s.matches?.length ?? 0,
      top: topPlayer(s, dir),
    }
    const prev = byId.get(s.id)
    if (!prev || row.matches > prev.matches) byId.set(s.id, row)
  }
  return [...byId.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)))
}

/** คนที่ลงเล่นเยอะที่สุดในก๊วนนั้น — ใช้ยืนยันว่าใช่ก๊วนที่ตามหา */
function topPlayer(s, dir) {
  const roster = readJson(path.join(dir, "roster.json")) ?? []
  const byId = new Map(roster.map((p) => [p.id, p.name]))
  let best = null
  for (const p of s.players ?? []) {
    if (!best || (p.gamesPlayed ?? 0) > (best.gamesPlayed ?? 0)) best = p
  }
  if (!best || !(best.gamesPlayed > 0)) return ""
  return `${byId.get(best.playerId) ?? best.playerId} ลงเยอะสุด ${best.gamesPlayed} เกม`
}

console.log("\n🔎 ไล่หาข้อมูลก๊วนในเครื่องนี้\n")
console.log(`ตอนนี้ถ้าสั่งรันจากตรงนี้ แอปจะอ่านข้อมูลจาก:\n   ${HERE}`)
console.log(`   ${fs.existsSync(HERE) ? "(โฟลเดอร์นี้มีอยู่)" : "(ยังไม่มีโฟลเดอร์นี้ — แอปจะสร้างใหม่เปล่า ๆ)"}\n`)

if (found.size === 0) {
  console.log("❌ หาโฟลเดอร์ข้อมูลไม่เจอเลยในที่ที่ไล่ดู")
  console.log("   ลองค้นทั้งเครื่องด้วยคำว่า roster.json แล้วบอกตำแหน่งที่เจอได้เลย\n")
  process.exit(0)
}

const dirs = [...found.keys()].sort()
console.log(`พบโฟลเดอร์ข้อมูลทั้งหมด ${dirs.length} ที่:\n`)

for (const d of dirs) {
  const roster = readJson(path.join(d, "roster.json")) ?? []
  const list = sessionsIn(d)
  const games = list.reduce((n, s) => n + s.matches, 0)
  const mark = path.resolve(d) === HERE ? "  ← แอปกำลังใช้โฟลเดอร์นี้" : ""
  console.log(`📁 ${d}${mark}`)
  console.log(`   ทะเบียนสมาชิก ${roster.length} คน · ก๊วน ${list.length} ครั้ง · รวม ${games} เกม`)
  for (const s of list) {
    const warn = s.kind === "ใช้งานอยู่" ? "" : `  ⚠ ${s.kind} (ไฟล์ ${s.file})`
    console.log(`     • ${s.date}  ${s.name}  — ${s.players} คน ${s.matches} เกม${s.top ? ` · ${s.top}` : ""}${warn}`)
  }
  console.log("")
}

const best = dirs
  .map((d) => ({ d, games: sessionsIn(d).reduce((n, s) => n + s.matches, 0) }))
  .sort((a, b) => b.games - a.games)[0]

if (best && path.resolve(best.d) !== HERE) {
  console.log("👉 ก๊วนที่มีเกมเยอะสุดอยู่ที่:")
  console.log(`   ${best.d}`)
  console.log("\n   วิธีใช้ข้อมูลชุดนั้น เลือกอย่างใดอย่างหนึ่ง:")
  console.log(`   1) ไปสั่งรันจากโฟลเดอร์แม่ของมัน  →  cd "${path.dirname(best.d)}"  แล้ว npm start`)
  console.log(`   2) ก๊อปโฟลเดอร์ data ทั้งอัน มาวางไว้ข้าง ๆ ที่รันตอนนี้`)
  console.log(`      (ก๊อปจาก "${best.d}"  ไปที่  "${HERE}")`)
  console.log("\n   ⚠ ก๊อปทั้งโฟลเดอร์ อย่าเลือกเฉพาะบางไฟล์ — roster.json กับ sessions/ ต้องไปด้วยกัน\n")
} else if (best) {
  console.log("✅ แอปกำลังอ่านโฟลเดอร์ที่มีข้อมูลเยอะที่สุดอยู่แล้ว\n")
}
