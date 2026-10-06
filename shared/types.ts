/**
 * โดเมนของระบบจัดก๊วน — ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์ (api/) และหน้าเว็บ (src/)
 *
 * แนวคิดหลัก 3 อย่าง
 *  1) คิว (queue)      — ใครรออยู่ รอมานานแค่ไหน (queueSince)
 *  2) ระดับมือ (level) — หน้าบ้าน → BG → N- → N → S → P → OPEN
 *  3) ความเป็นธรรม     — priority = เวลารอ + จำนวนเกมที่ตามหลังคนอื่น
 *                        ทำให้ "คนถูกดอง" ลอยขึ้นหัวคิวเองโดยไม่ต้องจำ
 *
 * ข้อมูลผู้เล่นเก็บน้อยที่สุดเท่าที่ระบบต้องใช้จริง: ชื่อที่ใช้เรียกในก๊วน + ระดับมือ
 * (ไม่เก็บชื่อจริง ไม่เก็บเพศ ไม่แบ่งประเภทสมาชิก)
 */

import { CLUB } from "./club"

/** ประเภทเกม — ก๊วนนี้เล่นคู่เป็นหลัก มีเดี่ยวไว้เผื่อคนเหลือ 2-3 คน */
export type MatchType = "D" | "S"

export const MATCH_TYPE_LABEL: Record<MatchType, string> = {
  D: "คู่",
  S: "เดี่ยว",
}

export function playersPerMatch(type: MatchType): 2 | 4 {
  return type === "S" ? 2 : 4
}

// ── ระดับมือ ─────────────────────────────────────────────────────────────────

export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7

export interface LevelInfo {
  level: Level
  code: string
  name: string
  hint: string
  /** สีประจำระดับ (คลาสใน index.css) */
  tone: string
}

/**
 * ระดับมือทั้ง 7 ขั้น — แต่ละขั้นมีสีของตัวเอง ไม่ใช้สีซ้ำกัน
 *
 * ไล่เฉดจากฟ้าอ่อน (มือใหม่) → น้ำเงินเข้ม (มือกลาง) → ทอง (มือเก่ง) → แดง (มือเปิด)
 * เพราะหัวก๊วนต้องกวาดตาดูทีเดียวแล้วรู้ว่าใครมือไหน ถ้าสองขั้นสีเหมือนกันก็แยกไม่ออก
 */
export const LEVELS: LevelInfo[] = [
  { level: 1, code: "หน้าบ้าน", name: "มือหน้าบ้าน", hint: "ตีสนุก ๆ ยังไม่เคยเล่นในก๊วนจริงจัง", tone: "level-1" },
  { level: 2, code: "BG", name: "มือ BG", hint: "เริ่มเล่นในก๊วน ตีโต้ได้ เริ่มจับตำแหน่งยืน", tone: "level-2" },
  { level: 3, code: "N-", name: "มือ N-", hint: "เล่นคู่ได้ ลูกยังไม่นิ่งตลอดเกม", tone: "level-3" },
  { level: 4, code: "N", name: "มือ N", hint: "เล่นคู่ลื่น รู้จังหวะสลับหน้า-หลัง", tone: "level-4" },
  { level: 5, code: "S", name: "มือ S", hint: "ตบ/ดรอป/หน้าเน็ตคม คุมเกมได้", tone: "level-5" },
  { level: 6, code: "P", name: "มือ P", hint: "ระดับก๊วนแข่ง ครบเครื่องทุกลูก", tone: "level-6" },
  { level: 7, code: "OPEN", name: "มือ OPEN", hint: "ระดับแข่งรายการ / มือเปิด", tone: "level-7" },
]

/** สีพื้นวงกลมชื่อ/ป้ายบนจอใหญ่ — เข้มพอให้ตัวอักษรขาวอ่านออกจากระยะไกล */
export const LEVEL_SOLID: Record<number, string> = {
  1: "#8fa3bf",
  2: "#5a74a8",
  3: "#3d5590",
  4: "#1d2447",
  5: "#bf9d65",
  6: "#9c7c47",
  7: "#c2223c",
}

export function levelSolid(level: number): string {
  return LEVEL_SOLID[Math.min(MAX_LEVEL, Math.max(1, Math.round(level)))] ?? LEVEL_SOLID[4]!
}

export const MAX_LEVEL = LEVELS.length

export function levelInfo(level: number): LevelInfo {
  return LEVELS[Math.min(MAX_LEVEL, Math.max(1, Math.round(level))) - 1]
}

// ── ผู้เล่นในทะเบียนก๊วน (อยู่ข้ามครั้ง) ──────────────────────────────────────

export interface RosterPlayer {
  id: string
  /** ชื่อที่ใช้เรียกกันในก๊วน (ไม่ต้องเป็นชื่อจริง) */
  name: string
  level: Level
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
  /** เสมอ — เล่น 2 เซ็ตแล้วได้กันคนละเซ็ต ก็จบที่เสมอ */
  draws: number
  /** ดันคิวด้วยมือ (+1 = ขอให้ได้ลงก่อน, -1 = ยอมถอยให้คนอื่น) */
  boost: number
  paid: boolean
  paidAt?: number
}

// ── คอร์ตและเกม ───────────────────────────────────────────────────────────────

export interface Court {
  index: number
  name: string
  /** ปิดคอร์ตชั่วคราว (ยังไม่ถึงเวลา / คนอื่นใช้) */
  disabled?: boolean
  currentMatchId: string | null
}

/** คะแนนหนึ่งเซ็ต (ก๊วนนี้เล่น 21 แต้ม สองเซ็ต ถ้าเสมอต่อเซ็ตที่ 3) */
export interface MatchSet {
  a: number
  b: number
}

export interface Match {
  id: string
  courtIndex: number
  type: MatchType
  teamA: string[]
  teamB: string[]
  startedAt: number
  endedAt?: number
  /** คะแนนรายเซ็ต — ปกติ 2 เซ็ต ถ้าเสมอกันจะมีเซ็ตที่ 3 */
  sets?: MatchSet[]
  /** คะแนนแบบเซ็ตเดียวของข้อมูลรุ่นเก่า (ยังอ่านได้ ไม่ได้ใช้บันทึกใหม่แล้ว) */
  scoreA?: number
  scoreB?: number
  /** "draw" = ได้กันคนละเซ็ต (เล่น 2 เซ็ตจึงเสมอกันได้) */
  winner?: "A" | "B" | "draw"
  /** ลูกที่ใช้ในเกมนี้ — ใช้คิดค่าลูกให้คนที่ลงเกมนี้ */
  shuttles: number
  createdBy: "auto" | "manual"
  /** ค่าความสูสีที่ระบบคาดไว้ตอนจัด (0 = เท่ากันเป๊ะ, ยิ่งมากยิ่งห่าง) */
  levelGap: number
  /** เวลารอสูงสุดของผู้เล่นในเกมนี้ตอนถูกเรียกลง (ms) — ใช้ตรวจว่าระบบดองใครไหม */
  maxWaitAtStart: number
}

// ── ค่าใช้จ่าย ────────────────────────────────────────────────────────────────

/**
 * club  — ระบบก๊วน: ค่าสนามคนละ X + ค่าลูก "คนละ Y ต่อลูก" ของทุกเกมที่ลง
 * equal — หารเท่ากันทุกคน: (ค่าสนามทั้งหมด + ค่าลูกทั้งหมด + ค่าอื่น ๆ) ÷ คนที่มาวันนั้น
 */
export type FeeMode = "club" | "equal"

export const FEE_MODE_LABEL: Record<FeeMode, string> = {
  club: "ระบบก๊วน",
  equal: "หารเท่ากันทุกคน",
}

export interface Fees {
  mode: FeeMode
  /** ค่าสนามที่เก็บต่อหัว (โหมดระบบก๊วน) */
  courtFeePerHead: number
  /**
   * ค่าลูกที่ "เก็บจากลูกก๊วนแต่ละคน" ต่อลูกหนึ่งลูก (ไม่ใช่ราคาที่ก๊วนซื้อลูกมา)
   *
   * เกมหนึ่งใช้ 1 ลูก → ทั้ง 4 คนในเกมนั้นจ่ายคนละเท่านี้ ไม่ใช่เอามาหารกัน
   * (ก๊วนเก็บได้ 4 เท่าของเลขนี้ต่อลูก ซึ่งพอดีกับราคาลูกที่ซื้อมาจริง)
   */
  shuttlePrice: number
  /**
   * ค่าลูกที่ก๊วนจ่ายไปทั้งวัน (ยอดรวม ไม่ใช่ต่อลูก)
   *
   * โหมดหารเท่า ใช้ตัวนี้เป็นตัวตั้งตรง ๆ · โหมดระบบก๊วน ใช้คิดว่าเก็บได้เกินหรือขาด
   * ใส่ 0 = ไม่ได้กรอก (ระบบจะไม่เดาให้ และจะไม่โชว์ยอดกำไร/ขาดทุน)
   */
  shuttleCostTotal: number
  /**
   * ค่าเช่าคอร์ตที่จ่ายสนามจริงทั้งวัน — โหมดหารเท่าใช้ตัวนี้เป็นตัวตั้ง
   * โหมดระบบก๊วนใส่ไว้เพื่อดูว่าเก็บได้เกินหรือขาดเท่าไร (ใส่ 0 ได้)
   */
  courtCost: number
  /** ค่าอื่น ๆ เช่น น้ำ/ขนม — หารเท่ากันทุกคนทั้งสองโหมด */
  extraCost: number
  extraNote?: string
  /** ปัดเศษขึ้นเป็นกี่บาท (5 = ปัดขึ้นทีละ 5 บาท) */
  roundTo: number
  /** ชื่อบัญชี/พร้อมเพย์ที่โชว์ใต้ QR */
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
  /** เกมหนึ่ง (2 เซ็ต) ใช้เวลาประมาณกี่นาที — ใช้ประเมินคิวถัดไป */
  targetGameMinutes: number
  /** ประเภทเกมเริ่มต้นเวลากดสุ่ม */
  defaultMatchType: MatchType | "auto"
  /** เรียกชื่อด้วยเสียงเมื่อจัดลงคอร์ต */
  callSound: boolean
}

export const DEFAULT_SETTINGS: SessionSettings = {
  // 7 ระดับมือ แต่ละขั้นห่างกันจริง → ค่าเริ่มต้นคุมไว้ที่ 1 ขั้น
  // (ถ้าคนในคิวไม่พอ ระบบผ่อนเป็น 2-3 ขั้นให้เองแล้วบอกในเหตุผล)
  maxLevelGap: 1,
  waitWeight: 1,
  gamesBehindWeight: 4,
  varietyWeight: 6,
  levelWeight: 8,
  warnWaitMinutes: 8,
  dongWaitMinutes: 15,
  targetGameMinutes: 20,
  defaultMatchType: "auto",
  callSound: true,
}

export const DEFAULT_FEES: Fees = {
  mode: "club",
  courtFeePerHead: CLUB.courtFeePerHead,
  shuttlePrice: CLUB.shuttlePrice,
  shuttleCostTotal: 0,
  courtCost: 0,
  extraCost: 0,
  roundTo: 1,
  promptPay: CLUB.payment.name,
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
    | "plan.add"
    | "plan.remove"
    | "plan.move"
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
  /** คิวเกมที่จัดไว้ล่วงหน้า เรียงตามลำดับที่จะได้ลง */
  planned: PlannedMatch[]
  events: SessionEvent[]
  settings: SessionSettings
  fees: Fees
  notes?: string
}

/**
 * เกมที่จัดไว้ล่วงหน้า — ยังไม่ได้ลงคอร์ต รอคอร์ตว่างแล้วกดลงได้เลย
 *
 * หัวก๊วนจัดคู่ไว้ตอนว่างได้ ไม่ต้องมายืนจัดตอนคอร์ตว่างพอดีซึ่งเป็นช่วงที่วุ่นที่สุด
 */
export interface PlannedMatch {
  id: string
  type: MatchType
  teamA: string[]
  teamB: string[]
  createdAt: number
  createdBy: "auto" | "manual"
  /** ระดับมือห่างกันกี่ขั้นตอนที่จัด */
  levelGap: number
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
  /** ค่าสนามส่วนของคนนี้ */
  courtPart: number
  /** ค่าลูกส่วนของคนนี้ — คิดเฉพาะลูกที่ใช้ในเกมที่ตัวเองลง */
  shuttlePart: number
  /** ค่าอื่น ๆ ส่วนของคนนี้ */
  extraPart: number
  /** ยอดที่ต้องจ่าย (ปัดเศษแล้ว) */
  amount: number
  paid: boolean
}

export interface Bill {
  mode: FeeMode
  /** ค่าเช่าคอร์ตที่จ่ายสนามจริง (ถ้ากรอก) */
  courtCost: number
  /** ค่าลูกที่เก็บจากลูกก๊วนรวมทุกคน */
  shuttleCharged: number
  /** ต้นทุนลูกจริงที่ก๊วนจ่ายไป — 0 ถ้ายังไม่ได้กรอกราคาลูกที่ซื้อมา */
  shuttleCost: number
  shuttlesUsed: number
  extraCost: number
  /** ต้นทุนจริงรวม */
  total: number
  /** กรอกต้นทุนไว้พอจะบอกกำไร/ขาดทุนได้ไหม — ไม่งั้นอย่าโชว์ยอดที่คำนวณจากศูนย์ */
  costTracked: boolean
  /** ยอดที่เรียกเก็บรวมจากทุกคน */
  billed: number
  /** ยอดที่เก็บได้แล้ว */
  collected: number
  lines: BillLine[]
  /** ยอดที่เรียกเก็บ − ต้นทุน (บวก = เหลือเข้าก๊วน, ลบ = ขาด) */
  balance: number
}

/** เกมที่จัดไว้ พร้อมข้อมูลคนและสถานะว่าลงได้เลยไหม */
export interface PlannedView {
  planned: PlannedMatch
  players: { player: RosterPlayer; sp: SessionPlayer; team: "A" | "B" }[]
  /** ลงคอร์ตได้เลยไหม — ทุกคนต้องยังอยู่และไม่ติดคอร์ตอื่น */
  ready: boolean
  /**
   * คนที่ยังเล่นอยู่ในคอร์ตอื่น — เรื่องปกติของเกมที่จัดล่วงหน้า แค่ต้องรอเขาจบ
   * (แยกจาก problems เพราะอันนี้ไม่ใช่ความผิดพลาด ไม่ควรขึ้นสีแดงให้ตกใจ)
   */
  waitingFor: string[]
  /** ปัญหาจริงที่ต้องแก้ เช่น มีคนกลับบ้านไปแล้ว */
  problems: string[]
}

export interface SessionView {
  session: Session
  roster: RosterPlayer[]
  courts: CourtView[]
  planned: PlannedView[]
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
  return p.name
}

/** นับว่าฝั่งไหนชนะกี่เซ็ต */
export function setsWon(sets: MatchSet[]): { a: number; b: number } {
  return sets.reduce(
    (acc, s) => {
      if (s.a > s.b) acc.a += 1
      else if (s.b > s.a) acc.b += 1
      return acc
    },
    { a: 0, b: 0 },
  )
}

/**
 * ผลเกมจากคะแนนรายเซ็ต — ฝั่งที่ได้เซ็ตมากกว่าเป็นผู้ชนะ
 *
 * ก๊วนนี้ตีกันไปกลับ 2 เซ็ต ได้กันคนละเซ็ตก็คือ "เสมอ" ไม่ใช่ผลที่ยังไม่ชี้ขาด
 * (null = ยังไม่ได้กรอกคะแนนสักเซ็ต จึงยังไม่มีผล)
 */
export function winnerFromSets(sets: MatchSet[]): "A" | "B" | "draw" | null {
  if (sets.length === 0) return null
  const w = setsWon(sets)
  if (w.a === w.b) return "draw"
  return w.a > w.b ? "A" : "B"
}

/** ป้ายผลเกมสำหรับแสดงผล */
export function resultLabel(winner: Match["winner"]): string {
  if (winner === "draw") return "เสมอ"
  return winner ? `ทีม ${winner}` : ""
}

/** สถิติแพ้ชนะแบบสั้น เช่น "3-1-2" (ชนะ-เสมอ-แพ้) */
export function recordLabel(sp: { wins: number; losses: number; draws?: number }): string {
  return `${sp.wins}-${sp.draws ?? 0}-${sp.losses}`
}

/** ข้อความคะแนนสำหรับแสดงผล เช่น "21-15, 19-21, 21-18" */
export function scoreLabel(match: Match): string {
  if (match.sets?.length) return match.sets.map((s) => `${s.a}-${s.b}`).join(", ")
  if (match.scoreA != null && match.scoreB != null) return `${match.scoreA}-${match.scoreB}`
  return ""
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

const THAI_WEEKDAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสฯ", "ศุกร์", "เสาร์"]

/** ชื่อวันไทยของเวลาที่ให้มา (ตาม UTC+7) */
export function thaiWeekday(at: number = Date.now()): string {
  return THAI_WEEKDAYS[new Date(at + 7 * 3600_000).getUTCDay()]
}
