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
