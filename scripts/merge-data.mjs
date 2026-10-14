/**
 * รวมข้อมูลก๊วนจากอีกโฟลเดอร์เข้ามาไว้ที่เดียว — จะได้ไม่ต้องตามหากันอีก
 *
 *   npm run merge-data -- "C:\\Users\\ชื่อคุณ\\genki-badminton\\data"
 *
 * กฎการรวม
 *   · ทะเบียนสมาชิก  รวมทุกคน ยึดตามรหัสประจำตัว (id) ไม่ใช่ชื่อ
 *     คนเดียวกันที่มีรหัสเดียวกัน → เอาข้อมูลจากฝั่งที่ยกมาเป็นหลัก แล้วรายงานให้ดู
 *     ชื่อซ้ำกันแต่คนละรหัส → ไม่รวมให้เอง (อาจเป็นคนละคนจริง ๆ) แต่จะเตือนไว้
 *   · ก๊วน          เอามาให้ครบทุกครั้ง ก๊วนเดียวกัน (รหัสเดียวกัน) เก็บอันที่มีเกมเยอะกว่า
 *   · รูปสมาชิก     ยกมาด้วย
 *   · ก๊วนที่เคยกดลบ ยกไฟล์มาด้วย แต่ยังคงสถานะลบไว้เหมือนเดิม (กู้ทีหลังได้)
 *
 * ของเดิมสำรองไว้เป็น data.backup-<เวลา> ก่อนเสมอ ไม่ลบอะไรทิ้ง
 */
import fs from "node:fs"
import path from "node:path"

const src = process.argv[2]
const dest = path.resolve(process.cwd(), process.env.DATA_DIR || "./data")

if (!src) {
  console.log('\nใช้แบบนี้:  npm run merge-data -- "ที่อยู่ของโฟลเดอร์ data อีกอัน"')
  console.log("ดูว่ามีโฟลเดอร์ไหนบ้าง:  npm run find-data\n")
  process.exit(1)
}

const from = path.resolve(src)
if (!fs.existsSync(from)) {
  console.log(`\n❌ ไม่เจอโฟลเดอร์นี้:\n   ${from}\n`)
  process.exit(1)
}
if (from === dest) {
  console.log("\n✅ เป็นโฟลเดอร์เดียวกันอยู่แล้ว ไม่ต้องรวม\n")
  process.exit(0)
}

const readJson = (f, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"))
  } catch {
    return fallback
  }
}

/** ไฟล์ก๊วนทั้งหมดในโฟลเดอร์ แยกเป็นที่ใช้งานอยู่ กับที่พักไว้ (.deleted-* / .broken-*) */
function sessionFiles(dir) {
  const sdir = path.join(dir, "sessions")
  let names = []
  try {
    names = fs.readdirSync(sdir)
  } catch {
    return { live: new Map(), parked: [] }
  }
  const live = new Map()
  const parked = []
  for (const f of names) {
    const full = path.join(sdir, f)
    const s = readJson(full)
    if (!s?.id) continue
    if (f.endsWith(".json")) {
      const prev = live.get(s.id)
      if (!prev || (s.matches?.length ?? 0) > (prev.data.matches?.length ?? 0)) live.set(s.id, { file: f, data: s })
    } else if (!f.endsWith(".bak")) {
      parked.push({ file: f, data: s })
    }
  }
  return { live, parked }
}

// ── อ่านทั้งสองฝั่ง ──────────────────────────────────────────────────────────
const destRoster = readJson(path.join(dest, "roster.json"), []) ?? []
const fromRoster = readJson(path.join(from, "roster.json"), []) ?? []
const destS = sessionFiles(dest)
const fromS = sessionFiles(from)

console.log("\n🔗 รวมข้อมูลก๊วนสองโฟลเดอร์เข้าด้วยกัน")
console.log(`   ที่อยู่ตอนนี้ : ${dest}   (ทะเบียน ${destRoster.length} คน · ก๊วน ${destS.live.size} ครั้ง)`)
console.log(`   ยกมาจาก     : ${from}   (ทะเบียน ${fromRoster.length} คน · ก๊วน ${fromS.live.size} ครั้ง)\n`)

// ── รวมทะเบียน ─────────────────────────────────────────────────────────────
const roster = new Map(destRoster.map((p) => [p.id, p]))
const renamed = []
let added = 0
for (const p of fromRoster) {
  const cur = roster.get(p.id)
  if (!cur) {
    roster.set(p.id, p)
    added += 1
    continue
  }
  if (cur.name !== p.name) renamed.push(`${cur.name} → ${p.name}`)
  // ฝั่งที่ยกมาเป็นหลัก แต่ไม่ทำให้รูปที่มีอยู่แล้วหายไป
  roster.set(p.id, { ...cur, ...p, photoAt: p.photoAt ?? cur.photoAt })
}

// ชื่อซ้ำแต่คนละรหัส — ไม่รวมให้เอง เพราะอาจเป็นคนละคน
const byName = new Map()
for (const p of roster.values()) byName.set(p.name, [...(byName.get(p.name) ?? []), p.id])
const dupNames = [...byName].filter(([, ids]) => ids.length > 1)

// ── รวมก๊วน ────────────────────────────────────────────────────────────────
const sessions = new Map([...destS.live])
const takenOver = []
for (const [id, inc] of fromS.live) {
  const cur = sessions.get(id)
  if (!cur) {
    sessions.set(id, inc)
    continue
  }
  const curN = cur.data.matches?.length ?? 0
  const incN = inc.data.matches?.length ?? 0
  if (incN > curN) {
    sessions.set(id, inc)
    takenOver.push(`${inc.data.date} ${inc.data.name} (${curN} → ${incN} เกม)`)
  }
}

// ── เขียนผลลัพธ์ ───────────────────────────────────────────────────────────
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
if (fs.existsSync(dest)) {
  fs.cpSync(dest, `${dest}.backup-${stamp}`, { recursive: true })
  console.log(`   สำรองของเดิมไว้ที่: ${dest}.backup-${stamp}\n`)
}

fs.mkdirSync(path.join(dest, "sessions"), { recursive: true })
fs.writeFileSync(path.join(dest, "roster.json"), JSON.stringify([...roster.values()], null, 2))

for (const [id, s] of sessions) {
  fs.writeFileSync(path.join(dest, "sessions", `${id}.json`), JSON.stringify(s.data, null, 2))
}
// ไฟล์ที่เคยกดลบ ยกมาด้วยแต่คงสถานะลบไว้ — กู้ทีหลังได้
let parkedCopied = 0
for (const p of fromS.parked) {
  const target = path.join(dest, "sessions", p.file)
  if (!fs.existsSync(target)) {
    fs.copyFileSync(path.join(from, "sessions", p.file), target)
    parkedCopied += 1
  }
}

// รูปสมาชิก
let photos = 0
const fromPhotos = path.join(from, "photos")
if (fs.existsSync(fromPhotos)) {
  fs.mkdirSync(path.join(dest, "photos"), { recursive: true })
  for (const f of fs.readdirSync(fromPhotos)) {
    fs.copyFileSync(path.join(fromPhotos, f), path.join(dest, "photos", f))
    photos += 1
  }
}

// ชี้ไปที่ก๊วนล่าสุด — ก๊วนที่ยังเปิดอยู่ก่อน ถ้าไม่มีก็อันที่ใหม่สุด
const all = [...sessions.values()].map((s) => s.data)
const pick =
  all.filter((s) => s.status === "live").sort((a, b) => b.startAt - a.startAt)[0] ??
  all.sort((a, b) => b.startAt - a.startAt)[0]
if (pick) fs.writeFileSync(path.join(dest, "current.json"), JSON.stringify({ id: pick.id }, null, 2))

// ── สรุป ───────────────────────────────────────────────────────────────────
console.log(`✅ รวมเสร็จแล้ว — ตอนนี้มีที่เดียว: ${dest}\n`)
console.log(`   ทะเบียนสมาชิก : ${roster.size} คน  (เพิ่มเข้ามาใหม่ ${added} คน)`)
console.log(`   ก๊วนทั้งหมด    : ${sessions.size} ครั้ง`)
for (const s of all.sort((a, b) => String(b.date).localeCompare(String(a.date)))) {
  console.log(`      • ${s.date}  ${s.name} — ${s.players?.length ?? 0} คน ${s.matches?.length ?? 0} เกม`)
}
if (photos > 0) console.log(`   รูปสมาชิก      : ยกมา ${photos} รูป`)
if (parkedCopied > 0) console.log(`   ก๊วนที่เคยกดลบ : ยกไฟล์มาด้วย ${parkedCopied} ไฟล์ (ยังเป็นสถานะลบอยู่ กู้ทีหลังได้)`)
if (pick) console.log(`   ก๊วนที่จะเปิดให้ : ${pick.date} ${pick.name}`)

if (renamed.length > 0) {
  console.log(`\n   ℹ️ ชื่อที่ถูกทับด้วยฝั่งที่ยกมา ${renamed.length} คน:`)
  for (const r of renamed.slice(0, 10)) console.log(`      ${r}`)
  if (renamed.length > 10) console.log(`      … อีก ${renamed.length - 10} คน`)
}
if (dupNames.length > 0) {
  console.log(`\n   ⚠️ มีชื่อซ้ำกันแต่เป็นคนละรหัส ${dupNames.length} ชื่อ — ระบบไม่รวมให้เอง เพราะอาจเป็นคนละคน:`)
  for (const [name, ids] of dupNames.slice(0, 10)) console.log(`      ${name} (${ids.length} รายการ)`)
  if (dupNames.length > 10) console.log(`      … อีก ${dupNames.length - 10} ชื่อ`)
  console.log(`      ถ้าซ้ำจริง ให้ไปที่หน้าเช็คอิน กด "เก็บเข้ากรุ" ตัวที่ไม่ใช้ สถิติเก่าจะยังอยู่`)
}
console.log("\n   ต่อไปสั่ง npm start ได้เลย — และลบโฟลเดอร์เก่าทิ้งได้เมื่อตรวจแล้วว่าครบ\n")
