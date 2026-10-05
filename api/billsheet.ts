/**
 * สมุดบัญชีก๊วนหนึ่งครั้ง → ไฟล์ Excel
 *
 * เก็บเงินเสร็จแล้วหัวก๊วนต้องตอบได้ว่า "ใครจ่ายแล้ว ใครยังค้าง และยอดนี้มาจากไหน"
 * ไฟล์จึงแยกเป็น 4 ชีต: ยอดรายคน · คนที่ยังค้าง · ที่มาของค่าลูกรายเกม · สรุปทั้งก๊วน
 */

import {
  type Bill,
  type RosterPlayer,
  type Session,
  displayName,
  levelInfo,
  scoreLabel,
  thaiTime,
  thaiWeekday,
} from "@shared/types"
import { CLUB } from "@shared/club"
import { type Cell, type SheetSpec, buildXlsx, colName } from "./xlsx"

const round2 = (v: number) => Math.round(v * 100) / 100

function payStatus(paid: boolean): string {
  return paid ? "จ่ายแล้ว" : "ยังไม่จ่าย"
}

/** แถวรวมท้ายตาราง — ใส่สูตร SUM จริงไว้ด้วย เผื่อหัวก๊วนแก้ตัวเลขในไฟล์เอง */
function totalRow(label: string, columns: number, sums: Record<number, number>, rowCount: number): Cell[] {
  const row: Cell[] = new Array(columns).fill(null)
  row[0] = { v: label, style: "bold" }
  for (const [indexText, value] of Object.entries(sums)) {
    const index = Number(indexText)
    const letter = colName(index + 1)
    row[index] = rowCount
      ? { v: round2(value), style: "moneyBold", formula: `SUM(${letter}2:${letter}${rowCount + 1})` }
      : { v: 0, style: "moneyBold" }
  }
  return row
}

export function billWorkbook(session: Session, bill: Bill, roster: Map<string, RosterPlayer>): Buffer {
  const nameOf = (playerId: string) => {
    const player = roster.get(playerId)
    return player ? displayName(player) : playerId
  }
  const byId = new Map(session.players.map((sp) => [sp.playerId, sp]))
  const endAt = session.endAt ?? Date.now()
  const finished = session.matches.filter((m) => m.endedAt)

  // ── ชีต 1: ยอดรายคน ────────────────────────────────────────────────────────
  const peopleRows: Cell[][] = bill.lines.map((line, i) => {
    const sp = byId.get(line.playerId)
    const player = roster.get(line.playerId)
    return [
      { v: i + 1, style: "int" },
      line.name,
      player ? levelInfo(player.level).code : "",
      sp ? thaiTime(sp.checkInAt) : "",
      sp?.leftAt ? thaiTime(sp.leftAt) : "",
      { v: line.games, style: "int" },
      { v: sp?.wins ?? 0, style: "int" },
      { v: sp?.losses ?? 0, style: "int" },
      { v: line.courtPart, style: "money" },
      { v: round2(line.shuttlePart - line.looseShuttlePart), style: "money" },
      { v: line.looseShuttlePart, style: "money" },
      { v: line.extraPart, style: "money" },
      { v: line.amount, style: "moneyBold" },
      payStatus(line.paid),
      sp?.paidAt ? thaiTime(sp.paidAt) : "",
    ]
  })

  const people: SheetSpec = {
    name: "ค่าก๊วนรายคน",
    columns: [
      { header: "#", width: 5 },
      { header: "ชื่อ", width: 18 },
      { header: "ระดับมือ", width: 10 },
      { header: "เช็คอิน", width: 9 },
      { header: "กลับ", width: 9 },
      { header: "เกมที่ลง", width: 9 },
      { header: "ชนะ", width: 7 },
      { header: "แพ้", width: 7 },
      { header: "ค่าสนาม", width: 11 },
      { header: "ค่าลูกในเกม", width: 12 },
      { header: "ค่าลูกนอกเกม", width: 13 },
      { header: "อื่น ๆ", width: 12 },
      { header: "รวมต้องจ่าย", width: 13 },
      { header: "สถานะ", width: 12 },
      { header: "จ่ายเมื่อ", width: 10 },
    ],
    rows: [
      ...peopleRows,
      totalRow(
        "รวมทุกคน",
        15,
        {
          8: bill.lines.reduce((s, l) => s + l.courtPart, 0),
          9: bill.lines.reduce((s, l) => s + (l.shuttlePart - l.looseShuttlePart), 0),
          10: bill.lines.reduce((s, l) => s + l.looseShuttlePart, 0),
          11: bill.lines.reduce((s, l) => s + l.extraPart, 0),
          12: bill.billed,
        },
        peopleRows.length,
      ),
    ],
  }

  // ── ชีต 2: คนที่ยังค้าง ────────────────────────────────────────────────────
  const unpaid = bill.lines.filter((l) => !l.paid)
  const unpaidRows: Cell[][] = unpaid.map((line, i) => {
    const player = roster.get(line.playerId)
    return [
      { v: i + 1, style: "int" },
      line.name,
      player ? levelInfo(player.level).code : "",
      { v: line.games, style: "int" },
      { v: line.amount, style: "moneyBold" },
      player?.note ?? "",
    ]
  })

  const chase: SheetSpec = {
    name: "ยังไม่จ่าย",
    columns: [
      { header: "#", width: 5 },
      { header: "ชื่อ", width: 18 },
      { header: "ระดับมือ", width: 10 },
      { header: "เกมที่ลง", width: 9 },
      { header: "ยอดค้าง", width: 13 },
      { header: "โน้ต", width: 30 },
    ],
    rows: unpaidRows.length
      ? [
          ...unpaidRows,
          totalRow("รวมค้างอยู่", 6, { 4: bill.billed - bill.collected }, unpaidRows.length),
        ]
      : [[null, { v: "เก็บครบทุกคนแล้ว", style: "bold" }]],
    filter: unpaidRows.length > 0,
  }

  // ── ชีต 3: ที่มาของค่าลูก (รายเกม) ─────────────────────────────────────────
  const matchRows: Cell[][] = session.matches.map((m, i) => {
    const sets = m.sets ?? []
    const head = [...m.teamA, ...m.teamB].length
    const perHead = m.shuttles * session.fees.shuttlePrice
    const collected = perHead * head
    return [
      { v: i + 1, style: "int" },
      session.courts[m.courtIndex]?.name ?? `คอร์ต ${m.courtIndex + 1}`,
      m.type === "D" ? "คู่" : "เดี่ยว",
      thaiTime(m.startedAt),
      m.endedAt ? thaiTime(m.endedAt) : "ยังไม่จบ",
      m.endedAt ? { v: Math.round((m.endedAt - m.startedAt) / 60_000), style: "int" as const } : null,
      m.teamA.map(nameOf).join(" + "),
      m.teamB.map(nameOf).join(" + "),
      sets[0] ? `${sets[0].a}-${sets[0].b}` : scoreLabel(m),
      sets[1] ? `${sets[1].a}-${sets[1].b}` : "",
      sets[2] ? `${sets[2].a}-${sets[2].b}` : "",
      m.winner ? `ทีม ${m.winner}` : "",
      { v: m.shuttles, style: "int" },
      { v: round2(perHead), style: "money" },
      { v: round2(collected), style: "money" },
    ]
  })

  const matches: SheetSpec = {
    name: "รายเกม",
    columns: [
      { header: "เกมที่", width: 7 },
      { header: "คอร์ต", width: 12 },
      { header: "ประเภท", width: 8 },
      { header: "เริ่ม", width: 8 },
      { header: "จบ", width: 9 },
      { header: "นาที", width: 7 },
      { header: "ทีม A", width: 26 },
      { header: "ทีม B", width: 26 },
      { header: "เซ็ต 1", width: 8 },
      { header: "เซ็ต 2", width: 8 },
      { header: "เซ็ต 3", width: 8 },
      { header: "ผู้ชนะ", width: 9 },
      { header: "ลูกที่ใช้", width: 9 },
      { header: "ค่าลูก คนละ", width: 12 },
      { header: "เก็บได้เกมนี้", width: 12 },
    ],
    rows: matchRows,
  }

  // ── ชีต 4: สรุปทั้งก๊วน ────────────────────────────────────────────────────
  const money = (v: number): Cell => ({ v: round2(v), style: "money" })
  const count = (v: number): Cell => ({ v, style: "int" })

  const summaryRows: Cell[][] = [
    ["ชื่อก๊วน", session.name],
    ["วันที่", `${thaiWeekday(session.startAt)} ${session.date}`],
    ["สถานที่", session.venue || CLUB.venue],
    ["เวลา", `${thaiTime(session.startAt)} – ${thaiTime(endAt)}`],
    ["สถานะ", session.status === "ended" ? "ปิดก๊วนแล้ว" : "ยังเล่นอยู่"],
    [null, null],
    [{ v: "วิธีคิดเงิน", style: "bold" }, null],
    [
      "โหมด",
      session.fees.mode === "club"
        ? "ระบบก๊วน (ค่าสนามต่อหัว + ค่าลูกคนละเท่ากันต่อลูก เฉพาะเกมที่ลง)"
        : "หารเท่ากันทุกคน",
    ],
    ["ค่าสนามต่อหัว", money(session.fees.courtFeePerHead)],
    ["ค่าลูก เก็บคนละ (ต่อลูก)", money(session.fees.shuttlePrice)],
    ["ปัดเศษขึ้นทีละ", money(session.fees.roundTo)],
    ["ราคาลูกที่ซื้อมาจริง (ต่อลูก)", session.fees.shuttleCostReal > 0 ? money(session.fees.shuttleCostReal) : "ไม่ได้กรอก"],
    ["ค่าเช่าคอร์ตที่จ่ายสนามจริง", money(session.fees.courtCost)],
    [
      session.fees.extraNote ? `ค่าอื่น ๆ (${session.fees.extraNote})` : "ค่าอื่น ๆ",
      money(session.fees.extraCost),
    ],
    [null, null],
    [{ v: "ตัวเลขของวันนี้", style: "bold" }, null],
    ["จำนวนคน", count(session.players.length)],
    ["เกมที่จบแล้ว", count(finished.length)],
    ["ลูกที่ใช้ในเกม", count(bill.shuttlesInGames)],
    ["ลูกที่ใช้นอกเกม (หารเท่ากัน)", count(session.shuttlesExtra)],
    ["ลูกที่ใช้ทั้งหมด", count(bill.shuttlesUsed)],
    ["ค่าลูกที่เก็บจากลูกก๊วนรวม", money(bill.shuttleCharged)],
    [null, null],
    [{ v: "เงิน", style: "bold" }, null],
    ["ยอดเรียกเก็บรวม", { v: round2(bill.billed), style: "moneyBold" }],
    ["เก็บได้แล้ว", { v: round2(bill.collected), style: "moneyBold" }],
    ["ยังค้างอยู่", { v: round2(bill.billed - bill.collected), style: "moneyBold" }],
    ["จ่ายแล้วกี่คน", `${bill.lines.filter((l) => l.paid).length} / ${bill.lines.length} คน`],
    [
      "ต้นทุนจริงที่ก๊วนจ่ายออก",
      bill.costTracked ? money(bill.total) : "ยังไม่ได้กรอกต้นทุน",
    ],
    [
      bill.costTracked && bill.balance < 0 ? "ก๊วนออกให้ก่อน" : "เหลือเข้าก๊วน",
      bill.costTracked ? { v: round2(Math.abs(bill.balance)), style: "moneyBold" } : "คิดไม่ได้ ต้องกรอกต้นทุนก่อน",
    ],
    [null, null],
    ["รับเงินที่", session.fees.promptPay || CLUB.payment.name],
    ["ออกไฟล์เมื่อ", `${thaiDateTime(Date.now())}`],
  ]

  const summary: SheetSpec = {
    name: "สรุปก๊วน",
    columns: [
      { header: "รายการ", width: 30 },
      { header: "ค่า", width: 40 },
    ],
    rows: summaryRows,
    filter: false,
  }

  return buildXlsx([people, chase, matches, summary])
}

function thaiDateTime(at: number): string {
  const d = new Date(at + 7 * 3600_000)
  return `${d.toISOString().slice(0, 10)} ${thaiTime(at)} น.`
}

/** ชื่อไฟล์ที่เปิดใน Windows/Mac ได้ทั้งคู่ */
export function billFilename(session: Session): string {
  return `ค่าก๊วนเกงกิเดสซ์-${session.date}.xlsx`
}
