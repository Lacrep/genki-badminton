import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * ข้อมูลก๊วนคือเงินจริงของลูกก๊วน — ไฟล์เสียแล้วกู้ไม่ได้คือเรื่องใหญ่
 * เทสต์ชุดนี้จำลองไฟล์พังแบบที่เจอจริง (ไฟดับกลางเขียน / ไฟล์โดนแก้มั่ว)
 */

let dir = ""

async function loadStore() {
  vi.resetModules()
  process.env.DATA_DIR = dir
  return import("./store")
}

/** จำลอง "คอมอีกเครื่อง" — โฟลเดอร์ข้อมูลคนละอัน ของเดิมยังอยู่ */
async function loadStoreAt(other: string) {
  vi.resetModules()
  process.env.DATA_DIR = other
  return import("./store")
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "genki-store-"))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const rosterFile = () => path.join(dir, "roster.json")

describe("เขียนไฟล์แบบไฟดับแล้วไม่เสีย", () => {
  it("เขียนเสร็จแล้วมีไฟล์สำรองคู่ไว้เสมอ", async () => {
    const store = await loadStore()
    store.addPlayer({ name: "ต้น", level: 5 })
    store.addPlayer({ name: "บอย", level: 4 })

    expect(fs.existsSync(rosterFile())).toBe(true)
    expect(fs.existsSync(`${rosterFile()}.bak`)).toBe(true)
  })

  it("ไม่ทิ้งไฟล์ .tmp ค้างไว้", async () => {
    const store = await loadStore()
    store.addPlayer({ name: "ต้น", level: 5 })
    expect(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toHaveLength(0)
  })
})

describe("ไฟล์ทะเบียนเสีย", () => {
  it("กู้จากไฟล์สำรอง ไม่ใช่เริ่มนับหนึ่งใหม่", async () => {
    const store = await loadStore()
    store.addPlayer({ name: "ต้น", level: 5 })
    store.addPlayer({ name: "บอย", level: 4 })
    expect(store.getRoster()).toHaveLength(2)

    // จำลองไฟดับกลางเขียน — ได้ไฟล์ที่ชื่อถูกแต่ข้างในไม่ครบ
    fs.writeFileSync(rosterFile(), '[{"id":"p_1","name":"ต้')
    vi.spyOn(console, "error").mockImplementation(() => {})

    const reopened = await loadStore()
    const names = reopened.getRoster().map((p) => p.name)
    expect(names).toContain("ต้น")
  })

  it("เก็บไฟล์ที่พังไว้ให้ ไม่ลบทิ้ง", async () => {
    const store = await loadStore()
    store.addPlayer({ name: "ต้น", level: 5 })
    store.addPlayer({ name: "บอย", level: 4 })

    fs.writeFileSync(rosterFile(), "ขยะ")
    vi.spyOn(console, "error").mockImplementation(() => {})
    await (await loadStore()).getRoster()

    expect(fs.readdirSync(dir).some((f) => f.includes(".broken-"))).toBe(true)
  })

  it("พังทั้งไฟล์หลักและไฟล์สำรองก็ยังเปิดเว็บได้ ไม่ค้าง", async () => {
    const store = await loadStore()
    store.addPlayer({ name: "ต้น", level: 5 })

    fs.writeFileSync(rosterFile(), "ขยะ")
    fs.writeFileSync(`${rosterFile()}.bak`, "ขยะเหมือนกัน")
    vi.spyOn(console, "error").mockImplementation(() => {})

    const reopened = await loadStore()
    expect(reopened.getRoster()).toEqual([])
    // ของเดิมยังอยู่ให้แกะ
    expect(fs.readdirSync(dir).some((f) => f.includes(".broken-"))).toBe(true)
  })

  it("ยังไม่เคยมีไฟล์ (เปิดใช้ครั้งแรก) ไม่ถือว่าพัง", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const store = await loadStore()
    expect(store.getRoster()).toEqual([])
    expect(spy).not.toHaveBeenCalled()
    expect(fs.readdirSync(dir).some((f) => f.includes(".broken-"))).toBe(false)
  })
})

describe("เก็บเงินครบแล้วข้อมูลก๊วนต้องไม่หาย", () => {
  it("เก็บเงินครบทุกคน รายชื่อคนที่มาและสถิติยังอยู่ครบ", async () => {
    const store = await loadStore()
    const ids = ["ต้น", "บอย", "แนน", "โจ้"].map((name) => store.addPlayer({ name, level: 4 }).id)
    const session = store.createSession({})
    for (const id of ids) store.checkIn(session.id, id)
    const { match } = store.startMatch(session.id, {
      courtIndex: 0,
      type: "D",
      teamA: ids.slice(0, 2),
      teamB: ids.slice(2),
    })
    store.finishMatch(session.id, { matchId: match.id, sets: [{ a: 21, b: 15 }], shuttles: 1 })

    // จบก๊วน: เก็บเงินครบทุกคน (ซึ่งเช็คเอาท์ให้อัตโนมัติ)
    for (const id of ids) store.setPaid(session.id, id, true)

    const after = store.getSession(session.id)
    expect(after.players).toHaveLength(4)
    expect(after.players.every((p) => p.status === "left")).toBe(true)
    // ตัวเลขสถิติต้องไม่ถูกล้าง
    expect(after.players.every((p) => p.gamesPlayed === 1)).toBe(true)
    expect(after.matches).toHaveLength(1)
    expect(store.getRoster()).toHaveLength(4)

    // "มาวันนี้" ต้องยังเป็น 4 ไม่ใช่ 0
    const view = store.buildView(after)
    expect(view.stats.checkedIn).toBe(4)
    expect(view.stats.present).toBe(0)
  })

  it("สถิติรวมทุกครั้งยังนับก๊วนที่เก็บเงินครบแล้ว", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "ต้น", level: 5 })
    const session = store.createSession({})
    store.checkIn(session.id, a.id)
    store.setPaid(session.id, a.id, true)

    const stats = store.allTimeStats()
    expect(stats.find((x) => x.playerId === a.id)?.sessions).toBe(1)
  })
})

describe("เอาคนออกจากบิล", () => {
  it("กดพลาดกับคนที่จ่ายแล้ว เอากลับเข้าบิลแล้วต้องยังขึ้นว่าจ่ายแล้วอยู่", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "ต้น", level: 5 })
    const session = store.createSession({})
    store.checkIn(session.id, a.id)
    store.setPaid(session.id, a.id, true)

    const off = store.setNoBill(session.id, a.id, true)
    expect(off.players.find((p) => p.playerId === a.id)?.noBill).toBe(true)

    const on = store.setNoBill(session.id, a.id, false)
    const sp = on.players.find((p) => p.playerId === a.id)!
    expect(sp.noBill).toBeUndefined()
    // ประวัติว่าจ่ายมาแล้วต้องไม่หาย ไม่งั้นต้องไปตามเก็บเงินซ้ำ
    expect(sp.paid).toBe(true)
  })

  it("คนที่ไม่อยู่ในบิลไม่ถูกนับเป็นยอดที่เก็บได้ แม้ธงจ่ายแล้วยังอยู่", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "ต้น", level: 5 })
    const session = store.createSession({})
    store.checkIn(session.id, a.id)
    store.setPaid(session.id, a.id, true)
    store.setNoBill(session.id, a.id, true)

    const bill = store.computeBill(store.getSession(session.id), store.rosterMap())
    expect(bill.lines.find((l) => l.playerId === a.id)?.amount).toBe(0)
    expect(bill.collected).toBe(0)
  })

  it("คนที่ไม่อยู่ในบิล กดรับเงินไม่ได้", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "ต้น", level: 5 })
    const session = store.createSession({})
    store.checkIn(session.id, a.id)
    store.setNoBill(session.id, a.id, true)

    expect(() => store.setPaid(session.id, a.id, true)).toThrow(/ไม่ได้อยู่ในบิล/)
  })

  it("เอากลับเข้าบิลได้ แล้วคิดเงินตามปกติ", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "ต้น", level: 5 })
    const session = store.createSession({})
    store.checkIn(session.id, a.id)
    store.setNoBill(session.id, a.id, true)

    const after = store.setNoBill(session.id, a.id, false)
    expect(after.players.find((p) => p.playerId === a.id)?.noBill).toBeUndefined()
  })
})

describe("ปรับลูกกับส่วนลดรายคน", () => {
  it("ปรับลูกแล้วค้างไว้ข้ามการเปิดเซิร์ฟเวอร์ใหม่", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "ต้น", level: 5 })
    const session = store.createSession({})
    store.checkIn(session.id, a.id)

    store.setShuttleAdjust(session.id, a.id, -2)
    const again = await loadStore()
    expect(again.getSession(session.id).players.find((p) => p.playerId === a.id)?.shuttleAdjust).toBe(-2)
  })

  it("ปรับกลับเป็น 0 แล้วธงถูกลบทิ้ง ไม่ค้างเป็นขยะในไฟล์", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "ต้น", level: 5 })
    const session = store.createSession({})
    store.checkIn(session.id, a.id)

    store.setShuttleAdjust(session.id, a.id, 3)
    const after = store.setShuttleAdjust(session.id, a.id, 0)
    expect(after.players.find((p) => p.playerId === a.id)?.shuttleAdjust).toBeUndefined()
  })

  it("ส่วนลดติดลบไม่ได้ — กรอกมาเท่าไรก็ถูกบีบที่ศูนย์", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "ต้น", level: 5 })
    const session = store.createSession({})
    store.checkIn(session.id, a.id)

    const after = store.setDiscount(session.id, a.id, -500)
    expect(after.players.find((p) => p.playerId === a.id)?.discount).toBeUndefined()
  })

  it("คนที่ยังไม่ได้เช็คอิน ปรับลูกหรือลดราคาไม่ได้", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "ต้น", level: 5 })
    const session = store.createSession({})

    expect(() => store.setShuttleAdjust(session.id, a.id, -1)).toThrow(/ยังไม่ได้เช็คอิน/)
    expect(() => store.setDiscount(session.id, a.id, 50)).toThrow(/ยังไม่ได้เช็คอิน/)
  })
})

describe("รับเงินแล้วต้องเช็คเอาท์ให้เอง", () => {
  it("คนที่นั่งรออยู่ จ่ายเงินแล้วออกจากก๊วนทันที", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "ต้น", level: 5 })
    const session = store.createSession({})
    store.checkIn(session.id, a.id)

    const after = store.setPaid(session.id, a.id, true)
    expect(after.players.find((p) => p.playerId === a.id)?.status).toBe("left")
  })

  it("ยกเลิกการจ่าย พากลับเข้าคิวให้", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "ต้น", level: 5 })
    const session = store.createSession({})
    store.checkIn(session.id, a.id)
    store.setPaid(session.id, a.id, true)

    const after = store.setPaid(session.id, a.id, false)
    expect(after.players.find((p) => p.playerId === a.id)?.status).toBe("queue")
  })

  it("คนที่อยู่ในคอร์ต จ่ายแล้วไม่โดนดึงออกกลางเกม แต่จบเกมแล้วกลับบ้านเลย", async () => {
    const store = await loadStore()
    const ids = ["ต้น", "บอย", "แนน", "โจ้"].map((name) => store.addPlayer({ name, level: 4 }).id)
    const session = store.createSession({})
    for (const id of ids) store.checkIn(session.id, id)
    const { match } = store.startMatch(session.id, {
      courtIndex: 0,
      type: "D",
      teamA: ids.slice(0, 2),
      teamB: ids.slice(2),
    })

    const mid = store.setPaid(session.id, ids[0], true)
    expect(mid.players.find((p) => p.playerId === ids[0])?.status).toBe("playing")

    const done = store.finishMatch(session.id, { matchId: match.id, sets: [{ a: 21, b: 15 }], shuttles: 1 })
    expect(done.players.find((p) => p.playerId === ids[0])?.status).toBe("left")
    // คนที่ยังไม่จ่ายกลับเข้าคิวตามปกติ
    expect(done.players.find((p) => p.playerId === ids[1])?.status).toBe("queue")
  })
})

describe("ห้ามชื่อซ้ำกันในทะเบียน", () => {
  it("เพิ่มชื่อที่มีอยู่แล้วไม่ได้", async () => {
    const store = await loadStore()
    store.addPlayer({ name: "ต้น", level: 5 })
    expect(() => store.addPlayer({ name: "ต้น", level: 3 })).toThrow()
    expect(store.getRoster()).toHaveLength(1)
  })

  it("ช่องว่างหัวท้ายหรือเว้นวรรคต่างกัน ก็ถือว่าซ้ำ", async () => {
    const store = await loadStore()
    store.addPlayer({ name: "พี่หมู", level: 5 })
    expect(() => store.addPlayer({ name: "  พี่หมู  ", level: 3 })).toThrow()
    expect(() => store.addPlayer({ name: "พี่  หมู", level: 3 })).toThrow()
  })

  it("แก้ชื่อไปชนกับคนอื่นไม่ได้ แต่แก้ชื่อตัวเองได้", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "ต้น", level: 5 })
    store.addPlayer({ name: "บอย", level: 4 })

    expect(() => store.updatePlayer(a.id, { name: "บอย" })).toThrow()
    // แก้ข้อมูลอื่นของตัวเองโดยส่งชื่อเดิมมาด้วย ต้องผ่าน
    expect(store.updatePlayer(a.id, { name: "ต้น", level: 6 }).level).toBe(6)
  })

  it("ชื่อที่ถูกเก็บเข้ากรุก็ยังกันซ้ำ และบอกให้เอากลับมาใช้", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "แนน", level: 4 })
    store.updatePlayer(a.id, { archived: true })
    expect(() => store.addPlayer({ name: "แนน", level: 4 })).toThrow(/เก็บเข้ากรุ/)
  })
})

describe("ทะเบียนสมาชิกต้องอยู่ตลอด", () => {
  it("แก้ชื่ออย่างเดียวแล้วระดับมือต้องไม่หาย", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "ต้น", level: 7 })

    store.updatePlayer(a.id, { archived: true })
    store.updatePlayer(a.id, { name: "ต้นใหญ่" })

    const again = store.getRoster().find((p) => p.id === a.id)
    expect(again?.level).toBe(7)
    expect(again?.name).toBe("ต้นใหญ่")
    expect(again?.archived).toBe(true)
  })

  it("คนที่เคยลงก๊วนแล้ว ลบเฉย ๆ ไม่ได้ ต้องยืนยันอีกชั้น", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "ต้น", level: 5 })
    const session = store.createSession({})
    store.checkIn(session.id, a.id)
    store.endSession(session.id)

    expect(() => store.deletePlayer(a.id)).toThrow(/เคยอยู่ในก๊วน|เคยลงก๊วนมาแล้ว/)
    expect(store.getRoster().map((p) => p.id)).toContain(a.id)
  })

  it("เพิ่มชื่อซ้ำจากหน้าเช็คอินแล้วลบทิ้ง — ถอนออกจากก๊วนวันนี้ให้ด้วย ไม่เหลือหัวผีในบิล", async () => {
    const store = await loadStore()
    const dup = store.addPlayer({ name: "บอยซ้ำ", level: 4 })
    const session = store.createSession({})
    store.checkIn(session.id, dup.id)
    store.checkOut(session.id, dup.id)

    // ยังไม่ได้ลงสักเกม → ลบจบในคลิกเดียว ไม่ต้องยืนยันซ้ำ
    const out = store.deletePlayer(dup.id)
    expect(out.sessions).toBe(0)
    expect(store.getRoster().map((p) => p.id)).not.toContain(dup.id)
    // ชื่อถูกถอนออกจากก๊วนวันนี้ บิลจึงไม่มีหัวที่ไม่ได้มาจริง
    expect(store.getSession(session.id).players.map((x) => x.playerId)).not.toContain(dup.id)
  })

  it("ลงเล่นไปแล้วแม้แต่เกมเดียว ก็ไม่ถูกถอนออกจากก๊วนที่เปิดอยู่เงียบ ๆ", async () => {
    const store = await loadStore()
    const ids = ["ต้น", "บอย", "แนน", "โจ้"].map((name) => store.addPlayer({ name, level: 4 }).id)
    const session = store.createSession({})
    for (const id of ids) store.checkIn(session.id, id)
    const { match } = store.startMatch(session.id, {
      courtIndex: 0,
      type: "D",
      teamA: [ids[0]!, ids[1]!],
      teamB: [ids[2]!, ids[3]!],
    })
    store.finishMatch(session.id, { matchId: match.id, sets: [{ a: 21, b: 15 }], shuttles: 1 })
    store.checkOut(session.id, ids[0]!)

    expect(() => store.deletePlayer(ids[0]!)).toThrow(/เคยลงก๊วนมาแล้ว/)
    // ยืนยันแล้วลบได้ แต่ชื่อยังอยู่ในก๊วนนั้น ยอดเงินเก่าจึงไม่ขยับ
    store.deletePlayer(ids[0]!, { force: true })
    expect(store.getSession(session.id).players.map((x) => x.playerId)).toContain(ids[0])
    expect(store.rosterMap().get(ids[0]!)?.name).toBe("ต้น")
  })

  it("ยืนยันแล้วลบได้ แม้เคยลงก๊วนมาแล้ว", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "ต้น", level: 5 })
    const session = store.createSession({})
    store.checkIn(session.id, a.id)
    store.endSession(session.id)

    const out = store.deletePlayer(a.id, { force: true })
    expect(out).toMatchObject({ name: "ต้น", sessions: 1 })
    expect(store.getRoster().map((p) => p.id)).not.toContain(a.id)
  })

  it("ลบแล้วบิลกับสถิติของก๊วนเก่ายังขึ้นชื่อเดิม ไม่กลายเป็นรหัสดิบ", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "ปาล์ม", level: 5 })
    const session = store.createSession({})
    store.checkIn(session.id, a.id)
    store.endSession(session.id)
    store.deletePlayer(a.id, { force: true })

    // ชื่อยังอ่านออกทั้งในบิลและสถิติรวม
    const bill = store.computeBill(store.getSession(session.id), store.rosterMap())
    expect(bill.lines.find((l) => l.playerId === a.id)?.name).toBe("ปาล์ม")
    expect(store.allTimeStats().find((x) => x.playerId === a.id)?.name).toBe("ปาล์ม")
  })

  it("ลบแล้วหายจากทะเบียนจริง เปิดเซิร์ฟเวอร์ใหม่ก็ไม่กลับมา", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "ต้น", level: 5 })
    const session = store.createSession({})
    store.checkIn(session.id, a.id)
    store.endSession(session.id)
    store.deletePlayer(a.id, { force: true })

    const again = await loadStore()
    expect(again.getRoster().map((p) => p.id)).not.toContain(a.id)
    // แต่ชื่อยังอยู่ในแผนที่ชื่อ เพื่อให้ของเก่าอ่านออก
    expect(again.rosterMap().get(a.id)?.name).toBe("ต้น")
  })

  it("ลบคนเก่าแล้วใช้ชื่อเดิมสร้างคนใหม่ได้ ไม่ติดกันชื่อซ้ำ", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "ต้น", level: 5 })
    const session = store.createSession({})
    store.checkIn(session.id, a.id)
    store.endSession(session.id)
    store.deletePlayer(a.id, { force: true })

    const fresh = store.addPlayer({ name: "ต้น", level: 5 })
    expect(fresh.id).not.toBe(a.id)
  })

  it("คนที่อยู่ในก๊วนที่กำลังเล่นอยู่ ลบไม่ได้ แม้จะยืนยันแล้ว", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "บอย", level: 4 })
    const session = store.createSession({})
    store.checkIn(session.id, a.id)

    expect(() => store.deletePlayer(a.id)).toThrow(/กำลังเล่นอยู่/)
    expect(() => store.deletePlayer(a.id, { force: true })).toThrow(/กำลังเล่นอยู่/)
    expect(store.getRoster().map((p) => p.id)).toContain(a.id)
  })

  it("เช็คเอาท์แล้วลบได้ (ยืนยันก่อน) — ก๊วนที่รันอยู่ไม่พัง", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "บอย", level: 4 })
    const session = store.createSession({})
    store.checkIn(session.id, a.id)
    store.checkOut(session.id, a.id)

    store.deletePlayer(a.id, { force: true })
    expect(store.getRoster().map((p) => p.id)).not.toContain(a.id)
  })

  it("คนที่ยังไม่เคยลงก๊วน ลบแล้วไม่ต้องเก็บชื่อไว้ให้รก", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "พิมพ์ผิดซ้ำ", level: 3 })
    store.deletePlayer(a.id)

    expect(store.rosterMap().has(a.id)).toBe(false)
  })

  it("คนที่เพิ่งพิมพ์ชื่อผิด (ยังไม่เคยลง) ลบได้", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "พิมพ์ผิด", level: 3 })

    store.deletePlayer(a.id)
    expect(store.getRoster().map((p) => p.id)).not.toContain(a.id)
  })

  it("ทะเบียนที่ระดับมือหายไป เปิดใหม่แล้วซ่อมให้ ไม่ใช่ทำเว็บพัง", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "แนน", level: 6 })

    const file = path.join(dir, "roster.json")
    const raw = JSON.parse(fs.readFileSync(file, "utf8"))
    delete raw[0].level
    fs.writeFileSync(file, JSON.stringify(raw))

    const reopened = await loadStore()
    const again = reopened.getRoster().find((p) => p.id === a.id)
    expect(typeof again?.level).toBe("number")
  })
})

describe("ข้อมูลก๊วนที่กำลังเล่นอยู่", () => {
  it("ปิดเซิร์ฟเวอร์กลางคันแล้วเปิดใหม่ ก๊วนยังอยู่ครบ", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "ต้น", level: 5 })
    const b = store.addPlayer({ name: "บอย", level: 4 })
    const session = store.createSession({})
    store.checkIn(session.id, a.id)
    store.checkIn(session.id, b.id)

    // เปิดเซิร์ฟเวอร์ใหม่ (โหลดโมดูลใหม่หมด ไม่เหลือ state ในหน่วยความจำ)
    const reopened = await loadStore()
    const current = reopened.currentSession()
    expect(current?.id).toBe(session.id)
    expect(current?.players).toHaveLength(2)
  })

  it("ก๊วนเก่าที่เก็บค่าลูกไว้ชื่อเดิม ยอดไม่หายตอนเปิดใหม่", async () => {
    const store = await loadStore()
    const session = store.createSession({})
    const file = path.join(dir, "sessions", `${session.id}.json`)

    // จำลองไฟล์รุ่นเก่า: ค่าลูกที่จ่ายจริงทั้งวันเคยชื่อ shuttleCostReal
    const raw = JSON.parse(fs.readFileSync(file, "utf8"))
    delete raw.fees.shuttleCostTotal
    raw.fees.shuttleCostReal = 1200
    fs.writeFileSync(file, JSON.stringify(raw))

    const reopened = await loadStore()
    const fees = reopened.currentSession()?.fees as { shuttleCostTotal: number; shuttleCostReal?: number }
    expect(fees.shuttleCostTotal).toBe(1200)
    expect(fees.shuttleCostReal).toBeUndefined()
  })
})

describe("สำรอง / กู้ข้อมูลไปเครื่องอื่น", () => {
  it("กู้ที่เครื่องใหม่แล้วได้ทะเบียน ประวัติก๊วน บิล และรูปครบเหมือนเดิม", async () => {
    const a = await loadStore()
    const ids = ["ต้น", "บอย", "แนน", "โจ้"].map((name) => a.addPlayer({ name, level: 4 }).id)
    const session = a.createSession({})
    for (const id of ids) a.checkIn(session.id, id)
    const { match } = a.startMatch(session.id, {
      courtIndex: 0,
      type: "D",
      teamA: [ids[0]!, ids[1]!],
      teamB: [ids[2]!, ids[3]!],
    })
    a.finishMatch(session.id, { matchId: match.id, sets: [{ a: 21, b: 15 }], shuttles: 2 })
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFUlEQVR4nGP8z4AATAxQxhCVAAgwAA3lAQSWvWrZAAAAAElFTkSuQmCC"
    a.setPlayerPhoto(ids[0]!, png)
    const billA = a.computeBill(a.getSession(session.id), a.rosterMap())
    const backup = JSON.parse(JSON.stringify(a.exportBackup()))

    // เครื่องใหม่ที่ยังไม่มีอะไรเลย
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "genki-other-"))
    try {
      const b = await loadStoreAt(other)
      expect(b.getRoster()).toHaveLength(0)

      b.restoreBackup(b.readBackup(backup))
      expect(b.getRoster().map((p) => p.name).sort()).toEqual(["ต้น", "บอย", "แนน", "โจ้"].sort())
      expect(b.currentSessionId()).toBe(session.id)

      const billB = b.computeBill(b.getSession(session.id), b.rosterMap())
      expect(billB.billed).toBe(billA.billed)
      expect(billB.shuttlesUsed).toBe(billA.shuttlesUsed)
      // รูปต้องไปด้วย ไม่ใช่หายไปเหลือแต่ชื่อ
      expect(b.readPlayerPhoto(ids[0]!)).not.toBeNull()
      expect(b.getRoster().find((p) => p.id === ids[0])?.photoAt).toBeTruthy()
    } finally {
      fs.rmSync(other, { recursive: true, force: true })
    }
  })

  it("ชื่อคนที่ลบไปแล้วไปด้วย — บิลเก่าที่เครื่องใหม่ไม่กลายเป็นรหัสดิบ", async () => {
    const a = await loadStore()
    const gone = a.addPlayer({ name: "ปาล์ม", level: 5 })
    const session = a.createSession({})
    a.checkIn(session.id, gone.id)
    a.endSession(session.id)
    a.deletePlayer(gone.id, { force: true })
    const backup = JSON.parse(JSON.stringify(a.exportBackup()))

    const other = fs.mkdtempSync(path.join(os.tmpdir(), "genki-other-"))
    try {
      const b = await loadStoreAt(other)
      b.restoreBackup(b.readBackup(backup))
      expect(b.getRoster().map((p) => p.id)).not.toContain(gone.id)
      expect(b.rosterMap().get(gone.id)?.name).toBe("ปาล์ม")
      const bill = b.computeBill(b.getSession(session.id), b.rosterMap())
      expect(bill.lines.find((l) => l.playerId === gone.id)?.name).toBe("ปาล์ม")
    } finally {
      fs.rmSync(other, { recursive: true, force: true })
    }
  })

  it("กู้ทับของเดิม — ยกโฟลเดอร์เก่าไปเก็บไว้ก่อนเสมอ กดผิดก็เอากลับได้", async () => {
    const a = await loadStore()
    a.addPlayer({ name: "คนในไฟล์สำรอง", level: 3 })
    const backup = JSON.parse(JSON.stringify(a.exportBackup()))

    const other = fs.mkdtempSync(path.join(os.tmpdir(), "genki-other-"))
    try {
      const b = await loadStoreAt(other)
      b.addPlayer({ name: "คนที่จะโดนทับ", level: 6 })

      const out = b.restoreBackup(b.readBackup(backup))
      expect(b.getRoster().map((p) => p.name)).toEqual(["คนในไฟล์สำรอง"])
      expect(out.movedTo).toBeTruthy()
      // ของเดิมยังอ่านได้จากโฟลเดอร์ที่ยกไปเก็บ
      const old = JSON.parse(fs.readFileSync(path.join(out.movedTo!, "roster.json"), "utf8"))
      expect(old.map((p: { name: string }) => p.name)).toEqual(["คนที่จะโดนทับ"])
    } finally {
      fs.rmSync(other, { recursive: true, force: true })
    }
  })

  it("ก๊วนที่ไม่มีในไฟล์สำรองต้องไม่ค้างปนอยู่หลังกู้", async () => {
    const a = await loadStore()
    a.addPlayer({ name: "ต้น", level: 4 })
    const backup = JSON.parse(JSON.stringify(a.exportBackup()))

    const other = fs.mkdtempSync(path.join(os.tmpdir(), "genki-other-"))
    try {
      const b = await loadStoreAt(other)
      const stale = b.createSession({ name: "ก๊วนที่ไม่ควรเหลือ" })
      b.endSession(stale.id)
      expect(b.listSessions()).toHaveLength(1)

      b.restoreBackup(b.readBackup(backup))
      expect(b.listSessions()).toHaveLength(0)
      expect(b.currentSessionId()).toBeNull()
    } finally {
      fs.rmSync(other, { recursive: true, force: true })
    }
  })

  it("ไฟล์ที่ไม่ใช่ไฟล์สำรอง ต้องไม่ยอมกู้", async () => {
    const store = await loadStore()
    expect(() => store.readBackup({ hello: "world" })).toThrow(/ไม่ใช่ไฟล์สำรอง/)
    expect(() => store.readBackup(null)).toThrow(/ไม่ใช่ไฟล์สำรอง/)
    expect(() => store.readBackup({ genki: "backup", version: 999 })).toThrow(/รุ่นใหม่กว่า/)
    expect(() => store.readBackup({ genki: "backup", version: 1, roster: "nope" })).toThrow(/เสียหาย/)
  })
})
