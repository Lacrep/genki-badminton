import { useEffect, useState } from "react"
import { ArrowLeftRight, CheckCircle2, Plus, Trophy } from "lucide-react"
import {
  type CourtView,
  type MatchSet,
  type SessionView,
  displayName,
  formatDuration,
  setsWon,
  winnerFromSets,
} from "@shared/types"
import { api } from "@/lib/api"
import { useApp } from "@/lib/app"
import { cn } from "@/lib/util"
import { Modal, Segmented, Stepper } from "./ui"
import { LevelBadge, PlayerAvatar } from "./player"

// ── จบเกม ────────────────────────────────────────────────────────────────────

export function FinishSheet({
  open,
  onClose,
  cv,
  sessionId,
}: {
  open: boolean
  onClose: () => void
  cv: CourtView | null
  sessionId: string
}) {
  const { run } = useApp()
  const [mode, setMode] = useState<"score" | "quick">("score")
  const [sets, setSets] = useState<MatchSet[]>([
    { a: 0, b: 0 },
    { a: 0, b: 0 },
  ])
  const [quickWinner, setQuickWinner] = useState<"A" | "B" | "none">("none")
  const [shuttles, setShuttles] = useState(1)
  const [busy, setBusy] = useState(false)

  const matchId = cv?.match?.id
  const matchShuttles = cv?.match?.shuttles ?? 0

  // ล้างฟอร์มเฉพาะตอนเปิดหน้าต่างหรือเปลี่ยนเกม — ห้ามผูกกับ cv ทั้งก้อน
  // เพราะข้อมูลถูกดึงใหม่ทุก 3 วินาที จะรีเซ็ตสิ่งที่ผู้ใช้เพิ่งกดทิ้ง
  useEffect(() => {
    if (!open || !matchId) return
    setMode("score")
    setSets([
      { a: 0, b: 0 },
      { a: 0, b: 0 },
    ])
    setQuickWinner("none")
    setShuttles(matchShuttles || 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, matchId])

  // เซ็ตที่มีคะแนนแล้วเท่านั้นที่นับ — กรอกไม่ครบก็จบเกมได้
  const filled = sets.filter((x) => x.a > 0 || x.b > 0)
  const won = setsWon(filled)
  const decided = winnerFromSets(filled)
  const needsThirdSet = filled.length === 2 && won.a === won.b

  if (!cv?.match) return null
  const match = cv.match
  const teamA = cv.players.filter((p) => p.team === "A")
  const teamB = cv.players.filter((p) => p.team === "B")
  const highlight = mode === "score" ? decided : quickWinner === "none" ? null : quickWinner

  const setScore = (index: number, side: "a" | "b", value: number) => {
    setSets((prev) => {
      const next = prev.map((x, i) => (i === index ? { ...x, [side]: Math.max(0, Math.min(99, value)) } : x))
      return next
    })
  }

  const submit = async () => {
    setBusy(true)
    await run("บันทึกผลเกมแล้ว", () =>
      api.finish(sessionId, {
        matchId: match.id,
        shuttles,
        ...(mode === "score" && filled.length > 0
          ? { sets: filled }
          : mode === "quick" && quickWinner !== "none"
            ? { winner: quickWinner }
            : {}),
      }),
    )
    setBusy(false)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`จบเกม ${cv.court.name}`}
      subtitle={`เล่นไป ${formatDuration(cv.elapsedMs)} — ทุกคนจะกลับเข้าคิวโดยเริ่มนับเวลารอใหม่`}
      footer={
        <button className="btn-primary w-full btn-lg" onClick={submit} disabled={busy}>
          <CheckCircle2 size={18} />
          จบเกมและคืนคนเข้าคิว
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-xl border border-line/70 bg-subtle/40 p-3">
          <TeamLine label="A" players={teamA} highlight={highlight === "A"} />
          <TeamLine label="B" players={teamB} highlight={highlight === "B"} />
        </div>

        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "score", label: "จดคะแนน (21 แต้ม 2 เซ็ต)" },
            { value: "quick", label: "ไม่จดคะแนน" },
          ]}
          size="sm"
        />

        {mode === "score" ? (
          <div className="flex flex-col gap-2">
            {sets.map((set, i) => (
              <SetRow
                key={i}
                index={i}
                set={set}
                onChange={(side, v) => setScore(i, side, v)}
                onQuick={(winnerSide) => {
                  setScore(i, winnerSide, 21)
                  setScore(i, winnerSide === "a" ? "b" : "a", set[winnerSide === "a" ? "b" : "a"] || 0)
                }}
              />
            ))}

            {needsThirdSet && sets.length === 2 ? (
              <button className="btn-ghost btn-sm self-start" onClick={() => setSets((p) => [...p, { a: 0, b: 0 }])}>
                <Plus size={14} />
                เสมอ 1-1 · เพิ่มเซ็ตที่ 3
              </button>
            ) : null}

            <p className="text-center text-[12.5px] text-ink-soft">
              {filled.length === 0
                ? "ใส่คะแนนแต่ละเซ็ต หรือข้ามไปก็ได้"
                : decided
                  ? `ฝั่ง ${decided} ชนะ ${Math.max(won.a, won.b)}-${Math.min(won.a, won.b)} เซ็ต`
                  : `ตอนนี้เสมอกัน ${won.a}-${won.b} เซ็ต`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {(["A", "B", "none"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setQuickWinner(k)}
                className={cn(
                  "rounded-xl border px-2 py-2.5 text-center font-heading text-[13px] font-medium transition-all",
                  quickWinner === k
                    ? k === "none"
                      ? "border-line bg-subtle text-ink"
                      : "border-navy bg-navy text-white"
                    : "border-line bg-surface text-ink-soft hover:bg-subtle",
                )}
              >
                {k === "none" ? (
                  "ไม่บันทึก"
                ) : (
                  <span className="flex items-center justify-center gap-1">
                    {quickWinner === k ? <Trophy size={13} /> : null}
                    ฝั่ง {k}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 rounded-xl border border-gold/50 bg-gold/[0.08] px-3 py-2.5">
          <span>
            <span className="block font-heading text-[14px] font-medium text-ink">ลูกที่ใช้ในเกมนี้</span>
            <span className="block text-[12px] text-ink-soft">
              ค่าลูกจะถูกหารเฉพาะ {cv.players.length} คนที่ลงเกมนี้
            </span>
          </span>
          <Stepper value={shuttles} onChange={setShuttles} max={20} suffix="ลูก" />
        </div>
      </div>
    </Modal>
  )
}

/** แถวกรอกคะแนนหนึ่งเซ็ต — กดปุ่ม 21 เพื่อใส่ไวตอนอยู่ข้างสนาม */
function SetRow({
  index,
  set,
  onChange,
  onQuick,
}: {
  index: number
  set: MatchSet
  onChange: (side: "a" | "b", value: number) => void
  onQuick: (side: "a" | "b") => void
}) {
  const num = (v: string) => {
    const n = Number(v.replace(/[^0-9]/g, ""))
    return Number.isFinite(n) ? n : 0
  }
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line/70 bg-surface px-3 py-2">
      <span className="w-12 shrink-0 font-heading text-[12.5px] font-medium text-ink-soft">เซ็ต {index + 1}</span>
      <div className="flex flex-1 items-center justify-center gap-2">
        <input
          className="input nums w-[72px] py-1.5 text-center text-[17px] font-semibold"
          inputMode="numeric"
          value={set.a || ""}
          placeholder="0"
          aria-label={`คะแนนฝั่ง A เซ็ต ${index + 1}`}
          onChange={(e) => onChange("a", num(e.target.value))}
        />
        <span className="font-heading text-[15px] text-ink-faint">:</span>
        <input
          className="input nums w-[72px] py-1.5 text-center text-[17px] font-semibold"
          inputMode="numeric"
          value={set.b || ""}
          placeholder="0"
          aria-label={`คะแนนฝั่ง B เซ็ต ${index + 1}`}
          onChange={(e) => onChange("b", num(e.target.value))}
        />
      </div>
      <div className="flex shrink-0 gap-1">
        <button type="button" className="btn-quiet btn-sm !px-2" onClick={() => onQuick("a")} title="ฝั่ง A ได้ 21">
          A 21
        </button>
        <button type="button" className="btn-quiet btn-sm !px-2" onClick={() => onQuick("b")} title="ฝั่ง B ได้ 21">
          B 21
        </button>
      </div>
    </div>
  )
}

function TeamLine({
  label,
  players,
  highlight,
}: {
  label: string
  players: CourtView["players"]
  highlight: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-2",
        highlight ? "border-gold bg-gold/15" : "border-transparent",
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-navy font-heading text-[10.5px] font-semibold text-white">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1">
        {players.map((p) => (
          <span key={p.player.id} className="flex items-center gap-1.5">
            <span className="font-heading text-[13.5px] font-medium text-ink">{displayName(p.player)}</span>
            <LevelBadge level={p.player.level} />
          </span>
        ))}
      </div>
      {highlight ? <Trophy size={14} className="shrink-0 text-gold-deep" /> : null}
    </div>
  )
}

// ── สลับคนในเกมที่กำลังเล่น ───────────────────────────────────────────────────

export function SwapSheet({
  open,
  onClose,
  cv,
  view,
}: {
  open: boolean
  onClose: () => void
  cv: CourtView | null
  view: SessionView
}) {
  const { run } = useApp()
  const [outId, setOutId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setOutId(null)
  }, [open])

  if (!cv?.match) return null

  const swap = async (inId: string) => {
    if (!outId) return
    setBusy(true)
    await run("สลับตัวแล้ว", () =>
      api.swap(view.session.id, { matchId: cv.match!.id, outPlayerId: outId, inPlayerId: inId }),
    )
    setBusy(false)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`สลับตัวใน ${cv.court.name}`}
      subtitle="ใช้ตอนมีคนเจ็บ หรือขอเปลี่ยนตัวกลางเกม — คนที่ออกจะกลับไปต่อคิว"
    >
      <div className="flex flex-col gap-4">
        <div>
          <span className="label">1. เลือกคนที่จะออก</span>
          <div className="flex flex-col gap-1.5">
            {cv.players.map((p) => (
              <button
                key={p.player.id}
                type="button"
                onClick={() => setOutId(p.player.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all",
                  outId === p.player.id
                    ? "border-hinomaru bg-hinomaru/10 ring-1 ring-hinomaru/40"
                    : "border-line/70 bg-surface hover:bg-subtle",
                )}
              >
                <PlayerAvatar player={p.player} size={30} />
                <span className="flex-1 truncate font-heading text-[14px] font-medium text-ink">
                  {displayName(p.player)}
                </span>
                <span className="chip bg-subtle text-ink-soft">ฝั่ง {p.team}</span>
                <LevelBadge level={p.player.level} />
              </button>
            ))}
          </div>
        </div>

        <div className={cn("transition-opacity", outId ? "opacity-100" : "pointer-events-none opacity-40")}>
          <span className="label">2. เลือกคนที่จะลงแทน (จากคิว)</span>
          <div className="flex flex-col gap-1.5">
            {view.queue.map((q) => (
              <button
                key={q.player.id}
                type="button"
                disabled={busy}
                onClick={() => void swap(q.player.id)}
                className="flex items-center gap-2.5 rounded-xl border border-line/70 bg-surface px-2.5 py-2 text-left transition-all hover:bg-subtle"
              >
                <PlayerAvatar player={q.player} size={30} />
                <span className="flex-1 truncate font-heading text-[14px] font-medium text-ink">
                  {displayName(q.player)}
                </span>
                <LevelBadge level={q.player.level} />
                <span className="nums text-[12px] text-ink-soft">{formatDuration(q.waitMs)}</span>
                <ArrowLeftRight size={15} className="text-navy dark:text-gold-soft" />
              </button>
            ))}
            {view.queue.length === 0 ? (
              <p className="py-3 text-center text-[13px] text-ink-faint">ไม่มีคนในคิวให้สลับ</p>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  )
}
