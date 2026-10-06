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
    expect(view.planned[0]!.problems.join(" ")).toContain("กลับบ้านแล้ว")
  })

  it("คนที่ถูกจัดไว้ในคิวแล้ว ไม่ถูกนับว่าว่างสำหรับจัดเกมใหม่", async () => {
    const { store, sessionId, ids } = await setup()
    store.planMatch(sessionId, { type: "D", teamA: [ids[0]!, ids[1]!], teamB: [ids[2]!, ids[3]!] })
    const busy = store.committedPlayerIds(store.getSession(sessionId))
    for (const pid of ids.slice(0, 4)) expect(busy, pid).toContain(pid)
    for (const pid of ids.slice(4)) expect(busy, pid).not.toContain(pid)
  })
})

describe("จัดคิวได้จากคนทุกคน ไม่ใช่เฉพาะคนที่รออยู่", () => {
  it("คนที่กำลังเล่นอยู่ในคอร์ต ก็จัดเข้าคิวเกมถัดไปได้", async () => {
    const { store, sessionId, ids } = await setup()
    store.startMatch(sessionId, { courtIndex: 0, type: "D", teamA: [ids[0]!, ids[1]!], teamB: [ids[2]!, ids[3]!] })

    // สี่คนนี้อยู่ในคอร์ต แต่กว่าจะถึงคิวถัดไปเขาก็ลงแล้ว จึงต้องจัดได้
    expect(() =>
      store.planMatch(sessionId, { type: "D", teamA: [ids[0]!, ids[1]!], teamB: [ids[2]!, ids[3]!] }),
    ).not.toThrow()
    expect(store.getSession(sessionId).planned).toHaveLength(1)
  })

  it("เครื่องจัดเกมเสนอคนที่อยู่ในคอร์ตได้ตอนจัดล่วงหน้า แต่ไม่เสนอตอนจัดลงคอร์ตเดี๋ยวนี้", async () => {
    const { store, sessionId, ids } = await setup()
    const { suggestMatch } = await import("./matching")
    // ดึง 4 คนลงคอร์ต เหลือในคิวแค่ 4 คน
    store.startMatch(sessionId, { courtIndex: 0, type: "D", teamA: [ids[0]!, ids[1]!], teamB: [ids[2]!, ids[3]!] })

    const base = { session: store.getSession(sessionId), roster: store.rosterMap(), now: Date.now(), type: "D" as const }
    const live = suggestMatch(base)
    const plan = suggestMatch({ ...base, includePlaying: true })

    expect(live.ok).toBe(true)
    expect(plan.ok).toBe(true)
    if (!live.ok || !plan.ok) return
    const liveIds = [...live.suggestion.teamA, ...live.suggestion.teamB]
    // ตอนจัดลงคอร์ตเดี๋ยวนี้ ต้องไม่หยิบคนที่อยู่ในคอร์ตมา
    for (const pid of ids.slice(0, 4)) expect(liveIds, pid).not.toContain(pid)
  })

  it("คนที่ถูกจัดไว้ในคิวแล้ว ไม่ถูกเสนอซ้ำ", async () => {
    const { store, sessionId, ids } = await setup()
    store.planMatch(sessionId, { type: "D", teamA: [ids[0]!, ids[1]!], teamB: [ids[2]!, ids[3]!] })
    const planned = store.plannedPlayerIds(store.getSession(sessionId))
    for (const pid of ids.slice(0, 4)) expect(planned, pid).toContain(pid)
    for (const pid of ids.slice(4)) expect(planned, pid).not.toContain(pid)
  })
})

describe("เกมในคิวที่คนยังเล่นอยู่", () => {
  it("แยก 'รอเขาจบเกม' (เรื่องปกติ) ออกจาก 'มีคนกลับบ้าน' (ปัญหาจริง)", async () => {
    const { store, sessionId, ids } = await setup()
    store.startMatch(sessionId, { courtIndex: 0, type: "D", teamA: [ids[0]!, ids[1]!], teamB: [ids[2]!, ids[3]!] })
    store.planMatch(sessionId, { type: "D", teamA: [ids[0]!, ids[1]!], teamB: [ids[2]!, ids[3]!] })

    const view = store.buildView(store.getSession(sessionId))
    const pv = view.planned[0]!
    expect(pv.ready).toBe(false)
    expect(pv.waitingFor).toHaveLength(4)
    expect(pv.problems).toHaveLength(0)
  })

  it("พอเขาจบเกม เกมในคิวก็พร้อมลงเอง", async () => {
    const { store, sessionId, ids } = await setup()
    const { match } = store.startMatch(sessionId, {
      courtIndex: 0, type: "D", teamA: [ids[0]!, ids[1]!], teamB: [ids[2]!, ids[3]!],
    })
    store.planMatch(sessionId, { type: "D", teamA: [ids[0]!, ids[1]!], teamB: [ids[2]!, ids[3]!] })
    store.finishMatch(sessionId, { matchId: match.id, shuttles: 1 })

    const pv = store.buildView(store.getSession(sessionId)).planned[0]!
    expect(pv.ready).toBe(true)
    expect(pv.waitingFor).toHaveLength(0)
  })
})

describe("ปิดก๊วน", () => {
  it("คู่ที่จัดรอไว้แต่ไม่ได้ลง ถูกล้างทิ้งตอนปิดก๊วน", async () => {
    const { store, sessionId, ids } = await setup()
    store.planMatch(sessionId, { type: "D", teamA: [ids[0]!, ids[1]!], teamB: [ids[2]!, ids[3]!] })
    expect(store.getSession(sessionId).planned).toHaveLength(1)

    store.endSession(sessionId)
    expect(store.getSession(sessionId).planned).toHaveLength(0)
  })
})

describe("ลบก๊วนทิ้ง", () => {
  it("ก๊วนที่ยังเปิดอยู่ลบไม่ได้ ต้องปิดก่อน", async () => {
    const { store, sessionId } = await setup()
    expect(() => store.deleteSession(sessionId)).toThrow(/ปิดก๊วนก่อน/)
  })

  it("ปิดแล้วลบได้ และหายไปจากประวัติ", async () => {
    const { store, sessionId } = await setup()
    store.endSession(sessionId)
    store.deleteSession(sessionId)
    expect(store.listSessions().some((s) => s.id === sessionId)).toBe(false)
    expect(() => store.getSession(sessionId)).toThrow()
  })

  it("ลบก๊วนที่หน้าเว็บเปิดค้างอยู่ แล้วตัวชี้ต้องไม่ค้างชี้ไปที่ของที่ไม่มีแล้ว", async () => {
    const { store, sessionId } = await setup()
    store.endSession(sessionId)
    expect(store.currentSessionId()).toBe(sessionId)
    store.deleteSession(sessionId)
    expect(store.currentSessionId()).not.toBe(sessionId)
    expect(store.currentSession()).toBeNull()
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
