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

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || "./data")
const ROSTER_FILE = path.join(DATA_DIR, "roster.json")
const SESSION_DIR = path.join(DATA_DIR, "sessions")
const POINTER_FILE = path.join(DATA_DIR, "current.json")

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
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
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
  const fees = session.fees as Fees & { memberFee?: number; guestFee?: number }

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
  for (const key of ["shuttlePrice", "shuttleCostReal", "courtCost", "extraCost", "roundTo"] as const) {
    if (typeof fees[key] !== "number") {
      fees[key] = DEFAULT_FEES[key]
      changed = true
    }
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

  for (const m of session.matches) {
    if (!MATCH_TYPES.includes(m.type)) {
      m.type = m.teamA.length <= 1 ? "S" : "D"
      changed = true
    }
  }

  // ฟิลด์ที่เพิ่มมาทีหลัง — เติมให้ครบกันหน้าเว็บคำนวณไม่ได้
  for (const p of session.players) {
    for (const key of ["gamesPlayed", "playedMs", "waitedMs", "longestWaitMs", "wins", "losses", "boost"] as const) {
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

export function rosterMap(): Map<string, RosterPlayer> {
  return new Map(getRoster().map((p) => [p.id, p]))
}

export function addPlayer(input: Omit<RosterPlayer, "id" | "createdAt">): RosterPlayer {
  const list = getRoster()
  const player: RosterPlayer = { ...input, id: id("p_"), createdAt: Date.now() }
  list.push(player)
  saveRoster(list)
  return player
}

export function updatePlayer(playerId: string, patch: Partial<RosterPlayer>): RosterPlayer {
  const list = getRoster()
  const i = list.findIndex((p) => p.id === playerId)
  if (i < 0) throw new StoreError("ไม่พบผู้เล่นคนนี้ในทะเบียน", 404)
  list[i] = { ...list[i], ...patch, id: list[i].id, createdAt: list[i].createdAt }
  saveRoster(list)
  return list[i]
}

export function deletePlayer(playerId: string) {
  const list = getRoster()
  const next = list.filter((p) => p.id !== playerId)
  if (next.length === list.length) throw new StoreError("ไม่พบผู้เล่นคนนี้ในทะเบียน", 404)
  saveRoster(next)
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
    events: [event("session.start", "เปิดก๊วน")],
    settings: { ...DEFAULT_SETTINGS, ...input.settings },
    fees: { ...DEFAULT_FEES, ...input.fees },
    shuttlesExtra: 0,
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

export function setPaid(sessionId: string, playerId: string, paid: boolean): Session {
  return mutate(sessionId, (s) => {
    const sp = s.players.find((p) => p.playerId === playerId)
    if (!sp) throw new StoreError("คนนี้ยังไม่ได้เช็คอิน", 404)
    sp.paid = paid
    sp.paidAt = paid ? Date.now() : undefined
    const name = rosterMap().get(playerId)
    s.events.push(
      event("pay", `${name ? displayName(name) : playerId} ${paid ? "จ่ายแล้ว" : "ยกเลิกการจ่าย"}`, { playerId }),
    )
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

export function finishMatch(
  sessionId: string,
  input: { matchId: string; sets?: MatchSet[]; shuttles?: number; winner?: "A" | "B" },
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
        if (match.winner) {
          if (match.winner === team) sp.wins += 1
          else sp.losses += 1
        }
        // กลับเข้าคิว → เริ่มจับเวลารอใหม่ทันที (คนที่เพิ่งลงจึงอยู่ท้ายคิวเอง)
        if (sp.status === "playing") {
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
      event("match.end", `จบเกม ${court?.name ?? `คอร์ต ${match.courtIndex + 1}`}${score}`, { matchId: match.id }),
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

export function addShuttles(sessionId: string, delta: number, matchId?: string): Session {
  return mutate(sessionId, (s) => {
    if (matchId) {
      const match = s.matches.find((m) => m.id === matchId)
      if (!match) throw new StoreError("ไม่พบเกมนี้", 404)
      match.shuttles = Math.max(0, match.shuttles + delta)
    } else {
      s.shuttlesExtra = Math.max(0, s.shuttlesExtra + delta)
    }
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
  const shuttlesInGames = session.matches.reduce((n, m) => n + m.shuttles, 0)
  const shuttlesUsed = shuttlesInGames + session.shuttlesExtra

  /**
   * ต้นทุนลูกจริง = จำนวนลูก × ราคาที่ก๊วนซื้อลูกมา (ไม่ใช่อัตราที่เก็บต่อคน)
   * ไม่กรอกราคาที่ซื้อมา = ไม่รู้ต้นทุน ซึ่งต่างจาก "ต้นทุนเป็นศูนย์" — จึงต้องแยกให้ออก
   */
  const shuttleCost = shuttlesUsed * fees.shuttleCostReal
  const total = fees.courtCost + shuttleCost + fees.extraCost
  const costTracked = fees.courtCost > 0 || fees.shuttleCostReal > 0

  // ทุกคนที่เช็คอินวันนี้ (รวมคนที่กลับไปแล้ว — เขาก็ใช้คอร์ตไปแล้ว)
  const people = session.players
  const n = people.length || 1

  /**
   * ค่าลูกแบบระบบก๊วน: ใครลงเกมไหน จ่ายค่าลูกของเกมนั้น "เต็มอัตราต่อคน"
   *
   * เกมหนึ่งใช้ 1 ลูก ทั้งสี่คนจ่ายคนละ 25 (ไม่ใช่เอา 25 มาหารสี่)
   * ก๊วนจึงเก็บได้ 100 ต่อลูก ซึ่งพอดีกับราคาลูกที่ซื้อมา — นี่คือวิธีที่ก๊วนใช้จริง
   */
  const shuttleShare = new Map<string, number>()
  for (const m of session.matches) {
    const ids = [...m.teamA, ...m.teamB]
    if (ids.length === 0 || m.shuttles <= 0) continue
    const perHead = m.shuttles * fees.shuttlePrice
    for (const id of ids) shuttleShare.set(id, (shuttleShare.get(id) ?? 0) + perHead)
  }

  /**
   * ลูกที่เปิดใช้นอกเกม (ซ้อมก่อนเริ่ม ฯลฯ) ก๊วนออกให้ — ไม่เก็บจากใครสักบาท
   * ยังนับรวมใน "ลูกที่ใช้ทั้งหมด" และต้นทุนจริงอยู่ เพราะก๊วนจ่ายค่าลูกนั้นไปแล้วจริง ๆ
   */
  const extraPerHead = fees.extraCost / n

  const round2 = (v: number) => Math.round(v * 100) / 100

  const lines: BillLine[] = people.map((sp) => {
    const player = roster.get(sp.playerId)
    const courtPart = fees.mode === "club" ? fees.courtFeePerHead : fees.courtCost / n
    const shuttlePart =
      fees.mode === "club" ? (shuttleShare.get(sp.playerId) ?? 0) : shuttleCost / n

    return {
      playerId: sp.playerId,
      name: player ? displayName(player) : sp.playerId,
      games: sp.gamesPlayed,
      courtPart: round2(courtPart),
      shuttlePart: round2(shuttlePart),
      extraPart: round2(extraPerHead),
      amount: roundUpTo(courtPart + shuttlePart + extraPerHead, fees.roundTo),
      paid: sp.paid,
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
    shuttlesInGames,
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
    const detail = fees.mode === "club" ? ` [สนาม ${baht(l.courtPart)} + ลูก ${baht(l.shuttlePart)}]` : ""
    lines.push(`   ${l.paid ? "✅" : "⬜"} ${l.name} ${baht(l.amount)} บาท · ${l.games} เกม${detail}`)
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
    .filter((p) => p.wins + p.losses >= 2)
    .sort((a, b) => b.wins / (b.wins + b.losses) - a.wins / (a.wins + a.losses))[0]
  if (bestWin) {
    const p = rmap.get(bestWin.playerId)
    if (p) lines.push(`🏆 ชนะเยอะสุด: ${displayName(p)} ${bestWin.wins} ชนะ / ${bestWin.losses} แพ้`)
  }
  const patient = [...session.players].sort((a, b) => b.longestWaitMs - a.longestWaitMs)[0]
  if (patient && patient.longestWaitMs > 0) {
    const p = rmap.get(patient.playerId)
    if (p) lines.push(`🧘 ใจเย็นสุด: ${displayName(p)} รอนานสุด ${Math.round(patient.longestWaitMs / 60_000)} นาที`)
  }
  return lines.join("\n")
}

// ── ประกอบข้อมูลให้หน้าเว็บ ───────────────────────────────────────────────────

export function buildView(session: Session, now = Date.now()): SessionView {
  const roster = getRoster()
  const rmap = new Map(roster.map((p) => [p.id, p]))
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

  const waits = queue.map((q) => q.waitMs)
  const dongAlerts = queue
    .filter((q) => q.tier === "dong")
    .map((q) => `${displayName(q.player)} รอมา ${Math.round(q.waitMs / 60_000)} นาที`)

  return {
    session,
    roster,
    courts,
    queue,
    resting,
    bill: computeBill(session, rmap),
    now,
    dongAlerts,
    stats: {
      checkedIn: session.players.filter((p) => p.status !== "left").length,
      playing: session.players.filter((p) => p.status === "playing").length,
      waiting: queue.length,
      matchesDone: session.matches.filter((m) => m.endedAt).length,
      avgWaitMs: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0,
      maxWaitMs: waits.length ? Math.max(...waits) : 0,
      shuttlesUsed: session.matches.reduce((n, m) => n + m.shuttles, 0) + session.shuttlesExtra,
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
          playedMs: 0,
          waitedMs: 0,
          longestWaitMs: 0,
        } satisfies AllTimeStat)
      cur.sessions += 1
      cur.games += sp.gamesPlayed
      cur.wins += sp.wins
      cur.losses += sp.losses
      cur.playedMs += sp.playedMs
      cur.waitedMs += sp.waitedMs
      cur.longestWaitMs = Math.max(cur.longestWaitMs, sp.longestWaitMs)
      acc.set(sp.playerId, cur)
    }
  }
  return [...acc.values()].sort((a, b) => b.games - a.games)
}
