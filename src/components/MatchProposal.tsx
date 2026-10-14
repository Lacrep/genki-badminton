import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, ArrowLeftRight, CheckCheck, Dices, Info, ListPlus, Play, Users } from "lucide-react"
import {
  type MatchType,
  type RosterPlayer,
  type SessionView,
  MATCH_TYPE_LABEL,
  displayName,
  formatDuration,
  playersPerMatch,
} from "@shared/types"
import { api, type Suggestion } from "@/lib/api"
import { useApp } from "@/lib/app"
import { speak } from "@/lib/sound"
import { cn } from "@/lib/util"
import { Modal, Segmented } from "./ui"
import { LevelBadge, PlayerAvatar, PlayerFace } from "./player"

/** คนหนึ่งคนในรายชื่อที่เลือกได้ — เก็บสถานะจริงไว้ จะได้ย้อมสีให้เห็นชัด */
type Pickable = { player: RosterPlayer; status: "queue" | "playing" | "resting"; waitMs: number }

const TYPE_OPTIONS: { value: MatchType | "auto"; label: string }[] = [
  { value: "auto", label: "อัตโนมัติ" },
  { value: "D", label: "คู่" },
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
  /** null = จัดเข้าคิวไว้ก่อน ยังไม่ลงคอร์ต */
  courtIndex: number | null
  /** "auto" = ให้ระบบจัด · "manual" = เลือกคนเอง */
  startMode: "auto" | "manual"
}) {
  const { run, toast } = useApp()
  const sessionId = view.session.id
  const planning = courtIndex === null
  const courtName = courtIndex === null ? "" : (view.session.courts[courtIndex]?.name ?? `คอร์ต ${courtIndex + 1}`)

  const [mode, setMode] = useState<"auto" | "manual">(startMode)
  const [type, setType] = useState<MatchType | "auto">(view.session.settings.defaultMatchType)
  const [picked, setPicked] = useState<string[]>([])
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [alternatives, setAlternatives] = useState<Suggestion[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const rosterById = useMemo(() => new Map(view.roster.map((p) => [p.id, p])), [view.roster])

  /**
   * คนที่หยิบมาจัดเกมได้
   *
   * จัดลงคอร์ตเดี๋ยวนี้ → เฉพาะคนที่รออยู่ในคิว
   * จัดเข้าคิวล่วงหน้า → ทุกคนที่ยังอยู่ในก๊วน (รวมคนที่กำลังเล่น) ยกเว้นคนที่ถูกจัดไว้แล้ว
   */
  const pickable = useMemo(() => {
    if (!planning) {
      return view.queue.map((q) => ({ player: q.player, status: "queue" as const, waitMs: q.waitMs }))
    }
    const taken = new Set(view.planned.flatMap((p) => p.players.map((x) => x.player.id)))
    const waitOf = new Map(view.queue.map((q) => [q.player.id, q.waitMs]))
    return view.session.players
      .filter((sp) => sp.status !== "left" && !taken.has(sp.playerId))
      .map((sp) => {
        const player = rosterById.get(sp.playerId)
        if (!player) return null
        // เวลารอคือข้อมูลหลักที่ใช้ตัดสินว่าจะจัดใครลง จึงต้องเห็นตอนเลือกคนด้วย
        const wait = waitOf.get(sp.playerId)
        return { player, status: sp.status, waitMs: wait ?? -1 }
      })
      .filter((x): x is Pickable => !!x)
      // คนที่รอนานสุดอยู่บนสุด คนที่ยังเล่นอยู่ไปท้ายสุด
      .sort((a, b) => b.waitMs - a.waitMs)
  }, [planning, view.queue, view.planned, view.session.players, rosterById])
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
          forPlan: planning,
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
    [sessionId, type, planning],
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

  /**
   * โหมดเลือกเอง: จับคู่ตามลำดับที่กดเป๊ะ ๆ — คนที่ 1-2 ฝั่ง A · 3-4 ฝั่ง B
   *
   * เมื่อก่อนส่งรายชื่อกลับไปให้เซิร์ฟเวอร์แบ่งฝั่งใหม่ให้สูสี ผลคือจัดคู่เดิม
   * กี่ครั้งก็โดนสลับสมาชิกทุกที ทั้งที่บางคู่เขาอยากลงด้วยกันตลอด
   * ตอนนี้จับมาแบบไหนก็ได้แบบนั้น ซ้ำคู่เดิมได้ไม่มีใครมาห้าม
   */
  useEffect(() => {
    if (mode !== "manual") return
    if (picked.length !== need) {
      setSuggestion(null)
      setAlternatives([])
      return
    }
    const half = need / 2
    const teamA = picked.slice(0, half)
    const teamB = picked.slice(half)
    const levelOf = (id: string) => rosterById.get(id)?.level ?? 1
    const levels = picked.map(levelOf)
    const sum = (ids: string[]) => ids.reduce((n, id) => n + levelOf(id), 0)
    setSuggestion({
      type: need === 2 ? "S" : "D",
      teamA,
      teamB,
      levelGap: Math.max(...levels) - Math.min(...levels),
      teamDiff: Math.abs(sum(teamA) - sum(teamB)),
      maxWaitMs: Math.max(0, ...picked.map((id) => pickable.find((c) => c.player.id === id)?.waitMs ?? 0)),
      reasons: ["หัวก๊วนจับคู่เอง — ระบบไม่สลับให้"],
    })
    setAlternatives([])
  }, [mode, picked, need, rosterById, pickable])

  /** สลับฝั่ง A↔B โดยไม่เปลี่ยนว่าใครคู่กับใคร */
  const swapSides = () => setPicked((prev) => [...prev.slice(need / 2), ...prev.slice(0, need / 2)])

  const start = async () => {
    if (!suggestion) return
    if (
      stillPlaying.length > 0 &&
      !window.confirm(
        `${stillPlaying.join(", ")} ยังอยู่ในคอร์ตตอนนี้\n\n` +
          (planning
            ? "จัดเข้าคิวได้ แต่คู่นี้จะลงไม่ได้จนกว่าเขาจะจบเกม — ยืนยันไหม?"
            : "ต้องจบเกมที่เขาเล่นอยู่ก่อนถึงจะลงคอร์ตนี้ได้ — ยืนยันไหม?"),
      )
    ) {
      return
    }
    setBusy(true)
    const payload = {
      type: suggestion.type,
      teamA: suggestion.teamA,
      teamB: suggestion.teamB,
      createdBy: (mode === "auto" ? "auto" : "manual") as "auto" | "manual",
    }
    const reply = planning
      ? await run("เพิ่มเข้าคิวเกมแล้ว", () => api.plan(sessionId, payload))
      : await run("เริ่มเกมแล้ว", () => api.start(sessionId, { courtIndex, ...payload }), { silent: true })
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

  /** คนในเกมนี้ที่ยังไม่ลงจากคอร์ต — ต้องเตือนก่อนจัด ไม่งั้นพลาดได้ง่าย */
  const stillPlaying = useMemo(() => {
    if (!suggestion) return []
    const ids = new Set([...suggestion.teamA, ...suggestion.teamB])
    return view.session.players
      .filter((sp) => ids.has(sp.playerId) && sp.status === "playing")
      .map((sp) => nameOf(sp.playerId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion, view.session.players, rosterById])

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={planning ? "จัดเกมเข้าคิวไว้ก่อน" : `จัดเกมลง ${courtName}`}
      subtitle={
        planning
          ? "เกมนี้จะไปต่อท้ายคิว — คอร์ตไหนว่างก่อนก็กดลงได้เลย ไม่ต้องมาจัดใหม่ตอนนั้น"
          : mode === "auto"
            ? "ระบบเลือกคนที่รอนานสุด + มือใกล้เคียง + ไม่ซ้ำคู่เดิม"
            : `เลือกเอง ${picked.length}/${need} คน — กดตามลำดับ คนที่ 1-2 อยู่ฝั่ง A คนที่ 3-4 ฝั่ง B`
      }
      footer={
        <div className="flex items-center gap-2">
          {mode === "manual" ? (
            <button className="btn-ghost" onClick={swapSides} disabled={busy || picked.length !== need}>
              <ArrowLeftRight size={16} />
              สลับฝั่ง
            </button>
          ) : (
            <button className="btn-ghost" onClick={shuffleAgain} disabled={busy || (!suggestion && !problem)}>
              <Dices size={16} />
              สุ่มใหม่
            </button>
          )}
          <div className="flex-1" />
          <button className="btn-quiet" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" onClick={start} disabled={!suggestion || busy}>
            {planning ? <ListPlus size={16} /> : <Play size={16} />}
            {planning ? "เพิ่มเข้าคิว" : "เริ่มเกม"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {stillPlaying.length > 0 ? (
          <div className="flex items-start gap-2.5 rounded-xl border-2 border-hinomaru/55 bg-hinomaru/[0.1] px-3 py-2.5">
            <AlertTriangle size={17} className="mt-0.5 shrink-0 text-hinomaru" />
            <p className="text-[12.5px] leading-snug text-ink">
              <b className="font-heading">{stillPlaying.join(", ")}</b> ยังอยู่ในคอร์ตตอนนี้
              <span className="block text-ink-soft">
                {planning
                  ? "จัดเข้าคิวได้ แต่คู่นี้จะลงไม่ได้จนกว่าเขาจะจบเกม"
                  : "ต้องจบเกมที่เขาเล่นอยู่ก่อน ถึงจะลงคอร์ตนี้ได้"}
              </span>
            </p>
          </div>
        ) : null}
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
                <TeamPanel ids={suggestion.teamA} side="A" players={rosterById} levels={rosterById} />
                <div className="flex items-center gap-2">
                  <span className="h-px flex-1 bg-line" />
                  <span className="font-heading text-[11px] font-semibold text-ink-faint">VS</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
                <TeamPanel ids={suggestion.teamB} side="B" players={rosterById} levels={rosterById} />
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
              {planning ? `เลือกใครก็ได้ (${pickable.length} คน)` : `คิวรอ (${pickable.length})`}
            </p>
            {planning ? (
              <p className="mb-2 text-[11.5px] leading-snug text-ink-faint">
                คนที่อยู่ในคอร์ตตอนนี้ก็เลือกได้ — กว่าจะถึงคิวนี้เขาก็ลงจากคอร์ตแล้ว
                (คนที่ถูกจัดไว้ในคิวเกมอื่นแล้วจะไม่ขึ้นให้เลือกซ้ำ)
              </p>
            ) : null}
            <div className="flex flex-col gap-1.5">
              {pickable.map((c) => {
                const at = picked.indexOf(c.player.id)
                const on = at >= 0
                return (
                  <button
                    key={c.player.id}
                    type="button"
                    onClick={() => togglePick(c.player.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-all",
                      on
                        ? "border-navy bg-navy/[0.07] ring-1 ring-navy/40"
                        : c.status === "playing"
                          ? // คนที่ยังอยู่ในคอร์ตต้องสะดุดตา ไม่งั้นจัดลงซ้ำโดยไม่ทันสังเกต
                            "border-hinomaru/45 bg-hinomaru/[0.07] hover:bg-hinomaru/[0.12]"
                          : "border-line/70 bg-surface hover:bg-subtle",
                    )}
                  >
                    {/* รูปใหญ่ — หัวก๊วนนึกชื่อไม่ออกก็ดูหน้าได้ทันที */}
                    <span className="relative shrink-0">
                      <PlayerAvatar player={c.player} size={46} />
                      {/* โหมดเลือกเอง: เลขบอกว่าใครคู่กับใคร (1-2 ฝั่ง A · 3-4 ฝั่ง B) */}
                      {on && mode === "manual" ? (
                        <span
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full font-heading text-[12px] font-bold text-white ring-2 ring-surface",
                            at < need / 2 ? "bg-navy" : "bg-hinomaru",
                          )}
                        >
                          {at + 1}
                        </span>
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-heading text-[15px] font-semibold text-ink">
                      {displayName(c.player)}
                    </span>
                    <LevelBadge level={c.player.level} />
                    {c.status === "playing" ? (
                      <span className="chip shrink-0 border border-hinomaru/40 bg-hinomaru/15 font-semibold text-hinomaru-deep dark:text-hinomaru-soft">
                        อยู่ในคอร์ต
                      </span>
                    ) : c.status === "resting" ? (
                      <span className="chip shrink-0 border border-gold/50 bg-gold/20 font-semibold text-gold-deep dark:text-gold-soft">
                        ขอพัก
                      </span>
                    ) : (
                      <span className="nums text-[12px] text-ink-soft">รอ {formatDuration(c.waitMs)}</span>
                    )}
                    {on ? <CheckCheck size={16} className="text-navy dark:text-gold-soft" /> : null}
                  </button>
                )
              })}
              {pickable.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-ink-faint">
                  {planning ? "ทุกคนถูกจัดไว้ในคิวหมดแล้ว" : "ยังไม่มีคนในคิว"}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

/** ฝั่ง A / ฝั่ง B ของคู่ที่จัดได้ — โชว์รูปใหญ่ให้เห็นหน้าชัดก่อนกดเริ่มเกม */
function TeamPanel({
  ids,
  side,
  players,
  levels,
}: {
  ids: string[]
  side: "A" | "B"
  players: Map<string, RosterPlayer>
  levels: Map<string, { level: number }>
}) {
  const sum = ids.reduce((n, id) => n + (levels.get(id)?.level ?? 0), 0)
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border-2 px-3 py-2.5",
        side === "A" ? "border-navy/35 bg-navy/[0.05]" : "border-hinomaru/35 bg-hinomaru/[0.05]",
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-heading text-[12px] font-bold text-white",
          side === "A" ? "bg-navy" : "bg-hinomaru",
        )}
      >
        {side}
      </span>
      <div className="flex min-w-0 flex-1 items-start justify-around gap-2">
        {ids.map((id) => {
          const p = players.get(id)
          return p ? (
            <PlayerFace key={id} player={p} size={52} stack />
          ) : (
            <span key={id} className="text-[13px] text-ink-faint">
              —
            </span>
          )
        })}
      </div>
      <span className="nums shrink-0 font-heading text-[11px] text-ink-faint" title="ผลรวมระดับมือ">
        Σ{sum}
      </span>
    </div>
  )
}
