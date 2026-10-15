import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, ArrowLeftRight, CheckCheck, Dices, Info, ListPlus, Play, Search, Users, X } from "lucide-react"
import {
  type MatchType,
  type RosterPlayer,
  type SessionView,
  MATCH_TYPE_LABEL,
  displayName,
  formatDuration,
  levelInfo,
  levelInk,
  levelSolid,
  photoUrl,
  playersPerMatch,
} from "@shared/types"
import { api, type Suggestion } from "@/lib/api"
import { useApp, useNow } from "@/lib/app"
import { speak } from "@/lib/sound"
import { cn } from "@/lib/util"
import { Modal, Segmented } from "./ui"
import { PlayerFace } from "./player"

/** ตัดช่องว่างกับตัวพิมพ์ใหญ่เล็กทิ้งก่อนเทียบ — พิมพ์ "พี่ หมู" ก็ต้องเจอ "พี่หมู" */
function nameKey(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase()
}

/** คนหนึ่งคนในรายชื่อที่เลือกได้ — เก็บสถานะจริงไว้ จะได้ย้อมสีให้เห็นชัด */
type Pickable = {
  player: RosterPlayer
  status: "queue" | "playing" | "resting"
  /** เวลาที่เริ่มรอคิว — เอาไปลบกับนาฬิกาเดินจริงตอนแสดงผล (null = ไม่ได้รออยู่) */
  queueSince: number | null
  /** ลงไปกี่เกมแล้ววันนี้ — ใช้ดูว่าใครยังลงน้อย ตอนวางแผนล่วงหน้า */
  games: number
  /** ถูกจัดไว้ในคิวเกมที่จัดล่วงหน้าแล้วกี่เกม */
  plannedCount: number
}

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
  // นาฬิกาเดินจริงทุกวินาที — เวลารอบนการ์ดจะได้ขยับตามจริง ไม่ใช่ค้างตามรอบรีเฟรช
  const now = useNow()
  const sessionId = view.session.id
  const planning = courtIndex === null
  const courtName = courtIndex === null ? "" : (view.session.courts[courtIndex]?.name ?? `คอร์ต ${courtIndex + 1}`)

  const [mode, setMode] = useState<"auto" | "manual">(startMode)
  const [type, setType] = useState<MatchType | "auto">(view.session.settings.defaultMatchType)
  const [picked, setPicked] = useState<string[]>([])
  const [query, setQuery] = useState("")
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
    /** ถูกจัดไว้ในคิวแล้วกี่เกม — จัดซ้ำได้ แต่ต้องรู้ว่าซ้ำ */
    const plannedCount = new Map<string, number>()
    for (const p of view.planned) {
      for (const x of p.players) plannedCount.set(x.player.id, (plannedCount.get(x.player.id) ?? 0) + 1)
    }
    if (!planning) {
      return view.queue.map((q) => ({
        player: q.player,
        status: "queue" as const,
        queueSince: q.sp.queueSince ?? null,
        games: q.sp.gamesPlayed,
        plannedCount: plannedCount.get(q.player.id) ?? 0,
      }))
    }
    /*
      จัดคิวล่วงหน้าเลือกได้ทุกคนที่ยังอยู่ในก๊วน

      รวมคนที่กำลังเล่นอยู่ (กว่าจะถึงคิวนี้เขาก็ลงจากคอร์ตแล้ว) และรวมคนที่ถูกจัดไว้
      ในคิวเกมอื่นแล้วด้วย เพราะหัวก๊วนวางแผนทั้งรอบล่วงหน้า คนเดิมลงหลายเกมติดกันก็มี
      แค่ติดป้ายบอกไว้ว่าซ้ำกี่คิว แล้วไปบอกตอนแสดงคิวว่าคิวไหนต้องรอคิวก่อนหน้า
    */
    return view.session.players
      .filter((sp) => sp.status !== "left")
      .map((sp) => {
        const player = rosterById.get(sp.playerId)
        if (!player) return null
        return {
          player,
          status: sp.status,
          queueSince: sp.queueSince ?? null,
          games: sp.gamesPlayed,
          plannedCount: plannedCount.get(sp.playerId) ?? 0,
        }
      })
      .filter((x): x is Pickable => !!x)
      // คนที่รอนานสุดอยู่บนสุด คนที่ยังเล่นอยู่ไปท้ายสุด
      .sort((a, b) => (b.queueSince == null ? -1 : now - b.queueSince) - (a.queueSince == null ? -1 : now - a.queueSince))
  }, [planning, view.queue, view.planned, view.session.players, rosterById, now])
  const need = playersPerMatch(type === "auto" ? (view.queue.length >= 4 ? "D" : "S") : type)

  /**
   * รายชื่อที่โชว์จริงหลังกรองด้วยคำค้นหา
   *
   * คนที่เลือกไว้แล้วต้องไม่หายไปตอนพิมพ์ค้นหาคนถัดไป ไม่งั้นเลขลำดับที่จับไว้
   * จะหายจากตาจนไม่รู้ว่าจับไปแล้วกี่คน และกดยกเลิกคนที่เลือกผิดไม่ได้
   */
  const shown = useMemo(() => {
    const key = nameKey(query)
    if (!key) return pickable
    return pickable.filter((c) => picked.includes(c.player.id) || nameKey(displayName(c.player)).includes(key))
  }, [pickable, query, picked])

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
    setQuery("")
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
      maxWaitMs: Math.max(
        0,
        ...picked.map((id) => {
          const since = pickable.find((c) => c.player.id === id)?.queueSince
          return since ? now - since : 0
        }),
      ),
      reasons: ["หัวก๊วนจับคู่เอง — ระบบไม่สลับให้"],
    })
    setAlternatives([])
  }, [mode, picked, need, rosterById, pickable, now])

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

  /**
   * คนในเกมนี้ที่ถูกจัดไว้ในคิวเกมอื่นอยู่แล้ว
   *
   * จัดซ้ำได้ (หัวก๊วนวางแผนทั้งรอบ คนเดิมลงหลายเกมติดกันก็มี) แค่บอกให้รู้ตัว
   * ไม่ใช่ความผิดพลาด จึงขึ้นสีทองไม่ใช่สีแดง
   */
  const alsoQueued = useMemo(() => {
    if (!suggestion) return []
    const ids = new Set([...suggestion.teamA, ...suggestion.teamB])
    const out = new Set<string>()
    for (const p of view.planned) {
      for (const x of p.players) if (ids.has(x.player.id)) out.add(displayName(x.player))
    }
    return [...out]
  }, [suggestion, view.planned])

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
        {alsoQueued.length > 0 ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-gold/60 bg-gold/[0.12] px-3 py-2.5">
            <ListPlus size={17} className="mt-0.5 shrink-0 text-gold-deep dark:text-gold-soft" />
            <p className="text-[12.5px] leading-snug text-ink">
              <b className="font-heading">{alsoQueued.join(", ")}</b> ถูกจัดไว้ในคิวเกมอื่นแล้ว
              <span className="block text-ink-soft">
                จัดซ้ำได้ — คิวที่ใช้คนซ้ำกันจะรอให้คิวก่อนหน้าลงจบก่อนเอง
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
            // ข้อความ "คนไม่พอ" จากโหมดให้ระบบจัด ค้างข้ามมาโหมดเลือกเองไม่ได้
            setProblem(null)
            setQuery("")
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
                เลือกได้ทุกคน ทั้งคนที่อยู่ในคอร์ตตอนนี้และคนที่ถูกจัดไว้ในคิวเกมอื่นแล้ว —
                คิวที่ใช้คนซ้ำกันจะรอให้คิวก่อนหน้าลงจบก่อนเอง
              </p>
            ) : null}

            {/* ช่องค้นหา — วันที่คนเยอะ 30-40 คน กวาดตาหาทีละการ์ดไม่ทัน */}
            <label className="relative mb-2 block">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาชื่อ"
                className="input w-full !pl-8 !pr-8"
                autoComplete="off"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint hover:bg-subtle"
                  aria-label="ล้างคำค้นหา"
                >
                  <X size={14} />
                </button>
              ) : null}
            </label>

            {/*
              การ์ดจัตุรัสรูปเต็มใบ แทนแถวผืนผ้ายาว ๆ

              หัวก๊วนต้องกวาดตาหาคนให้เจอเร็วตอนสนามกำลังวุ่น รูปกว้างเกือบเต็มการ์ด
              จำหน้าได้จากระยะแขน และเห็นได้ทีละ 9 คนต่อหน้าจอแทนที่จะเป็น 6 แถว
            */}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {shown.map((c) => {
                const at = picked.indexOf(c.player.id)
                const on = at >= 0
                const photo = photoUrl(c.player)
                const info = levelInfo(c.player.level)
                const waitMs = c.queueSince == null ? null : Math.max(0, now - c.queueSince)
                return (
                  <button
                    key={c.player.id}
                    type="button"
                    onClick={() => togglePick(c.player.id)}
                    title={`${displayName(c.player)} · ${info.name} — ${info.hint}`}
                    className={cn(
                      "relative flex flex-col overflow-hidden rounded-xl border-2 text-left transition-all active:scale-[0.97]",
                      on
                        ? "border-navy ring-2 ring-navy/35 dark:border-gold-soft dark:ring-gold/35"
                        : c.status === "playing"
                          ? // คนที่ยังอยู่ในคอร์ตต้องสะดุดตา ไม่งั้นจัดลงซ้ำโดยไม่ทันสังเกต
                            "border-hinomaru/60 hover:border-hinomaru"
                          : "border-line/70 hover:border-navy/40",
                    )}
                  >
                    <span className="relative block aspect-square w-full bg-subtle">
                      {photo ? (
                        <img src={photo} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        // ไม่มีรูปก็ใช้ตัวอักษรแรกบนสีระดับมือ — ยังกวาดตาดูมือได้เหมือนกัน
                        <span
                          className="flex h-full w-full items-center justify-center font-heading text-[34px] font-bold"
                          style={{ backgroundColor: levelSolid(c.player.level), color: levelInk(c.player.level) }}
                          aria-hidden
                        >
                          {displayName(c.player).trim().slice(0, 1)}
                        </span>
                      )}

                      {/* เลือกแล้ว: ย้อมทับ + เลขลำดับ (1-2 ฝั่ง A · 3-4 ฝั่ง B) */}
                      {on ? (
                        <span className="absolute inset-0 bg-navy/35 dark:bg-navy-deep/45" aria-hidden />
                      ) : null}
                      {on && mode === "manual" ? (
                        <span
                          className={cn(
                            "absolute left-1 top-1 flex h-7 w-7 items-center justify-center rounded-full font-heading text-[14px] font-bold text-white shadow-lift",
                            at < need / 2 ? "bg-navy" : "bg-hinomaru",
                          )}
                        >
                          {at + 1}
                        </span>
                      ) : on ? (
                        <span className="absolute left-1 top-1 rounded-full bg-navy p-1 text-white shadow-lift">
                          <CheckCheck size={14} />
                        </span>
                      ) : null}

                      {/* ถูกจัดไว้ในคิวแล้ว — จัดซ้ำได้ แต่ต้องรู้ตัวว่าซ้ำ */}
                      {c.plannedCount > 0 ? (
                        <span className="absolute right-1 top-1 rounded-md bg-gold px-1.5 py-0.5 font-heading text-[10px] font-bold leading-tight text-navy-deep shadow-lift">
                          ในคิว{c.plannedCount > 1 ? ` ×${c.plannedCount}` : ""}
                        </span>
                      ) : null}

                      {/* สถานะคาดไว้ท้ายรูป — อยู่ในคอร์ต/ขอพักต้องเห็นก่อนกด */}
                      {c.status === "playing" ? (
                        <span className="absolute inset-x-0 bottom-0 bg-hinomaru py-0.5 text-center font-heading text-[10.5px] font-bold text-white">
                          อยู่ในคอร์ต
                        </span>
                      ) : c.status === "resting" ? (
                        <span className="absolute inset-x-0 bottom-0 bg-gold py-0.5 text-center font-heading text-[10.5px] font-bold text-navy-deep">
                          ขอพัก
                        </span>
                      ) : null}
                    </span>

                    {/* แถบระดับมือเต็มความกว้าง — เห็นปุ๊บรู้ว่ามืออะไร ไม่ต้องจำรหัสย่อ */}
                    <span
                      className="block truncate px-1 py-[3px] text-center font-heading text-[11px] font-bold leading-tight"
                      style={{ backgroundColor: levelSolid(c.player.level), color: levelInk(c.player.level) }}
                    >
                      {info.name}
                    </span>

                    <span className={cn("block px-1.5 py-1", on ? "bg-navy text-white dark:bg-navy-soft" : "bg-surface")}>
                      <span className="block truncate text-center font-heading text-[13px] font-semibold leading-tight">
                        {displayName(c.player)}
                      </span>
                      {/* เวลารอเดินจริงเป็นนาที:วินาที — ตัวตัดสินว่าใครควรได้ลงก่อน */}
                      <span
                        className={cn(
                          "nums block truncate text-center text-[11px] leading-tight",
                          on ? "text-sand/80" : waitMs != null ? "text-ink-soft" : "text-ink-faint",
                        )}
                      >
                        {waitMs != null ? formatDuration(waitMs) : `ลงไป ${c.games} เกม`}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            {shown.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-ink-faint">
                {query.trim()
                  ? `ไม่เจอชื่อที่มีคำว่า “${query.trim()}”`
                  : planning
                    ? "ทุกคนกลับบ้านไปหมดแล้ว"
                    : "ยังไม่มีคนในคิว"}
              </p>
            ) : null}
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
