import { describe, expect, it } from "vitest"
import {
  type Fees,
  type Match,
  type RosterPlayer,
  type Session,
  type SessionPlayer,
  DEFAULT_FEES,
  DEFAULT_SETTINGS,
} from "@shared/types"
import { computeBill } from "./store"

const NOW = 1_700_000_000_000

function match(id: string, ids: string[], shuttles: number): Match {
  return {
    id,
    courtIndex: 0,
    type: "D",
    teamA: ids.slice(0, 2),
    teamB: ids.slice(2, 4),
    startedAt: NOW - 900_000,
    endedAt: NOW,
    shuttles,
    createdBy: "auto",
    levelGap: 0,
    maxWaitAtStart: 0,
  }
}

/**
 * ก๊วนตัวอย่างตามโปสเตอร์: ค่าสนามคนละ 70 · ลูกละ 25
 * 2 เกม — เกมแรก a,b vs c,d ใช้ 2 ลูก · เกมสอง a,b vs c,e ใช้ 1 ลูก
 */
function makeSession(fees: Partial<Fees> = {}, games: Record<string, number> = {}) {
  const ids = ["a", "b", "c", "d", "e"]
  const roster = new Map<string, RosterPlayer>()
  const players: SessionPlayer[] = []
  const played: Record<string, number> = { a: 2, b: 2, c: 2, d: 1, e: 1, ...games }

  for (const id of ids) {
    roster.set(id, { id, name: id, level: 4, createdAt: NOW })
    players.push({
      playerId: id,
      status: "queue",
      checkInAt: NOW,
      queueSince: NOW,
      gamesPlayed: played[id] ?? 0,
      playedMs: 0,
      waitedMs: 0,
      longestWaitMs: 0,
      wins: 0,
      losses: 0,
      boost: 0,
      paid: false,
    })
  }

  const session: Session = {
    id: "s_bill",
    name: "ก๊วนทดสอบบิล",
    date: "2026-09-22",
    venue: "",
    startAt: NOW,
    status: "live",
    code: "BILL",
    courts: [{ index: 0, name: "คอร์ต 1", currentMatchId: null }],
    players,
    matches: [match("m1", ["a", "b", "c", "d"], 2), match("m2", ["a", "b", "c", "e"], 1)],
    events: [],
    settings: { ...DEFAULT_SETTINGS },
    fees: { ...DEFAULT_FEES, roundTo: 1, ...fees },
    shuttlesExtra: 0,
  }
  return { session, roster }
}

const amountOf = (bill: { lines: { playerId: string; amount: number }[] }, id: string) =>
  bill.lines.find((l) => l.playerId === id)!.amount

describe("ค่าเริ่มต้นตามโปสเตอร์ก๊วน", () => {
  it("ค่าสนามคนละ 70 · ลูกละ 25 · โหมดระบบก๊วน", () => {
    expect(DEFAULT_FEES.courtFeePerHead).toBe(70)
    expect(DEFAULT_FEES.shuttlePrice).toBe(25)
    expect(DEFAULT_FEES.mode).toBe("club")
  })
})

describe("โหมดระบบก๊วน — ค่าสนามต่อหัว + ค่าลูกตามเกมที่ลง", () => {
  it("ค่าลูกในแต่ละเกมหารกันเฉพาะ 4 คนที่ลงเกมนั้น", () => {
    const { session, roster } = makeSession()
    const bill = computeBill(session, roster)
    // เกม 1: 2 ลูก × 25 = 50 ÷ 4 = 12.5 · เกม 2: 1 ลูก × 25 = 25 ÷ 4 = 6.25
    expect(amountOf(bill, "a")).toBe(89) // 70 + 12.5 + 6.25 = 88.75 → ปัดขึ้น 89
    expect(amountOf(bill, "d")).toBe(83) // 70 + 12.5 = 82.5 → 83
    expect(amountOf(bill, "e")).toBe(77) // 70 + 6.25 = 76.25 → 77
  })

  it("คนที่ยังไม่ได้ลงเลยจ่ายแค่ค่าสนาม", () => {
    const { session, roster } = makeSession({}, { e: 0 })
    session.matches = [match("m1", ["a", "b", "c", "d"], 2)]
    const bill = computeBill(session, roster)
    expect(amountOf(bill, "e")).toBe(70)
  })

  it("แยกยอดค่าสนาม/ค่าลูกให้เห็นในใบเสร็จ", () => {
    const { session, roster } = makeSession()
    const line = computeBill(session, roster).lines.find((l) => l.playerId === "a")!
    expect(line.courtPart).toBe(70)
    expect(line.shuttlePart).toBe(18.75)
    expect(line.extraPart).toBe(0)
  })

  it("ลูกที่ใช้นอกเกมหารเท่ากันทุกคน", () => {
    const { session, roster } = makeSession()
    session.shuttlesExtra = 1 // 25 บาท ÷ 5 คน = 5 บาท
    const bill = computeBill(session, roster)
    expect(bill.shuttlesUsed).toBe(4)
    expect(amountOf(bill, "e")).toBe(82) // 70 + 6.25 + 5 = 81.25 → 82
  })

  it("ค่าอื่น ๆ หารเท่ากันทุกคน", () => {
    const { session, roster } = makeSession({ extraCost: 100 })
    const bill = computeBill(session, roster)
    expect(bill.lines.every((l) => l.extraPart === 20)).toBe(true)
  })

  it("บอกว่าเก็บได้เกินหรือขาดเมื่อกรอกค่าคอร์ตที่จ่ายสนามจริง", () => {
    const { session, roster } = makeSession({ courtCost: 700 })
    const bill = computeBill(session, roster)
    // ต้นทุน = ค่าคอร์ต 700 + ค่าลูก 3 ลูก × 25 = 775
    expect(bill.total).toBe(775)
    expect(bill.balance).toBe(bill.billed - 775)
    // เก็บหัวละ 70 จาก 5 คน = 350 → ยังขาด
    expect(bill.balance).toBeLessThan(0)
  })
})

describe("โหมดหารเท่ากันทุกคน", () => {
  it("ทุกคนจ่ายเท่ากันจากต้นทุนรวม", () => {
    const { session, roster } = makeSession({ mode: "equal", courtCost: 700 })
    const bill = computeBill(session, roster)
    // (700 + 3×25) / 5 = 155
    expect(new Set(bill.lines.map((l) => l.amount)).size).toBe(1)
    expect(amountOf(bill, "a")).toBe(155)
    expect(amountOf(bill, "e")).toBe(155)
  })

  it("ไม่สนว่าใครลงกี่เกม", () => {
    const { session, roster } = makeSession({ mode: "equal", courtCost: 500 }, { a: 9, e: 0 })
    const bill = computeBill(session, roster)
    expect(amountOf(bill, "a")).toBe(amountOf(bill, "e"))
  })
})

describe("การปัดเศษและยอดที่เก็บได้", () => {
  it("ปัดขึ้นทีละ 5 บาทได้ เก็บเงินหน้างานง่าย", () => {
    const { session, roster } = makeSession({ roundTo: 5 })
    const bill = computeBill(session, roster)
    expect(bill.lines.every((l) => l.amount % 5 === 0)).toBe(true)
    expect(amountOf(bill, "a")).toBe(90) // 88.75 → 90
  })

  it("นับยอดที่จ่ายแล้วเฉพาะคนที่ติ๊กว่าจ่าย", () => {
    const { session, roster } = makeSession()
    session.players[0].paid = true // a
    const bill = computeBill(session, roster)
    expect(bill.collected).toBe(89)
    expect(bill.billed).toBeGreaterThan(bill.collected)
  })

  it("คนที่กลับบ้านแล้วยังอยู่ในบิล (เขาก็ใช้คอร์ตไปแล้ว)", () => {
    const { session, roster } = makeSession()
    session.players[4].status = "left"
    session.players[4].leftAt = NOW
    const bill = computeBill(session, roster)
    expect(bill.lines.length).toBe(5)
    expect(amountOf(bill, "e")).toBe(77)
  })
})
