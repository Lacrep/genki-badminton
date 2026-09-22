/**
 * โดเมนของระบบจัดก๊วน — ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์ (api/) และหน้าเว็บ (src/)
 *
 * แนวคิดหลัก 3 อย่าง
 *  1) คิว (queue)      — ใครรออยู่ รอมานานแค่ไหน (queueSince)
 *  2) ลำดับมือ (level) — 1..10 ตามระดับมือแบบก๊วนไทย (N → B/A)
 *  3) ความเป็นธรรม     — priority = เวลารอ + จำนวนเกมที่ตามหลังคนอื่น
 *                        ทำให้ "คนถูกดอง" ลอยขึ้นหัวคิวเองโดยไม่ต้องจำ
 */

export type Gender = "m" | "f"

/** ประเภทเกมที่จัดลงคอร์ตได้ */
export type MatchType =
  | "D" // คู่ทั่วไป (ไม่สนเพศ)
  | "MD" // ชายคู่
  | "WD" // หญิงคู่
  | "XD" // คู่ผสม
  | "MS" // ชายเดี่ยว
  | "WS" // หญิงเดี่ยว
  | "S" // เดี่ยวทั่วไป

export const MATCH_TYPE_LABEL: Record<MatchType, string> = {
  D: "คู่ทั่วไป",
  MD: "ชายคู่",
  WD: "หญิงคู่",
  XD: "คู่ผสม",
  MS: "ชายเดี่ยว",
  WS: "หญิงเดี่ยว",
  S: "เดี่ยวทั่วไป",
}

export function playersPerMatch(type: MatchType): 2 | 4 {
  return type === "S" || type === "MS" || type === "WS" ? 2 : 4
}

// ── ลำดับมือ ─────────────────────────────────────────────────────────────────
// เทียบเคียงระดับมือที่ก๊วนไทยใช้กัน: มือใหม่ → N → S → P → C → B/A

export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export interface LevelInfo {
  level: Level
  code: string
  name: string
  hint: string
  /** สีประจำระดับ (tailwind class) */
  tone: string
}

export const LEVELS: LevelInfo[] = [
  { level: 1, code: "N", name: "มือใหม่", hint: "เพิ่งเริ่มเล่น ตีโต้ยังไม่ต่อเนื่อง", tone: "level-n" },
  { level: 2, code: "N+", name: "มือใหม่+", hint: "ตีโต้ได้ เริ่มเล่นคู่เป็น", tone: "level-n" },
  { level: 3, code: "S-", name: "มือ S-", hint: "รู้ตำแหน่งยืน ตบ/ดรอปพอได้", tone: "level-s" },
  { level: 4, code: "S", name: "มือ S", hint: "เล่นคู่ได้ลื่น ลูกหน้าเน็ตเริ่มคม", tone: "level-s" },
  { level: 5, code: "S+", name: "มือ S+", hint: "เกมคู่แน่น สลับหน้า-หลังคล่อง", tone: "level-s" },
  { level: 6, code: "P-", name: "มือ P-", hint: "ตบหนัก คุมจังหวะเกมได้", tone: "level-p" },
  { level: 7, code: "P", name: "มือ P", hint: "ระดับก๊วนแข่ง ทุกลูกครบเครื่อง", tone: "level-p" },
  { level: 8, code: "P+", name: "มือ P+", hint: "แข่งรายการสมัครเล่นระดับต้น", tone: "level-p" },
  { level: 9, code: "C", name: "มือ C", hint: "แข่งรายการจริงจัง", tone: "level-c" },
  { level: 10, code: "B/A", name: "มือ B/A", hint: "ระดับนักกีฬา / อดีตเยาวชนทีมชาติ", tone: "level-c" },
]

export function levelInfo(level: number): LevelInfo {
  return LEVELS[Math.min(LEVELS.length, Math.max(1, Math.round(level))) - 1]
}

// ── ผู้เล่นในทะเบียนก๊วน (อยู่ข้ามครั้ง) ──────────────────────────────────────

export interface RosterPlayer {
  id: string
  name: string
  nickname?: string
  gender: Gender
  level: Level
  /** สมาชิกก๊วน (จ่ายเรทสมาชิก) หรือขาจร */
  member: boolean
  phone?: string
  note?: string
  /** เก็บเข้ากรุ — ไม่โชว์ในรายชื่อเช็คอิน แต่สถิติเก่ายังอยู่ */
  archived?: boolean
  createdAt: number
}

// ── ผู้เล่นในก๊วนวันนี้ ───────────────────────────────────────────────────────

/** queue = นั่งรอคิว · playing = อยู่ในคอร์ต · resting = ขอพัก (ไม่ถูกสุ่ม) · left = กลับแล้ว */
export type PlayerStatus = "queue" | "playing" | "resting" | "left"

export interface SessionPlayer {
  playerId: string
  status: PlayerStatus
  checkInAt: number
  leftAt?: number
  /** เริ่มนับเวลารอเมื่อไร (เช็คอิน / จบเกม / เลิกพัก) — null ตอนอยู่ในคอร์ต */
  queueSince: number | null
  gamesPlayed: number
  /** เวลาที่อยู่ในคอร์ตรวมทั้งวัน (ms) */
  playedMs: number
  /** เวลารวมที่นั่งรอทั้งวัน (ms) — ปิดยอดทุกครั้งที่ได้ลงเล่น */
  waitedMs: number
  /** เวลารอที่นานที่สุดในวันนี้ (ms) — ใช้ดูว่าเคยถูกดองหนักแค่ไหน */
  longestWaitMs: number
  wins: number
  losses: number
  /** ดันคิวด้วยมือ (+1 = ขอให้ได้ลงก่อน, -1 = ยอมถอยให้คนอื่น) */
  boost: number
  paid: boolean
  paidAt?: number
  /** ผู้เล่นที่เพิ่มสดหน้างาน ไม่ต้องอยู่ในทะเบียนถาวร */
  guestOnly?: boolean
}

// ── คอร์ตและเกม ───────────────────────────────────────────────────────────────

export interface Court {
  index: number
  name: string
  /** ปิดคอร์ตชั่วคราว (ยังไม่ถึงเวลา / คนอื่นใช้) */
  disabled?: boolean
  currentMatchId: string | null
}

export interface Match {
  id: string
  courtIndex: number
  type: MatchType
  teamA: string[]
  teamB: string[]
  startedAt: number
  endedAt?: number
  scoreA?: number
  scoreB?: number
  winner?: "A" | "B"
  /** ลูกที่ใช้ในเกมนี้ */
  shuttles: number
  createdBy: "auto" | "manual"
  /** ค่าความสูสีที่ระบบคาดไว้ตอนจัด (0 = เท่ากันเป๊ะ, ยิ่งมากยิ่งห่าง) */
  levelGap: number
  /** เวลารอสูงสุดของผู้เล่นในเกมนี้ตอนถูกเรียกลง (ms) — ใช้ตรวจว่าระบบดองใครไหม */
  maxWaitAtStart: number
}

// ── ค่าใช้จ่าย ────────────────────────────────────────────────────────────────

/**
 * equal   — หารเท่ากันทุกคน (ค่าคอร์ต + ค่าลูก)
 * byGames — หารตามจำนวนเกมที่ลง (คนมาช้า/ลงน้อย จ่ายน้อย)
 * split   — ค่าคอร์ตหารเท่า + ค่าลูกหารตามเกมที่ลง (นิยมที่สุด)
 * flat    — เก็บหัวละเท่าไรก็ว่าไป (เรทสมาชิก/ขาจร) แล้วดูว่าขาดหรือเกิน
 */
export type FeeMode = "equal" | "byGames" | "split" | "flat"

export const FEE_MODE_LABEL: Record<FeeMode, string> = {
  equal: "หารเท่ากันทุกคน",
  byGames: "หารตามเกมที่ลง",
  split: "ค่าคอร์ตหารเท่า + ค่าลูกตามเกม",
  flat: "เก็บหัวละเท่าไรก็ว่าไป",
}

export interface Fees {
  /** ค่าเช่าคอร์ตรวมทั้งวัน (บาท) */
  courtCost: number
  /** ราคาลูกละ (บาท) */
  shuttlePrice: number
  /** ค่าอื่น ๆ เช่น น้ำ/ขนม (บาท) */
  extraCost: number
  extraNote?: string
  mode: FeeMode
  /** ใช้เมื่อ mode = flat */
  memberFee: number
  guestFee: number
  /** ปัดเศษขึ้นเป็นกี่บาท (5 = ปัดขึ้นทีละ 5 บาท) */
  roundTo: number
  promptPay?: string
}

// ── ตั้งค่าการจัดคิว ──────────────────────────────────────────────────────────

export interface SessionSettings {
  /** ห่างกันได้ไม่เกินกี่ระดับมือในเกมเดียวกัน (ระบบจะผ่อนให้เองถ้าคนไม่พอ) */
  maxLevelGap: number
  /** น้ำหนักเวลารอ ต่อ 1 นาที */
  waitWeight: number
  /** น้ำหนักของการ "ตามหลังคนอื่น 1 เกม" */
  gamesBehindWeight: number
  /** โทษการซ้ำคู่/ซ้ำคู่แข่งกับเกมที่เพิ่งเล่น */
  varietyWeight: number
  /** โทษความห่างของระดับมือในกลุ่ม */
  levelWeight: number
  /** เกินกี่นาทีถือว่า "รอนาน" (การ์ดเปลี่ยนเป็นสีทอง) */
  warnWaitMinutes: number
  /** เกินกี่นาทีถือว่า "ถูกดอง" (การ์ดแดงกระพริบ + ระบบบังคับจัดลง) */
  dongWaitMinutes: number
  /** เกมหนึ่งใช้เวลาประมาณกี่นาที (ใช้ประเมินคิวถัดไป) */
  targetGameMinutes: number
  /** ประเภทเกมเริ่มต้นเวลากดสุ่ม */
  defaultMatchType: MatchType | "auto"
  /** เรียกชื่อด้วยเสียงเมื่อจัดลงคอร์ต */
  callSound: boolean
  /** ให้ระบบเติมคอร์ตว่างเองทันทีที่มีคนพอ */
  autoFill: boolean
}

export const DEFAULT_SETTINGS: SessionSettings = {
  maxLevelGap: 2,
  waitWeight: 1,
  gamesBehindWeight: 4,
  varietyWeight: 6,
  levelWeight: 8,
  warnWaitMinutes: 8,
  dongWaitMinutes: 15,
  targetGameMinutes: 14,
  defaultMatchType: "auto",
  callSound: true,
  autoFill: false,
}

export const DEFAULT_FEES: Fees = {
  courtCost: 0,
  shuttlePrice: 90,
  extraCost: 0,
  mode: "split",
  memberFee: 100,
  guestFee: 120,
  roundTo: 5,
  promptPay: "",
}

// ── ก๊วนหนึ่งครั้ง ────────────────────────────────────────────────────────────

export type SessionStatus = "live" | "ended"

export interface SessionEvent {
  at: number
  kind:
    | "session.start"
    | "session.end"
    | "player.checkin"
    | "player.checkout"
    | "player.rest"
    | "player.resume"
    | "match.start"
    | "match.end"
    | "match.cancel"
    | "match.swap"
    | "shuttle.add"
    | "pay"
    | "undo"
  text: string
  /** ข้อมูลพอให้ย้อน (undo) การกระทำล่าสุดได้ */
  matchId?: string
  playerId?: string
}

export interface Session {
  id: string
  name: string
  /** วันที่แบบ YYYY-MM-DD (ตามเวลาไทย) */
  date: string
  venue: string
  startAt: number
  endAt?: number
  status: SessionStatus
  /** รหัสสำหรับลิงก์ให้ลูกก๊วนดูคิว /q/<code> */
  code: string
  courts: Court[]
  players: SessionPlayer[]
  matches: Match[]
  events: SessionEvent[]
  settings: SessionSettings
  fees: Fees
  shuttlesExtra: number
  notes?: string
}

// ── ค่าที่คำนวณให้หน้าเว็บ (ฝั่งเซิร์ฟเวอร์ประกอบให้เสร็จ) ────────────────────

export type WaitTier = "fresh" | "waiting" | "warn" | "dong"

export interface QueueEntry {
  player: RosterPlayer
  sp: SessionPlayer
  waitMs: number
  /** คะแนนความควรได้ลง — ยิ่งสูงยิ่งต้องได้ลงก่อน */
  priority: number
  tier: WaitTier
  /** ประมาณว่าอีกกี่คิวถึงตา (0 = คิวหน้า) */
  queueAhead: number
  /** นาทีที่คาดว่าจะได้ลง */
  etaMinutes: number | null
}

export interface CourtView {
  court: Court
  match: Match | null
  players: { player: RosterPlayer; sp: SessionPlayer; team: "A" | "B" }[]
  elapsedMs: number
}

export interface BillLine {
  playerId: string
  name: string
  games: number
  member: boolean
  amount: number
  paid: boolean
}

export interface Bill {
  courtCost: number
  shuttleCost: number
  shuttlesUsed: number
  extraCost: number
  total: number
  collected: number
  mode: FeeMode
  lines: BillLine[]
  /** ยอดที่เก็บได้ลบต้นทุน (บวก = เหลือเข้าก๊วน, ลบ = ขาด) */
  balance: number
}

export interface SessionView {
  session: Session
  roster: RosterPlayer[]
  courts: CourtView[]
  queue: QueueEntry[]
  resting: QueueEntry[]
  bill: Bill
  now: number
  /** เตือนว่ามีคนถูกดอง */
  dongAlerts: string[]
  stats: {
    checkedIn: number
    playing: number
    waiting: number
    matchesDone: number
    avgWaitMs: number
    maxWaitMs: number
    shuttlesUsed: number
  }
}

// ── ฟังก์ชันร่วม ──────────────────────────────────────────────────────────────

export function displayName(p: RosterPlayer): string {
  return p.nickname?.trim() ? p.nickname.trim() : p.name
}

/** คะแนนความควรได้ลงเล่น — สูตรเดียวกันทั้งฝั่งจัดคิวและฝั่งแสดงผล */
export function priorityOf(
  sp: SessionPlayer,
  now: number,
  maxGames: number,
  s: SessionSettings,
): number {
  const waitMin = sp.queueSince == null ? 0 : Math.max(0, (now - sp.queueSince) / 60_000)
  const gamesBehind = Math.max(0, maxGames - sp.gamesPlayed)
  return waitMin * s.waitWeight + gamesBehind * s.gamesBehindWeight + sp.boost * 30
}

export function waitTier(waitMs: number, s: SessionSettings): WaitTier {
  const min = waitMs / 60_000
  if (min >= s.dongWaitMinutes) return "dong"
  if (min >= s.warnWaitMinutes) return "warn"
  if (min >= s.warnWaitMinutes / 2) return "waiting"
  return "fresh"
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const sec = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  return `${m}:${String(sec).padStart(2, "0")}`
}

export function formatMinutes(ms: number): string {
  const min = Math.round(ms / 60_000)
  if (min < 60) return `${min} นาที`
  return `${Math.floor(min / 60)} ชม. ${min % 60} นาที`
}

/** YYYY-MM-DD ตามเวลาไทย (UTC+7) ไม่ขึ้นกับ timezone ของเครื่อง */
export function thaiDateKey(at: number = Date.now()): string {
  return new Date(at + 7 * 3600_000).toISOString().slice(0, 10)
}

export function thaiTime(at: number): string {
  const d = new Date(at + 7 * 3600_000)
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`
}
