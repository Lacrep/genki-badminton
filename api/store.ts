/**
 * ที่เก็บข้อมูล — ไฟล์ JSON ธรรมดาในโฟลเดอร์ data/
 *
 * ตั้งใจเลือกแบบนี้เพราะก๊วนแบดคือข้อมูลเล็ก (คนไม่กี่สิบ เกมไม่กี่ร้อยต่อครั้ง)
 * แต่ "ต้องไม่ล่ม" ตอนอยู่ในโรงยิม → ไม่มี native module, ไม่มี migration,
 * ย้ายเครื่องแค่ก็อปโฟลเดอร์ data/ ไป และเปิดดูย้อนหลังด้วย text editor ได้เลย
 *
 * การเขียนไฟล์ใช้ write-to-temp + rename (atomic) กันไฟล์พังตอนไฟดับ
 */

import fs from "node:fs"
import path from "node:path"
import {
  type Bill,
  type BillLine,
  type Court,
  type CourtView,
  type FeeMode,
  type Fees,
  type Level,
  type Match,
  type MatchSet,
  type PlannedMatch,
  type PlannedView,
  type MatchType,
  type QueueEntry,
  type RosterPlayer,
  type Session,
  type SessionEvent,
  type SessionPlayer,
  type SessionSettings,
  type SessionView,
  DEFAULT_FEES,
  DEFAULT_SETTINGS,
  MAX_LEVEL,
  displayName,
  formatMinutes,
  playersPerMatch,
  priorityOf,
  thaiDateKey,
  thaiTime,
  scoreLabel,
  thaiWeekday,
  waitTier,
  winnerFromSets,
} from "@shared/types"
import { CLUB } from "@shared/club"
import { forecastQueue } from "./matching"
import { markDataDirty } from "./git-autosync"

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || "./data")
const ROSTER_FILE = path.join(DATA_DIR, "roster.json")
/**
 * ชื่อคนที่ลบออกจากทะเบียนไปแล้ว — เก็บไว้เพื่อให้บิลกับสถิติของก๊วนเก่ายังอ่านชื่อออก
 *
 * ถ้าลบแล้วไม่เก็บอะไรไว้เลย ใบเสร็จกับสถิติของก๊วนที่เขาเคยลงจะขึ้นเป็นรหัสดิบ
 * อย่าง "p_a1b2c3" ซึ่งอ่านไม่รู้เรื่องว่าใคร ไฟล์นี้จึงเก็บแค่ชื่อกับระดับมือไว้
 * ส่วนตัวคนจะหายจากทุกรายชื่อในระบบ (ทะเบียน เช็คอิน หน้าจัดคน) ตามที่สั่งลบ
 */
const REMOVED_FILE = path.join(DATA_DIR, "removed-players.json")
const SESSION_DIR = path.join(DATA_DIR, "sessions")
const POINTER_FILE = path.join(DATA_DIR, "current.json")
const PHOTO_DIR = path.join(DATA_DIR, "photos")

function ensureDirs() {
  fs.mkdirSync(SESSION_DIR, { recursive: true })
}

/**
 * อ่านไฟล์ JSON — ถ้าไฟล์หลักพังก็ลองไฟล์สำรองที่เขียนคู่กันไว้ทุกครั้ง
 *
 * ที่ต้องมีสำรองเพราะถ้าปล่อยให้คืนค่าว่างเฉย ๆ การบันทึกครั้งถัดไปจะทับของเดิม
 * ที่ยังกู้ได้ทิ้งไปเลย — ทะเบียนลูกก๊วนทั้งก๊วนหายในพริบตาโดยไม่มีใครรู้ตัว
 */
function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return fallback

    try {
      const rescued = JSON.parse(fs.readFileSync(`${file}.bak`, "utf8")) as T
      console.error(`[store] ${path.basename(file)} เสีย — กู้จากไฟล์สำรองแล้ว`)
      // เก็บตัวที่พังไว้ดูทีหลัง แล้วเอาตัวที่กู้ได้ขึ้นมาเป็นตัวหลักทันที
      keepBroken(file)
      writeJson(file, rescued)
      return rescued
    } catch {
      console.error(`[store] ${path.basename(file)} เสียและไฟล์สำรองก็ใช้ไม่ได้ — เริ่มจากค่าว่าง`)
      keepBroken(file)
      return fallback
    }
  }
}

/** ย้ายไฟล์ที่อ่านไม่ออกไปเก็บไว้ ไม่ลบทิ้ง — เผื่อยังแกะข้อมูลออกมาได้ */
function keepBroken(file: string) {
  try {
    if (fs.existsSync(file)) fs.renameSync(file, `${file}.broken-${Date.now()}`)
  } catch {
    // กู้ไม่ได้ก็ไม่เป็นไร อย่าให้ล้มทั้งเซิร์ฟเวอร์เพราะเรื่องนี้
  }
}

/**
 * เขียนไฟล์แบบที่ไฟดับกลางคันแล้วข้อมูลไม่หาย
 *
 * เขียนลงไฟล์ชั่วคราว → fsync (บังคับให้ลงจานจริง ไม่ใช่ค้างใน cache ของ OS)
 * → สำรองตัวเดิมไว้ → rename ทับ (atomic) → fsync โฟลเดอร์ให้ชื่อใหม่ติดจาน
 *
 * ถ้าไม่ fsync แล้วไฟดับ จะได้ไฟล์ชื่อถูกแต่ข้างในว่าง ซึ่งแย่กว่าไฟล์เก่าเสียอีก
 */
function writeJson(file: string, value: unknown) {
  ensureDirs()
  const tmp = `${file}.${process.pid}.tmp`
  const text = JSON.stringify(value, null, 2)

  const fd = fs.openSync(tmp, "w")
  try {
    fs.writeFileSync(fd, text)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }

  try {
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`)
  } catch {
    // สำรองไม่ได้ก็ยังต้องเขียนตัวจริงต่อ
  }

  fs.renameSync(tmp, file)

  try {
    const dir = fs.openSync(path.dirname(file), "r")
    fs.fsyncSync(dir)
    fs.closeSync(dir)
  } catch {
    // ระบบไฟล์บางตัว (เช่นบน Windows) fsync โฟลเดอร์ไม่ได้ — ข้ามไป
  }

  // เปิด GIT_AUTOSYNC ไว้เท่านั้นถึงจะทำอะไร (ปกติเป็น no-op) — ดู api/git-autosync.ts
  markDataDirty()
}

export function id(prefix = ""): string {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
}

/** รหัสลิงก์ดูคิว — ตัดตัวที่อ่านสับสน (0/O, 1/I) ออก */
export function sessionCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let out = ""
  for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

export class StoreError extends Error {
  status: number
  /** ข้อมูลเพิ่มเติมที่ส่งกลับไปให้หน้าเว็บด้วย เช่น จำนวนครั้งที่เคยลงก๊วน */
  extra?: Record<string, unknown>
  constructor(message: string, status = 400, extra?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

// ── แปลงข้อมูลรุ่นเก่าให้เข้ากับระบบปัจจุบัน ────────────────────────────────────
//
// ก๊วนที่เปิดไว้ก่อนเปลี่ยนระบบ (ระดับมือ 10 ขั้น, มีเพศ/สมาชิก, ค่าก๊วน 4 แบบ)
// ยังเปิดดูได้ตามปกติ — แปลงให้ตอนอ่านไฟล์แล้วเขียนกลับครั้งเดียว

/** คีย์ที่มีเฉพาะข้อมูลรุ่นเก่า ใช้เป็นตัวสังเกตว่าเรคอร์ดนี้ยังไม่ถูกแปลง */
type LegacyPlayerFields = {
  nickname?: string
  gender?: string
  member?: boolean
  phone?: string
}

/** ระดับมือเดิม 1..10 → สเกลใหม่ 1..7 (หน้าบ้าน..OPEN) */
function mapLegacyLevel(level: number): Level {
  const mapped = Math.round((Number(level) || 1) * 0.7)
  return Math.max(1, Math.min(MAX_LEVEL, mapped)) as Level
}

function migrateRoster(list: RosterPlayer[]): { list: RosterPlayer[]; changed: boolean } {
  let changed = false
  const next = list.map((raw) => {
    const legacy = raw as RosterPlayer & LegacyPlayerFields
    // ทะเบียนที่ระดับมือหายไป (เคยโดนบันทึกทับด้วยค่าว่าง) — เติมขั้นกลางคืนให้
    if (typeof raw.level !== "number" || !Number.isFinite(raw.level)) {
      changed = true
      return { ...raw, level: 3 as RosterPlayer["level"] }
    }
    const isLegacy =
      legacy.nickname !== undefined ||
      legacy.gender !== undefined ||
      legacy.member !== undefined ||
      legacy.phone !== undefined
    if (!isLegacy) return raw

    changed = true
    return {
      id: legacy.id,
      // เดิมเก็บชื่อจริง + ชื่อเล่น ตอนนี้ใช้ชื่อที่เรียกกันในก๊วนอย่างเดียว
      name: legacy.nickname?.trim() || legacy.name,
      level: mapLegacyLevel(legacy.level),
      note: legacy.note,
      archived: legacy.archived,
      createdAt: legacy.createdAt,
    } satisfies RosterPlayer
  })
  return { list: next, changed }
}

const FEE_MODES: FeeMode[] = ["club", "equal"]
const MATCH_TYPES: MatchType[] = ["D", "S"]

function migrateSession(session: Session): { session: Session; changed: boolean } {
  let changed = false
  const fees = session.fees as Fees & { memberFee?: number; guestFee?: number; shuttleCostReal?: number }

  if (!FEE_MODES.includes(fees.mode)) {
    // split/byGames/flat ของเดิม ใกล้กับ "ระบบก๊วน" ที่สุด
    fees.mode = fees.mode === ("equal" as FeeMode) ? "equal" : "club"
    changed = true
  }
  if (typeof fees.courtFeePerHead !== "number") {
    fees.courtFeePerHead = typeof fees.memberFee === "number" ? fees.memberFee : DEFAULT_FEES.courtFeePerHead
    changed = true
  }
  if (fees.memberFee !== undefined || fees.guestFee !== undefined) {
    delete fees.memberFee
    delete fees.guestFee
    changed = true
  }
  // ก๊วนรุ่นเก่าเก็บ "ค่าลูกที่จ่ายจริงทั้งวัน" ไว้ในชื่อ shuttleCostReal
  // ย้ายยอดมาชื่อใหม่ก่อน ไม่งั้นค่าลูกที่เคยกรอกไว้จะหายกลายเป็น 0
  if (fees.shuttleCostReal !== undefined) {
    if (typeof fees.shuttleCostTotal !== "number") fees.shuttleCostTotal = fees.shuttleCostReal
    delete fees.shuttleCostReal
    changed = true
  }
  for (const key of ["shuttlePrice", "shuttleCostTotal", "courtCost", "extraCost", "roundTo"] as const) {
    if (typeof fees[key] !== "number") {
      fees[key] = DEFAULT_FEES[key]
      changed = true
    }
  }

  if (!Array.isArray(session.planned)) {
    session.planned = []
    changed = true
  }
  // ก๊วนรุ่นเก่าเคยเก็บ "ลูกนอกเกม" ไว้ — ตอนนี้ไม่คิดเงินแล้ว ลบทิ้งได้เลย
  const legacy = session as Session & { shuttlesExtra?: number }
  if (legacy.shuttlesExtra !== undefined) {
    delete legacy.shuttlesExtra
    changed = true
  }

  const settings = session.settings as SessionSettings & { autoFill?: boolean }
  if (settings.defaultMatchType !== "auto" && !MATCH_TYPES.includes(settings.defaultMatchType)) {
    settings.defaultMatchType = "auto"
    changed = true
  }
  if (settings.autoFill !== undefined) {
    delete settings.autoFill
    changed = true
  }
  if (settings.maxLevelGap > MAX_LEVEL - 1) {
    settings.maxLevelGap = DEFAULT_SETTINGS.maxLevelGap
    changed = true
  }

  // ก๊วนเก่าไม่มีเลขเกม — ไล่ใส่ตามลำดับที่เริ่มเล่นจริง
  if (session.matches.some((m) => typeof m.no !== "number")) {
    const order = [...session.matches].sort((a, b) => a.startedAt - b.startedAt)
    order.forEach((m, i) => {
      m.no = i + 1
    })
    changed = true
  }
  for (const m of session.matches) {
    if (!MATCH_TYPES.includes(m.type)) {
      m.type = m.teamA.length <= 1 ? "S" : "D"
      changed = true
    }
  }

  // ฟิลด์ที่เพิ่มมาทีหลัง — เติมให้ครบกันหน้าเว็บคำนวณไม่ได้
  for (const p of session.players) {
    for (const key of ["gamesPlayed", "playedMs", "waitedMs", "longestWaitMs", "wins", "losses", "draws", "boost"] as const) {
      if (typeof p[key] !== "number") {
        p[key] = 0
        changed = true
      }
    }
  }

  return { session, changed }
}

// ── ทะเบียนผู้เล่น ────────────────────────────────────────────────────────────

export function getRoster(): RosterPlayer[] {
  const { list, changed } = migrateRoster(readJson<RosterPlayer[]>(ROSTER_FILE, []))
  if (changed) saveRoster(list)
  return list
}

function saveRoster(list: RosterPlayer[]) {
  writeJson(ROSTER_FILE, list)
}

function getRemoved(): RosterPlayer[] {
  return readJson<RosterPlayer[]>(REMOVED_FILE, []).filter((p) => p && typeof p.id === "string")
}

/**
 * แผนที่ชื่อสำหรับ "แปลงรหัสเป็นชื่อ" — รวมคนที่ลบไปแล้วด้วย
 *
 * ต่างจาก getRoster() ที่เป็นรายชื่อสมาชิกปัจจุบัน (ใช้โชว์ในทะเบียน/เช็คอิน/หน้าจัดคน)
 * อันนี้ใช้ตอนต้องรู้ว่ารหัสนี้คือใคร เช่น บิลกับสถิติของก๊วนเก่า จึงต้องมีคนที่ลบไปแล้วด้วย
 */
export function rosterMap(): Map<string, RosterPlayer> {
  const map = new Map<string, RosterPlayer>()
  for (const p of getRemoved()) map.set(p.id, p)
  // สมาชิกปัจจุบันทับของเก่าเสมอ เผื่อมีรหัสซ้ำกันด้วยเหตุผลอะไรก็ตาม
  for (const p of getRoster()) map.set(p.id, p)
  return map
}

/**
 * ชื่อที่ใช้เทียบว่าซ้ำกันไหม — ตัดช่องว่างทิ้งหมด ไม่สนตัวพิมพ์เล็กใหญ่
 *
 * "พี่หมู" · "พี่ หมู" · " พี่หมู " ในก๊วนคือคนเดียวกันแน่ ๆ คนพิมพ์ชื่อเล่น
 * เว้นวรรคไม่เหมือนกันทุกครั้งอยู่แล้ว ถ้าเทียบตรงตัวจะหลุดเป็นสองคนในทะเบียน
 * แล้วสถิติแยกกันคนละท่อน (ชื่อที่โชว์ยังเก็บช่องว่างตามที่พิมพ์ไว้เหมือนเดิม)
 */
function nameKey(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase()
}

/** หาคนที่ชื่อชนกัน (ข้ามตัวเองตอนแก้ชื่อ) */
function findSameName(list: RosterPlayer[], name: string, exceptId?: string): RosterPlayer | undefined {
  const key = nameKey(name)
  return list.find((p) => p.id !== exceptId && nameKey(p.name) === key)
}

function assertNameFree(list: RosterPlayer[], name: string, exceptId?: string) {
  const clash = findSameName(list, name, exceptId)
  if (!clash) return
  throw new StoreError(
    clash.archived
      ? `มีชื่อ "${clash.name}" อยู่แล้ว (เก็บเข้ากรุไว้) — เอากลับมาใช้แทนการสร้างใหม่ได้`
      : `มีชื่อ "${clash.name}" อยู่ในทะเบียนแล้ว ใช้ชื่อซ้ำกันไม่ได้`,
    400,
  )
}

export function addPlayer(input: Omit<RosterPlayer, "id" | "createdAt">): RosterPlayer {
  const list = getRoster()
  assertNameFree(list, input.name)
  const player: RosterPlayer = { ...input, id: id("p_"), createdAt: Date.now() }
  list.push(player)
  saveRoster(list)
  return player
}

export function updatePlayer(playerId: string, patch: Partial<RosterPlayer>): RosterPlayer {
  const list = getRoster()
  const i = list.findIndex((p) => p.id === playerId)
  if (i < 0) throw new StoreError("ไม่พบผู้เล่นคนนี้ในทะเบียน", 404)
  if (typeof patch.name === "string") assertNameFree(list, patch.name, playerId)
  // ตัดคีย์ที่เป็น undefined ทิ้งก่อน — ไม่งั้นการแก้ชื่ออย่างเดียวจะลบระดับมือหาย
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
  list[i] = { ...list[i], ...clean, id: list[i].id, createdAt: list[i].createdAt }
  saveRoster(list)
  return list[i]
}

// ── รูปโปรไฟล์ ───────────────────────────────────────────────────────────────

/** ชนิดไฟล์ที่รับ — เบราว์เซอร์ส่งมาได้แค่สามอย่างนี้หลังย่อรูปแล้ว */
const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

function photoFile(playerId: string, ext: string) {
  return path.join(PHOTO_DIR, `${playerId}.${ext}`)
}

/** ลบรูปทุกนามสกุลของคนนี้ — กันไฟล์เก่าค้างตอนเปลี่ยนชนิดรูป */
function removePhotoFiles(playerId: string) {
  for (const ext of Object.values(PHOTO_TYPES)) {
    try {
      fs.rmSync(photoFile(playerId, ext), { force: true })
    } catch {
      /* ไม่มีไฟล์ก็ไม่เป็นไร */
    }
  }
}

/**
 * บันทึกรูปโปรไฟล์จาก data URL ที่หน้าเว็บย่อมาแล้ว
 *
 * รูปเก็บเป็นไฟล์แยก ไม่ยัดลง roster.json เพราะ base64 จะทำให้ไฟล์ทะเบียน
 * บวมหลายเมกะไบต์ แล้วการเขียนแบบปลอดภัย (เขียน temp + สำรอง + rename)
 * จะช้าลงทุกครั้งที่แก้ชื่อคนเดียว
 */
export function setPlayerPhoto(playerId: string, dataUrl: string): RosterPlayer {
  const list = getRoster()
  const i = list.findIndex((p) => p.id === playerId)
  if (i < 0) throw new StoreError("ไม่พบผู้เล่นคนนี้ในทะเบียน", 404)

  const m = /^data:([a-z/+-]+);base64,(.+)$/i.exec(dataUrl.trim())
  if (!m) throw new StoreError("ไฟล์รูปไม่ถูกต้อง", 400)
  const ext = PHOTO_TYPES[m[1]!.toLowerCase()]
  if (!ext) throw new StoreError("รองรับเฉพาะรูป JPG · PNG · WebP", 400)

  const bytes = Buffer.from(m[2]!, "base64")
  if (bytes.length === 0) throw new StoreError("ไฟล์รูปว่างเปล่า", 400)
  if (bytes.length > 3_000_000) throw new StoreError("รูปใหญ่เกินไป (เกิน 3 MB)", 400)

  fs.mkdirSync(PHOTO_DIR, { recursive: true })
  removePhotoFiles(playerId)
  fs.writeFileSync(photoFile(playerId, ext), bytes)

  list[i] = { ...list[i]!, photoAt: Date.now() }
  saveRoster(list)
  return list[i]!
}

export function clearPlayerPhoto(playerId: string): RosterPlayer {
  const list = getRoster()
  const i = list.findIndex((p) => p.id === playerId)
  if (i < 0) throw new StoreError("ไม่พบผู้เล่นคนนี้ในทะเบียน", 404)
  removePhotoFiles(playerId)
  const next = { ...list[i]! }
  delete next.photoAt
  list[i] = next
  saveRoster(list)
  return next
}

/** อ่านรูปกลับมาส่งให้เบราว์เซอร์ */
export function readPlayerPhoto(playerId: string): { bytes: Buffer; type: string } | null {
  // กัน path traversal — id มาจาก URL ตรง ๆ
  if (!/^[A-Za-z0-9_-]+$/.test(playerId)) return null
  for (const [type, ext] of Object.entries(PHOTO_TYPES)) {
    const file = photoFile(playerId, ext)
    if (fs.existsSync(file)) return { bytes: fs.readFileSync(file), type }
  }
  return null
}

/**
 * ลบคนออกจากทะเบียน — ทำได้เฉพาะคนที่ยังไม่เคยลงก๊วนเลย (เช่นพิมพ์ชื่อผิด)
 *
 * ทะเบียนสมาชิกคือที่มาของ "ชื่อ" ในบิลและสถิติทุกครั้งที่ผ่านมา ลบทิ้งเมื่อไร
 * ก๊วนเก่าจะเหลือแต่รหัส p_xxxx แทนชื่อ และคนนั้นจะหายจากสถิติรวมไปเลย
 * คนที่เคยลงเล่นแล้วให้ "เก็บเข้ากรุ" (archived) แทน — หายจากรายชื่อเช็คอิน
 * แต่ชื่อกับประวัติยังอยู่ครบ
 */
/**
 * ลบคนออกจากทะเบียน — เผื่อเพิ่มชื่อซ้ำหรือเพิ่มผิดคน
 *
 * คนที่ยังไม่เคยลงก๊วนลบได้เลย ส่วนคนที่เคยลงแล้วต้องยืนยันอีกชั้น (force)
 * เพราะเป็นคนละเรื่องกัน: อันแรกคือลบของที่ไม่ควรมีตั้งแต่แรก
 * อันหลังคือเอาคนที่มีประวัติจริงออก ซึ่งกู้คืนเป็นสมาชิกไม่ได้
 *
 * ไม่ว่าทางไหน ชื่อจะถูกเก็บไว้ในไฟล์คนที่ลบแล้ว บิลกับสถิติของก๊วนเก่าจึงยังอ่านชื่อออก
 * (ไม่กลายเป็นรหัสดิบ) ส่วนประวัติในไฟล์ก๊วนไม่ถูกแตะต้อง ยอดเงินเก่าจึงไม่ขยับสักบาท
 */
export function deletePlayer(playerId: string, opts: { force?: boolean } = {}) {
  const list = getRoster()
  const target = list.find((p) => p.id === playerId)
  if (!target) throw new StoreError("ไม่พบผู้เล่นคนนี้ในทะเบียน", 404)

  /** ก๊วนที่กำลังเปิดอยู่และเขาแค่เช็คอินไว้เฉย ๆ — ถอนชื่อออกได้สะอาด ๆ */
  const scrub: string[] = []
  let sessions = 0
  let games = 0

  for (const s of listSessions()) {
    const sp = s.players.find((x) => x.playerId === playerId)
    if (!sp) continue

    /*
      คนที่ยังอยู่ในก๊วนที่กำลังเล่น ลบไม่ได้ — คิวกับคอร์ตที่รันอยู่จะพัง

      เคสที่เจอบ่อยสุดคือเพิ่มชื่อซ้ำจากหน้าเช็คอิน ซึ่งเพิ่มแล้วเช็คอินให้เลย
      ชื่อที่เพิ่งเพิ่มผิดจึงติดอยู่ในก๊วนทันที ส่งข้อมูลกลับไปให้หน้าเว็บเสนอ
      "เช็คเอาท์แล้วลบเลย" ได้ จะได้ไม่ต้องไปตามกดเองสองที่
    */
    if (s.status === "live" && sp.status !== "left") {
      throw new StoreError(
        `${displayName(target)} อยู่ในก๊วนที่กำลังเล่นอยู่ — เช็คเอาท์หรือปิดก๊วนก่อนถึงจะลบได้`,
        409,
        {
          needCheckout: true,
          name: displayName(target),
          sessionId: s.id,
          // อยู่ในคอร์ตอยู่ เช็คเอาท์ก็ยังไม่ได้ ต้องจบเกมก่อน
          playing: sp.status === "playing",
        },
      )
    }

    /*
      ก๊วนที่ยังเปิดอยู่ + ไม่เคยลงสักเกม + ไม่มีเกมหรือคิวไหนอ้างถึง
      = ชื่อที่เพิ่มผิดแล้วเช็คอินไปเฉย ๆ ถอนออกจากก๊วนวันนี้ไปเลย

      ไม่งั้นบิลวันนี้จะยังมีหัวผีค้างอยู่ให้หัวก๊วนไปไล่กด "ไม่คิดเงิน" เองทีหลัง
      ส่วนก๊วนที่ปิดไปแล้วไม่แตะต้อง — ประวัติคือประวัติ ยอดเงินเก่าต้องไม่ขยับ
    */
    const inMatch = s.matches.some((m) => [...m.teamA, ...m.teamB].includes(playerId))
    const inPlan = s.planned.some((pl) => [...pl.teamA, ...pl.teamB].includes(playerId))
    if (s.status === "live" && sp.gamesPlayed === 0 && !inMatch && !inPlan) {
      scrub.push(s.id)
      continue
    }

    sessions += 1
    games += sp.gamesPlayed
  }

  /*
    ถามยืนยันเมื่อยังมีก๊วนที่อ้างถึงเขาอยู่

    ชื่อที่เพิ่มผิดแล้วถอนออกจากก๊วนวันนี้ได้หมด (scrub ข้างบน) จะเหลือ sessions = 0
    จึงลบจบในคลิกเดียวตามที่ควรเป็น ส่วนคนที่มีบิลหรือสถิติค้างอยู่ในก๊วนที่ปิดไปแล้ว
    ต้องอ่านก่อนว่าจะเสียอะไรบ้าง
  */
  if (sessions > 0 && !opts.force) {
    throw new StoreError(
      games > 0
        ? `${displayName(target)} เคยลงก๊วนมาแล้ว ${sessions} ครั้ง (${games} เกม)`
        : `${displayName(target)} เคยอยู่ในก๊วนที่ปิดไปแล้ว ${sessions} ครั้ง`,
      409,
      { needConfirm: true, name: displayName(target), sessions, games },
    )
  }

  for (const sid of scrub) {
    mutate(sid, (s) => {
      s.players = s.players.filter((x) => x.playerId !== playerId)
      s.events.push(event("player.checkout", `${displayName(target)} ถูกลบออกจากทะเบียน`, { playerId }))
    })
  }

  removePhotoFiles(playerId)
  saveRoster(list.filter((p) => p.id !== playerId))

  /*
    เก็บชื่อไว้เฉพาะคนที่มีประวัติในก๊วนที่ปิดไปแล้ว

    บิลกับสถิติของก๊วนเก่าอ้างถึงเขาด้วยรหัส ถ้าไม่เก็บชื่อไว้จะกลายเป็น "p_a1b2c3"
    ส่วนชื่อที่เพิ่มผิดแล้วถอนออกหมดแล้วไม่มีใครอ้างถึง ไม่ต้องเก็บให้ไฟล์รก
    (และจะได้ไม่ไปกันชื่อซ้ำตอนสร้างคนใหม่ด้วยชื่อเดิม)
  */
  if (sessions > 0) {
    const kept = getRemoved().filter((p) => p.id !== playerId)
    kept.push({ ...target, archived: true, photoAt: undefined })
    writeJson(REMOVED_FILE, kept)
  }

  return { name: displayName(target), sessions, games }
}

// ── ก๊วน ─────────────────────────────────────────────────────────────────────

function sessionFile(sessionId: string) {
  return path.join(SESSION_DIR, `${sessionId}.json`)
}

export function listSessions(): Session[] {
  ensureDirs()
  return fs
    .readdirSync(SESSION_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<Session | null>(path.join(SESSION_DIR, f), null))
    .filter((s): s is Session => !!s)
    .map((s) => migrateSession(s).session)
    .sort((a, b) => b.startAt - a.startAt)
}

export function getSession(sessionId: string): Session {
  const raw = readJson<Session | null>(sessionFile(sessionId), null)
  if (!raw) throw new StoreError("ไม่พบก๊วนนี้", 404)
  const { session, changed } = migrateSession(raw)
  if (changed) writeJson(sessionFile(session.id), session)
  return session
}

export function findSessionByCode(code: string): Session | null {
  const up = code.trim().toUpperCase()
  return listSessions().find((s) => s.code === up) ?? null
}

/**
 * ลบก๊วนทิ้งถาวร — ใช้กับก๊วนที่เปิดไว้ลองเล่นหรือวันที่ไม่อยากเก็บ
 *
 * ก๊วนที่ยังเปิดอยู่ลบไม่ได้ ต้องปิดก่อน — กันลบก๊วนที่กำลังเล่นอยู่กลางคัน
 * ไฟล์ถูกย้ายไปเป็น .deleted-<เวลา> ไม่ได้ลบทิ้งจริง เผื่อกดผิดแล้วอยากได้คืน
 */
export function deleteSession(sessionId: string): void {
  const session = getSession(sessionId)
  if (session.status === "live") {
    throw new StoreError("ก๊วนนี้ยังเปิดอยู่ — ปิดก๊วนก่อนถึงจะลบได้", 400)
  }

  const file = sessionFile(sessionId)
  try {
    fs.renameSync(file, `${file}.deleted-${Date.now()}`)
  } catch {
    throw new StoreError("ลบไม่สำเร็จ ลองใหม่อีกครั้ง", 500)
  }
  try {
    fs.rmSync(`${file}.bak`, { force: true })
  } catch {
    // ไฟล์สำรองลบไม่ได้ก็ไม่เป็นไร ตัวจริงถูกย้ายออกไปแล้ว
  }

  // ถ้าตัวชี้ "ก๊วนปัจจุบัน" ชี้มาที่ก๊วนนี้อยู่ ต้องย้ายไปก๊วนล่าสุดที่ยังเหลือ
  if (currentSessionId() === sessionId) {
    const latest = listSessions()[0]
    writeJson(POINTER_FILE, { id: latest?.id ?? null })
  }
  undoStacks.delete(sessionId)
}

export function currentSessionId(): string | null {
  return readJson<{ id: string | null }>(POINTER_FILE, { id: null }).id
}

export function currentSession(): Session | null {
  const sid = currentSessionId()
  if (!sid) return null
  try {
    return getSession(sid)
  } catch {
    return null
  }
}

function setCurrent(sessionId: string | null) {
  writeJson(POINTER_FILE, { id: sessionId })
}

// ── undo: เก็บสแนปช็อตในหน่วยความจำ (พอสำหรับ "กดผิด" หน้างาน) ────────────────

const undoStacks = new Map<string, string[]>()
const UNDO_DEPTH = 25

function snapshot(session: Session) {
  const stack = undoStacks.get(session.id) ?? []
  stack.push(JSON.stringify(session))
  if (stack.length > UNDO_DEPTH) stack.shift()
  undoStacks.set(session.id, stack)
}

export function undoDepth(sessionId: string): number {
  return undoStacks.get(sessionId)?.length ?? 0
}

export function undo(sessionId: string): Session {
  const stack = undoStacks.get(sessionId)
  if (!stack || stack.length === 0) throw new StoreError("ไม่มีอะไรให้ย้อนกลับแล้ว", 400)
  const prev = JSON.parse(stack.pop()!) as Session
  undoStacks.set(sessionId, stack)
  prev.events.push(event("undo", "ย้อนการกระทำล่าสุด"))
  writeJson(sessionFile(prev.id), prev)
  return prev
}

function event(kind: SessionEvent["kind"], text: string, extra: Partial<SessionEvent> = {}): SessionEvent {
  return { at: Date.now(), kind, text, ...extra }
}

/** อ่าน-แก้-เขียน โดยเก็บสแนปช็อตไว้ให้ undo อัตโนมัติ */
function mutate<T>(sessionId: string, fn: (s: Session) => T): { session: Session; result: T } {
  const session = getSession(sessionId)
  snapshot(session)
  const result = fn(session)
  writeJson(sessionFile(session.id), session)
  return { session, result }
}

export interface CreateSessionInput {
  name?: string
  venue?: string
  courtCount?: number
  courtNames?: string[]
  settings?: Partial<SessionSettings>
  fees?: Partial<Fees>
  notes?: string
}

/** ชื่อก๊วนเริ่มต้น — ตรงวันประจำก๊วนก็ใช้ชื่อตารางประจำไปเลย */
function defaultSessionName(now: number): string {
  const weekday = thaiWeekday(now)
  const onSchedule = new Date(now + 7 * 3600_000).getUTCDay() === CLUB.scheduleWeekday
  return onSchedule ? `ก๊วน${CLUB.scheduleShort}` : `ก๊วนวัน${weekday}`
}

export function createSession(input: CreateSessionInput): Session {
  const now = Date.now()
  const count = Math.max(1, Math.min(20, input.courtCount ?? CLUB.courtCount))
  const courts: Court[] = Array.from({ length: count }, (_, i) => ({
    index: i,
    name: input.courtNames?.[i]?.trim() || `คอร์ต ${i + 1}`,
    currentMatchId: null,
  }))

  const session: Session = {
    id: id("s_"),
    name: input.name?.trim() || defaultSessionName(now),
    date: thaiDateKey(now),
    venue: input.venue?.trim() || CLUB.venue,
    startAt: now,
    status: "live",
    code: sessionCode(),
    courts,
    players: [],
    matches: [],
    planned: [],
    events: [event("session.start", "เปิดก๊วน")],
    settings: { ...DEFAULT_SETTINGS, ...input.settings },
    fees: { ...DEFAULT_FEES, ...input.fees },
    notes: input.notes,
  }
  writeJson(sessionFile(session.id), session)
  setCurrent(session.id)
  return session
}

export function updateSession(
  sessionId: string,
  patch: {
    name?: string
    venue?: string
    notes?: string
    settings?: Partial<SessionSettings>
    fees?: Partial<Fees>
  },
): Session {
  return mutate(sessionId, (s) => {
    if (patch.name !== undefined) s.name = patch.name
    if (patch.venue !== undefined) s.venue = patch.venue
    if (patch.notes !== undefined) s.notes = patch.notes
    if (patch.settings) s.settings = { ...s.settings, ...patch.settings }
    if (patch.fees) s.fees = { ...s.fees, ...patch.fees }
  }).session
}

export function setCourtCount(sessionId: string, count: number): Session {
  return mutate(sessionId, (s) => {
    const next = Math.max(1, Math.min(20, count))
    if (next < s.courts.length) {
      const dropping = s.courts.slice(next)
      if (dropping.some((c) => c.currentMatchId)) {
        throw new StoreError("ลดคอร์ตไม่ได้ — คอร์ตที่จะเอาออกยังมีเกมอยู่", 400)
      }
      s.courts = s.courts.slice(0, next)
    } else {
      for (let i = s.courts.length; i < next; i++) {
        s.courts.push({ index: i, name: `คอร์ต ${i + 1}`, currentMatchId: null })
      }
    }
  }).session
}

export function renameCourt(sessionId: string, index: number, name: string): Session {
  return mutate(sessionId, (s) => {
    const court = s.courts[index]
    if (!court) throw new StoreError("ไม่พบคอร์ตนี้", 404)
    court.name = name.trim() || `คอร์ต ${index + 1}`
  }).session
}

export function toggleCourt(sessionId: string, index: number, disabled: boolean): Session {
  return mutate(sessionId, (s) => {
    const court = s.courts[index]
    if (!court) throw new StoreError("ไม่พบคอร์ตนี้", 404)
    if (disabled && court.currentMatchId) throw new StoreError("ปิดคอร์ตไม่ได้ — ยังมีเกมอยู่", 400)
    court.disabled = disabled
  }).session
}

export function endSession(sessionId: string): Session {
  return mutate(sessionId, (s) => {
    const live = s.matches.filter((m) => !m.endedAt)
    if (live.length > 0) throw new StoreError("ยังมีเกมค้างในคอร์ต — จบเกมให้ครบก่อนปิดก๊วน", 400)
    s.status = "ended"
    s.endAt = Date.now()
    // คู่ที่จัดรอไว้แต่ไม่ได้ลง ไม่มีความหมายอีกแล้ว — ล้างทิ้ง ไม่งั้นเปิดก๊วนกลับมาเจอของค้างจากเมื่อวาน
    s.planned = []
    for (const sp of s.players) {
      if (sp.status !== "left") {
        closeWait(sp, s.endAt)
        sp.status = "left"
        sp.leftAt = s.endAt
      }
    }
    s.events.push(event("session.end", "ปิดก๊วน"))
  }).session
}

export function reopenSession(sessionId: string): Session {
  const s = getSession(sessionId)
  if (s.status === "live") {
    setCurrent(s.id)
    return s
  }
  return mutate(sessionId, (x) => {
    x.status = "live"
    x.endAt = undefined
    setCurrent(x.id)
  }).session
}

// ── เช็คอิน / พัก / กลับบ้าน ───────────────────────────────────────────────────

function closeWait(sp: SessionPlayer, now: number) {
  if (sp.queueSince == null) return
  const waited = Math.max(0, now - sp.queueSince)
  sp.waitedMs += waited
  sp.longestWaitMs = Math.max(sp.longestWaitMs, waited)
  sp.queueSince = null
}

export function checkIn(sessionId: string, playerId: string): Session {
  return mutate(sessionId, (s) => {
    const roster = rosterMap()
    const player = roster.get(playerId)
    if (!player) throw new StoreError("ไม่พบผู้เล่นคนนี้ในทะเบียน", 404)
    const now = Date.now()
    const existing = s.players.find((p) => p.playerId === playerId)
    if (existing) {
      if (existing.status !== "left") throw new StoreError(`${displayName(player)} เช็คอินอยู่แล้ว`, 400)
      existing.status = "queue"
      existing.queueSince = now
      existing.leftAt = undefined
    } else {
      s.players.push({
        playerId,
        status: "queue",
        checkInAt: now,
        queueSince: now,
        gamesPlayed: 0,
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
    s.events.push(event("player.checkin", `${displayName(player)} เช็คอิน`, { playerId }))
  }).session
}

export function checkOut(sessionId: string, playerId: string): Session {
  return mutate(sessionId, (s) => {
    const sp = s.players.find((p) => p.playerId === playerId)
    if (!sp) throw new StoreError("คนนี้ยังไม่ได้เช็คอิน", 404)
    if (sp.status === "playing") throw new StoreError("คนนี้อยู่ในคอร์ต — จบเกมก่อน", 400)
    const now = Date.now()
    closeWait(sp, now)
    sp.status = "left"
    sp.leftAt = now
    const name = rosterMap().get(playerId)
    s.events.push(event("player.checkout", `${name ? displayName(name) : playerId} กลับบ้าน`, { playerId }))
  }).session
}

export function setRest(sessionId: string, playerId: string, resting: boolean): Session {
  return mutate(sessionId, (s) => {
    const sp = s.players.find((p) => p.playerId === playerId)
    if (!sp) throw new StoreError("คนนี้ยังไม่ได้เช็คอิน", 404)
    if (sp.status === "playing") throw new StoreError("คนนี้อยู่ในคอร์ต — จบเกมก่อน", 400)
    const now = Date.now()
    const name = rosterMap().get(playerId)
    const label = name ? displayName(name) : playerId
    if (resting) {
      closeWait(sp, now)
      sp.status = "resting"
      s.events.push(event("player.rest", `${label} ขอพัก`, { playerId }))
    } else {
      sp.status = "queue"
      sp.queueSince = now
      s.events.push(event("player.resume", `${label} กลับเข้าคิว`, { playerId }))
    }
  }).session
}

export function setBoost(sessionId: string, playerId: string, boost: number): Session {
  return mutate(sessionId, (s) => {
    const sp = s.players.find((p) => p.playerId === playerId)
    if (!sp) throw new StoreError("คนนี้ยังไม่ได้เช็คอิน", 404)
    sp.boost = Math.max(-3, Math.min(3, Math.round(boost)))
  }).session
}

/** ยกเว้น/คิดค่าสนามรายคน — หัวก๊วนที่ลงไปตีเองมักจ่ายแค่ค่าลูก */
export function setNoCourtFee(sessionId: string, playerId: string, noCourtFee: boolean): Session {
  return mutate(sessionId, (s) => {
    const sp = s.players.find((p) => p.playerId === playerId)
    if (!sp) throw new StoreError("คนนี้ยังไม่ได้เช็คอิน", 404)
    if (noCourtFee) sp.noCourtFee = true
    else delete sp.noCourtFee
    const name = rosterMap().get(playerId)
    s.events.push(
      event(
        "fee",
        `${name ? displayName(name) : playerId} ${noCourtFee ? "ยกเว้นค่าสนาม" : "กลับมาคิดค่าสนาม"}`,
        { playerId },
      ),
    )
  }).session
}

/**
 * เอาคนออกจากบิล / เอากลับเข้าบิล — ไม่คิดเงินคนนี้เลยสักบาท
 *
 * ต่างจาก noCourtFee ตรงที่อันนั้นยังเก็บค่าลูกอยู่ อันนี้คือไม่เก็บอะไรเลย
 * ใช้กับแขกที่ก๊วนเชิญมา หรือคนที่เคลียร์กันไปแล้วทางอื่น
 */
export function setNoBill(sessionId: string, playerId: string, noBill: boolean): Session {
  return mutate(sessionId, (s) => {
    const sp = s.players.find((p) => p.playerId === playerId)
    if (!sp) throw new StoreError("คนนี้ยังไม่ได้เช็คอิน", 404)
    /*
      ธง "จ่ายแล้ว" เก็บไว้เหมือนเดิม ไม่เคลียร์ทิ้ง

      ยอดของคนที่ไม่อยู่ในบิลเป็น 0 อยู่แล้ว เลขรวมจึงไม่เพี้ยนแม้ธงยังอยู่
      แต่ถ้าเคลียร์ทิ้ง พอกดพลาดแล้วเอากลับเข้าบิล ประวัติว่าเขาจ่ายมาแล้วจะหายไป
      กลายเป็นต้องไปตามเก็บเงินคนที่จ่ายไปแล้วซ้ำอีกรอบ
    */
    if (noBill) sp.noBill = true
    else delete sp.noBill
    const name = rosterMap().get(playerId)
    s.events.push(
      event(
        "fee",
        `${name ? displayName(name) : playerId} ${noBill ? "ไม่คิดเงิน (เอาออกจากบิล)" : "กลับเข้าบิลตามปกติ"}`,
        { playerId },
      ),
    )
  }).session
}

/**
 * บวก/ลบจำนวนลูกที่คิดกับคนนี้ — มาสาย ลงครึ่งเกม หรืออยากลดให้เป็นลูก ๆ
 *
 * เก็บเป็นส่วนต่าง ไม่ใช่จำนวนลูกสุทธิ เพราะจำนวนลูกจริงยังขยับได้เรื่อย ๆ
 * ตอนบันทึกลูกที่ใช้ในเกม ถ้าเก็บเป็นยอดสุทธิไว้ ยอดจะเพี้ยนทุกครั้งที่เกมใหม่จบ
 */
export function setShuttleAdjust(sessionId: string, playerId: string, adjust: number): Session {
  return mutate(sessionId, (s) => {
    const sp = s.players.find((p) => p.playerId === playerId)
    if (!sp) throw new StoreError("คนนี้ยังไม่ได้เช็คอิน", 404)
    const next = Math.max(-99, Math.min(99, Math.round(adjust)))
    if (next === 0) delete sp.shuttleAdjust
    else sp.shuttleAdjust = next
    const name = rosterMap().get(playerId)
    s.events.push(
      event(
        "fee",
        `${name ? displayName(name) : playerId} ปรับลูกที่คิดเป็น ${next > 0 ? "+" : ""}${next} ลูก`,
        { playerId },
      ),
    )
  }).session
}

/** ลดราคาให้คนนี้เป็นบาท — หักจากยอดสุดท้ายตรง ๆ ตามที่หัวก๊วนกรอก */
export function setDiscount(sessionId: string, playerId: string, discount: number): Session {
  return mutate(sessionId, (s) => {
    const sp = s.players.find((p) => p.playerId === playerId)
    if (!sp) throw new StoreError("คนนี้ยังไม่ได้เช็คอิน", 404)
    const next = Math.max(0, Math.min(100_000, Math.round(discount)))
    if (next === 0) delete sp.discount
    else sp.discount = next
    const name = rosterMap().get(playerId)
    s.events.push(
      event("fee", `${name ? displayName(name) : playerId} ${next > 0 ? `ลดให้ ${next} บาท` : "ยกเลิกส่วนลด"}`, {
        playerId,
      }),
    )
  }).session
}

/**
 * รับเงินแล้ว = คนนั้นกลับบ้านได้ ระบบจึงเช็คเอาท์ให้เลย
 *
 * เมื่อก่อนต้องไปกดเช็คเอาท์อีกทีแยกต่างหาก ซึ่งลืมกันประจำ แล้วชื่อคนที่
 * จ่ายเงินกลับบ้านไปแล้วยังค้างอยู่ในคิว โผล่มาตอนจัดเกมรอบถัดไป
 *
 * ถ้ายังอยู่ในคอร์ตจะไม่ดึงออกกลางเกม — พอจบเกมนั้น finishMatch จะส่งกลับบ้านให้เอง
 * กดยกเลิกการจ่ายก็พากลับเข้าคิวให้เหมือนเดิม
 */
export function setPaid(sessionId: string, playerId: string, paid: boolean): Session {
  return mutate(sessionId, (s) => {
    const sp = s.players.find((p) => p.playerId === playerId)
    if (!sp) throw new StoreError("คนนี้ยังไม่ได้เช็คอิน", 404)
    // คนที่เอาออกจากบิลแล้วไม่มียอดให้จ่าย กดรับเงินไปก็ทำให้เลขรวมเพี้ยนเปล่า ๆ
    if (paid && sp.noBill) throw new StoreError("คนนี้ไม่ได้อยู่ในบิล — เอากลับเข้าบิลก่อนถึงจะรับเงินได้", 400)
    const now = Date.now()
    sp.paid = paid
    sp.paidAt = paid ? now : undefined
    const name = rosterMap().get(playerId)
    const label = name ? displayName(name) : playerId
    s.events.push(event("pay", `${label} ${paid ? "จ่ายแล้ว" : "ยกเลิกการจ่าย"}`, { playerId }))

    if (paid && sp.status !== "playing" && sp.status !== "left") {
      closeWait(sp, now)
      sp.status = "left"
      sp.leftAt = now
      s.events.push(event("player.checkout", `${label} จ่ายเงินแล้วกลับบ้าน`, { playerId }))
    } else if (!paid && sp.status === "left") {
      sp.status = "queue"
      sp.queueSince = now
      sp.leftAt = undefined
      s.events.push(event("player.checkin", `${label} กลับเข้าคิว`, { playerId }))
    }
  }).session
}

// ── เกม ──────────────────────────────────────────────────────────────────────

export function startMatch(
  sessionId: string,
  input: { courtIndex: number; type: MatchType; teamA: string[]; teamB: string[]; createdBy?: "auto" | "manual" },
): { session: Session; match: Match } {
  const out = mutate(sessionId, (s) => {
    if (s.status !== "live") throw new StoreError("ก๊วนนี้ปิดแล้ว", 400)
    const court = s.courts[input.courtIndex]
    if (!court) throw new StoreError("ไม่พบคอร์ตนี้", 404)
    if (court.disabled) throw new StoreError("คอร์ตนี้ถูกปิดอยู่", 400)
    if (court.currentMatchId) throw new StoreError("คอร์ตนี้มีเกมอยู่แล้ว", 400)

    const ids = [...input.teamA, ...input.teamB]
    const need = playersPerMatch(input.type)
    if (ids.length !== need) throw new StoreError(`เกมนี้ต้องมี ${need} คน (ส่งมา ${ids.length} คน)`, 400)
    if (new Set(ids).size !== ids.length) throw new StoreError("มีชื่อซ้ำในเกมเดียวกัน", 400)

    const now = Date.now()
    let maxWait = 0
    for (const pid of ids) {
      const sp = s.players.find((p) => p.playerId === pid)
      if (!sp) throw new StoreError("มีคนในเกมที่ยังไม่ได้เช็คอิน", 400)
      if (sp.status === "playing") throw new StoreError("มีคนในเกมที่กำลังเล่นอยู่คอร์ตอื่น", 400)
      if (sp.status === "left") throw new StoreError("มีคนในเกมที่กลับบ้านแล้ว", 400)
      if (sp.queueSince != null) maxWait = Math.max(maxWait, now - sp.queueSince)
    }

    const roster = rosterMap()
    const levels = ids.map((pid) => roster.get(pid)?.level ?? 1)
    const match: Match = {
      id: id("m_"),
      // นับต่อจากเลขสูงสุดที่เคยใช้ เกมที่ถูกยกเลิกไปไม่ดันเลขให้ข้าม
      no: Math.max(0, ...s.matches.map((m) => m.no ?? 0)) + 1,
      courtIndex: input.courtIndex,
      type: input.type,
      teamA: input.teamA,
      teamB: input.teamB,
      startedAt: now,
      shuttles: 0,
      createdBy: input.createdBy ?? "manual",
      levelGap: Math.max(...levels) - Math.min(...levels),
      maxWaitAtStart: maxWait,
    }

    for (const pid of ids) {
      const sp = s.players.find((p) => p.playerId === pid)!
      closeWait(sp, now)
      sp.status = "playing"
    }
    s.matches.push(match)
    court.currentMatchId = match.id
    s.events.push(
      event(
        "match.start",
        `${court.name}: ${ids.map((pid) => (roster.get(pid) ? displayName(roster.get(pid)!) : pid)).join(", ")}`,
        { matchId: match.id },
      ),
    )
    return match
  })
  return { session: out.session, match: out.result }
}

// ── เกมที่จัดไว้ล่วงหน้า ─────────────────────────────────────────────────────

/** คนที่ถูกจัดไว้ในคิวเกมแล้ว — ห้ามถูกจัดซ้ำอีกเกม */
export function plannedPlayerIds(session: Session): string[] {
  const ids = new Set<string>()
  for (const p of session.planned) for (const pid of [...p.teamA, ...p.teamB]) ids.add(pid)
  return [...ids]
}

/** คนที่ลงคอร์ตตอนนี้ไม่ได้ — อยู่ในคอร์ตอื่น หรือถูกจัดไว้ในคิวเกมแล้ว */
export function committedPlayerIds(session: Session): string[] {
  const ids = new Set<string>(plannedPlayerIds(session))
  for (const court of session.courts) {
    const match = court.currentMatchId ? session.matches.find((m) => m.id === court.currentMatchId) : null
    if (match) for (const pid of [...match.teamA, ...match.teamB]) ids.add(pid)
  }
  return [...ids]
}

export function planMatch(
  sessionId: string,
  input: { type: MatchType; teamA: string[]; teamB: string[]; createdBy?: "auto" | "manual" },
): { session: Session; planned: PlannedMatch } {
  const out = mutate(sessionId, (s) => {
    if (s.status !== "live") throw new StoreError("ก๊วนนี้ปิดแล้ว", 400)

    const ids = [...input.teamA, ...input.teamB]
    const need = playersPerMatch(input.type)
    if (ids.length !== need) throw new StoreError(`เกมนี้ต้องมี ${need} คน (ส่งมา ${ids.length} คน)`, 400)
    if (new Set(ids).size !== ids.length) throw new StoreError("มีชื่อซ้ำในเกมเดียวกัน", 400)

    /*
      จัดคิวล่วงหน้าได้ทุกคน ทั้งคนที่อยู่ในคอร์ตและคนที่รออยู่

      เมื่อก่อนห้ามจัดคนที่ถูกจัดไว้ในคิวเกมอื่นแล้ว เพราะพอถึงคิวจะลงพร้อมกันไม่ได้
      แต่หัวก๊วนวางแผนทั้งรอบล่วงหน้าเป็นเรื่องปกติ — คนเดิมลงหลายเกมติดกันก็มี
      ตอนนี้จัดได้หมด แล้วไปบอกเอาตอนแสดงผลแทนว่าคิวไหนต้องรอคิวก่อนหน้าลงก่อน
      (ดู blockedBy ใน view) ส่วนการลงคอร์ตจริง startMatch กันคนซ้อนเกมอยู่แล้ว
    */
    for (const pid of ids) {
      const sp = s.players.find((p) => p.playerId === pid)
      if (!sp) throw new StoreError("มีคนในเกมที่ยังไม่ได้เช็คอิน", 400)
      if (sp.status === "left") throw new StoreError("มีคนในเกมที่กลับบ้านแล้ว", 400)
    }

    const roster = rosterMap()
    const levels = ids.map((pid) => roster.get(pid)?.level ?? 1)
    const planned: PlannedMatch = {
      id: id("pl_"),
      type: input.type,
      teamA: input.teamA,
      teamB: input.teamB,
      createdAt: Date.now(),
      createdBy: input.createdBy ?? "manual",
      levelGap: Math.max(...levels) - Math.min(...levels),
    }
    s.planned.push(planned)
    s.events.push(
      event("plan.add", `จัดเกมเข้าคิว: ${ids.map((pid) => nameOf(roster, pid)).join(", ")}`, {}),
    )
    return planned
  })
  return { session: out.session, planned: out.result }
}

export function unplanMatch(sessionId: string, plannedId: string): Session {
  return mutate(sessionId, (s) => {
    const index = s.planned.findIndex((p) => p.id === plannedId)
    if (index < 0) throw new StoreError("ไม่พบเกมที่จัดไว้", 404)
    const [removed] = s.planned.splice(index, 1)
    const roster = rosterMap()
    const ids = removed ? [...removed.teamA, ...removed.teamB] : []
    s.events.push(event("plan.remove", `เอาเกมออกจากคิว: ${ids.map((pid) => nameOf(roster, pid)).join(", ")}`, {}))
  }).session
}

/** เลื่อนลำดับคิวขึ้น/ลง — หัวก๊วนสลับได้เองว่าจะให้เกมไหนได้ลงก่อน */
export function movePlanned(sessionId: string, plannedId: string, direction: "up" | "down"): Session {
  return mutate(sessionId, (s) => {
    const index = s.planned.findIndex((p) => p.id === plannedId)
    if (index < 0) throw new StoreError("ไม่พบเกมที่จัดไว้", 404)
    const target = direction === "up" ? index - 1 : index + 1
    if (target < 0 || target >= s.planned.length) return
    const [moved] = s.planned.splice(index, 1)
    if (moved) s.planned.splice(target, 0, moved)
    s.events.push(event("plan.move", `สลับลำดับคิวเกม`, {}))
  }).session
}

/** เอาเกมที่จัดไว้ลงคอร์ต — ตรวจก่อนว่าทุกคนยังลงได้จริง */
export function startPlanned(
  sessionId: string,
  plannedId: string,
  courtIndex: number,
): { session: Session; match: Match } {
  const session = getSession(sessionId)
  const planned = session.planned.find((p) => p.id === plannedId)
  if (!planned) throw new StoreError("ไม่พบเกมที่จัดไว้", 404)

  const out = startMatch(sessionId, {
    courtIndex,
    type: planned.type,
    teamA: planned.teamA,
    teamB: planned.teamB,
    createdBy: planned.createdBy,
  })
  // ลงสนามแล้วค่อยเอาออกจากคิว — ถ้า startMatch โยน error คิวต้องไม่หาย
  return { session: unplanMatch(sessionId, plannedId), match: out.match }
}

function nameOf(roster: Map<string, RosterPlayer>, playerId: string): string {
  const p = roster.get(playerId)
  return p ? displayName(p) : playerId
}

export function finishMatch(
  sessionId: string,
  input: { matchId: string; sets?: MatchSet[]; shuttles?: number; winner?: "A" | "B" | "draw" },
): Session {
  return mutate(sessionId, (s) => {
    const match = s.matches.find((m) => m.id === input.matchId)
    if (!match) throw new StoreError("ไม่พบเกมนี้", 404)
    if (match.endedAt) throw new StoreError("เกมนี้จบไปแล้ว", 400)

    const now = Date.now()
    match.endedAt = now
    if (typeof input.shuttles === "number") match.shuttles = Math.max(0, input.shuttles)
    // บันทึกคะแนนรายเซ็ตถ้ามี (ก๊วนนี้เล่น 21 แต้ม สองเซ็ต) แล้วสรุปผู้ชนะจากเซ็ตที่ได้
    const sets = (input.sets ?? []).filter((x) => x.a > 0 || x.b > 0)
    if (sets.length > 0) {
      match.sets = sets
      match.winner = winnerFromSets(sets) ?? undefined
    } else if (input.winner) {
      // ก๊วนส่วนใหญ่ไม่จดคะแนน — บอกแค่ว่าฝั่งไหนชนะก็พอสำหรับสถิติ
      match.winner = input.winner
    }

    const dur = now - match.startedAt
    for (const team of ["A", "B"] as const) {
      for (const pid of team === "A" ? match.teamA : match.teamB) {
        const sp = s.players.find((p) => p.playerId === pid)
        if (!sp) continue
        sp.gamesPlayed += 1
        sp.playedMs += dur
        if (match.winner === "draw") sp.draws += 1
        else if (match.winner === team) sp.wins += 1
        else if (match.winner) sp.losses += 1
        // จ่ายเงินไปแล้วระหว่างยังเล่นอยู่ → จบเกมนี้คือกลับบ้าน ไม่ต้องกลับเข้าคิว
        if (sp.status === "playing" && sp.paid) {
          sp.status = "left"
          sp.leftAt = now
          sp.queueSince = null
        } else if (sp.status === "playing") {
          // กลับเข้าคิว → เริ่มจับเวลารอใหม่ทันที (คนที่เพิ่งลงจึงอยู่ท้ายคิวเอง)
          sp.status = "queue"
          sp.queueSince = now
        }
      }
    }

    const court = s.courts[match.courtIndex]
    if (court && court.currentMatchId === match.id) court.currentMatchId = null

    const label = scoreLabel(match)
    const score = label ? ` ${label}` : ""
    s.events.push(
      event("match.end", `จบเกม #${match.no} ${court?.name ?? `คอร์ต ${match.courtIndex + 1}`}${score}`, {
        matchId: match.id,
      }),
    )
  }).session
}

/**
 * ย้ายเกมที่กำลังเล่นไปคอร์ตอื่น — ใช้ตอนคอร์ตเดิมต้องคืนสนามแต่เกมยังไม่จบ
 * เวลาที่เล่นไปแล้วไม่รีเซ็ต เพราะเป็นเกมเดิม แค่เปลี่ยนที่ยืน
 */
export function moveMatch(sessionId: string, matchId: string, toCourtIndex: number): Session {
  return mutate(sessionId, (s) => {
    const match = s.matches.find((m) => m.id === matchId)
    if (!match) throw new StoreError("ไม่พบเกมนี้", 404)
    if (match.endedAt) throw new StoreError("เกมนี้จบไปแล้ว ย้ายไม่ได้", 400)

    const to = s.courts[toCourtIndex]
    if (!to) throw new StoreError("ไม่พบคอร์ตปลายทาง", 404)
    if (to.index === match.courtIndex) throw new StoreError("เกมนี้อยู่คอร์ตนี้อยู่แล้ว", 400)
    if (to.currentMatchId) throw new StoreError(`${to.name} มีเกมอยู่แล้ว`, 400)
    if (to.disabled) throw new StoreError(`${to.name} ถูกปิดอยู่ เปิดคอร์ตก่อน`, 400)

    const from = s.courts[match.courtIndex]
    if (from && from.currentMatchId === match.id) from.currentMatchId = null
    match.courtIndex = to.index
    to.currentMatchId = match.id
    s.events.push(
      event("match.move", `ย้ายเกม #${match.no} จาก ${from?.name ?? "คอร์ตเดิม"} ไป ${to.name}`, { matchId }),
    )
  }).session
}

export function cancelMatch(sessionId: string, matchId: string): Session {
  return mutate(sessionId, (s) => {
    const idx = s.matches.findIndex((m) => m.id === matchId)
    if (idx < 0) throw new StoreError("ไม่พบเกมนี้", 404)
    const match = s.matches[idx]
    if (match.endedAt) throw new StoreError("เกมนี้จบไปแล้ว ยกเลิกไม่ได้ (ใช้ปุ่มย้อนกลับ)", 400)

    const now = Date.now()
    for (const pid of [...match.teamA, ...match.teamB]) {
      const sp = s.players.find((p) => p.playerId === pid)
      if (!sp || sp.status !== "playing") continue
      sp.status = "queue"
      // คืนเวลารอเดิมให้ (ถูกเรียกลงแล้วไม่ได้เล่น ไม่ควรเสียคิว)
      sp.queueSince = now - match.maxWaitAtStart
    }
    const court = s.courts[match.courtIndex]
    if (court && court.currentMatchId === match.id) court.currentMatchId = null
    s.matches.splice(idx, 1)
    s.events.push(event("match.cancel", `ยกเลิกเกม ${court?.name ?? ""}`.trim(), { matchId }))
  }).session
}

/** สลับคนในเกมที่กำลังเล่น (เจ็บ/มีคนขอเปลี่ยน) */
export function swapPlayer(
  sessionId: string,
  input: { matchId: string; outPlayerId: string; inPlayerId: string },
): Session {
  return mutate(sessionId, (s) => {
    const match = s.matches.find((m) => m.id === input.matchId)
    if (!match) throw new StoreError("ไม่พบเกมนี้", 404)
    if (match.endedAt) throw new StoreError("เกมนี้จบไปแล้ว", 400)

    const inSp = s.players.find((p) => p.playerId === input.inPlayerId)
    const outSp = s.players.find((p) => p.playerId === input.outPlayerId)
    if (!inSp || !outSp) throw new StoreError("ไม่พบผู้เล่นที่จะสลับ", 404)
    if (inSp.status === "playing") throw new StoreError("คนที่จะใส่เข้าไปกำลังเล่นอยู่คอร์ตอื่น", 400)
    if (inSp.status === "left") throw new StoreError("คนที่จะใส่เข้าไปกลับบ้านแล้ว", 400)

    const now = Date.now()
    const replace = (team: string[]) => {
      const i = team.indexOf(input.outPlayerId)
      if (i >= 0) team[i] = input.inPlayerId
      return i >= 0
    }
    if (!replace(match.teamA) && !replace(match.teamB)) {
      throw new StoreError("คนที่จะเอาออกไม่ได้อยู่ในเกมนี้", 400)
    }

    outSp.status = "queue"
    outSp.queueSince = now
    closeWait(inSp, now)
    inSp.status = "playing"

    const roster = rosterMap()
    const nameOf = (pid: string) => (roster.get(pid) ? displayName(roster.get(pid)!) : pid)
    s.events.push(
      event("match.swap", `สลับ ${nameOf(input.outPlayerId)} ออก ${nameOf(input.inPlayerId)} ลง`, {
        matchId: match.id,
      }),
    )
  }).session
}

/** ลูกแบดผูกกับเกมเสมอ — ไม่มีถังลูกลอย ๆ ที่ไม่รู้ว่าใครใช้ */
export function addShuttles(sessionId: string, delta: number, matchId: string): Session {
  return mutate(sessionId, (s) => {
    const match = s.matches.find((m) => m.id === matchId)
    if (!match) throw new StoreError("ไม่พบเกมนี้", 404)
    match.shuttles = Math.max(0, match.shuttles + delta)
    if (delta !== 0) {
      s.events.push(event("shuttle.add", `${delta > 0 ? "เพิ่ม" : "ลด"}ลูกแบด ${Math.abs(delta)} ลูก`, { matchId }))
    }
  }).session
}

// ── ค่าใช้จ่าย ────────────────────────────────────────────────────────────────

function roundUpTo(value: number, step: number): number {
  const s = step > 0 ? step : 1
  return Math.ceil(value / s) * s
}

export function computeBill(session: Session, roster: Map<string, RosterPlayer>): Bill {
  const fees = session.fees
  const shuttlesUsed = session.matches.reduce((n, m) => n + m.shuttles, 0)

  /**
   * ต้นทุนจริงของก๊วน = ค่าคอร์ต + ค่าลูกที่ซื้อมา + ค่าอื่น ๆ (กรอกเป็นยอดรวมทั้งหมด)
   * ไม่กรอก = ไม่รู้ต้นทุน ซึ่งต่างจาก "ต้นทุนเป็นศูนย์" — จึงต้องแยกให้ออก
   */
  const shuttleCost = fees.shuttleCostTotal
  const total = fees.courtCost + shuttleCost + fees.extraCost
  const costTracked = fees.courtCost > 0 || fees.shuttleCostTotal > 0

  // ทุกคนที่เช็คอินวันนี้ (รวมคนที่กลับไปแล้ว — เขาก็ใช้คอร์ตไปแล้ว)
  const people = session.players
  const n = people.length || 1

  /**
   * ค่าลูกแบบระบบก๊วน: ใครลงเกมไหน จ่ายค่าลูกของเกมนั้น "เต็มอัตราต่อคน"
   *
   * เกมหนึ่งใช้ 1 ลูก ทั้งสี่คนจ่ายคนละ 25 (ไม่ใช่เอา 25 มาหารสี่)
   * ก๊วนจึงเก็บได้ 100 ต่อลูก ซึ่งพอดีกับราคาลูกที่ซื้อมา — นี่คือวิธีที่ก๊วนใช้จริง
   */
  const shuttleUnits = new Map<string, number>()
  for (const m of session.matches) {
    const ids = [...m.teamA, ...m.teamB]
    if (ids.length === 0 || m.shuttles <= 0) continue
    for (const id of ids) shuttleUnits.set(id, (shuttleUnits.get(id) ?? 0) + m.shuttles)
  }

  /**
   * ลูกที่เปิดใช้นอกเกม (ซ้อมก่อนเริ่ม ฯลฯ) ก๊วนออกให้ — ไม่เก็บจากใครสักบาท
   * ยังนับรวมใน "ลูกที่ใช้ทั้งหมด" และต้นทุนจริงอยู่ เพราะก๊วนจ่ายค่าลูกนั้นไปแล้วจริง ๆ
   */
  const extraPerHead = fees.extraCost / n

  const round2 = (v: number) => Math.round(v * 100) / 100

  const lines: BillLine[] = people.map((sp) => {
    const player = roster.get(sp.playerId)
    // หารเท่า: เอาต้นทุนทั้งก้อนหารจำนวนคน — ช่องค่าอื่น ๆ ถูกบวกแยกด้านล่างอยู่แล้ว
    const fullCourt = fees.mode === "club" ? fees.courtFeePerHead : fees.courtCost / n
    // ยกเว้นค่าสนามรายคน (หัวก๊วนที่ลงไปตีเอง) — เก็บแต่ค่าลูก ส่วนที่หายไปไม่ผลักให้คนอื่น
    const noBill = sp.noBill === true
    const courtPart = noBill || sp.noCourtFee ? 0 : fullCourt

    /*
      จำนวนลูกที่คิดจริง = ลูกจากเกมที่ลง + ที่หัวก๊วนบวก/ลบเอง (ติดลบไม่ได้)

      เก็บเป็น "ลูก" ไม่ใช่บาท เพราะถ้าแก้ราคาลูกทีหลัง ยอดจะขยับตามเองทั้งก๊วน
      ส่วนโหมดหารเท่า ค่าลูกหารหัวอยู่แล้ว จึงเอาลูกที่ปรับไปคิดเป็นบาทบวกเพิ่ม/หักออก
    */
    const adjust = Math.round(sp.shuttleAdjust ?? 0)
    const baseUnits = fees.mode === "club" ? (shuttleUnits.get(sp.playerId) ?? 0) : 0
    const units = Math.max(0, baseUnits + adjust)
    const rawShuttle =
      fees.mode === "club" ? units * fees.shuttlePrice : shuttleCost / n + adjust * fees.shuttlePrice
    const shuttlePart = noBill ? 0 : Math.max(0, rawShuttle)
    const extraPart = noBill ? 0 : extraPerHead

    // ส่วนลดหักหลังปัดเศษ จะได้ลดตรงตามจำนวนที่กรอกเป๊ะ ๆ ไม่โดนปัดกลับขึ้นไป
    const discount = noBill ? 0 : Math.max(0, Math.round(sp.discount ?? 0))
    const beforeDiscount = roundUpTo(courtPart + shuttlePart + extraPart, fees.roundTo)

    return {
      playerId: sp.playerId,
      name: player ? displayName(player) : sp.playerId,
      games: sp.gamesPlayed,
      courtPart: round2(courtPart),
      shuttlePart: round2(shuttlePart),
      shuttleCount: fees.mode === "club" ? units : Math.max(0, baseUnits + adjust),
      shuttleAdjust: adjust,
      extraPart: round2(extraPart),
      amount: noBill ? 0 : Math.max(0, beforeDiscount - discount),
      paid: sp.paid,
      noCourtFee: sp.noCourtFee === true,
      noBill,
      discount,
    }
  })

  const billed = lines.reduce((sum, l) => sum + l.amount, 0)
  const collected = lines.filter((l) => l.paid).reduce((sum, l) => sum + l.amount, 0)
  const shuttleCharged = lines.reduce((sum, l) => sum + l.shuttlePart, 0)

  return {
    mode: fees.mode,
    courtCost: fees.courtCost,
    shuttleCharged: round2(shuttleCharged),
    shuttleCost,
    shuttlesUsed,
    extraCost: fees.extraCost,
    total,
    costTracked,
    billed,
    collected,
    lines: lines.sort((a, b) => b.games - a.games || a.name.localeCompare(b.name, "th")),
    balance: billed - total,
  }
}

// ── สรุปส่งกลุ่มไลน์ ──────────────────────────────────────────────────────────

export function summaryText(session: Session): string {
  const rmap = rosterMap()
  const bill = computeBill(session, rmap)
  const fees = session.fees
  const lines: string[] = []
  const end = session.endAt ?? Date.now()
  const baht = (v: number) => v.toLocaleString("th-TH", { maximumFractionDigits: 0 })

  lines.push(`🏸 ${session.name}`)
  if (session.venue) lines.push(`📍 ${session.venue}`)
  lines.push(`🕒 ${thaiTime(session.startAt)} - ${thaiTime(end)}`)
  lines.push(
    `👥 ${session.players.length} คน · 🎮 ${session.matches.filter((m) => m.endedAt).length} เกม · 🏸 ลูกที่ใช้ ${bill.shuttlesUsed} ลูก`,
  )
  lines.push("")

  if (fees.mode === "club") {
    lines.push(
      `💰 ค่าสนามคนละ ${baht(fees.courtFeePerHead)} + ค่าลูกคนละ ${baht(fees.shuttlePrice)} ต่อลูก (เฉพาะเกมที่ลง)`,
    )
  } else {
    lines.push(`💰 หารเท่ากันทุกคน — ต้นทุนรวม ${baht(bill.total)} บาท`)
  }
  if (bill.extraCost > 0) {
    lines.push(`   • อื่น ๆ ${baht(bill.extraCost)} บาท${fees.extraNote ? ` (${fees.extraNote})` : ""}`)
  }
  lines.push("")

  lines.push("💸 คนละ")
  for (const l of bill.lines) {
    // คนที่เอาออกจากบิลต้องอ่านออกว่าตั้งใจไม่เก็บ ไม่ใช่ลืมใส่ยอด
    if (l.noBill) {
      lines.push(`   🙅 ${l.name} ไม่คิดเงิน · ${l.games} เกม`)
      continue
    }
    const detail = fees.mode === "club" ? ` [สนาม ${baht(l.courtPart)} + ลูก ${baht(l.shuttlePart)}]` : ""
    // ส่วนลดต้องอ่านออกในสรุปที่ส่งเข้ากลุ่ม ไม่งั้นมีคนทักว่าทำไมยอดไม่เท่ากัน
    const cut = l.discount > 0 ? ` (ลดให้ ${baht(l.discount)})` : ""
    lines.push(`   ${l.paid ? "✅" : "⬜"} ${l.name} ${baht(l.amount)} บาท${cut} · ${l.games} เกม${detail}`)
  }
  lines.push("")
  lines.push(`รวมที่ต้องเก็บ ${baht(bill.billed)} บาท · เก็บแล้ว ${baht(bill.collected)} บาท`)

  lines.push("")
  lines.push("📲 สแกนจ่ายพร้อมเพย์ในหน้า “ค่าก๊วน” ของเว็บ")
  if (fees.promptPay) lines.push(`   ${fees.promptPay}`)

  // สถิติสนุก ๆ ปิดท้าย
  const top = [...session.players].sort((a, b) => b.gamesPlayed - a.gamesPlayed)[0]
  if (top && top.gamesPlayed > 0) {
    const p = rmap.get(top.playerId)
    if (p) {
      lines.push("")
      lines.push(`🔥 ลงเยอะสุด: ${displayName(p)} ${top.gamesPlayed} เกม`)
    }
  }
  const bestWin = [...session.players]
    .filter((p) => p.wins + p.losses + p.draws >= 2)
    .sort((a, b) => b.wins / (b.wins + b.losses + b.draws) - a.wins / (a.wins + a.losses + a.draws))[0]
  if (bestWin) {
    const p = rmap.get(bestWin.playerId)
    if (p) {
      const drawPart = bestWin.draws > 0 ? ` / ${bestWin.draws} เสมอ` : ""
      lines.push(`🏆 ชนะเยอะสุด: ${displayName(p)} ${bestWin.wins} ชนะ${drawPart} / ${bestWin.losses} แพ้`)
    }
  }
  const patient = [...session.players].sort((a, b) => b.longestWaitMs - a.longestWaitMs)[0]
  if (patient && patient.longestWaitMs > 0) {
    const p = rmap.get(patient.playerId)
    if (p) lines.push(`🧘 ใจเย็นสุด: ${displayName(p)} รอนานสุด ${formatMinutes(patient.longestWaitMs)}`)
  }
  return lines.join("\n")
}

// ── ประกอบข้อมูลให้หน้าเว็บ ───────────────────────────────────────────────────

export function buildView(session: Session, now = Date.now()): SessionView {
  const roster = getRoster()
  /*
    รายชื่อที่ส่งให้หน้าเว็บ (roster) = สมาชิกปัจจุบัน ใช้โชว์ในทะเบียน/เช็คอิน/หน้าจัดคน
    ส่วนแผนที่ชื่อ (rmap) รวมคนที่ลบไปแล้วด้วย เพราะบิลกับสถิติของก๊วนนี้อาจอ้างถึงเขาอยู่
    ถ้าใช้ชุดเดียวกัน ชื่อในบิลจะกลายเป็นรหัสดิบทันทีที่ลบใครออกจากทะเบียน
  */
  const rmap = rosterMap()
  const maxGames = session.players.reduce((m, p) => (p.status === "left" ? m : Math.max(m, p.gamesPlayed)), 0)
  const forecast = forecastQueue(session, now)

  const entry = (sp: SessionPlayer): QueueEntry | null => {
    const player = rmap.get(sp.playerId)
    if (!player) return null
    const waitMs = sp.queueSince == null ? 0 : Math.max(0, now - sp.queueSince)
    return {
      player,
      sp,
      waitMs,
      priority: priorityOf(sp, now, maxGames, session.settings),
      tier: waitTier(waitMs, session.settings),
      queueAhead: forecast.ahead.get(sp.playerId) ?? 0,
      etaMinutes: forecast.eta.get(sp.playerId) ?? null,
    }
  }

  const queue = session.players
    .filter((p) => p.status === "queue")
    .map(entry)
    .filter((q): q is QueueEntry => !!q)
    .sort((a, b) => b.priority - a.priority)

  const resting = session.players
    .filter((p) => p.status === "resting")
    .map(entry)
    .filter((q): q is QueueEntry => !!q)

  const courts: CourtView[] = session.courts.map((court) => {
    const match = court.currentMatchId ? session.matches.find((m) => m.id === court.currentMatchId) ?? null : null
    const players: CourtView["players"] = []
    if (match) {
      for (const team of ["A", "B"] as const) {
        for (const pid of team === "A" ? match.teamA : match.teamB) {
          const player = rmap.get(pid)
          const sp = session.players.find((p) => p.playerId === pid)
          if (player && sp) players.push({ player, sp, team })
        }
      }
    }
    return { court, match, players, elapsedMs: match ? now - match.startedAt : 0 }
  })

  /**
   * คิวเกมที่จัดไว้ — คนอาจกลับบ้านหรือถูกดึงไปลงคอร์ตอื่นหลังจากจัดไว้แล้ว
   * จึงต้องบอกตรงนี้เลยว่าเกมไหนยังลงได้ ไม่ใช่ปล่อยให้กดแล้วค่อยเด้ง error
   */
  /** คนที่ถูกจัดไว้ในคิวก่อนหน้า — คิวหลังต้องรอคิวก่อนลงจบก่อนถึงจะลงได้ */
  const usedEarlier = new Set<string>()
  const planned: PlannedView[] = session.planned.map((p) => {
    const players: PlannedView["players"] = []
    const waitingFor: string[] = []
    const problems: string[] = []
    const blockedBy: string[] = []

    for (const team of ["A", "B"] as const) {
      for (const pid of team === "A" ? p.teamA : p.teamB) {
        const player = rmap.get(pid)
        const sp = session.players.find((x) => x.playerId === pid)
        if (!player || !sp) {
          problems.push("มีคนที่ไม่อยู่ในก๊วนแล้ว")
          continue
        }
        players.push({ player, sp, team })
        if (sp.status === "left") problems.push(`${displayName(player)} กลับบ้านแล้ว`)
        else if (sp.status === "playing") waitingFor.push(displayName(player))
        else if (usedEarlier.has(pid)) blockedBy.push(displayName(player))
      }
    }
    for (const pid of [...p.teamA, ...p.teamB]) usedEarlier.add(pid)

    return {
      planned: p,
      players,
      ready: waitingFor.length === 0 && problems.length === 0 && blockedBy.length === 0,
      waitingFor: [...new Set(waitingFor)],
      problems: [...new Set(problems)],
      blockedBy: [...new Set(blockedBy)],
    }
  })

  const waits = queue.map((q) => q.waitMs)
  const dongAlerts = queue
    .filter((q) => q.tier === "dong")
    .map((q) => `${displayName(q.player)} รอมา ${formatMinutes(q.waitMs)}`)

  return {
    session,
    roster,
    courts,
    planned,
    queue,
    resting,
    bill: computeBill(session, rmap),
    now,
    dongAlerts,
    stats: {
      // "มาวันนี้" ต้องนับทุกคนที่เช็คอิน ไม่งั้นพอเก็บเงินครบทุกคนตอนจบก๊วน
      // (ซึ่งเช็คเอาท์ให้อัตโนมัติ) ตัวเลขจะกลายเป็น 0 เหมือนไม่มีใครมาเลย
      checkedIn: session.players.length,
      present: session.players.filter((p) => p.status !== "left").length,
      playing: session.players.filter((p) => p.status === "playing").length,
      waiting: queue.length,
      matchesDone: session.matches.filter((m) => m.endedAt).length,
      avgWaitMs: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0,
      maxWaitMs: waits.length ? Math.max(...waits) : 0,
      shuttlesUsed: session.matches.reduce((n, m) => n + m.shuttles, 0),
    },
  }
}

// ── สถิติรวมทุกครั้ง ──────────────────────────────────────────────────────────

export interface AllTimeStat {
  playerId: string
  name: string
  level: number
  sessions: number
  games: number
  wins: number
  losses: number
  draws: number
  playedMs: number
  waitedMs: number
  longestWaitMs: number
}

export function allTimeStats(): AllTimeStat[] {
  const rmap = rosterMap()
  const acc = new Map<string, AllTimeStat>()
  for (const s of listSessions()) {
    for (const sp of s.players) {
      const player = rmap.get(sp.playerId)
      const cur =
        acc.get(sp.playerId) ??
        ({
          playerId: sp.playerId,
          name: player ? displayName(player) : sp.playerId,
          level: player?.level ?? 1,
          sessions: 0,
          games: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          playedMs: 0,
          waitedMs: 0,
          longestWaitMs: 0,
        } satisfies AllTimeStat)
      cur.sessions += 1
      cur.games += sp.gamesPlayed
      cur.wins += sp.wins
      cur.losses += sp.losses
      cur.draws += sp.draws
      cur.playedMs += sp.playedMs
      cur.waitedMs += sp.waitedMs
      cur.longestWaitMs = Math.max(cur.longestWaitMs, sp.longestWaitMs)
      acc.set(sp.playerId, cur)
    }
  }
  return [...acc.values()].sort((a, b) => b.games - a.games)
}

// ── สำรอง / กู้ข้อมูลทั้งก้อน ──────────────────────────────────────────────────
//
// ทำไมเป็นไฟล์เดียว: หัวก๊วนพกคอมไปคนละเครื่อง ถ้าต้องไล่ก็อปโฟลเดอร์ data/ เอง
// มีโอกาสตกหล่น (ลืมโฟลเดอร์ photos/ หรือ sessions/ ทั้งอัน) ไฟล์เดียวจบคือก็อปยาก
// ที่จะผิด — เอาไปวางใน Google Drive หรือส่งเข้าไลน์ตัวเองก็ได้

/** รุ่นของรูปแบบไฟล์สำรอง — ขึ้นเลขเมื่อโครงสร้างเปลี่ยนจนของเก่าอ่านไม่ได้ */
const BACKUP_VERSION = 1

export interface BackupFile {
  /** ป้ายบอกว่าเป็นไฟล์สำรองของระบบนี้จริง กันเลือกไฟล์ผิดมากู้ */
  genki: "backup"
  version: number
  createdAt: number
  counts: { players: number; sessions: number; photos: number }
  roster: RosterPlayer[]
  /** ชื่อคนที่ลบไปแล้ว — ต้องไปด้วย ไม่งั้นบิลเก่าที่เครื่องใหม่จะขึ้นรหัสดิบ */
  removed: RosterPlayer[]
  current: { id: string | null }
  sessions: Session[]
  /** รูปสมาชิก เก็บเป็น base64 ในไฟล์เดียวกัน */
  photos: { id: string; ext: string; data: string }[]
}

export function exportBackup(): BackupFile {
  ensureDirs()
  const sessions = listSessions()
  const photos: BackupFile["photos"] = []
  if (fs.existsSync(PHOTO_DIR)) {
    for (const f of fs.readdirSync(PHOTO_DIR)) {
      const m = /^([A-Za-z0-9_-]+)\.([a-z]+)$/.exec(f)
      if (!m || !Object.values(PHOTO_TYPES).includes(m[2]!)) continue
      try {
        photos.push({ id: m[1]!, ext: m[2]!, data: fs.readFileSync(path.join(PHOTO_DIR, f)).toString("base64") })
      } catch {
        // รูปใบไหนอ่านไม่ได้ก็ข้ามไป ดีกว่าสำรองไม่ได้ทั้งก้อนเพราะรูปใบเดียว
      }
    }
  }
  const roster = getRoster()
  return {
    genki: "backup",
    version: BACKUP_VERSION,
    createdAt: Date.now(),
    counts: { players: roster.length, sessions: sessions.length, photos: photos.length },
    roster,
    removed: getRemoved(),
    current: { id: currentSessionId() },
    sessions,
    photos,
  }
}

/** ตรวจว่าไฟล์ที่เลือกมาเป็นไฟล์สำรองจริง ไม่ใช่ไฟล์อื่นที่หน้าตาคล้าย ๆ */
export function readBackup(raw: unknown): BackupFile {
  const b = raw as Partial<BackupFile> | null
  if (!b || typeof b !== "object" || b.genki !== "backup") {
    throw new StoreError("ไฟล์นี้ไม่ใช่ไฟล์สำรองของระบบก๊วน", 400)
  }
  if (typeof b.version !== "number" || b.version > BACKUP_VERSION) {
    throw new StoreError("ไฟล์สำรองนี้มาจากระบบรุ่นใหม่กว่า — อัปเดตเว็บก่อนแล้วค่อยกู้", 400)
  }
  if (!Array.isArray(b.roster) || !Array.isArray(b.sessions)) {
    throw new StoreError("ไฟล์สำรองเสียหาย — ไม่มีทะเบียนหรือประวัติก๊วนอยู่ข้างใน", 400)
  }
  return {
    genki: "backup",
    version: b.version,
    createdAt: typeof b.createdAt === "number" ? b.createdAt : Date.now(),
    counts: b.counts ?? { players: b.roster.length, sessions: b.sessions.length, photos: 0 },
    roster: b.roster,
    removed: Array.isArray(b.removed) ? b.removed : [],
    current: b.current && typeof b.current === "object" ? b.current : { id: null },
    sessions: b.sessions,
    photos: Array.isArray(b.photos) ? b.photos : [],
  }
}

/**
 * กู้ข้อมูลจากไฟล์สำรอง — ทับของที่อยู่ในเครื่องนี้ทั้งหมด
 *
 * ก่อนทับจะยกโฟลเดอร์ data/ เดิมไปเก็บไว้เป็น data.before-restore-<เวลา> เสมอ
 * กดกู้ผิดไฟล์ก็ยังเอาของเดิมกลับมาได้ (ชื่อโฟลเดอร์อยู่ในผลลัพธ์ที่ตอบกลับไป)
 */
export function restoreBackup(backup: BackupFile): { movedTo: string | null; counts: BackupFile["counts"] } {
  ensureDirs()

  let movedTo: string | null = null
  if (fs.existsSync(DATA_DIR)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    const dest = `${DATA_DIR}.before-restore-${stamp}`
    try {
      fs.cpSync(DATA_DIR, dest, { recursive: true })
      movedTo = dest
    } catch {
      throw new StoreError("สำรองข้อมูลเดิมไว้ก่อนกู้ไม่สำเร็จ — ยังไม่ได้แตะข้อมูลเก่า", 500)
    }
  }

  // ล้างของเดิมออกก่อน ไม่งั้นก๊วนที่ไม่มีในไฟล์สำรองจะค้างปนอยู่
  for (const f of fs.readdirSync(SESSION_DIR)) {
    if (f.endsWith(".json") || f.endsWith(".bak")) fs.rmSync(path.join(SESSION_DIR, f), { force: true })
  }
  if (fs.existsSync(PHOTO_DIR)) fs.rmSync(PHOTO_DIR, { recursive: true, force: true })

  for (const s of backup.sessions) {
    if (!s || typeof s.id !== "string") continue
    writeJson(sessionFile(s.id), s)
  }
  writeJson(ROSTER_FILE, backup.roster)
  writeJson(REMOVED_FILE, backup.removed)

  if (backup.photos.length > 0) {
    fs.mkdirSync(PHOTO_DIR, { recursive: true })
    for (const p of backup.photos) {
      if (!/^[A-Za-z0-9_-]+$/.test(p.id)) continue
      if (!Object.values(PHOTO_TYPES).includes(p.ext)) continue
      try {
        fs.writeFileSync(photoFile(p.id, p.ext), Buffer.from(p.data, "base64"))
      } catch {
        // รูปใบไหนเขียนไม่ได้ก็ข้าม ไม่ต้องล้มทั้งการกู้เพราะรูปใบเดียว
      }
    }
  }

  // ตัวชี้ "ก๊วนปัจจุบัน" ต้องชี้ไปที่ก๊วนที่มีอยู่จริงในไฟล์สำรองเท่านั้น
  const ids = new Set(backup.sessions.map((s) => s.id))
  writeJson(POINTER_FILE, { id: backup.current.id && ids.has(backup.current.id) ? backup.current.id : null })

  // ประวัติ undo ของเครื่องนี้อ้างถึงก๊วนชุดเก่า ใช้ต่อไม่ได้แล้ว
  undoStacks.clear()

  return {
    movedTo,
    counts: {
      players: backup.roster.length,
      sessions: backup.sessions.length,
      photos: backup.photos.length,
    },
  }
}
