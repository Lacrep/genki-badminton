import { describe, expect, it } from "vitest"
import {
  type Fees,
  type RosterPlayer,
  type Session,
  type SessionPlayer,
  DEFAULT_FEES,
  DEFAULT_SETTINGS,
} from "@shared/types"
import { computeBill } from "./store"

const NOW = 1_700_000_000_000

/** ก๊วนสมมุติ: ค่าคอร์ต 600 + ลูก 4 ลูก × 90 = 960 บาท */
function makeSession(
  people: { id: string; games: number; member?: boolean; paid?: boolean }[],
  fees: Partial<Fees> = {},
) {
  const roster = new Map<string, RosterPlayer>()
  const players: SessionPlayer[] = []

  for (const p of people) {
    roster.set(p.id, {
      id: p.id,
      name: p.id,
      gender: "m",
      level: 4,
      member: p.member ?? true,
      createdAt: NOW,
    })
    players.push({
      playerId: p.id,
      status: "queue",
      checkInAt: NOW,
      queueSince: NOW,
      gamesPlayed: p.games,
      playedMs: p.games * 13 * 60_000,
      waitedMs: 0,
      longestWaitMs: 0,
      wins: 0,
      losses: 0,
      boost: 0,
      paid: p.paid ?? false,
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
    matches: [
      {
        id: "m1",
        courtIndex: 0,
        type: "D",
        teamA: [people[0]?.id ?? "a"],
        teamB: [people[1]?.id ?? "b"],
        startedAt: NOW - 900_000,
        endedAt: NOW,
        shuttles: 4,
        createdBy: "auto",
        levelGap: 0,
        maxWaitAtStart: 0,
      },
    ],
    events: [],
    settings: { ...DEFAULT_SETTINGS },
    fees: { ...DEFAULT_FEES, courtCost: 600, shuttlePrice: 90, roundTo: 1, ...fees },
    shuttlesExtra: 0,
  }
  return { session, roster }
}

describe("computeBill — ต้นทุน", () => {
  it("รวมค่าคอร์ต + ค่าลูกตามที่ใช้จริง + ค่าอื่น ๆ", () => {
    const { session, roster } = makeSession([{ id: "a", games: 1 }], { extraCost: 40 })
    const bill = computeBill(session, roster)
    expect(bill.shuttlesUsed).toBe(4)
    expect(bill.shuttleCost).toBe(360)
    expect(bill.total).toBe(600 + 360 + 40)
  })

  it("นับลูกที่ใช้นอกเกมด้วย", () => {
    const { session, roster } = makeSession([{ id: "a", games: 1 }])
    session.shuttlesExtra = 2
    const bill = computeBill(session, roster)
    expect(bill.shuttlesUsed).toBe(6)
    expect(bill.total).toBe(600 + 540)
  })
})

describe("computeBill — วิธีหารเงิน", () => {
  const people = [
    { id: "a", games: 6 },
    { id: "b", games: 4 },
    { id: "c", games: 2 },
    { id: "d", games: 0 },
  ]

  it("equal: ทุกคนจ่ายเท่ากัน", () => {
    const { session, roster } = makeSession(people, { mode: "equal" })
    const bill = computeBill(session, roster)
    expect(new Set(bill.lines.map((l) => l.amount)).size).toBe(1)
    expect(bill.lines[0].amount).toBe(960 / 4)
  })

  it("byGames: คนไม่ได้ลงเลยไม่ต้องจ่าย, คนลงเยอะจ่ายมากสุด", () => {
    const { session, roster } = makeSession(people, { mode: "byGames" })
    const bill = computeBill(session, roster)
    const amt = (id: string) => bill.lines.find((l) => l.playerId === id)!.amount
    expect(amt("d")).toBe(0)
    expect(amt("a")).toBeGreaterThan(amt("b"))
    expect(amt("b")).toBeGreaterThan(amt("c"))
    // 12 เกมรวม → คนละ 80 บาทต่อเกม
    expect(amt("a")).toBe(480)
  })

  it("split: ค่าคอร์ตหารเท่า + ค่าลูกตามเกม", () => {
    const { session, roster } = makeSession(people, { mode: "split" })
    const bill = computeBill(session, roster)
    const amt = (id: string) => bill.lines.find((l) => l.playerId === id)!.amount
    // ค่าคอร์ต 600/4 = 150 ทุกคน + ค่าลูก 360 หารตาม 12 เกม = 30/เกม
    expect(amt("d")).toBe(150)
    expect(amt("c")).toBe(150 + 60)
    expect(amt("a")).toBe(150 + 180)
  })

  it("flat: เก็บตามเรทสมาชิก/ขาจร แล้วบอกว่าขาดหรือเกิน", () => {
    const { session, roster } = makeSession(
      [
        { id: "a", games: 3, member: true },
        { id: "b", games: 3, member: false },
      ],
      { mode: "flat", memberFee: 100, guestFee: 150 },
    )
    const bill = computeBill(session, roster)
    const amt = (id: string) => bill.lines.find((l) => l.playerId === id)!.amount
    expect(amt("a")).toBe(100)
    expect(amt("b")).toBe(150)
    // เก็บได้ 250 แต่ต้นทุน 960 → ขาด 710
    expect(bill.balance).toBe(250 - 960)
  })
})

describe("computeBill — การปัดเศษและยอดที่เก็บได้", () => {
  it("ปัดขึ้นทีละ 5 บาท เก็บเงินหน้างานง่าย", () => {
    const { session, roster } = makeSession(
      [
        { id: "a", games: 1 },
        { id: "b", games: 1 },
        { id: "c", games: 1 },
      ],
      { mode: "equal", roundTo: 5 },
    )
    const bill = computeBill(session, roster)
    // 960 / 3 = 320 ลงตัวอยู่แล้ว
    expect(bill.lines.every((l) => l.amount % 5 === 0)).toBe(true)
  })

  it("ปัดขึ้นแล้วต้องเก็บได้ไม่น้อยกว่าต้นทุน", () => {
    const { session, roster } = makeSession(
      [
        { id: "a", games: 1 },
        { id: "b", games: 1 },
        { id: "c", games: 1 },
        { id: "d", games: 1 },
        { id: "e", games: 1 },
        { id: "f", games: 1 },
        { id: "g", games: 1 },
      ],
      { mode: "equal", roundTo: 5 },
    )
    const bill = computeBill(session, roster)
    const billed = bill.lines.reduce((n, l) => n + l.amount, 0)
    expect(billed).toBeGreaterThanOrEqual(bill.total)
    expect(bill.balance).toBe(billed - bill.total)
  })

  it("นับยอดที่จ่ายแล้วเฉพาะคนที่ติ๊กว่าจ่าย", () => {
    const { session, roster } = makeSession(
      [
        { id: "a", games: 1, paid: true },
        { id: "b", games: 1, paid: false },
      ],
      { mode: "equal" },
    )
    const bill = computeBill(session, roster)
    expect(bill.collected).toBe(480)
  })

  it("คนที่กลับบ้านแล้วยังอยู่ในบิล (เขาก็ใช้คอร์ตไปแล้ว)", () => {
    const { session, roster } = makeSession(
      [
        { id: "a", games: 2 },
        { id: "b", games: 2 },
      ],
      { mode: "equal" },
    )
    session.players[1].status = "left"
    session.players[1].leftAt = NOW
    const bill = computeBill(session, roster)
    expect(bill.lines.length).toBe(2)
  })
})
