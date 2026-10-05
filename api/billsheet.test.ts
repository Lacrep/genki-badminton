import zlib from "node:zlib"
import { describe, expect, it } from "vitest"
import {
  type Match,
  type RosterPlayer,
  type Session,
  type SessionPlayer,
  DEFAULT_FEES,
  DEFAULT_SETTINGS,
} from "@shared/types"
import { computeBill } from "./store"
import { billWorkbook } from "./billsheet"
import { buildXlsx, colName } from "./xlsx"

const NOW = 1_700_000_000_000

/** แกะ zip ด้วยมือ — เทสต์จะได้ไม่ต้องลงไลบรารีอ่าน Excel เพิ่ม */
function unzip(file: Buffer): Map<string, string> {
  const out = new Map<string, string>()
  let i = 0
  while (i + 4 <= file.length && file.readUInt32LE(i) === 0x04034b50) {
    const method = file.readUInt16LE(i + 8)
    const compSize = file.readUInt32LE(i + 18)
    const nameLen = file.readUInt16LE(i + 26)
    const extraLen = file.readUInt16LE(i + 28)
    const name = file.subarray(i + 30, i + 30 + nameLen).toString("utf8")
    const start = i + 30 + nameLen + extraLen
    const raw = file.subarray(start, start + compSize)
    out.set(name, (method === 8 ? zlib.inflateRawSync(raw) : raw).toString("utf8"))
    i = start + compSize
  }
  return out
}

/** ข้อความทั้งหมดในชีตหนึ่ง (ตามลำดับที่เขียนลงไฟล์) */
function textsOf(sheets: Map<string, string>, index: number): string[] {
  const xml = sheets.get(`xl/worksheets/sheet${index}.xml`) ?? ""
  return [...xml.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => m[1]!)
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
}

const unescapeXml = (value: string) => value.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITIES[e]!)

function numbersOf(sheets: Map<string, string>, index: number): number[] {
  const xml = sheets.get(`xl/worksheets/sheet${index}.xml`) ?? ""
  return [...xml.matchAll(/<v>([-\d.]+)<\/v>/g)].map((m) => Number(m[1]))
}

function match(id: string, ids: string[], shuttles: number): Match {
  return {
    id,
    courtIndex: 0,
    type: "D",
    teamA: ids.slice(0, 2),
    teamB: ids.slice(2, 4),
    startedAt: NOW - 900_000,
    endedAt: NOW,
    sets: [
      { a: 21, b: 18 },
      { a: 21, b: 15 },
    ],
    winner: "A",
    shuttles,
    createdBy: "auto",
    levelGap: 0,
    maxWaitAtStart: 0,
  }
}

/** ก๊วน 4 คน 2 เกม — a กับ b จ่ายแล้ว, c กับ d ยังค้าง */
function makeSession(names: string[] = ["ต้น", "บอย", "เอก", "แนน"]) {
  const ids = ["a", "b", "c", "d"]
  const roster = new Map<string, RosterPlayer>()
  const players: SessionPlayer[] = []

  ids.forEach((id, i) => {
    roster.set(id, { id, name: names[i]!, level: 4, createdAt: NOW })
    players.push({
      playerId: id,
      status: "queue",
      checkInAt: NOW,
      queueSince: NOW,
      gamesPlayed: 2,
      playedMs: 0,
      waitedMs: 0,
      longestWaitMs: 0,
      wins: 1,
      losses: 1,
      boost: 0,
      paid: i < 2,
      paidAt: i < 2 ? NOW : undefined,
    })
  })

  const session: Session = {
    id: "s_sheet",
    name: "ก๊วนทดสอบไฟล์",
    date: "2026-10-03",
    venue: "The 18 Badminton Club",
    startAt: NOW,
    endAt: NOW + 3 * 3600_000,
    status: "ended",
    code: "XLSX",
    courts: [{ index: 0, name: "คอร์ต 1", currentMatchId: null }],
    players,
    matches: [match("m1", ids, 2), match("m2", ids, 1)],
    events: [],
    settings: { ...DEFAULT_SETTINGS },
    fees: { ...DEFAULT_FEES, roundTo: 1 },
    shuttlesExtra: 0,
  }
  return { session, roster }
}

function workbookOf(...args: Parameters<typeof makeSession>) {
  const { session, roster } = makeSession(...args)
  const bill = computeBill(session, roster)
  return { sheets: unzip(billWorkbook(session, bill, roster)), bill, session }
}

describe("ไฟล์ .xlsx ที่ประกอบเอง", () => {
  it("เป็น zip ที่มีชิ้นส่วนครบตามที่ Excel ต้องการ", () => {
    const { sheets } = workbookOf()
    for (const part of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet4.xml",
    ]) {
      expect(sheets.has(part), part).toBe(true)
    }
  })

  it("ทุกชีตมี relationship ของตัวเอง และ styles ต่อท้าย", () => {
    const { sheets } = workbookOf()
    const rels = sheets.get("xl/_rels/workbook.xml.rels")!
    for (let i = 1; i <= 4; i++) {
      expect(rels).toContain(`Target="worksheets/sheet${i}.xml"`)
    }
    expect(rels).toContain(`Id="rId5"`)
    expect(rels).toContain(`Target="styles.xml"`)
  })

  it("ชื่อที่มีอักขระพิเศษถูก escape แล้วอ่านกลับได้ตรงเดิม", () => {
    const names = ["เอ & บี", "<ซี>", 'ดี"อี"', "เอฟ'จี"]
    const { sheets } = workbookOf(names)
    const xml = sheets.get("xl/worksheets/sheet1.xml")!

    // อักขระดิบต้องไม่หลุดลงไฟล์ (ไม่งั้น Excel ฟ้องว่าไฟล์เสีย)
    expect(xml).toContain("เอ &amp; บี")
    expect(xml).toContain("&lt;ซี&gt;")

    // และต้องถอดกลับมาได้เป็นชื่อเดิมเป๊ะ
    const texts = textsOf(sheets, 1).map(unescapeXml)
    for (const name of names) expect(texts).toContain(name)
  })

  it("แปลงเลขคอลัมน์เป็นตัวอักษรแบบ Excel", () => {
    expect(colName(1)).toBe("A")
    expect(colName(26)).toBe("Z")
    expect(colName(27)).toBe("AA")
    expect(colName(52)).toBe("AZ")
  })

  it("ชื่อชีตที่ยาวเกินหรือมีอักขระต้องห้ามถูกตัดให้ Excel เปิดได้", () => {
    const file = unzip(
      buildXlsx([{ name: "ชีต/ที่[มี]อักขระ*ต้องห้าม:เยอะ?มาก\\จนยาวเกินสามสิบเอ็ดตัวอักษรแน่นอน", columns: [], rows: [] }]),
    )
    const name = /name="([^"]*)"/.exec(file.get("xl/workbook.xml")!)![1]!
    expect(name.length).toBeLessThanOrEqual(31)
    expect(name).not.toMatch(/[[\]:*?/\\]/)
  })
})

describe("ชีตค่าก๊วนรายคน", () => {
  it("มีครบทุกคนที่เช็คอิน พร้อมสถานะจ่าย/ยังไม่จ่าย", () => {
    const { sheets } = workbookOf()
    const texts = textsOf(sheets, 1)
    for (const name of ["ต้น", "บอย", "เอก", "แนน"]) expect(texts).toContain(name)
    expect(texts.filter((t) => t === "จ่ายแล้ว")).toHaveLength(2)
    expect(texts.filter((t) => t === "ยังไม่จ่าย")).toHaveLength(2)
  })

  it("ยอดรวมท้ายตารางตรงกับยอดที่เรียกเก็บจริง", () => {
    const { sheets, bill } = workbookOf()
    expect(numbersOf(sheets, 1)).toContain(bill.billed)
  })

  it("แถวรวมใส่สูตร SUM ไว้ด้วย เผื่อหัวก๊วนแก้ตัวเลขเองในไฟล์", () => {
    const { sheets, session } = workbookOf()
    const xml = sheets.get("xl/worksheets/sheet1.xml")!
    const last = session.players.length + 1
    // M = คอลัมน์ "รวมต้องจ่าย"
    expect(xml).toContain(`<f>SUM(M2:M${last})</f>`)
  })

  it("แยกค่าลูกในเกมกับค่าลูกนอกเกมเป็นคนละคอลัมน์", () => {
    const { session, roster } = makeSession()
    session.shuttlesExtra = 2
    const sheets = unzip(billWorkbook(session, computeBill(session, roster), roster))
    const texts = textsOf(sheets, 1)
    expect(texts).toContain("ค่าลูกในเกม")
    expect(texts).toContain("ค่าลูกนอกเกม")
  })

  it("ตรึงหัวตารางและใส่ปุ่มกรองให้", () => {
    const xml = workbookOf().sheets.get("xl/worksheets/sheet1.xml")!
    expect(xml).toContain('state="frozen"')
    expect(xml).toContain("<autoFilter")
  })
})

describe("ชีตยังไม่จ่าย", () => {
  it("มีเฉพาะคนที่ยังค้าง พร้อมยอดรวมที่ต้องตามเก็บ", () => {
    const { sheets, bill } = workbookOf()
    const texts = textsOf(sheets, 2)
    expect(texts).toContain("เอก")
    expect(texts).toContain("แนน")
    expect(texts).not.toContain("ต้น")
    expect(numbersOf(sheets, 2)).toContain(bill.billed - bill.collected)
  })

  it("เก็บครบแล้วก็ยังเปิดไฟล์ได้ และบอกว่าครบ", () => {
    const { session, roster } = makeSession()
    for (const p of session.players) p.paid = true
    const sheets = unzip(billWorkbook(session, computeBill(session, roster), roster))
    expect(textsOf(sheets, 2)).toContain("เก็บครบทุกคนแล้ว")
  })
})

describe("ชีตรายเกม", () => {
  it("แจกแจงค่าลูกของแต่ละเกมว่าคนละเท่าไร และก๊วนเก็บได้เท่าไร", () => {
    const { sheets } = workbookOf()
    const numbers = numbersOf(sheets, 3)
    // เกมแรก 2 ลูก → คนละ 50 · 4 คน = เก็บได้ 200
    expect(numbers).toContain(50)
    expect(numbers).toContain(200)
    // เกมสอง 1 ลูก → คนละ 25 · 4 คน = เก็บได้ 100
    expect(numbers).toContain(25)
    expect(numbers).toContain(100)
  })

  it("บันทึกคะแนนครบทุกเซ็ต", () => {
    const texts = textsOf(workbookOf().sheets, 3)
    expect(texts).toContain("21-18")
    expect(texts).toContain("21-15")
  })
})

describe("ชีตสรุปก๊วน", () => {
  it("บอกยอดเรียกเก็บ เก็บได้แล้ว และค้างอยู่", () => {
    const { sheets, bill } = workbookOf()
    const texts = textsOf(sheets, 4)
    const numbers = numbersOf(sheets, 4)
    expect(texts).toContain("ยอดเรียกเก็บรวม")
    expect(texts).toContain("เก็บได้แล้ว")
    expect(texts).toContain("ยังค้างอยู่")
    expect(numbers).toContain(bill.billed)
    expect(numbers).toContain(bill.collected)
  })

  it("แยกลูกที่ใช้ในเกมกับลูกที่ใช้นอกเกมให้เห็น", () => {
    const { session, roster } = makeSession()
    session.shuttlesExtra = 2
    const sheets = unzip(billWorkbook(session, computeBill(session, roster), roster))
    const texts = textsOf(sheets, 4)
    expect(texts).toContain("ลูกที่ใช้ในเกม")
    expect(texts).toContain("ลูกที่ใช้นอกเกม (หารเท่ากัน)")
    expect(texts).toContain("ค่าลูกที่เก็บจากลูกก๊วนรวม")
  })

  it("ไม่กรอกต้นทุนก็บอกตรง ๆ ว่าคิดกำไรขาดทุนไม่ได้", () => {
    const texts = textsOf(workbookOf().sheets, 4)
    expect(texts).toContain("ยังไม่ได้กรอกต้นทุน")
    expect(texts).toContain("คิดไม่ได้ ต้องกรอกต้นทุนก่อน")
  })
})

describe("ก๊วนที่ยังไม่มีอะไรเลย", () => {
  it("ยังออกไฟล์ได้ ไม่พัง", () => {
    const { session, roster } = makeSession()
    session.players = []
    session.matches = []
    const file = billWorkbook(session, computeBill(session, roster), roster)
    const sheets = unzip(file)
    expect(sheets.size).toBeGreaterThan(5)
    expect(textsOf(sheets, 1)).toContain("ชื่อ")
  })
})
