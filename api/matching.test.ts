import { describe, expect, it } from "vitest"
import {
  type Level,
  type Match,
  type RosterPlayer,
  type Session,
  type SessionPlayer,
  DEFAULT_FEES,
  DEFAULT_SETTINGS,
} from "@shared/types"
import { forecastQueue, repeatPenalty, splitTeams, suggestMatch } from "./matching"

const NOW = 1_700_000_000_000

interface Spec {
  id: string
  /** ระดับมือ 1 = หน้าบ้าน … 7 = OPEN */
  level: Level
  /** รออยู่กี่นาที */
  wait: number
  games?: number
  status?: SessionPlayer["status"]
}

function makeSession(specs: Spec[], overrides: Partial<Session> = {}) {
  const roster = new Map<string, RosterPlayer>()
  const players: SessionPlayer[] = []

  for (const s of specs) {
    roster.set(s.id, { id: s.id, name: s.id, level: s.level, createdAt: NOW - 86_400_000 })
    const status = s.status ?? "queue"
    players.push({
      playerId: s.id,
      status,
      checkInAt: NOW - 3_600_000,
      queueSince: status === "queue" ? NOW - s.wait * 60_000 : null,
      gamesPlayed: s.games ?? 0,
      playedMs: 0,
      waitedMs: 0,
      longestWaitMs: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      boost: 0,
      paid: false,
    })
  }

  const session: Session = {
    id: "s_test",
    name: "test",
    date: "2026-09-22",
    venue: "",
    startAt: NOW - 7_200_000,
    status: "live",
    code: "TEST",
    courts: [
      { index: 0, name: "คอร์ต 1", currentMatchId: null },
      { index: 1, name: "คอร์ต 2", currentMatchId: null },
    ],
    players,
    planned: [],
    matches: [],
    events: [],
    settings: { ...DEFAULT_SETTINGS },
    fees: { ...DEFAULT_FEES },
    ...overrides,
  }
  return { session, roster }
}

function finishedMatch(teamA: string[], teamB: string[], endedAt: number): Match {
  return {
    id: `m_${endedAt}`,
    courtIndex: 0,
    type: "D",
    teamA,
    teamB,
    startedAt: endedAt - 900_000,
    endedAt,
    shuttles: 1,
    createdBy: "auto",
    levelGap: 0,
    maxWaitAtStart: 0,
  }
}

function ok(result: ReturnType<typeof suggestMatch>) {
  if (!result.ok) throw new Error(`คาดว่าจะจัดได้ แต่ได้: ${result.reason}`)
  return result.suggestion
}

describe("suggestMatch — ความเป็นธรรม (ไม่ดองคน)", () => {
  it("เลือก 4 คนที่รอนานที่สุดเมื่อทุกคนมือเท่ากัน", () => {
    const { session, roster } = makeSession([
      { id: "a", level: 4, wait: 20 },
      { id: "b", level: 4, wait: 15 },
      { id: "c", level: 4, wait: 12 },
      { id: "d", level: 4, wait: 9 },
      { id: "e", level: 4, wait: 1 },
      { id: "f", level: 4, wait: 0 },
    ])
    const s = ok(suggestMatch({ session, roster, now: NOW, type: "D" }))
    expect([...s.teamA, ...s.teamB].sort()).toEqual(["a", "b", "c", "d"])
  })

  it("คนที่รอเกินเพดาน 'ถูกดอง' ต้องได้ลง แม้มือจะห่างจากคนอื่น", () => {
    const { session, roster } = makeSession([
      // มือหน้าบ้าน รอ 25 นาที — ถูกดองชัดเจน
      { id: "dong", level: 1, wait: 25 },
      { id: "a", level: 5, wait: 3 },
      { id: "b", level: 5, wait: 2 },
      { id: "c", level: 5, wait: 2 },
      { id: "d", level: 5, wait: 1 },
      { id: "e", level: 5, wait: 1 },
    ])
    const s = ok(suggestMatch({ session, roster, now: NOW, type: "D" }))
    expect([...s.teamA, ...s.teamB]).toContain("dong")
    expect(s.reasons.some((r) => r.includes("บังคับลง"))).toBe(true)
  })

  it("คนที่เพิ่งจบเกม (รอ 0 นาที) ไม่แย่งคิวคนที่นั่งรออยู่", () => {
    const { session, roster } = makeSession([
      { id: "waited1", level: 4, wait: 11, games: 1 },
      { id: "waited2", level: 4, wait: 10, games: 1 },
      { id: "waited3", level: 4, wait: 9, games: 1 },
      { id: "waited4", level: 4, wait: 8, games: 1 },
      { id: "justOff1", level: 4, wait: 0, games: 3 },
      { id: "justOff2", level: 4, wait: 0, games: 3 },
    ])
    const picked = ok(suggestMatch({ session, roster, now: NOW, type: "D" }))
    const all = [...picked.teamA, ...picked.teamB]
    expect(all).not.toContain("justOff1")
    expect(all).not.toContain("justOff2")
  })

  it("คนลงน้อยกว่าคนอื่นได้แรงดันจาก gamesBehind", () => {
    const { session, roster } = makeSession([
      { id: "few", level: 4, wait: 5, games: 0 },
      { id: "many1", level: 4, wait: 6, games: 5 },
      { id: "many2", level: 4, wait: 6, games: 5 },
      { id: "many3", level: 4, wait: 6, games: 5 },
      { id: "many4", level: 4, wait: 6, games: 5 },
    ])
    const s = ok(suggestMatch({ session, roster, now: NOW, type: "D" }))
    // รอน้อยกว่า 1 นาที แต่ตามหลัง 5 เกม → ต้องได้ลง
    expect([...s.teamA, ...s.teamB]).toContain("few")
  })
})

describe("suggestMatch — ระดับมือใกล้เคียง", () => {
  it("ไม่จับมือหน้าบ้านไปเล่นกับมือ OPEN ถ้ามีตัวเลือกที่มือใกล้กัน", () => {
    const { session, roster } = makeSession([
      { id: "home1", level: 1, wait: 10 },
      { id: "home2", level: 1, wait: 9 },
      { id: "bg1", level: 2, wait: 8 },
      { id: "bg2", level: 2, wait: 7 },
      { id: "p1", level: 6, wait: 12 },
      { id: "p2", level: 6, wait: 11 },
      { id: "open1", level: 7, wait: 6 },
      { id: "open2", level: 7, wait: 5 },
    ])
    const s = ok(suggestMatch({ session, roster, now: NOW, type: "D" }))
    const levels = [...s.teamA, ...s.teamB].map((id) => roster.get(id)!.level)
    expect(Math.max(...levels) - Math.min(...levels)).toBeLessThanOrEqual(DEFAULT_SETTINGS.maxLevelGap)
  })

  it("ผ่อนเพดานระดับมือให้เองเมื่อคิวบางจนจัดไม่ได้", () => {
    const { session, roster } = makeSession([
      { id: "a", level: 1, wait: 10 },
      { id: "b", level: 3, wait: 9 },
      { id: "c", level: 5, wait: 8 },
      { id: "d", level: 7, wait: 7 },
    ])
    const s = ok(suggestMatch({ session, roster, now: NOW, type: "D" }))
    expect([...s.teamA, ...s.teamB].sort()).toEqual(["a", "b", "c", "d"])
    expect(s.reasons.some((r) => r.includes("ผ่อนเพดาน"))).toBe(true)
  })

  it("มือเท่ากันหมดจะบอกว่าเท่ากัน ไม่ใช่ห่างกัน 0 ขั้น", () => {
    const { session, roster } = makeSession([
      { id: "a", level: 5, wait: 9 },
      { id: "b", level: 5, wait: 8 },
      { id: "c", level: 5, wait: 7 },
      { id: "d", level: 5, wait: 6 },
    ])
    const s = ok(suggestMatch({ session, roster, now: NOW, type: "D" }))
    expect(s.levelGap).toBe(0)
    expect(s.reasons.some((r) => r.includes("มือเท่ากันหมด (S)"))).toBe(true)
  })
})

describe("suggestMatch — เงื่อนไขและกรณีคนไม่พอ", () => {
  it("บอกเหตุผลเมื่อคนไม่พอ ไม่ใช่โยน error", () => {
    const { session, roster } = makeSession([
      { id: "a", level: 4, wait: 5 },
      { id: "b", level: 4, wait: 5 },
      { id: "c", level: 4, wait: 5 },
    ])
    const r = suggestMatch({ session, roster, now: NOW, type: "D" })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.needed).toBe(4)
      expect(r.reason).toContain("ไม่พอ")
    }
  })

  it("เดี่ยวใช้ 2 คน", () => {
    const { session, roster } = makeSession([
      { id: "a", level: 4, wait: 9 },
      { id: "b", level: 4, wait: 8 },
      { id: "c", level: 4, wait: 1 },
    ])
    const s = ok(suggestMatch({ session, roster, now: NOW, type: "S" }))
    expect(s.teamA.length).toBe(1)
    expect(s.teamB.length).toBe(1)
    expect([...s.teamA, ...s.teamB].sort()).toEqual(["a", "b"])
  })

  it("auto: คิวถึง 4 คนจัดเป็นคู่ ถ้าเหลือ 2-3 คนจัดเดี่ยว", () => {
    const four = makeSession([
      { id: "a", level: 4, wait: 9 },
      { id: "b", level: 4, wait: 8 },
      { id: "c", level: 4, wait: 7 },
      { id: "d", level: 4, wait: 6 },
    ])
    expect(ok(suggestMatch({ ...four, now: NOW, type: "auto" })).type).toBe("D")

    const three = makeSession([
      { id: "a", level: 4, wait: 9 },
      { id: "b", level: 4, wait: 8 },
      { id: "c", level: 4, wait: 7 },
    ])
    expect(ok(suggestMatch({ ...three, now: NOW, type: "auto" })).type).toBe("S")
  })

  it("include = ปักหมุดให้ลงแน่นอน, exclude = ข้ามคนนั้น", () => {
    const { session, roster } = makeSession([
      { id: "a", level: 4, wait: 20 },
      { id: "b", level: 4, wait: 19 },
      { id: "c", level: 4, wait: 18 },
      { id: "d", level: 4, wait: 17 },
      { id: "pin", level: 4, wait: 0 },
      { id: "e", level: 4, wait: 2 },
    ])
    const s = ok(
      suggestMatch({ session, roster, now: NOW, type: "D", include: ["pin"], exclude: ["a"] }),
    )
    const all = [...s.teamA, ...s.teamB]
    expect(all).toContain("pin")
    expect(all).not.toContain("a")
  })

  it("ไม่เลือกคนที่ขอพักหรือกลับบ้านแล้ว", () => {
    const { session, roster } = makeSession([
      { id: "a", level: 4, wait: 9 },
      { id: "b", level: 4, wait: 8 },
      { id: "c", level: 4, wait: 7 },
      { id: "d", level: 4, wait: 6 },
      { id: "rest", level: 4, wait: 60, status: "resting" },
      { id: "gone", level: 4, wait: 60, status: "left" },
    ])
    const s = ok(suggestMatch({ session, roster, now: NOW, type: "D" }))
    expect([...s.teamA, ...s.teamB].sort()).toEqual(["a", "b", "c", "d"])
  })
})

describe("การไม่ซ้ำคู่เดิม", () => {
  it("เลี่ยงจับคู่เดิมที่เพิ่งเล่นด้วยกันเกมก่อน", () => {
    const { session, roster } = makeSession([
      { id: "a", level: 4, wait: 10 },
      { id: "b", level: 4, wait: 10 },
      { id: "c", level: 4, wait: 10 },
      { id: "d", level: 4, wait: 10 },
    ])
    session.matches = [finishedMatch(["a", "b"], ["c", "d"], NOW - 60_000)]
    const s = ok(suggestMatch({ session, roster, now: NOW, type: "D" }))
    const sameAsBefore =
      (s.teamA.includes("a") && s.teamA.includes("b")) || (s.teamB.includes("a") && s.teamB.includes("b"))
    expect(sameAsBefore).toBe(false)
  })

  it("repeatPenalty ให้โทษเกมที่เพิ่งเล่นมากกว่าเกมเก่า", () => {
    const { session } = makeSession([{ id: "a", level: 4, wait: 1 }])
    session.matches = [finishedMatch(["a", "b"], ["c", "d"], NOW - 60_000)]
    const fresh = repeatPenalty(session, ["a", "b"])
    session.matches = [
      finishedMatch(["a", "b"], ["c", "d"], NOW - 60_000),
      finishedMatch(["x", "y"], ["z", "w"], NOW - 50_000),
      finishedMatch(["x", "y"], ["z", "w"], NOW - 40_000),
      finishedMatch(["x", "y"], ["z", "w"], NOW - 30_000),
    ]
    const stale = repeatPenalty(session, ["a", "b"])
    expect(fresh).toBeGreaterThan(stale)
    expect(stale).toBeGreaterThan(0)
  })
})

describe("splitTeams — แบ่งฝั่งให้สูสี", () => {
  it("แบ่งให้ผลรวมระดับมือสองฝั่งต่างกันน้อยที่สุด", () => {
    const { session, roster } = makeSession([
      { id: "hi1", level: 6, wait: 1 },
      { id: "hi2", level: 6, wait: 1 },
      { id: "lo1", level: 2, wait: 1 },
      { id: "lo2", level: 2, wait: 1 },
    ])
    const split = splitTeams(["hi1", "hi2", "lo1", "lo2"], session, roster)
    expect(split.diff).toBe(0)
    // แต่ละฝั่งต้องมีมือสูง 1 + มือต่ำ 1
    for (const team of [split.teamA, split.teamB]) {
      expect(team.map((id) => roster.get(id)!.level).sort()).toEqual([2, 6])
    }
  })

  it("เดี่ยวแบ่งเป็นฝั่งละคน", () => {
    const { session, roster } = makeSession([
      { id: "a", level: 5, wait: 1 },
      { id: "b", level: 3, wait: 1 },
    ])
    const split = splitTeams(["a", "b"], session, roster)
    expect(split.teamA).toEqual(["a"])
    expect(split.teamB).toEqual(["b"])
    expect(split.diff).toBe(2)
  })
})

describe("forecastQueue — อีกกี่คิวถึงตา", () => {
  it("4 คนแรกได้คิวถัดไป คนที่ 5-8 รออีกรอบ", () => {
    const specs: Spec[] = Array.from({ length: 9 }, (_, i) => ({
      id: `p${i}`,
      level: 4 as Level,
      wait: 20 - i,
    }))
    const { session } = makeSession(specs)
    const f = forecastQueue(session, NOW)
    expect(f.ahead.get("p0")).toBe(0)
    expect(f.ahead.get("p3")).toBe(0)
    expect(f.ahead.get("p4")).toBe(1)
    expect(f.ahead.get("p8")).toBe(2)
  })

  it("คอร์ตว่างอยู่ → คิวหน้าได้ลงทันที (eta 0 นาที)", () => {
    const { session } = makeSession([
      { id: "a", level: 4, wait: 9 },
      { id: "b", level: 4, wait: 8 },
      { id: "c", level: 4, wait: 7 },
      { id: "d", level: 4, wait: 6 },
    ])
    const f = forecastQueue(session, NOW)
    expect(f.eta.get("a")).toBe(0)
  })

  it("คอร์ตเต็ม → ประเมินจากเวลาที่เกมเดินไปแล้ว", () => {
    const { session } = makeSession([
      { id: "a", level: 4, wait: 9 },
      { id: "b", level: 4, wait: 8 },
      { id: "c", level: 4, wait: 7 },
      { id: "d", level: 4, wait: 6 },
    ])
    const m1 = finishedMatch(["x1", "x2"], ["x3", "x4"], NOW)
    m1.endedAt = undefined
    const played = 10
    m1.startedAt = NOW - played * 60_000 // เล่นไปแล้ว 10 นาที
    const m2 = { ...m1, id: "m_other", courtIndex: 1, startedAt: NOW - 2 * 60_000 }
    session.matches = [m1, m2]
    session.courts[0].currentMatchId = m1.id
    session.courts[1].currentMatchId = m2.id
    const f = forecastQueue(session, NOW)
    // คอร์ตที่ใกล้จบที่สุด = เป้าเวลาต่อเกม ลบเวลาที่เล่นไปแล้ว
    expect(f.eta.get("a")).toBe(DEFAULT_SETTINGS.targetGameMinutes - played)
  })
})

describe("ตัวเลือกสำรอง และปุ่มสุ่มใหม่", () => {
  it("คืนตัวเลือกสำรองที่คนไม่ซ้ำชุดกับตัวเลือกหลัก", () => {
    const specs: Spec[] = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`,
      level: 4 as Level,
      wait: 10 - i * 0.5,
    }))
    const { session, roster } = makeSession(specs)
    const r = suggestMatch({ session, roster, now: NOW, type: "D" })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.alternatives.length).toBeGreaterThan(0)
    const key = (s: { teamA: string[]; teamB: string[] }) => [...s.teamA, ...s.teamB].sort().join("|")
    const seen = new Set([key(r.suggestion)])
    for (const alt of r.alternatives) {
      expect(seen.has(key(alt))).toBe(false)
      seen.add(key(alt))
    }
  })

  it("สุ่มใหม่ (jitter) ยังบังคับคนที่ถูกดองลงเหมือนเดิม", () => {
    const { session, roster } = makeSession([
      { id: "dong", level: 4, wait: 30 },
      ...Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, level: 4 as Level, wait: 2 })),
    ])
    for (let round = 0; round < 25; round++) {
      const s = ok(suggestMatch({ session, roster, now: NOW, type: "D", jitter: 3 }))
      expect([...s.teamA, ...s.teamB]).toContain("dong")
    }
  })

  it("สุ่มใหม่หลายครั้งได้ชุดที่ต่างกันบ้าง (ไม่ซ้ำเดิมทุกครั้ง)", () => {
    const specs: Spec[] = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      level: 4 as Level,
      wait: 5,
    }))
    const { session, roster } = makeSession(specs)
    const seen = new Set<string>()
    for (let round = 0; round < 30; round++) {
      const s = ok(suggestMatch({ session, roster, now: NOW, type: "D", jitter: 5 }))
      seen.add([...s.teamA, ...s.teamB].sort().join("|"))
    }
    expect(seen.size).toBeGreaterThan(1)
  })
})
