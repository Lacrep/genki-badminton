/**
 * เครื่องจัดคิว — ฟังก์ชันล้วน (ไม่แตะ I/O) เพื่อให้เทสต์ได้ตรง ๆ
 *
 * เป้าหมายที่ต้องได้พร้อมกัน 4 ข้อ
 *   1. มือใกล้เคียงกันลงด้วยกัน       → เกมสนุก ไม่มีใครถูกกินเรียบ
 *   2. คนรอนานได้ลงก่อน               → ไม่ดองคน (ข้อนี้เป็น "กฎเหล็ก")
 *   3. ไม่ซ้ำคู่/ซ้ำคู่แข่งเดิมติด ๆ กัน  → ได้ตีกับคนใหม่เรื่อย ๆ
 *   4. สองฝั่งสูสี                     → เกมไม่จบเร็วเกินไป
 *
 * วิธีทำ: ล็อกคนที่ "ถูกดอง" ลงก่อนเป็นอันดับแรก (กฎเหล็ก) แล้วค่อยหาเพื่อนร่วม
 * เกมที่ให้คะแนนรวมดีที่สุดจากทุกเงื่อนไขที่เหลือ
 */

import {
  type Match,
  type MatchType,
  type RosterPlayer,
  type Session,
  type SessionPlayer,
  levelInfo,
  playersPerMatch,
  priorityOf,
  waitTier,
} from "@shared/types"

export interface SuggestInput {
  session: Session
  roster: Map<string, RosterPlayer>
  now: number
  type: MatchType | "auto"
  /** ปักหมุดว่าต้องลงเกมนี้ */
  include?: string[]
  /** ไม่เอาคนนี้ในเกมนี้ */
  exclude?: string[]
  /**
   * เอาคนที่กำลังเล่นอยู่มาคิดด้วย — ใช้ตอนจัดเกมล่วงหน้าเข้าคิว
   * เพราะกว่าจะถึงคิวนั้น เขาก็ลงจากคอร์ตแล้ว ถ้าไม่ให้เลือกจะจัดได้ไม่กี่เกม
   */
  includePlaying?: boolean
  /**
   * ความสุ่ม (คะแนน) — 0 = เอาชุดที่ดีที่สุดเสมอ (ค่าเริ่มต้น)
   * ใส่ค่า 2-3 เวลาผู้ใช้กด "สุ่มใหม่" เพื่อให้ได้ชุดอื่นที่ดีใกล้เคียงกัน
   * ไม่ทำให้คนถูกดองหลุด เพราะกฎเหล็กบังคับใส่ก่อนคิดคะแนน
   */
  jitter?: number
}

export interface Suggestion {
  type: MatchType
  teamA: string[]
  teamB: string[]
  /** ระดับมือห่างกันกี่ขั้นในกลุ่มนี้ */
  levelGap: number
  /** ผลรวมมือสองฝั่งต่างกันเท่าไร (0 = สูสีเป๊ะ) */
  teamDiff: number
  /** เวลารอสูงสุดของคนในเกมนี้ (ms) */
  maxWaitMs: number
  /** คำอธิบายให้คนในก๊วนเห็นว่าจัดมาแบบนี้เพราะอะไร */
  reasons: string[]
}

export type SuggestResult =
  | { ok: true; suggestion: Suggestion; alternatives: Suggestion[] }
  | { ok: false; reason: string; needed: number; available: number }

const LOOKBACK = 6 // ดูย้อนหลังกี่เกมเวลาเช็คว่าซ้ำคู่

// ── ตัวช่วยเล็ก ๆ ─────────────────────────────────────────────────────────────

function combinations<T>(items: T[], k: number): T[][] {
  const out: T[][] = []
  const pick: T[] = []
  const walk = (start: number) => {
    if (pick.length === k) {
      out.push([...pick])
      return
    }
    for (let i = start; i < items.length; i++) {
      pick.push(items[i])
      walk(i + 1)
      pick.pop()
    }
  }
  if (k >= 0 && k <= items.length) walk(0)
  return out
}

/** เกมล่าสุดย้อนหลัง LOOKBACK เกม เรียงใหม่สุดมาก่อน */
function recentMatches(session: Session): Match[] {
  return [...session.matches]
    .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
    .slice(0, LOOKBACK)
}

/**
 * ความซ้ำซากของกลุ่ม — เพิ่งเล่นกันมาหมาด ๆ ยิ่งโดนโทษหนัก
 * เป็นคู่กัน (ทีมเดียวกัน) โทษหนักกว่าเป็นคู่แข่ง เพราะคนรู้สึกกับ "คู่" มากกว่า
 */
export function repeatPenalty(session: Session, ids: string[]): number {
  const recent = recentMatches(session)
  let penalty = 0
  for (let i = 0; i < recent.length; i++) {
    const m = recent[i]
    const freshness = (LOOKBACK - i) / LOOKBACK // เกมล่าสุด = 1.0
    const inA = ids.filter((id) => m.teamA.includes(id))
    const inB = ids.filter((id) => m.teamB.includes(id))
    // ซ้ำคู่เดิม
    if (inA.length >= 2) penalty += 2 * freshness * (inA.length - 1)
    if (inB.length >= 2) penalty += 2 * freshness * (inB.length - 1)
    // ซ้ำคู่แข่งเดิม
    penalty += 0.6 * freshness * Math.min(inA.length, inB.length)
  }
  return penalty
}

function levelsOf(ids: string[], roster: Map<string, RosterPlayer>): number[] {
  return ids.map((id) => roster.get(id)?.level ?? 1)
}

function spreadOf(ids: string[], roster: Map<string, RosterPlayer>): number {
  const ls = levelsOf(ids, roster)
  return Math.max(...ls) - Math.min(...ls)
}

// ── แบ่งทีมให้สูสี ────────────────────────────────────────────────────────────

export interface TeamSplit {
  teamA: string[]
  teamB: string[]
  diff: number
}

/**
 * แบ่ง 4 คนเป็น 2 ทีมให้ผลรวมระดับมือใกล้กันที่สุด
 * ถ้าสูสีเท่ากันหลายแบบ ให้เลือกแบบที่ไม่ซ้ำคู่เดิม
 */
export function splitTeams(
  ids: string[],
  session: Session,
  roster: Map<string, RosterPlayer>,
): TeamSplit {
  if (ids.length === 2) {
    const [a, b] = ids
    return { teamA: [a], teamB: [b], diff: Math.abs((roster.get(a)?.level ?? 1) - (roster.get(b)?.level ?? 1)) }
  }

  const pairings: [number, number][][] = [
    [
      [0, 1],
      [2, 3],
    ],
    [
      [0, 2],
      [1, 3],
    ],
    [
      [0, 3],
      [1, 2],
    ],
  ]

  let best: TeamSplit | null = null
  let bestCost = Infinity

  for (const [pa, pb] of pairings) {
    const teamA = [ids[pa[0]], ids[pa[1]]]
    const teamB = [ids[pb[0]], ids[pb[1]]]

    const sum = (t: string[]) => levelsOf(t, roster).reduce((x, y) => x + y, 0)
    const diff = Math.abs(sum(teamA) - sum(teamB))
    // ซ้ำ "คู่" เดิมน่าเบื่อกว่าเจอคู่แข่งเดิม จึงคิดโทษเฉพาะคู่
    const cost = diff * 10 + repeatPenalty(session, teamA) + repeatPenalty(session, teamB)
    if (cost < bestCost) {
      bestCost = cost
      best = { teamA, teamB, diff }
    }
  }

  // ป้องกันไว้เท่านั้น — วนครบ 3 แบบย่อมได้คำตอบเสมอ
  if (!best) return { teamA: [ids[0], ids[1]], teamB: [ids[2], ids[3]], diff: 0 }
  return best
}

// ── หัวใจ: เลือกผู้เล่นลงคอร์ต ────────────────────────────────────────────────

interface Candidate {
  id: string
  sp: SessionPlayer
  player: RosterPlayer
  priority: number
  waitMs: number
  dong: boolean
}

function buildCandidates(input: SuggestInput): Candidate[] {
  const { session, roster, now } = input
  const exclude = new Set(input.exclude ?? [])
  const maxGames = session.players.reduce(
    (m, p) => (p.status === "left" ? m : Math.max(m, p.gamesPlayed)),
    0,
  )

  const eligible = input.includePlaying ? new Set(["queue", "playing"]) : new Set(["queue"])

  const out: Candidate[] = []
  for (const sp of session.players) {
    if (!eligible.has(sp.status)) continue
    if (exclude.has(sp.playerId)) continue
    const player = roster.get(sp.playerId)
    if (!player) continue
    const waitMs = sp.queueSince == null ? 0 : Math.max(0, now - sp.queueSince)
    out.push({
      id: sp.playerId,
      sp,
      player,
      priority: priorityOf(sp, now, maxGames, session.settings),
      waitMs,
      dong: waitTier(waitMs, session.settings) === "dong",
    })
  }
  return out.sort((a, b) => b.priority - a.priority)
}

/** คะแนนของกลุ่มที่เลือก — ยิ่งมากยิ่งดี */
function scoreGroup(
  group: Candidate[],
  session: Session,
  roster: Map<string, RosterPlayer>,
  jitter = 0,
): { score: number; spread: number; repeat: number } {
  const s = session.settings
  const ids = group.map((c) => c.id)
  const spread = spreadOf(ids, roster)
  const repeat = repeatPenalty(session, ids)
  const priority = group.reduce((sum, c) => sum + c.priority, 0)
  // spread ยกกำลัง 1.5 → ห่าง 1 ขั้นแทบไม่เป็นไร แต่ห่าง 4 ขั้นเจ็บหนัก
  const score =
    priority -
    s.levelWeight * Math.pow(spread, 1.5) -
    s.varietyWeight * repeat +
    (jitter > 0 ? Math.random() * jitter : 0)
  return { score, spread, repeat }
}

function resolveType(input: SuggestInput, queueCount: number): MatchType {
  if (input.type !== "auto") return input.type
  return queueCount >= 4 ? "D" : "S"
}

export function suggestMatch(input: SuggestInput): SuggestResult {
  const { session, roster } = input
  const rawQueue = session.players.filter((p) => p.status === "queue").length
  const type = resolveType(input, rawQueue)
  const need = playersPerMatch(type)

  const candidates = buildCandidates(input)
  const byId = new Map(candidates.map((c) => [c.id, c]))

  if (candidates.length < need) {
    return {
      ok: false,
      reason: input.includePlaying
        ? `คนที่ยังว่างไม่พอ (ต้องมี ${need} คน เลือกได้ ${candidates.length} คน) — คนอื่นถูกจัดไว้ในคิวหมดแล้ว`
        : candidates.length === rawQueue
          ? `คนในคิวไม่พอ (ต้องมี ${need} คน มี ${rawQueue} คน)`
          : `คนในคิวที่เลือกได้ไม่พอ (ต้องมี ${need} คน เลือกได้ ${candidates.length} คน)`,
      needed: need,
      available: candidates.length,
    }
  }

  const reasons: string[] = []

  // ── กฎเหล็ก 1: คนที่ปักหมุดไว้ต้องได้ลง ──
  const forced: Candidate[] = []
  for (const id of input.include ?? []) {
    const c = byId.get(id)
    if (c && !forced.some((f) => f.id === id)) forced.push(c)
  }
  if (forced.length > 0) {
    reasons.push(`ปักหมุดไว้: ${forced.map((c) => shortName(c.player)).join(", ")}`)
  }

  // ── กฎเหล็ก 2: ใครถูกดองเกินเวลาที่ตั้งไว้ ต้องได้ลงเกมนี้ ──
  const dongs = candidates.filter((c) => c.dong && !forced.some((f) => f.id === c.id))
  for (const c of dongs) {
    if (forced.length >= need) break
    forced.push(c)
    reasons.push(`บังคับลง: ${shortName(c.player)} รอมา ${Math.round(c.waitMs / 60_000)} นาที`)
  }

  if (forced.length > need) forced.length = need

  // ── หาเพื่อนร่วมเกมที่เหลือ ──
  const anchor = forced[0] ?? candidates[0]
  const anchorLevel = anchor.player.level
  const pool = candidates.filter((c) => !forced.some((f) => f.id === c.id))

  interface Scored {
    group: Candidate[]
    score: number
    spread: number
    repeat: number
  }

  let found: Scored[] = []
  let usedGap = session.settings.maxLevelGap

  // ผ่อนเพดานระดับมือทีละขั้นถ้าหาชุดที่ครบคนไม่ได้จริง ๆ
  const gapLadder = [
    session.settings.maxLevelGap,
    session.settings.maxLevelGap + 1,
    session.settings.maxLevelGap + 2,
    99,
  ]

  for (const gap of gapLadder) {
    const forcedSpread = spreadOf(
      forced.map((c) => c.id),
      roster,
    )
    if (forced.length > 1 && forcedSpread > gap && gap !== 99) continue

    const near = pool.filter((c) => {
      if (Math.abs(c.player.level - anchorLevel) > gap) return false
      // ต้องเข้ากับคนที่ถูกบังคับลงด้วย
      return forced.every((f) => Math.abs(c.player.level - f.player.level) <= gap)
    })
    // ตัดเหลือหัวคิว 14 คน — พอให้มีตัวเลือกเยอะแต่คำนวณเร็ว (C(14,3) = 364 ชุด)
    const shortlist = near.slice(0, 14)
    const k = need - forced.length
    if (k < 0) break
    if (shortlist.length < k) continue

    const scored: Scored[] = []
    for (const combo of combinations(shortlist, k)) {
      const g = [...forced, ...combo]
      if (spreadOf(g.map((c) => c.id), roster) > gap && gap !== 99) continue
      scored.push({ group: g, ...scoreGroup(g, session, roster, input.jitter ?? 0) })
    }

    if (scored.length > 0) {
      scored.sort((a, b) => b.score - a.score)
      // เก็บตัวเลือกสำรองไว้ให้ปุ่ม "สุ่มใหม่" สลับดูได้ทันทีโดยไม่ต้องถามเซิร์ฟเวอร์
      found = scored.slice(0, 4)
      usedGap = gap
      break
    }
  }

  if (found.length === 0) {
    return {
      ok: false,
      reason: "หาชุดที่ลงด้วยกันได้ไม่เจอ ลองผ่อนเพดานระดับมือในหน้าตั้งค่า",
      needed: need,
      available: candidates.length,
    }
  }

  if (usedGap > session.settings.maxLevelGap) {
    reasons.push(`ผ่อนเพดานมือเป็น ${usedGap} ขั้น เพราะคนในคิวไม่พอให้เลือก`)
  }

  /** ประกอบชุดที่เลือกเป็นข้อเสนอ พร้อมคำอธิบายเป็นภาษาคน */
  const build = (picked: Scored): Suggestion => {
    const ids = picked.group.map((c) => c.id)
    const split = splitTeams(ids, session, roster)
    const ls = levelsOf(ids, roster)
    const lo = levelInfo(Math.min(...ls))
    const hi = levelInfo(Math.max(...ls))
    const waits = picked.group
      .map((c) => Math.round(c.waitMs / 60_000))
      .sort((a, b) => b - a)

    const why = [...reasons]
    why.push(`เลือกจากคนรอนานสุดในคิว (รอ ${waits.map((m) => `${m} น.`).join(" / ")})`)
    why.push(
      picked.spread === 0
        ? `มือเท่ากันหมด (${hi.code})`
        : `มือห่างกัน ${picked.spread} ขั้น (${lo.code} – ${hi.code})`,
    )
    if (picked.repeat === 0) why.push("ไม่ซ้ำคู่กับเกมก่อนหน้า")
    else if (picked.repeat < 1.5) why.push("ซ้ำคู่เดิมเล็กน้อย (คนในคิวจำกัด)")
    else why.push("ยังซ้ำคู่เดิมอยู่ — คนในคิวน้อย ระบบเลี่ยงได้ไม่หมด")
    why.push(split.diff === 0 ? "สองฝั่งผลรวมมือเท่ากัน" : `สองฝั่งต่างกัน ${split.diff} ขั้น`)

    return {
      type,
      teamA: split.teamA,
      teamB: split.teamB,
      levelGap: picked.spread,
      teamDiff: split.diff,
      maxWaitMs: Math.max(...picked.group.map((c) => c.waitMs)),
      reasons: why,
    }
  }

  const [best, ...rest] = found.map(build)
  return { ok: true, suggestion: best, alternatives: rest }
}

function shortName(p: RosterPlayer): string {
  return p.name
}

// ── ประเมินคิว: อีกกี่คิวถึงตา / อีกกี่นาที ────────────────────────────────────

export interface QueueForecast {
  /** playerId → จำนวนเกมที่ต้องรอก่อนถึงตา (0 = ลงเกมหน้า) */
  ahead: Map<string, number>
  /** playerId → นาทีที่คาดว่าจะได้ลง */
  eta: Map<string, number>
}

/**
 * ประเมินคร่าว ๆ จาก: ลำดับใน priority, จำนวนคอร์ต, และเวลาที่เกมในคอร์ตเดินไปแล้ว
 * ไม่ต้องเป๊ะ — ขอให้ลูกก๊วนรู้ว่า "ใกล้แล้ว" หรือ "ไปกินข้าวได้"
 */
export function forecastQueue(session: Session, now: number): QueueForecast {
  const s = session.settings
  const maxGames = session.players.reduce(
    (m, p) => (p.status === "left" ? m : Math.max(m, p.gamesPlayed)),
    0,
  )
  const queue = session.players
    .filter((p) => p.status === "queue")
    .map((sp) => ({ sp, priority: priorityOf(sp, now, maxGames, s) }))
    .sort((a, b) => b.priority - a.priority)

  const activeCourts = session.courts.filter((c) => !c.disabled)
  const perGame = 4
  const gameMs = s.targetGameMinutes * 60_000

  // คอร์ตแต่ละคอร์ตจะว่างอีกกี่ ms
  const freeIn: number[] = activeCourts.map((c) => {
    if (!c.currentMatchId) return 0
    const m = session.matches.find((x) => x.id === c.currentMatchId)
    if (!m) return 0
    return Math.max(0, gameMs - (now - m.startedAt))
  })
  freeIn.sort((a, b) => a - b)

  const ahead = new Map<string, number>()
  const eta = new Map<string, number>()
  if (freeIn.length === 0) {
    queue.forEach((q, i) => {
      ahead.set(q.sp.playerId, Math.floor(i / perGame))
    })
    return { ahead, eta }
  }

  queue.forEach((q, i) => {
    const gamesAhead = Math.floor(i / perGame)
    ahead.set(q.sp.playerId, gamesAhead)
    // รอบที่ gamesAhead จะเกิดขึ้นเมื่อคอร์ตหมุนไปกี่รอบ
    const round = Math.floor(gamesAhead / freeIn.length)
    const slot = gamesAhead % freeIn.length
    eta.set(q.sp.playerId, Math.round((freeIn[slot] + round * gameMs) / 60_000))
  })
  return { ahead, eta }
}
