import { useEffect, useState } from "react"
import { Award, BarChart3, Clock, Flame, Handshake, History, Trash2, Trophy } from "lucide-react"
import { displayName, formatMinutes, levelInfo, recordLabel, thaiTime } from "@shared/types"
import { api, type SessionSummary } from "@/lib/api"
import { useApp } from "@/lib/app"
import { LevelBadge, PlayerAvatar } from "@/components/player"
import { BrushDivider, EmptyState, Segmented, Stat } from "@/components/ui"
import { cn } from "@/lib/util"

interface AllTime {
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
}

export function StatsPage() {
  const [tab, setTab] = useState<"today" | "all" | "history">("today")
  const [allTime, setAllTime] = useState<AllTime[] | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)

  useEffect(() => {
    if (tab === "all" && !allTime) void api.stats().then((r) => setAllTime(r.stats))
    if (tab === "history" && !sessions) void api.sessions().then((r) => setSessions(r.sessions))
  }, [tab, allTime, sessions])

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "today", label: "ก๊วนวันนี้" },
          { value: "all", label: "สถิติรวม" },
          { value: "history", label: "ก๊วนที่ผ่านมา" },
        ]}
      />

      {tab === "today" ? <TodayStats /> : null}
      {tab === "all" ? <AllTimeStats rows={allTime} /> : null}
      {tab === "history" ? <SessionHistory rows={sessions} onDeleted={() => setSessions(null)} /> : null}
    </div>
  )
}

function TodayStats() {
  const { view } = useApp()
  if (!view) {
    return (
      <div className="card">
        <EmptyState title="ยังไม่มีก๊วนที่เปิดอยู่" hint="เปิดก๊วนก่อน แล้วสถิติจะขึ้นที่นี่" />
      </div>
    )
  }

  const rows = view.session.players
    .map((sp) => ({ sp, player: view.roster.find((p) => p.id === sp.playerId) }))
    .filter((r): r is { sp: typeof r.sp; player: NonNullable<typeof r.player> } => !!r.player)
    .sort((a, b) => b.sp.gamesPlayed - a.sp.gamesPlayed || b.sp.playedMs - a.sp.playedMs)

  // เกมที่จบแบบได้กันคนละเซ็ต — ตัวชี้วัดว่าจัดคู่ได้สูสีแค่ไหน
  const drawnGames = view.session.matches.filter((m) => m.winner === "draw").length

  const mostGames = rows[0]
  const mostPatient = [...rows].sort((a, b) => b.sp.longestWaitMs - a.sp.longestWaitMs)[0]
  const mostDraws = [...rows].sort((a, b) => b.sp.draws - a.sp.draws)[0]
  const bestWin = [...rows]
    .filter((r) => r.sp.wins + r.sp.losses + r.sp.draws >= 2)
    .sort(
      (a, b) =>
        b.sp.wins / (b.sp.wins + b.sp.losses + b.sp.draws) - a.sp.wins / (a.sp.wins + a.sp.losses + a.sp.draws),
    )[0]

  const totalGames = rows.reduce((n, r) => n + r.sp.gamesPlayed, 0)
  const spread = rows.length > 1 ? Math.max(...rows.map((r) => r.sp.gamesPlayed)) - Math.min(...rows.map((r) => r.sp.gamesPlayed)) : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="card card-pad">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="เกมทั้งวัน" value={view.stats.matchesDone} hint={`สูสีจนเสมอ ${drawnGames} เกม`} />
          <Stat label="เฉลี่ยคนละ" value={rows.length ? (totalGames / rows.length).toFixed(1) : "0"} hint="เกม" />
          <Stat
            label="ห่างกันมากสุด"
            value={spread}
            hint="เกม (ยิ่งน้อยยิ่งแบ่งคิวยุติธรรม)"
            tone={spread >= 3 ? "red" : "gold"}
          />
          <Stat label="ลูกที่ใช้" value={view.stats.shuttlesUsed} hint="ลูก" />
        </div>
      </div>

      {/* รางวัลประจำวัน */}
      {rows.length > 0 && totalGames > 0 ? (
        <div className="card card-pad">
          <h2 className="section-title mb-3">
            <Award size={15} className="text-gold-deep" />
            รางวัลประจำก๊วน
          </h2>
          <div className="flex flex-col gap-2">
            {mostGames && mostGames.sp.gamesPlayed > 0 ? (
              <AwardRow
                icon={<Flame size={15} className="text-hinomaru" />}
                title="ลงเยอะสุด"
                who={displayName(mostGames.player)}
                detail={`${mostGames.sp.gamesPlayed} เกม · เล่นรวม ${formatMinutes(mostGames.sp.playedMs)}`}
              />
            ) : null}
            {mostPatient && mostPatient.sp.longestWaitMs > 0 ? (
              <AwardRow
                icon={<Clock size={15} className="text-gold-deep" />}
                title="ใจเย็นสุด (รอนานสุด)"
                who={displayName(mostPatient.player)}
                detail={`รอนานสุด ${formatMinutes(mostPatient.sp.longestWaitMs)} · รอรวม ${formatMinutes(mostPatient.sp.waitedMs)}`}
              />
            ) : null}
            {bestWin ? (
              <AwardRow
                icon={<Trophy size={15} className="text-gold-deep" />}
                title="ชนะเยอะสุด"
                who={displayName(bestWin.player)}
                detail={`ชนะ ${bestWin.sp.wins} · เสมอ ${bestWin.sp.draws} · แพ้ ${bestWin.sp.losses}`}
              />
            ) : null}
            {mostDraws && mostDraws.sp.draws > 0 ? (
              <AwardRow
                icon={<Handshake size={15} className="text-gold-deep" />}
                title="สูสีที่สุด (เสมอเยอะสุด)"
                who={displayName(mostDraws.player)}
                detail={`เสมอ ${mostDraws.sp.draws} เกม จาก ${mostDraws.sp.gamesPlayed} เกมที่ลง`}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="card overflow-hidden">
        <h2 className="section-title px-4 py-3">
          <BarChart3 size={15} className="text-gold-deep" />
          รายคน
          {/* ชิปตัวเลขสามตัวอ่านไม่ออกถ้าไม่บอก และ title ไม่ขึ้นบนมือถือ */}
          <span className="order-last shrink-0 text-[11px] font-normal text-ink-faint">ชนะ-เสมอ-แพ้</span>
        </h2>
        <div className="divide-y divide-line/60">
          {rows.map(({ sp, player }) => (
            <div key={sp.playerId} className="flex items-center gap-2.5 px-3.5 py-2.5">
              <PlayerAvatar player={player} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-heading text-[14px] font-medium text-ink">
                  {displayName(player)}
                </span>
                <span className="block text-[11.5px] text-ink-faint">
                  เล่น {formatMinutes(sp.playedMs)} · รอ {formatMinutes(sp.waitedMs)}
                  {sp.longestWaitMs > 0 ? ` · รอนานสุด ${Math.round(sp.longestWaitMs / 60_000)} น.` : ""}
                </span>
              </span>
              <LevelBadge level={player.level} />
              {sp.wins + sp.losses + sp.draws > 0 ? (
                <span className="nums chip bg-subtle text-ink-soft" title="ชนะ-เสมอ-แพ้">
                  {recordLabel(sp)}
                </span>
              ) : null}
              <span className="nums w-14 text-right font-heading text-[15px] font-semibold text-ink">
                {sp.gamesPlayed}
                <span className="ml-0.5 text-[10.5px] font-normal text-ink-faint">เกม</span>
              </span>
            </div>
          ))}
          {rows.length === 0 ? <EmptyState title="ยังไม่มีใครเช็คอิน" /> : null}
        </div>
      </div>
    </div>
  )
}

function AwardRow({
  icon,
  title,
  who,
  detail,
}: {
  icon: React.ReactNode
  title: string
  who: string
  detail: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line/70 bg-subtle/40 px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface shadow-card">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-[11.5px] font-medium uppercase tracking-wide text-ink-faint">
          {title}
        </span>
        <span className="block truncate font-heading text-[14.5px] font-semibold text-ink">{who}</span>
        <span className="block truncate text-[11.5px] text-ink-soft">{detail}</span>
      </span>
    </div>
  )
}

function AllTimeStats({ rows }: { rows: AllTime[] | null }) {
  if (!rows) return <div className="card"><EmptyState title="กำลังโหลดสถิติ..." /></div>
  if (rows.length === 0) {
    return (
      <div className="card">
        <EmptyState title="ยังไม่มีสถิติ" hint="เล่นจบก๊วนแรกแล้วสถิติรวมจะเริ่มสะสม" />
      </div>
    )
  }
  return (
    <div className="card overflow-hidden">
      <h2 className="section-title px-4 py-3">
        <BarChart3 size={15} className="text-gold-deep" />
        สถิติรวมทุกก๊วน ({rows.length} คน)
        <span className="order-last shrink-0 text-[11px] font-normal text-ink-faint">ชนะ-เสมอ-แพ้</span>
      </h2>
      <div className="divide-y divide-line/60">
        {rows.map((r, i) => {
          const total = r.wins + r.losses + r.draws
          const winRate = total > 0 ? Math.round((r.wins / total) * 100) : null
          return (
            <div key={r.playerId} className="flex items-center gap-2.5 px-3.5 py-2.5">
              <span
                className={cn(
                  "nums w-6 text-center font-heading text-[13px] font-semibold",
                  i === 0 ? "text-gold-deep" : "text-ink-faint",
                )}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-heading text-[14px] font-medium text-ink">{r.name}</span>
                <span className="block text-[11.5px] text-ink-faint">
                  มา {r.sessions} ครั้ง · เล่นรวม {formatMinutes(r.playedMs)}
                  {winRate != null ? ` · ชนะ ${winRate}%` : ""}
                  {r.draws > 0 ? ` · เสมอ ${r.draws}` : ""}
                </span>
              </span>
              <span className={cn("chip", levelInfo(r.level).tone)}>{levelInfo(r.level).code}</span>
              {total > 0 ? <span className="nums chip bg-subtle text-ink-soft">{recordLabel(r)}</span> : null}
              <span className="nums w-14 text-right font-heading text-[15px] font-semibold text-ink">
                {r.games}
                <span className="ml-0.5 text-[10.5px] font-normal text-ink-faint">เกม</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SessionHistory({ rows, onDeleted }: { rows: SessionSummary[] | null; onDeleted: () => void }) {
  const { toast, refresh, needPin } = useApp()
  const [busy, setBusy] = useState<string | null>(null)

  const remove = async (s: SessionSummary) => {
    // ลบแล้วสถิติรวมของวันนั้นหายไปด้วย จึงต้องถามให้ชัดว่าลบอันไหน
    if (!window.confirm(`ลบ "${s.name}" (${s.date}) ทิ้งถาวรเลยไหม?\nสถิติและค่าก๊วนของวันนั้นจะหายไปด้วย`)) return
    setBusy(s.id)
    try {
      await api.deleteSession(s.id)
      toast("ลบก๊วนนั้นแล้ว", "ok")
      onDeleted()
      // เผื่อที่ลบไปคือก๊วนที่หน้าเว็บกำลังเปิดค้างอยู่ ต้องดึงของใหม่มาแทน
      await refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : "ลบไม่สำเร็จ", "error")
    } finally {
      setBusy(null)
    }
  }

  if (!rows) return <div className="card"><EmptyState title="กำลังโหลด..." /></div>
  if (rows.length === 0) {
    return (
      <div className="card">
        <EmptyState title="ยังไม่มีประวัติก๊วน" />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((s) => (
        <div key={s.id} className="card card-pad flex items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-heading text-[14.5px] font-semibold text-ink">{s.name}</span>
            <span className="block truncate text-[12px] text-ink-soft">
              {s.date} · {thaiTime(s.startAt)}
              {s.endAt ? `–${thaiTime(s.endAt)}` : ""}
              {s.venue ? ` · ${s.venue}` : ""}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end">
            <span className="nums font-heading text-[13.5px] font-semibold text-ink">{s.matches} เกม</span>
            <span className="nums text-[11.5px] text-ink-faint">{s.players} คน</span>
          </span>
          <span className={cn("chip", s.status === "live" ? "bg-gold/25 text-gold-deep" : "bg-subtle text-ink-faint")}>
            {s.status === "live" ? "กำลังเล่น" : "จบแล้ว"}
          </span>
          {/* ก๊วนที่เปิดไว้ลองเล่นควรลบทิ้งได้ — แต่ก๊วนที่ยังเล่นอยู่ต้องปิดก่อน */}
          {!needPin ? (
            <button
              type="button"
              className="btn-quiet btn-sm shrink-0 px-2 text-hinomaru-deep disabled:opacity-40 dark:text-hinomaru-soft"
              title={s.status === "live" ? "ปิดก๊วนก่อนถึงจะลบได้" : "ลบก๊วนนี้ทิ้ง"}
              disabled={s.status === "live" || busy === s.id}
              onClick={() => void remove(s)}
            >
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
      ))}
      <BrushDivider className="my-2" />
      <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-ink-faint">
        <History size={13} />
        เก็บไว้ทุกครั้งที่เปิดก๊วน — ดูย้อนหลังได้ไม่จำกัด
      </p>
    </div>
  )
}
