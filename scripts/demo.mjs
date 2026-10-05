/**
 * ใส่ก๊วนตัวอย่างให้กดเล่น — ไว้ลองหน้าตาและไฟล์ Excel ก่อนใช้งานจริง
 *
 * ใช้:  npm run serve   (หน้าต่างหนึ่ง)
 *       npm run demo    (อีกหน้าต่างหนึ่ง)
 *
 * ยิงผ่าน API เหมือนที่หน้าเว็บทำทุกอย่าง — ข้อมูลที่ได้จึงเป็นของจริง ไม่ใช่ของปลอมที่ยัดลงไฟล์
 */

/** คำสั่งลบโฟลเดอร์ข้อมูล — PowerShell ไม่รู้จัก rm -rf */
const RESET_CMD = process.platform === "win32" ? "Remove-Item -Recurse -Force data" : "rm -rf data"

const PORT = process.env.PORT || 3100
const BASE = process.env.BASE_URL || `http://127.0.0.1:${PORT}`
const PIN = process.env.ORGANIZER_PIN || ""

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(PIN ? { "x-organizer-pin": PIN } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}
const post = (path, body) => call("POST", path, body)
const viewOf = async (id) => (await call("GET", `/api/view/${id}`)).view

// ── เช็กก่อนว่าเว็บเปิดอยู่ไหม ───────────────────────────────────────────────
let boot
try {
  boot = await call("GET", "/api/bootstrap")
} catch {
  console.error(`
✗ ยังไม่มีเว็บรันอยู่ที่ ${BASE}

  เปิดเว็บก่อนในอีกหน้าต่างหนึ่ง แล้วค่อยรันคำสั่งนี้
     npm run serve
`)
  process.exit(1)
}

// ── มีข้อมูลอยู่แล้วก็ไม่ยัดซ้ำ ไม่งั้นได้ลูกก๊วนชื่อซ้ำกันคนละสองรอบ ────────
if (boot.roster.length > 0) {
  console.error(`
✗ มีลูกก๊วนในทะเบียนอยู่แล้ว ${boot.roster.length} คน — ไม่ใส่ข้อมูลตัวอย่างทับให้

  ถ้านี่เป็นข้อมูลจริงของก๊วน อย่าลบ! เปิดเว็บใช้งานได้ตามปกติเลย
     ${BASE}/

  ถ้าเป็นข้อมูลตัวอย่างที่อยากล้างทิ้งแล้วใส่ใหม่ ปิดเว็บก่อน แล้ว
     ${RESET_CMD}
     npm run serve     (อีกหน้าต่างหนึ่ง)
     npm run demo
`)
  process.exit(1)
}

const ROSTER = [
  ["ต้น", 7], ["บอย", 6], ["เอก", 6], ["หนึ่ง", 5], ["พี่หมู", 5],
  ["แนน", 5], ["ฝ้าย", 4], ["ก้อง", 4], ["โจ้", 4], ["มิ้น", 3],
  ["จูน", 3], ["ปุ๊ก", 3], ["เบส", 2], ["ใหม่", 1],
]
const NOTES = { "ใหม่": "เพื่อนโจ้ มาครั้งแรก", "ปุ๊ก": "โอนช้า ตามเก็บทีหลัง" }

console.log("▸ เพิ่มลูกก๊วนตัวอย่าง 14 คน")
const players = []
for (const [name, level] of ROSTER) {
  players.push((await post("/api/players", { name, level, note: NOTES[name] })).player)
}

console.log("▸ เปิดก๊วนและเช็คอินทุกคน")
const { view } = await post("/api/session", {})
const sid = view.session.id
await post(`/api/session/${sid}/checkin-many`, { playerIds: players.map((p) => p.id) })

console.log("▸ เล่นไป 10 เกม (มีเกมเสมอ และเกมที่ลืมกดลูกไว้ให้ดูด้วย)")
let games = 0
for (let round = 0; round < 5; round++) {
  for (const courtIndex of [0, 1]) {
    const v = await viewOf(sid)
    if (v.courts[courtIndex]?.match) continue

    const suggestion = await post(`/api/session/${sid}/suggest`, { type: "D" })
    if (!suggestion.ok) continue

    const { match } = await post(`/api/session/${sid}/start`, {
      courtIndex,
      type: suggestion.suggestion.type,
      teamA: suggestion.suggestion.teamA,
      teamB: suggestion.suggestion.teamB,
    })
    const sets =
      games % 4 === 1
        ? [{ a: 21, b: 18 }, { a: 19, b: 21 }] // ได้กันคนละเซ็ต = เสมอ
        : games % 3 === 0
          ? [{ a: 21, b: 18 }, { a: 19, b: 21 }, { a: 21, b: 15 }] // ตัดเซ็ตสาม
          : [{ a: 21, b: 15 }, { a: 21, b: 17 }]
    await post(`/api/session/${sid}/finish`, {
      matchId: match.id,
      sets,
      shuttles: games === 3 ? 0 : games % 3 === 0 ? 2 : 1,
    })
    games++
  }
}
console.log("▸ จัดเกมเข้าคิวไว้ล่วงหน้า 2 เกม")
for (let i = 0; i < 2; i++) {
  const suggestion = await post(`/api/session/${sid}/suggest`, { type: "D" })
  if (!suggestion.ok) break
  await post(`/api/session/${sid}/plan`, {
    type: suggestion.suggestion.type,
    teamA: suggestion.suggestion.teamA,
    teamB: suggestion.suggestion.teamB,
    createdBy: "auto",
  })
}

console.log("▸ เก็บเงินไป 9 คน เหลือค้าง 5 คน")
const before = await viewOf(sid)
for (const line of before.bill.lines.slice(0, 9)) {
  await post(`/api/session/${sid}/paid`, { playerId: line.playerId, paid: true })
}

const final = await viewOf(sid)
const owed = final.bill.billed - final.bill.collected

console.log(`
✅ ก๊วนตัวอย่างพร้อมแล้ว

   หน้าคอร์ต         ${BASE}/        ← มีคิวเกมจัดไว้ ลองกด "ลงคอร์ตนี้เลย"
   หน้าค่าก๊วน       ${BASE}/bill    ← ลองกดปุ่ม "ไฟล์ Excel"

   ${final.bill.lines.length} คน · ${final.session.matches.filter((m) => m.endedAt).length} เกม · ${final.bill.shuttlesUsed} ลูก
   เรียกเก็บ ${final.bill.billed} บาท · เก็บได้แล้ว ${final.bill.collected} · ค้างอยู่ ${owed.toFixed(2)}

   ลบข้อมูลตัวอย่างทิ้งเมื่อไรก็ได้ — ปิดเว็บแล้วสั่ง  ${RESET_CMD}
`)
