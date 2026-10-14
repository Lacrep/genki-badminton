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

  it("คนที่เคยลงก๊วนแล้วลบไม่ได้ — ชื่อในบิลเก่าต้องไม่หาย", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "ต้น", level: 5 })
    const session = store.createSession({})
    store.checkIn(session.id, a.id)
    store.endSession(session.id)

    expect(() => store.deletePlayer(a.id)).toThrow()
    expect(store.getRoster().map((p) => p.id)).toContain(a.id)
  })

  it("คนที่อยู่ในก๊วนที่กำลังเล่นอยู่ ลบไม่ได้", async () => {
    const store = await loadStore()
    const a = store.addPlayer({ name: "บอย", level: 4 })
    const session = store.createSession({})
    store.checkIn(session.id, a.id)

    expect(() => store.deletePlayer(a.id)).toThrow()
    expect(store.getRoster().map((p) => p.id)).toContain(a.id)
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
