/**
 * เก็บเฉพาะคนที่มาก๊วนวันที่ระบุ — คนที่เหลือเก็บเข้ากรุทั้งหมด
 *
 *   npm run keep-session -- 2026-10-10            (เก็บเข้ากรุ — ชื่อยังอยู่ กู้ได้)
 *   npm run keep-session -- 2026-10-10 --delete   (ลบทิ้งจริง ทั้งก๊วนอื่นและคนที่เหลือ)
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

const otherSessions = sessions.filter((s) => !target.some((t) => t.id === s.id))

/**
 * โหมด --delete คือ "ล้างให้เกลี้ยง" — เอาก๊วนอื่นออกไปด้วย
 *
 * ถ้าลบแต่คนแต่ยังเก็บก๊วนเทสไว้ ก๊วนนั้นจะเหลือแต่รหัส p_xxxx แทนชื่อคน
 * ดูแล้วงงกว่าเดิม เลยพักไฟล์ก๊วนอื่นไปด้วย (เปลี่ยนชื่อไฟล์ ไม่ได้ลบจริง กู้ได้)
 */
const playedElsewhere = new Set()
if (!hardDelete) {
  for (const s of otherSessions) {
    for (const p of s.players ?? []) if ((p.gamesPlayed ?? 0) > 0) playedElsewhere.add(p.playerId)
  }
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
if (hardDelete) {
  console.log(`\n   โหมดลบทิ้ง:`)
  console.log(`     · ลบคนที่ไม่ได้มาก๊วนนั้น ${others.length} คน ออกจากทะเบียน`)
  if (otherSessions.length > 0) {
    console.log(`     · พักก๊วนอื่นอีก ${otherSessions.length} ครั้งไปด้วย (เปลี่ยนชื่อไฟล์ ไม่ได้ลบจริง กู้ได้):`)
    for (const s of otherSessions) console.log(`         ${s.date}  ${s.name}  (${s.matches?.length ?? 0} เกม)`)
  }
} else {
  console.log(`     · เคยลงเล่นก๊วนอื่น ${others.length - deletable.length} คน → เก็บเข้ากรุ (ชื่อในสถิติเก่าต้องไม่หาย)`)
  console.log(`     · ไม่เคยลงเล่นเลย  ${deletable.length} คน → เก็บเข้ากรุ`)
}

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
  if (hardDelete) {
    removed += 1
    continue
  }
  next.push({ ...p, archived: true })
  archived += 1
}

fs.writeFileSync(path.join(dir, "roster.json"), JSON.stringify(next, null, 2))

// โหมดลบทิ้ง: พักไฟล์ก๊วนอื่นไว้ (เปลี่ยนชื่อ ไม่ได้ลบ) แล้วชี้ไปก๊วนที่เก็บไว้
let parked = 0
if (hardDelete) {
  for (const s of otherSessions) {
    const f = path.join(sdir, `${s.id}.json`)
    if (fs.existsSync(f)) {
      fs.renameSync(f, `${f}.deleted-${Date.now()}`)
      parked += 1
    }
    const bak = `${f}.bak`
    if (fs.existsSync(bak)) fs.rmSync(bak, { force: true })
  }
  fs.writeFileSync(path.join(dir, "current.json"), JSON.stringify({ id: target[0].id }, null, 2))
}

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
if (removed > 0) console.log(`   ลบออกแล้ว  : ${removed} คน`)
if (parked > 0) console.log(`   ก๊วนที่พักไว้ : ${parked} ครั้ง  (ไฟล์ยังอยู่ กู้ได้จากโฟลเดอร์สำรอง)`)
if (!hardDelete && others.length > 0) {
  console.log(`\n   ℹ️ ถ้าอยากลบทิ้งจริง ๆ (ทั้งคนและก๊วนเทส) สั่ง:`)
  console.log(`      npm run keep-session -- ${want} --delete`)
}
console.log("\n   สั่ง npm start แล้วเปิดดูได้เลย\n")
