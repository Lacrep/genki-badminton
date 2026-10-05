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
  it("คนที่ลงเกมนั้นจ่ายค่าลูกคนละเต็มอัตรา ไม่ได้เอามาหารกัน", () => {
    const { session, roster } = makeSession()
    const bill = computeBill(session, roster)
    // เกม 1 ใช้ 2 ลูก → คนในเกมจ่ายคนละ 50 · เกม 2 ใช้ 1 ลูก → คนละ 25
    expect(amountOf(bill, "a")).toBe(145) // 70 + 50 + 25 (ลงทั้งสองเกม)
    expect(amountOf(bill, "d")).toBe(120) // 70 + 50 (ลงเกมแรกเกมเดียว)
    expect(amountOf(bill, "e")).toBe(95) // 70 + 25 (ลงเกมสองเกมเดียว)
  })

  it("เกมที่ใช้ลูกเดียว ทั้งสี่คนจ่ายคนละเท่าราคาลูกที่ตั้งไว้", () => {
    const { session, roster } = makeSession()
    session.matches = [match("m1", ["a", "b", "c", "d"], 1)]
    const bill = computeBill(session, roster)
    for (const id of ["a", "b", "c", "d"]) {
      expect(amountOf(bill, id), id).toBe(70 + 25)
    }
    // ก๊วนเก็บค่าลูกเกมนี้ได้ 100 บาท = ราคาลูกจริงหนึ่งลูก
    expect(bill.shuttleCharged).toBe(100)
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
    expect(line.shuttlePart).toBe(75) // 2 ลูกเกมแรก + 1 ลูกเกมสอง = คนละ 50 + 25
    expect(line.extraPart).toBe(0)
  })

  it("ลูกซ้อมนอกเกม ก๊วนออกให้ — ไม่โผล่ในบิลใครสักบาท", () => {
    const { session, roster } = makeSession()
    const before = computeBill(session, roster)

    session.shuttlesExtra = 3
    const after = computeBill(session, roster)

    expect(after.billed).toBe(before.billed)
    for (const line of after.lines) {
      expect(line.shuttlePart, line.name).toBe(
        before.lines.find((l) => l.playerId === line.playerId)!.shuttlePart,
      )
    }
    // แต่ยังนับไว้ว่าวันนี้ใช้ลูกไปทั้งหมดกี่ลูก
    expect(after.shuttlesInGames).toBe(3)
    expect(after.shuttlesUsed).toBe(6)
  })

  it("ลูกซ้อมยังนับเป็นต้นทุนของก๊วนอยู่ เพราะก๊วนจ่ายค่าลูกนั้นไปจริง", () => {
    const { session, roster } = makeSession({ shuttleCostReal: 100 })
    session.shuttlesExtra = 2
    const bill = computeBill(session, roster)
    expect(bill.total).toBe(500) // 5 ลูก × 100
  })

  it("ค่าอื่น ๆ หารเท่ากันทุกคน", () => {
    const { session, roster } = makeSession({ extraCost: 100 })
    const bill = computeBill(session, roster)
    expect(bill.lines.every((l) => l.extraPart === 20)).toBe(true)
  })

  it("ต้นทุนจริงคิดจากราคาลูกที่ซื้อมา ไม่ใช่อัตราที่เก็บต่อคน", () => {
    const { session, roster } = makeSession({ courtCost: 700, shuttleCostReal: 100 })
    const bill = computeBill(session, roster)
    // ต้นทุน = ค่าคอร์ต 700 + ลูก 3 ลูก × ราคาจริง 100 = 1,000
    expect(bill.total).toBe(1000)
    expect(bill.costTracked).toBe(true)
    expect(bill.balance).toBe(bill.billed - 1000)
  })

  it("ไม่กรอกต้นทุนก็บอกว่ายังคิดกำไรขาดทุนไม่ได้ ไม่ใช่เดาว่าต้นทุนเป็นศูนย์", () => {
    const { session, roster } = makeSession()
    const bill = computeBill(session, roster)
    expect(bill.costTracked).toBe(false)
    expect(bill.shuttleCost).toBe(0)
  })

  it("ค่าลูกไม่มีเศษสตางค์ ไม่ว่าจะมีลูกซ้อมกี่ลูกหรือคนในก๊วนกี่คน", () => {
    // 7 คน เป็นจำนวนที่หารไม่ลงตัวกับอะไรเลย — เดิมจะได้เศษทศนิยมยาว ๆ
    const { session, roster } = makeSession()
    for (const id of ["f", "g"]) {
      roster.set(id, { id, name: id, level: 4, createdAt: NOW })
      session.players.push({ ...session.players[0]!, playerId: id, gamesPlayed: 0 })
    }
    session.shuttlesExtra = 2

    const bill = computeBill(session, roster)
    for (const l of bill.lines) {
      expect(Number.isInteger(l.shuttlePart), `${l.name} = ${l.shuttlePart}`).toBe(true)
    }
  })

  it("ค่าลูกที่เก็บได้รวม = ผลรวมค่าลูกของทุกคน", () => {
    const { session, roster } = makeSession()
    const bill = computeBill(session, roster)
    // เกมแรก 4 คน × 50 = 200 · เกมสอง 4 คน × 25 = 100
    expect(bill.shuttleCharged).toBe(300)
  })
})

describe("โหมดหารเท่ากันทุกคน", () => {
  it("ทุกคนจ่ายเท่ากันจากต้นทุนจริงรวม", () => {
    const { session, roster } = makeSession({ mode: "equal", courtCost: 700, shuttleCostReal: 100 })
    const bill = computeBill(session, roster)
    // (ค่าคอร์ต 700 + ลูก 3 ลูก × 100) / 5 คน = 200
    expect(new Set(bill.lines.map((l) => l.amount)).size).toBe(1)
    expect(amountOf(bill, "a")).toBe(200)
    expect(amountOf(bill, "e")).toBe(200)
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
    expect(amountOf(bill, "a")).toBe(145) // 145 ลงตัวอยู่แล้ว
  })

  it("นับยอดที่จ่ายแล้วเฉพาะคนที่ติ๊กว่าจ่าย", () => {
    const { session, roster } = makeSession()
    session.players[0].paid = true // a
    const bill = computeBill(session, roster)
    expect(bill.collected).toBe(145)
    expect(bill.billed).toBeGreaterThan(bill.collected)
  })

  it("คนที่กลับบ้านแล้วยังอยู่ในบิล (เขาก็ใช้คอร์ตไปแล้ว)", () => {
    const { session, roster } = makeSession()
    session.players[4].status = "left"
    session.players[4].leftAt = NOW
    const bill = computeBill(session, roster)
    expect(bill.lines.length).toBe(5)
    expect(amountOf(bill, "e")).toBe(95) // 70 + ค่าลูกเกมที่ลงไว้ก่อนกลับ
  })
})
