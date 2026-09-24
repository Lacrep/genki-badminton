import { describe, expect, it } from "vitest"
import { type Match, DEFAULT_SETTINGS, scoreLabel, setsWon, winnerFromSets } from "./types"

const base: Match = {
  id: "m1",
  courtIndex: 0,
  type: "D",
  teamA: ["a", "b"],
  teamB: ["c", "d"],
  startedAt: 0,
  shuttles: 1,
  createdBy: "auto",
  levelGap: 0,
  maxWaitAtStart: 0,
}

describe("คะแนนแบบ 21 แต้ม สองเซ็ต", () => {
  it("ชนะรวด 2 เซ็ต", () => {
    const sets = [
      { a: 21, b: 15 },
      { a: 21, b: 18 },
    ]
    expect(setsWon(sets)).toEqual({ a: 2, b: 0 })
    expect(winnerFromSets(sets)).toBe("A")
  })

  it("แบ่งกันคนละเซ็ต → ยังไม่มีผู้ชนะจนกว่าจะมีเซ็ตที่ 3", () => {
    const tied = [
      { a: 21, b: 15 },
      { a: 19, b: 21 },
    ]
    expect(winnerFromSets(tied)).toBeNull()
    expect(winnerFromSets([...tied, { a: 18, b: 21 }])).toBe("B")
  })

  it("เซ็ตเดียวก็ตัดสินได้ (เผื่อเล่นเซ็ตเดียวจบ)", () => {
    expect(winnerFromSets([{ a: 21, b: 12 }])).toBe("A")
  })

  it("แสดงคะแนนเป็นข้อความอ่านง่าย", () => {
    expect(
      scoreLabel({
        ...base,
        sets: [
          { a: 21, b: 15 },
          { a: 19, b: 21 },
          { a: 21, b: 17 },
        ],
      }),
    ).toBe("21-15, 19-21, 21-17")
  })

  it("อ่านคะแนนของข้อมูลรุ่นเก่า (เซ็ตเดียว) ได้", () => {
    expect(scoreLabel({ ...base, scoreA: 21, scoreB: 18 })).toBe("21-18")
  })

  it("ไม่ได้จดคะแนน → ไม่มีข้อความ", () => {
    expect(scoreLabel(base)).toBe("")
  })

  it("เป้าเวลาต่อเกมตั้งไว้เผื่อเล่น 2 เซ็ต", () => {
    expect(DEFAULT_SETTINGS.targetGameMinutes).toBeGreaterThanOrEqual(18)
  })
})
