import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCheck, Dices, Info, Play, Users } from "lucide-react"
import {
  type MatchType,
  type SessionView,
  MATCH_TYPE_LABEL,
  displayName,
  formatDuration,
  levelInfo,
  playersPerMatch,
} from "@shared/types"
import { api, type Suggestion } from "@/lib/api"
import { useApp } from "@/lib/app"
import { speak } from "@/lib/sound"
import { cn } from "@/lib/util"
import { Modal, Segmented } from "./ui"
import { LevelBadge, PlayerAvatar } from "./player"

const TYPE_OPTIONS: { value: MatchType | "auto"; label: string }[] = [
  { value: "auto", label: "อัตโนมัติ" },
  { value: "D", label: "คู่ทั่วไป" },
  { value: "MD", label: "ชายคู่" },
  { value: "WD", label: "หญิงคู่" },
  { value: "XD", label: "คู่ผสม" },
  { value: "S", label: "เดี่ยว" },
]

export function MatchProposal({
  open,
  onClose,
  view,
  courtIndex,
  startMode,
}: {
  open: boolean
  onClose: () => void
  view: SessionView
  courtIndex: number
  /** "auto" = ให้ระบบจัด · "manual" = เลือกคนเอง */
  startMode: "auto" | "manual"
}) {
  const { run, toast } = useApp()
  const sessionId = view.session.id
  const courtName = view.session.courts[courtIndex]?.name ?? `คอร์ต ${courtIndex + 1}`

  const [mode, setMode] = useState<"auto" | "manual">(startMode)
  const [type, setType] = useState<MatchType | "auto">(view.session.settings.defaultMatchType)
  const [picked, setPicked] = useState<string[]>([])
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [alternatives, setAlternatives] = useState<Suggestion[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const rosterById = useMemo(() => new Map(view.roster.map((p) => [p.id, p])), [view.roster])
  const need = playersPerMatch(type === "auto" ? (view.queue.length >= 4 ? "D" : "S") : type)

  const fetchSuggestion = useCallback(
    async (opts: { shuffle?: boolean; include?: string[] } = {}) => {
      setBusy(true)
      setProblem(null)
      try {
        const reply = await api.suggest(sessionId, {
          type,
          include: opts.include,
          shuffle: opts.shuffle,
        })
        if (reply.ok) {
          setSuggestion(reply.suggestion)
          setAlternatives(reply.alternatives)
        } else {
          setSuggestion(null)
          setAlternatives([])
          setProblem(reply.reason)
        }
      } catch {
        setProblem("เรียกข้อมูลไม่สำเร็จ ลองอีกครั้ง")
      } finally {
        setBusy(false)
      }
    },
    [sessionId, type],
  )

  // เปิดหน้าต่าง → ล้างของเก่าทิ้ง
  useEffect(() => {
    if (!open) return
    setMode(startMode)
    setPicked([])
    setSuggestion(null)
    setProblem(null)
  }, [open, startMode])

  // โหมดให้ระบบจัด: ขอข้อเสนอทุกครั้งที่เปิดหรือเปลี่ยนประเภทเกม
  useEffect(() => {
    if (!open || mode !== "auto") return
    void fetchSuggestion()
  }, [open, mode, fetchSuggestion])

  const shuffleAgain = () => {
    const current = suggestion
    if (alternatives.length > 0 && current) {
      // มีตัวเลือกสำรองอยู่แล้ว → สลับให้ทันที ไม่ต้องรอเซิร์ฟเวอร์
      const [next, ...rest] = alternatives
      setSuggestion(next)
      setAlternatives([...rest, current])
      return
    }
    void fetchSuggestion({ shuffle: true, include: mode === "manual" ? picked : undefined })
  }

  const togglePick = (playerId: string) => {
    setPicked((prev) => {
      if (prev.includes(playerId)) return prev.filter((id) => id !== playerId)
      if (prev.length >= need) return prev
      return [...prev, playerId]
    })
  }

  // เลือกครบตามจำนวน → ให้เซิร์ฟเวอร์แบ่งฝั่งให้สูสี
  useEffect(() => {
    if (mode !== "manual") return
    if (picked.length === need) void fetchSuggestion({ include: picked })
    else setSuggestion(null)
  }, [mode, picked, need, fetchSuggestion])

  const start = async () => {
    if (!suggestion) return
    setBusy(true)
    const reply = await run(
      "เริ่มเกมแล้ว",
      () =>
        api.start(sessionId, {
          courtIndex,
          type: suggestion.type,
          teamA: suggestion.teamA,
          teamB: suggestion.teamB,
          createdBy: mode === "auto" ? "auto" : "manual",
        }),
      { silent: true },
    )
    setBusy(false)
    if (reply && "callText" in reply && reply.callText) {
      if (view.session.settings.callSound) speak(reply.callText)
      toast(reply.callText, "ok")
    }
    onClose()
  }

  const nameOf = (id: string) => {
    const p = rosterById.get(id)
    return p ? displayName(p) : id
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={`จัดเกมลง ${courtName}`}
      subtitle={
        mode === "auto"
          ? "ระบบเลือกคนที่รอนานสุด + มือใกล้เคียง + ไม่ซ้ำคู่เดิม"
          : `เลือกผู้เล่นเอง ${picked.length}/${need} คน แล้วระบบจะแบ่งฝั่งให้สูสี`
      }
      footer={
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={shuffleAgain} disabled={busy || (!suggestion && !problem)}>
            <Dices size={16} />
            สุ่มใหม่
          </button>
          <div className="flex-1" />
          <button className="btn-quiet" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" onClick={start} disabled={!suggestion || busy}>
            <Play size={16} />
            เริ่มเกม
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m)
            setPicked([])
            setSuggestion(null)
          }}
          options={[
            { value: "auto", label: "ให้ระบบจัด" },
            { value: "manual", label: "เลือกเอง" },
          ]}
        />

        <div>
          <span className="label">ประเภทเกม</span>
          <Segmented value={type} onChange={setType} options={TYPE_OPTIONS} size="sm" />
        </div>

        {problem ? (
          <div className="rounded-xl border border-gold/60 bg-gold/10 px-3.5 py-3 text-[13px] text-ink">
            {problem}
          </div>
        ) : null}

        {suggestion ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-washi border border-line/70 bg-subtle/50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="chip bg-navy/10 text-navy dark:bg-navy-soft/40 dark:text-sand">
                  {MATCH_TYPE_LABEL[suggestion.type]}
                </span>
                <span className="nums text-[11.5px] text-ink-soft">
                  รอนานสุดในชุดนี้ {formatDuration(suggestion.maxWaitMs)}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <TeamPanel ids={suggestion.teamA} side="A" nameOf={nameOf} levels={rosterById} />
                <div className="flex items-center gap-2">
                  <span className="h-px flex-1 bg-line" />
                  <span className="font-heading text-[11px] font-semibold text-ink-faint">VS</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
                <TeamPanel ids={suggestion.teamB} side="B" nameOf={nameOf} levels={rosterById} />
              </div>
            </div>

            <div className="rounded-xl border border-line/60 bg-surface p-3">
              <p className="mb-1.5 flex items-center gap-1.5 font-heading text-[12.5px] font-semibold text-ink">
                <Info size={13} className="text-gold-deep" />
                ทำไมจัดชุดนี้
              </p>
              <ul className="flex flex-col gap-1">
                {suggestion.reasons.map((r, i) => (
                  <li key={i} className="flex gap-1.5 text-[12.5px] leading-snug text-ink-soft">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {mode === "manual" ? (
          <div>
            <p className="section-title mb-2">
              <Users size={14} />
              คิวรอ ({view.queue.length})
            </p>
            <div className="flex flex-col gap-1.5">
              {view.queue.map((q) => {
                const on = picked.includes(q.player.id)
                return (
                  <button
                    key={q.player.id}
                    type="button"
                    onClick={() => togglePick(q.player.id)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all",
                      on ? "border-navy bg-navy/[0.07] ring-1 ring-navy/40" : "border-line/70 bg-surface hover:bg-subtle",
                    )}
                  >
                    <PlayerAvatar player={q.player} size={30} />
                    <span className="min-w-0 flex-1 truncate font-heading text-[14px] font-medium text-ink">
                      {displayName(q.player)}
                    </span>
                    <LevelBadge level={q.player.level} />
                    <span className="nums text-[12px] text-ink-soft">{formatDuration(q.waitMs)}</span>
                    {on ? <CheckCheck size={16} className="text-navy dark:text-gold-soft" /> : null}
                  </button>
                )
              })}
              {view.queue.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-ink-faint">ยังไม่มีคนในคิว</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

function TeamPanel({
  ids,
  side,
  nameOf,
  levels,
}: {
  ids: string[]
  side: "A" | "B"
  nameOf: (id: string) => string
  levels: Map<string, { level: number }>
}) {
  const sum = ids.reduce((n, id) => n + (levels.get(id)?.level ?? 0), 0)
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line/70 bg-surface px-3 py-2.5">
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg font-heading text-[11px] font-semibold",
          side === "A" ? "bg-navy text-white" : "bg-hinomaru text-white",
        )}
      >
        {side}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        {ids.map((id) => (
          <span key={id} className="flex items-center gap-1.5">
            <span className="truncate font-heading text-[14px] font-medium text-ink">{nameOf(id)}</span>
            <span className={cn("chip", levelInfo(levels.get(id)?.level ?? 1).tone)}>
              {levelInfo(levels.get(id)?.level ?? 1).code}
            </span>
          </span>
        ))}
      </div>
      <span className="nums shrink-0 font-heading text-[11px] text-ink-faint" title="ผลรวมระดับมือ">
        Σ{sum}
      </span>
    </div>
  )
}
