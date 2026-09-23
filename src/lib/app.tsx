import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { RosterPlayer, SessionView } from "@shared/types"
import { ApiError, api, getPin, setPin, type Bootstrap, type SessionSummary, type ViewReply } from "./api"
import { speak } from "./sound"

// ── แจ้งเตือนมุมจอ ────────────────────────────────────────────────────────────

export interface Toast {
  id: number
  text: string
  kind: "ok" | "warn" | "error"
}

// ── บริบทของแอป ───────────────────────────────────────────────────────────────

interface AppState {
  ready: boolean
  view: SessionView | null
  roster: RosterPlayer[]
  sessions: SessionSummary[]
  pinRequired: boolean
  needPin: boolean
  undoDepth: number
  offline: boolean
  toasts: Toast[]
  /** ส่วนต่างเวลาระหว่างเครื่องนี้กับเซิร์ฟเวอร์ (ms) — ใช้ให้นาฬิกาตรงกันทุกเครื่อง */
  clockSkew: number
}

interface AppApi extends AppState {
  refresh: () => Promise<void>
  /** เรียก API พร้อมจับ error มาแสดงเป็น toast และอัปเดต view ให้เสร็จในรอบเดียว */
  run: <T extends ViewReply | { roster: RosterPlayer[] }>(
    label: string,
    fn: () => Promise<T>,
    opts?: { silent?: boolean },
  ) => Promise<T | null>
  toast: (text: string, kind?: Toast["kind"]) => void
  dismissToast: (id: number) => void
  submitPin: (pin: string) => Promise<boolean>
  clearPin: () => void
  applyView: (reply: ViewReply) => void
  setRoster: (roster: RosterPlayer[]) => void
}

const Ctx = createContext<AppApi | null>(null)

export function useApp(): AppApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useApp ต้องอยู่ใน <AppProvider>")
  return ctx
}

/** view ที่การันตีว่ามีก๊วนอยู่ — ใช้ในหน้าที่ถูก guard ไว้แล้ว */
export function useSession(): { view: SessionView; sessionId: string } {
  const { view } = useApp()
  if (!view) throw new Error("ยังไม่มีก๊วนที่เปิดอยู่")
  return { view, sessionId: view.session.id }
}

const POLL_MS = 3000

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    ready: false,
    view: null,
    roster: [],
    sessions: [],
    pinRequired: false,
    needPin: false,
    undoDepth: 0,
    offline: false,
    toasts: [],
    clockSkew: 0,
  })
  const toastSeq = useRef(0)

  const dismissToast = useCallback((id: number) => {
    setState((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }))
  }, [])

  const toast = useCallback(
    (text: string, kind: Toast["kind"] = "ok") => {
      const id = ++toastSeq.current
      setState((s) => ({ ...s, toasts: [...s.toasts.slice(-2), { id, text, kind }] }))
      setTimeout(() => dismissToast(id), kind === "error" ? 5200 : 2800)
    },
    [dismissToast],
  )

  const applyBootstrap = useCallback((b: Bootstrap) => {
    setState((s) => ({
      ...s,
      ready: true,
      view: b.view,
      roster: b.roster,
      sessions: b.sessions,
      pinRequired: b.pinRequired,
      // ยังไม่มี PIN ในเครื่องนี้ → โหมดดูอย่างเดียวตั้งแต่ต้น ไม่ต้องรอให้กดแล้วเจอ error
      needPin: b.pinRequired && !getPin() ? true : s.needPin,
      undoDepth: b.undoDepth,
      offline: false,
      clockSkew: b.view ? b.view.now - Date.now() : s.clockSkew,
    }))
  }, [])

  const applyView = useCallback((reply: ViewReply) => {
    setState((s) => ({
      ...s,
      view: reply.view,
      roster: reply.view.roster,
      undoDepth: reply.undoDepth ?? s.undoDepth,
      offline: false,
      clockSkew: reply.view.now - Date.now(),
    }))
  }, [])

  const refresh = useCallback(async () => {
    try {
      applyBootstrap(await api.bootstrap())
    } catch {
      setState((s) => ({ ...s, ready: true, offline: true }))
    }
  }, [applyBootstrap])

  const run = useCallback<AppApi["run"]>(
    async (label, fn, opts) => {
      try {
        const reply = await fn()
        if ("view" in reply) applyView(reply as ViewReply)
        else if ("roster" in reply) setState((s) => ({ ...s, roster: reply.roster }))
        if (!opts?.silent && label) toast(label, "ok")
        return reply
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.needPin) setState((s) => ({ ...s, needPin: true, pinRequired: true }))
          toast(err.message, err.status === 0 ? "warn" : "error")
        } else {
          toast("เกิดข้อผิดพลาดที่ไม่คาดคิด", "error")
        }
        return null
      }
    },
    [applyView, toast],
  )

  const submitPin = useCallback(
    async (pin: string) => {
      const previous = getPin()
      setPin(pin.trim())
      try {
        await api.checkPin()
        setState((s) => ({ ...s, needPin: false }))
        toast("ปลดล็อกสิทธิ์หัวก๊วนแล้ว", "ok")
        void refresh()
        return true
      } catch (err) {
        setPin(previous)
        toast(err instanceof ApiError && err.needPin ? "PIN ไม่ถูกต้อง" : "ตรวจ PIN ไม่ได้ ลองอีกครั้ง", "error")
        return false
      }
    },
    [refresh, toast],
  )

  const clearPin = useCallback(() => {
    setPin("")
    setState((s) => ({ ...s, needPin: s.pinRequired }))
  }, [])

  const setRoster = useCallback((roster: RosterPlayer[]) => setState((s) => ({ ...s, roster })), [])

  // โหลดครั้งแรก
  useEffect(() => {
    void refresh()
  }, [refresh])

  // ดึงข้อมูลใหม่เป็นจังหวะ — หยุดเมื่อสลับแท็บไปแอปอื่น (ประหยัดแบตมือถือ)
  useEffect(() => {
    let timer: number | undefined
    const tick = async () => {
      if (document.visibilityState === "visible") {
        try {
          // ดึงสถานะรวมเสมอ (ไม่ใช่เจาะจง id ของก๊วนที่ถืออยู่) — เครื่องนี้จะได้รู้
          // ทันทีถ้าอีกเครื่องเปิดก๊วนใหม่หรือสลับก๊วน ไม่ค้างอยู่กับก๊วนเก่า
          applyBootstrap(await api.bootstrap())
        } catch {
          setState((s) => ({ ...s, offline: true }))
        }
      }
      timer = window.setTimeout(tick, POLL_MS)
    }
    timer = window.setTimeout(tick, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      if (timer) window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [applyBootstrap, refresh])

  const value = useMemo<AppApi>(
    () => ({
      ...state,
      refresh,
      run,
      toast,
      dismissToast,
      submitPin,
      clearPin,
      applyView,
      setRoster,
    }),
    [state, refresh, run, toast, dismissToast, submitPin, clearPin, applyView, setRoster],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** ประกาศเรียกลงสนามด้วยเสียง (ใช้ตอนกดเริ่มเกม) */
export function callPlayers(text: string, enabled: boolean) {
  if (!enabled) return
  speak(text)
}

/**
 * นาฬิกาที่เดินเองในหน้าเว็บ — ให้ตัวเลขเวลารอ/เวลาเล่นขยับทุกวินาที
 * โดยไม่ต้องยิง API ถี่ ๆ
 */
export function useNow(intervalMs = 1000): number {
  const { clockSkew } = useApp()
  const [now, setNow] = useState(() => Date.now() + clockSkew)
  useEffect(() => {
    setNow(Date.now() + clockSkew)
    const t = window.setInterval(() => setNow(Date.now() + clockSkew), intervalMs)
    return () => window.clearInterval(t)
  }, [intervalMs, clockSkew])
  return now
}
