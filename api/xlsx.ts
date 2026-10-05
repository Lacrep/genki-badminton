/**
 * ตัวเขียนไฟล์ .xlsx ขนาดจิ๋ว — เขียนเองเพราะทั้งโปรเจกต์ตั้งใจไม่มี native module
 * และไลบรารี Excel ตัวที่ใช้กันลาก dependency มาเป็นสิบ ๆ ตัว ทั้งที่งานจริงคือ
 * "ตาราง + หัวตารางตัวหนา + ช่องเงินทศนิยมสองตำแหน่ง" เท่านั้น
 *
 * .xlsx คือไฟล์ zip ที่ข้างในเป็น XML — ประกอบเองได้ด้วย zlib ที่ node มีอยู่แล้ว
 */

import zlib from "node:zlib"

// ── zip ──────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

interface ZipEntry {
  name: string
  data: Buffer
}

function zip(entries: ZipEntry[]): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  // ใช้เวลาคงที่ (1980-01-01) ทุกครั้ง — ข้อมูลเดิมจึงได้ไฟล์เดิมเป๊ะ ตรวจสอบง่าย
  const dosTime = 0
  const dosDate = 0x21

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8")
    const comp = zlib.deflateRawSync(entry.data, { level: 9 })
    const crc = crc32(entry.data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // ต้องใช้ zip เวอร์ชัน 2.0 ขึ้นไปอ่าน
    local.writeUInt16LE(0x0800, 6) // ชื่อไฟล์เป็น UTF-8
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(dosTime, 10)
    local.writeUInt16LE(dosDate, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(comp.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    parts.push(local, name, comp)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0x0800, 8)
    cd.writeUInt16LE(8, 10)
    cd.writeUInt16LE(dosTime, 12)
    cd.writeUInt16LE(dosDate, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(comp.length, 20)
    cd.writeUInt32LE(entry.data.length, 24)
    cd.writeUInt16LE(name.length, 28)
    cd.writeUInt16LE(0, 30)
    cd.writeUInt16LE(0, 32)
    cd.writeUInt16LE(0, 34)
    cd.writeUInt16LE(0, 36)
    cd.writeUInt32LE(0, 38)
    cd.writeUInt32LE(offset, 42)
    central.push(cd, name)

    offset += local.length + name.length + comp.length
  }

  const dir = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...parts, dir, end])
}

// ── ตาราง ────────────────────────────────────────────────────────────────────

/** รูปแบบช่อง — ตรงกับลำดับใน cellXfs ของ styles.xml ด้านล่าง */
export type CellStyle = "text" | "head" | "money" | "moneyBold" | "bold" | "int"

const STYLE_INDEX: Record<CellStyle, number> = {
  text: 0,
  head: 1,
  money: 2,
  moneyBold: 3,
  bold: 4,
  int: 5,
}

export type Cell =
  | string
  | number
  | null
  | undefined
  | { v: string | number; style?: CellStyle; formula?: string }

export interface Column {
  header: string
  /** ความกว้างคอลัมน์ (หน่วยเดียวกับที่ Excel ใช้ ≈ จำนวนตัวอักษร) */
  width: number
}

export interface SheetSpec {
  name: string
  columns: Column[]
  rows: Cell[][]
  /** ค่าปริยายของทั้งคอลัมน์ ถ้าช่องไม่ได้ระบุเอง */
  columnStyles?: (CellStyle | undefined)[]
  /** ตรึงหัวตารางไว้ตอนเลื่อน + ใส่ปุ่มกรอง (ค่าปริยาย: ใส่) */
  filter?: boolean
}

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
}

function esc(value: string): string {
  return value
    // อักขระควบคุมทำให้ Excel ฟ้องว่าไฟล์เสีย — ตัดทิ้งก่อน
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[&<>"']/g, (c) => XML_ESCAPES[c]!)
}

/** 1 → A, 27 → AA */
export function colName(index: number): string {
  let n = index
  let out = ""
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/** Excel ห้ามอักขระพวกนี้ในชื่อชีต และยาวได้ไม่เกิน 31 ตัว */
function sheetName(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31)
  return cleaned || fallback
}

function cellXml(ref: string, cell: Cell, fallbackStyle?: CellStyle): string {
  if (cell === null || cell === undefined || cell === "") return ""

  const obj = typeof cell === "object" ? cell : { v: cell, style: undefined, formula: undefined }
  const style = obj.style ?? fallbackStyle ?? (typeof obj.v === "number" ? "money" : "text")
  const s = STYLE_INDEX[style]
  const attrs = `r="${ref}"${s ? ` s="${s}"` : ""}`

  if (obj.formula) {
    const cached = typeof obj.v === "number" && Number.isFinite(obj.v) ? `<v>${obj.v}</v>` : ""
    return `<c ${attrs}><f>${esc(obj.formula)}</f>${cached}</c>`
  }
  if (typeof obj.v === "number") {
    if (!Number.isFinite(obj.v)) return ""
    return `<c ${attrs}><v>${obj.v}</v></c>`
  }
  return `<c ${attrs} t="inlineStr"><is><t xml:space="preserve">${esc(obj.v)}</t></is></c>`
}

function sheetXml(sheet: SheetSpec): string {
  const width = Math.max(sheet.columns.length, ...sheet.rows.map((r) => r.length), 1)
  const lastCol = colName(width)
  const lastRow = sheet.rows.length + 1
  const filter = sheet.filter !== false

  const cols = sheet.columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`)
    .join("")

  const header = sheet.columns
    .map((c, i) => cellXml(`${colName(i + 1)}1`, { v: c.header, style: "head" }))
    .join("")

  const body = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((cell, i) => cellXml(`${colName(i + 1)}${r + 2}`, cell, sheet.columnStyles?.[i]))
        .join("")
      return `<row r="${r + 2}">${cells}</row>`
    })
    .join("")

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="A1:${lastCol}${Math.max(lastRow, 1)}"/>` +
    // ตรึงแถวหัวตาราง — เลื่อนดูคนที่ 30 แล้วยังรู้ว่าคอลัมน์ไหนคืออะไร
    `<sheetViews><sheetView workbookViewId="0">` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
    `</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData><row r="1">${header}</row>${body}</sheetData>` +
    (filter && sheet.rows.length ? `<autoFilter ref="A1:${lastCol}${lastRow}"/>` : "") +
    `</worksheet>`
  )
}

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>` +
  // Tahoma — ฟอนต์ที่มีไทยครบทั้ง Windows และ Mac มาแต่ไหนแต่ไร
  `<fonts count="3">` +
  `<font><sz val="11"/><name val="Tahoma"/></font>` +
  `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font>` +
  `<font><b/><sz val="11"/><name val="Tahoma"/></font>` +
  `</fonts>` +
  `<fills count="3">` +
  `<fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF16265B"/><bgColor indexed="64"/></patternFill></fill>` +
  `</fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="6">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">` +
  `<alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>` +
  `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`

/** ประกอบไฟล์ .xlsx จากชีตหลายชีต */
export function buildXlsx(sheets: SheetSpec[]): Buffer {
  if (sheets.length === 0) throw new Error("ต้องมีอย่างน้อยหนึ่งชีต")

  const names = sheets.map((s, i) => sheetName(s.name, `Sheet${i + 1}`))

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    sheets
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("") +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
    names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    `</sheets></workbook>`

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("") +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`

  return zip([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rootRels, "utf8") },
    { name: "xl/workbook.xml", data: Buffer.from(workbook, "utf8") },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(workbookRels, "utf8") },
    { name: "xl/styles.xml", data: Buffer.from(STYLES_XML, "utf8") },
    ...sheets.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: Buffer.from(sheetXml(s), "utf8"),
    })),
  ])
}
