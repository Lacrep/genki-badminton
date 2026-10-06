import type { Level, MatchSet, MatchType, RosterPlayer, SessionView } from "@shared/types"

export interface SessionSummary {
  id: string
  name: string
  date: string
  venue: string
  status: "live" | "ended"
  code: string
  players: number
  matches: number
  shuttles?: number
  startAt: number
  endAt?: number
}

export interface Bootstrap {
  pinRequired: boolean
  roster: RosterPlayer[]
  view: SessionView | null
  undoDepth: number
  sessions: SessionSummary[]
}

export interface ViewReply {
  view: SessionView
  undoDepth: number
  callText?: string
  failed?: string[]
}

export interface Suggestion {
  type: MatchType
  teamA: string[]
  teamB: string[]
  levelGap: number
  teamDiff: number
  maxWaitMs: number
  reasons: string[]
}

export type SuggestReply =
  | { ok: true; suggestion: Suggestion; alternatives: Suggestion[] }
  | { ok: false; reason: string; needed: number; available: number }

const PIN_KEY = "genki.pin"

export function getPin(): string {
  try {
    return localStorage.getItem(PIN_KEY) ?? ""
  } catch {
    return ""
  }
}

export function setPin(pin: string) {
  try {
    if (pin) localStorage.setItem(PIN_KEY, pin)
    else localStorage.removeItem(PIN_KEY)
  } catch {
    /* โหมดส่วนตัวของ Safari เขียน localStorage ไม่ได้ — ไม่เป็นไร ใช้ต่อได้ */
  }
}

export class ApiError extends Error {
  status: number
  needPin: boolean
  constructor(message: string, status: number, needPin = false) {
    super(message)
    this.status = status
    this.needPin = needPin
  }
}

async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) }
  if (init?.json !== undefined) headers["Content-Type"] = "application/json"
  const pin = getPin()
  if (pin) headers["x-organizer-pin"] = pin

  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers,
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    })
  } catch {
    throw new ApiError("ต่อเซิร์ฟเวอร์ไม่ได้ — เช็ค Wi-Fi แล้วลองอีกครั้ง", 0)
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; needPin?: boolean }
    throw new ApiError(data.error ?? `ผิดพลาด (${res.status})`, res.status, !!data.needPin)
  }
  return (await res.json()) as T
}

const post = <T>(path: string, json?: unknown) => request<T>(path, { method: "POST", json: json ?? {} })
const patch = <T>(path: string, json: unknown) => request<T>(path, { method: "PATCH", json })

export interface PlayerInput {
  /** ชื่อที่ใช้เรียกในก๊วน */
  name: string
  level: Level
  note?: string
  archived?: boolean
}

export const api = {
  bootstrap: () => request<Bootstrap>("/api/bootstrap"),
  checkPin: () => post<{ ok: true }>("/api/auth/check"),
  view: (sessionId: string) => request<ViewReply>(`/api/view/${sessionId}`),
  publicQueue: (code: string) => request<{ view: SessionView }>(`/api/q/${code}`),
  sessions: () => request<{ sessions: SessionSummary[] }>("/api/sessions"),
  deleteSession: (id: string) =>
    request<{ sessions: { id: string; name: string }[] }>(`/api/sessions/${id}`, { method: "DELETE" }),
  stats: () =>
    request<{
      stats: {
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
      }[]
    }>("/api/stats"),

  // ทะเบียนผู้เล่น
  addPlayer: (input: PlayerInput) => post<{ player: RosterPlayer; roster: RosterPlayer[] }>("/api/players", input),
  updatePlayer: (id: string, input: Partial<PlayerInput>) =>
    patch<{ player: RosterPlayer; roster: RosterPlayer[] }>(`/api/players/${id}`, input),
  deletePlayer: (id: string) => request<{ roster: RosterPlayer[] }>(`/api/players/${id}`, { method: "DELETE" }),

  // ก๊วน
  createSession: (input: {
    name?: string
    venue?: string
    courtCount?: number
    fees?: Record<string, unknown>
    settings?: Record<string, unknown>
  }) => post<ViewReply>("/api/session", input),
  updateSession: (id: string, input: Record<string, unknown>) => patch<ViewReply>(`/api/session/${id}`, input),
  endSession: (id: string) => post<ViewReply>(`/api/session/${id}/end`),
  reopenSession: (id: string) => post<ViewReply>(`/api/session/${id}/reopen`),
  setCourtCount: (id: string, count: number) => post<ViewReply>(`/api/session/${id}/courts`, { count }),
  courtPatch: (id: string, index: number, input: { name?: string; disabled?: boolean }) =>
    post<ViewReply>(`/api/session/${id}/courts/${index}`, input),

  // คน
  checkIn: (id: string, playerId: string) => post<ViewReply>(`/api/session/${id}/checkin`, { playerId }),
  checkInNew: (id: string, newPlayer: PlayerInput) => post<ViewReply>(`/api/session/${id}/checkin`, { newPlayer }),
  checkInMany: (id: string, playerIds: string[]) => post<ViewReply>(`/api/session/${id}/checkin-many`, { playerIds }),
  checkOut: (id: string, playerId: string) => post<ViewReply>(`/api/session/${id}/checkout`, { playerId }),
  rest: (id: string, playerId: string, resting: boolean) =>
    post<ViewReply>(`/api/session/${id}/rest`, { playerId, resting }),
  boost: (id: string, playerId: string, boost: number) =>
    post<ViewReply>(`/api/session/${id}/boost`, { playerId, boost }),
  paid: (id: string, playerId: string, paid: boolean) => post<ViewReply>(`/api/session/${id}/paid`, { playerId, paid }),

  // เกม
  suggest: (
    id: string,
    input: {
      type?: MatchType | "auto"
      include?: string[]
      exclude?: string[]
      shuffle?: boolean
      /** true = จัดเกมเข้าคิวล่วงหน้า (เลือกคนที่อยู่ในคอร์ตได้ด้วย) */
      forPlan?: boolean
    },
  ) =>
    post<SuggestReply>(`/api/session/${id}/suggest`, input),
  start: (
    id: string,
    input: { courtIndex: number; type: MatchType; teamA: string[]; teamB: string[]; createdBy?: "auto" | "manual" },
  ) => post<ViewReply>(`/api/session/${id}/start`, input),
  finish: (
    id: string,
    input: { matchId: string; sets?: MatchSet[]; shuttles?: number; winner?: "A" | "B" | "draw" },
  ) =>
    post<ViewReply>(`/api/session/${id}/finish`, input),
  cancelMatch: (id: string, matchId: string) => post<ViewReply>(`/api/session/${id}/cancel`, { matchId }),
  swap: (id: string, input: { matchId: string; outPlayerId: string; inPlayerId: string }) =>
    post<ViewReply>(`/api/session/${id}/swap`, input),
  shuttles: (id: string, delta: number, matchId: string) =>
    post<ViewReply>(`/api/session/${id}/shuttles`, { delta, matchId }),

  // ── คิวเกมที่จัดไว้ล่วงหน้า ──
  plan: (id: string, input: { type: MatchType; teamA: string[]; teamB: string[]; createdBy?: "auto" | "manual" }) =>
    post<ViewReply>(`/api/session/${id}/plan`, input),
  unplan: (id: string, plannedId: string) =>
    request<ViewReply>(`/api/session/${id}/plan/${plannedId}`, { method: "DELETE" }),
  movePlan: (id: string, plannedId: string, direction: "up" | "down") =>
    post<ViewReply>(`/api/session/${id}/plan/${plannedId}/move`, { direction }),
  startPlan: (id: string, plannedId: string, courtIndex: number) =>
    post<ViewReply>(`/api/session/${id}/plan/${plannedId}/start`, { courtIndex }),
  undo: (id: string) => post<ViewReply>(`/api/session/${id}/undo`),
  summary: (id: string) => request<{ text: string }>(`/api/session/${id}/summary`),
}
