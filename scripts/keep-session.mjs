/**
 * เก็บเฉพาะคนที่มาก๊วนวันที่ระบุ — คนที่เหลือเก็บเข้ากรุทั้งหมด
 *
 *   npm run keep-session -- 2026-10-10
 *   npm run keep-session -- 2026-10-10 --delete   (ลบถาวรเฉพาะคนที่ไม่เคยลงเล่นที่ไหนเลย)
 *
 * "เก็บเข้ากรุ" = หายจากรายชื่อเช็คอินและรายชื่อตอนจัดเกม แต่ชื่อยังอยู่ในทะเบียน
 * บิลกับสถิติของก๊วนเก่าจึงยังเห็นชื่อถูกต้อง ไม่กลายเป็นรหัส p_xxxx
 * กดเอากลับมาได้ตลอดจากหน้าเช็คอิน (หัวข้อ "คนที่เก็บเข้ากรุ")
 */
import fs from "node:fs"
import path from "node:path"

const want = process.argv[2]
const hardDelete = process.argv.includes("--delete")
const dir = path.resolve(process.cwd(), process.env.DATA_DIR || "./data")

if (!want) {
  console.log("\nใช้แบบนี้:  npm run keep-session -- 2026-10-10")
  console.log("ดูว่ามีก๊วนวันไหนบ้าง:  npm run find-data\n")
  process.exit(1)
}

const readJson = (f, d = null) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"))
  } catch {
    return d
  }
}

const roster = readJson(path.join(dir, "roster.json"), []) ?? []
if (roster.length === 0) {
  console.log(`\n❌ ไม่เจอทะเบียนสมาชิกใน ${dir}\n`)
  process.exit(1)
}

// อ่านก๊วนที่ใช้งานอยู่ทั้งหมด
const sdir = path.join(dir, "sessions")
const sessions = []
for (const f of fs.existsSync(sdir) ? fs.readdirSync(sdir) : []) {
  if (!f.endsWith(".json")) continue
  const s = readJson(path.join(sdir, f))
  if (s?.id) sessions.push(s)
}

const target = sessions.filter((s) => s.date === want || s.id === want)
if (target.length === 0) {
  console.log(`\n❌ ไม่เจอก๊วนวันที่ "${want}" — ก๊วนที่มีคือ:`)
  for (const s of sessions.sort((a, b) => String(b.date).localeCompare(String(a.date)))) {
    console.log(`     ${s.date}  ${s.name}  (${s.players?.length ?? 0} คน ${s.matches?.length ?? 0} เกม)`)
  }
  console.log("")
  process.exit(1)
}

const keep = new Set()
for (const s of target) for (const p of s.players ?? []) keep.add(p.playerId)

// คนที่เคยลงเล่นที่อื่นด้วยไหม — ใช้ตัดสินว่าลบถาวรได้หรือไม่
const playedElsewhere = new Set()
for (const s of sessions) {
  if (target.some((t) => t.id === s.id)) continue
  for (const p of s.players ?? []) if ((p.gamesPlayed ?? 0) > 0) playedElsewhere.add(p.playerId)
}

const byId = new Map(roster.map((p) => [p.id, p]))
const keepers = roster.filter((p) => keep.has(p.id))
const others = roster.filter((p) => !keep.has(p.id))

console.log(`\n🧹 เก็บเฉพาะคนที่มาก๊วน ${target.map((t) => `${t.date} ${t.name}`).join(" · ")}\n`)
console.log(`   ทะเบียนตอนนี้  : ${roster.length} คน`)
console.log(`   มาก๊วนนั้น     : ${keepers.length} คน  ← เก็บไว้ใช้งานปกติ`)
console.log(`   ไม่ได้มา       : ${others.length} คน`)

if (others.length === 0) {
  console.log("\n✅ ทะเบียนมีแต่คนที่มาก๊วนนั้นอยู่แล้ว ไม่ต้องทำอะไร\n")
  process.exit(0)
}

const deletable = others.filter((p) => !playedElsewhere.has(p.id))
console.log(`     · เคยลงเล่นก๊วนอื่น ${others.length - deletable.length} คน → เก็บเข้ากรุ (ชื่อในสถิติเก่าต้องไม่หาย)`)
console.log(`     · ไม่เคยลงเล่นเลย  ${deletable.length} คน → ${hardDelete ? "ลบถาวร" : "เก็บเข้ากรุ"}`)

// สำรองก่อนเสมอ
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
fs.cpSync(dir, `${dir}.backup-${stamp}`, { recursive: true })
console.log(`\n   สำรองของเดิมไว้ที่: ${dir}.backup-${stamp}`)

const next = []
let archived = 0
let removed = 0
for (const p of roster) {
  if (keep.has(p.id)) {
    const { archived: _drop, ...rest } = p
    next.push(rest) // คนที่มาก๊วนนั้น เอาออกจากกรุให้ด้วยถ้าเคยถูกเก็บไว้
    continue
  }
  if (hardDelete && !playedElsewhere.has(p.id)) {
    removed += 1
    continue
  }
  next.push({ ...p, archived: true })
  archived += 1
}

fs.writeFileSync(path.join(dir, "roster.json"), JSON.stringify(next, null, 2))

// ลบรูปของคนที่ลบถาวรไปแล้ว
if (removed > 0) {
  const pdir = path.join(dir, "photos")
  if (fs.existsSync(pdir)) {
    const gone = new Set(roster.filter((p) => !next.some((n) => n.id === p.id)).map((p) => p.id))
    for (const f of fs.readdirSync(pdir)) {
      if (gone.has(f.replace(/\.[a-z]+$/i, ""))) fs.rmSync(path.join(pdir, f), { force: true })
    }
  }
}

console.log(`\n✅ เสร็จแล้ว — ทะเบียนเหลือ ${next.length} คน`)
console.log(`   ใช้งานปกติ : ${next.filter((p) => !p.archived).length} คน`)
if (archived > 0) console.log(`   เก็บเข้ากรุ : ${archived} คน  (กดเอากลับมาได้ที่หน้าเช็คอิน)`)
if (removed > 0) console.log(`   ลบถาวร     : ${removed} คน`)
if (!hardDelete && deletable.length > 0) {
  console.log(`\n   ℹ️ มี ${deletable.length} คนที่ไม่เคยลงเล่นที่ไหนเลย ลบถาวรได้ถ้าต้องการ:`)
  console.log(`      npm run keep-session -- ${want} --delete`)
}
console.log("\n   สั่ง npm start แล้วเปิดดูได้เลย\n")
