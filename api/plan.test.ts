import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * คิวเกมที่จัดไว้ล่วงหน้า — จุดตายคือคนในคิวหายไประหว่างรอ
 * (กลับบ้าน / ถูกดึงไปลงคอร์ตอื่น) แล้วกดลงคอร์ตไม่ได้ทั้งที่หน้าจอบอกว่าพร้อม
 */

let dir = ""

async function loadStore() {
  vi.resetModules()
  process.env.DATA_DIR = dir
  return import("./store")
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "genki-plan-"))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

/** ก๊วน 8 คนเช็คอินครบ 2 คอร์ต */
async function setup() {
  const store = await loadStore()
  const ids = ["ต้น", "บอย", "เอก", "แนน", "มิ้น", "จูน", "เบส", "ใหม่"].map(
    (name, i) => store.addPlayer({ name, level: ((i % 5) + 2) as 2 }).id,
  )
  const session = store.createSession({})
  for (const id of ids) store.checkIn(session.id, id)
  return { store, sessionId: session.id, ids }
}

describe("จัดเกมเข้าคิว", () => {
  it("เกมที่จัดไว้เรียงตามลำดับที่เพิ่ม", async () => {
    const { store, sessionId, ids } = await setup()
    store.planMatch(sessionId, { type: "D", teamA: [ids[0]!, ids[1]!], teamB: [ids[2]!, ids[3]!] })
    store.planMatch(sessionId, { type: "D", teamA: [ids[4]!, ids[5]!], teamB: [ids[6]!, ids[7]!] })

    const planned = store.getSession(sessionId).planned
    expect(planned).toHaveLength(2)
    expect(planned[0]!.teamA).toEqual([ids[0], ids[1]])
    expect(planned[1]!.teamA).toEqual([ids[4], ids[5]])
  })

  it("จัดคนเดิมซ้ำสองเกมไม่ได้ — ถึงคิวแล้วจะลงพร้อมกันไม่ได้", async () => {
    const { store, sessionId, ids } = await setup()
    store.planMatch(sessionId, { type: "D", teamA: [ids[0]!, ids[1]!], teamB: [ids[2]!, ids[3]!] })

    expect(() =>
      store.planMatch(sessionId, { type: "D", teamA: [ids[0]!, ids[4]!], teamB: [ids[5]!, ids[6]!] }),
    ).toThrow(/จัดไว้ในคิวเกมอื่นแล้ว/)
  })

  it("คนที่กลับบ้านแล้วจัดเข้าคิวไม่ได้", async () => {
    const { store, sessionId, ids } = await setup()
    store.checkOut(sessionId, ids[0]!)
    expect(() =>
      store.planMatch(sessionId, { type: "D", teamA: [ids[0]!, ids[1]!], teamB: [ids[2]!, ids[3]!] }),
    ).toThrow(/กลับบ้านแล้ว/)
  })

  it("สลับลำดับคิวได้ และไม่หลุดขอบ", async () => {
    const { store, sessionId, ids } = await setup()
    const a = store.planMatch(sessionId, { type: "D", teamA: [ids[0]!, ids[1]!], teamB: [ids[2]!, ids[3]!] }).planned
    store.planMatch(sessionId, { type: "D", teamA: [ids[4]!, ids[5]!], teamB: [ids[6]!, ids[7]!] })

    store.movePlanned(sessionId, a.id, "down")
    expect(store.getSession(sessionId).planned[1]!.id).toBe(a.id)

    // ท้ายสุดแล้วเลื่อนลงอีกก็ต้องอยู่เฉย ๆ ไม่ใช่หายไป
    store.movePlanned(sessionId, a.id, "down")
    expect(store.getSession(sessionId).planned).toHaveLength(2)
    expect(store.getSession(sessionId).planned[1]!.id).toBe(a.id)
  })
})

describe("เอาเกมในคิวลงคอร์ต", () => {
  it("ลงคอร์ตแล้วหลุดออกจากคิว และทุกคนเปลี่ยนเป็นกำลังเล่น", async () => {
    const { store, sessionId, ids } = await setup()
    const plan = store.planMatch(sessionId, { type: "D", teamA: [ids[0]!, ids[1]!], teamB: [ids[2]!, ids[3]!] }).planned

    const { match } = store.startPlanned(sessionId, plan.id, 0)
    const session = store.getSession(sessionId)

    expect(session.planned).toHaveLength(0)
    expect(session.courts[0]!.currentMatchId).toBe(match.id)
    for (const pid of ids.slice(0, 4)) {
      expect(session.players.find((p) => p.playerId === pid)!.status, pid).toBe("playing")
    }
  })

  it("มีคนในคิวไปลงคอร์ตอื่นก่อน → ลงไม่ได้ และเกมต้องยังอยู่ในคิว", async () => {
    const { store, sessionId, ids } = await setup()
    const plan = store.planMatch(sessionId, { type: "D", teamA: [ids[0]!, ids[1]!], teamB: [ids[2]!, ids[3]!] }).planned

    // ดึง 1 คนจากคิวไปลงคอร์ตอื่นด้วยมือ
    store.startMatch(sessionId, { courtIndex: 1, type: "D", teamA: [ids[0]!, ids[4]!], teamB: [ids[5]!, ids[6]!] })

    expect(() => store.startPlanned(sessionId, plan.id, 0)).toThrow(/กำลังเล่นอยู่คอร์ตอื่น/)
    // สำคัญ: ล้มแล้วคิวต้องไม่หาย ไม่งั้นงานที่จัดไว้หายฟรี
    expect(store.getSession(sessionId).planned).toHaveLength(1)
  })

  it("หน้าเว็บรู้ล่วงหน้าว่าเกมไหนยังลงไม่ได้ เพราะอะไร", async () => {
    const { store, sessionId, ids } = await setup()
    store.planMatch(sessionId, { type: "D", teamA: [ids[0]!, ids[1]!], teamB: [ids[2]!, ids[3]!] })
    store.checkOut(sessionId, ids[1]!)

    const view = store.buildView(store.getSession(sessionId))
    expect(view.planned).toHaveLength(1)
    expect(view.planned[0]!.ready).toBe(false)
    expect(view.planned[0]!.blockers.join(" ")).toContain("กลับบ้านแล้ว")
  })

  it("คนที่ถูกจัดไว้ในคิวแล้ว ไม่ถูกนับว่าว่างสำหรับจัดเกมใหม่", async () => {
    const { store, sessionId, ids } = await setup()
    store.planMatch(sessionId, { type: "D", teamA: [ids[0]!, ids[1]!], teamB: [ids[2]!, ids[3]!] })
    const busy = store.committedPlayerIds(store.getSession(sessionId))
    for (const pid of ids.slice(0, 4)) expect(busy, pid).toContain(pid)
    for (const pid of ids.slice(4)) expect(busy, pid).not.toContain(pid)
  })
})

describe("ผลเสมอ", () => {
  it("ได้กันคนละเซ็ต → ทุกคนได้เสมอคนละ 1 ไม่มีใครชนะหรือแพ้", async () => {
    const { store, sessionId, ids } = await setup()
    const { match } = store.startMatch(sessionId, {
      courtIndex: 0,
      type: "D",
      teamA: [ids[0]!, ids[1]!],
      teamB: [ids[2]!, ids[3]!],
    })
    store.finishMatch(sessionId, {
      matchId: match.id,
      sets: [
        { a: 21, b: 15 },
        { a: 19, b: 21 },
      ],
    })

    const session = store.getSession(sessionId)
    expect(session.matches[0]!.winner).toBe("draw")
    for (const pid of ids.slice(0, 4)) {
      const sp = session.players.find((p) => p.playerId === pid)!
      expect(sp.draws, pid).toBe(1)
      expect(sp.wins, pid).toBe(0)
      expect(sp.losses, pid).toBe(0)
    }
  })
})
