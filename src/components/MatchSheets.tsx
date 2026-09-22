import { useEffect, useState } from "react"
import { ArrowLeftRight, CheckCircle2, Trophy } from "lucide-react"
import { type CourtView, type SessionView, displayName, formatDuration } from "@shared/types"
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
  const [winner, setWinner] = useState<"A" | "B" | "none">("none")
  const [withScore, setWithScore] = useState(false)
  const [scoreA, setScoreA] = useState(21)
  const [scoreB, setScoreB] = useState(15)
  const [shuttles, setShuttles] = useState(1)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !cv?.match) return
    setWinner("none")
    setWithScore(false)
    setScoreA(21)
    setScoreB(15)
    setShuttles(cv.match.shuttles || 1)
  }, [open, cv])

  if (!cv?.match) return null
  const match = cv.match
  const teamA = cv.players.filter((p) => p.team === "A")
  const teamB = cv.players.filter((p) => p.team === "B")

  const submit = async () => {
    setBusy(true)
    await run("บันทึกผลเกมแล้ว", () =>
      api.finish(sessionId, {
        matchId: match.id,
        shuttles,
        ...(withScore
          ? { scoreA, scoreB }
          : winner !== "none"
            ? { winner }
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
        <div>
          <span className="label">ฝั่งไหนชนะ (ข้ามได้ถ้าไม่ได้จด)</span>
          <div className="grid grid-cols-3 gap-2">
            {(["A", "B", "none"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setWinner(k)}
                className={cn(
                  "rounded-xl border px-2 py-2.5 text-center font-heading text-[13px] font-medium transition-all",
                  winner === k
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
                    {winner === k ? <Trophy size={13} /> : null}
                    ฝั่ง {k}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-line/70 bg-subtle/40 p-3">
          <TeamLine label="A" players={teamA} highlight={winner === "A"} />
          <TeamLine label="B" players={teamB} highlight={winner === "B"} />
        </div>

        <div>
          <span className="label">คะแนน</span>
          <Segmented
            value={withScore ? "yes" : "no"}
            onChange={(v) => setWithScore(v === "yes")}
            options={[
              { value: "no", label: "ไม่จดคะแนน" },
              { value: "yes", label: "จดคะแนน" },
            ]}
            size="sm"
          />
          {withScore ? (
            <div className="mt-2.5 flex items-center justify-center gap-3">
              <div className="flex flex-col items-center gap-1">
                <span className="font-heading text-[11.5px] text-ink-faint">ฝั่ง A</span>
                <Stepper value={scoreA} onChange={setScoreA} max={40} />
              </div>
              <span className="pt-4 font-heading text-lg text-ink-faint">:</span>
              <div className="flex flex-col items-center gap-1">
                <span className="font-heading text-[11.5px] text-ink-faint">ฝั่ง B</span>
                <Stepper value={scoreB} onChange={setScoreB} max={40} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="block font-heading text-[14px] font-medium text-ink">ลูกที่ใช้ในเกมนี้</span>
            <span className="block text-[12px] text-ink-soft">ใช้คิดค่าลูกตอนหารเงินตอนท้าย</span>
          </span>
          <Stepper value={shuttles} onChange={setShuttles} max={20} suffix="ลูก" />
        </div>
      </div>
    </Modal>
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
