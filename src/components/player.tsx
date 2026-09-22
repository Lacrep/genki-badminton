import { Clock, Flame, Hourglass, Star } from "lucide-react"
import {
  type QueueEntry,
  type RosterPlayer,
  type WaitTier,
  displayName,
  formatDuration,
  levelInfo,
} from "@shared/types"
import { cn } from "@/lib/util"

// ── ระดับมือ ─────────────────────────────────────────────────────────────────

export function LevelBadge({ level, showName = false }: { level: number; showName?: boolean }) {
  const info = levelInfo(level)
  return (
    <span className={cn("chip", info.tone)} title={`${info.name} — ${info.hint}`}>
      {info.code}
      {showName ? <span className="font-normal opacity-80">· {info.name}</span> : null}
    </span>
  )
}

// ── ชื่อ + วงกลมตัวอักษรแรก ───────────────────────────────────────────────────

/** สีวงกลมไล่ตามระดับมือ — กวาดตาดูคิวทีเดียวก็รู้ว่ามือประมาณไหน */
function avatarTone(level: number): string {
  if (level >= 7) return "bg-hinomaru/90"
  if (level >= 5) return "bg-gold-deep/90"
  if (level >= 3) return "bg-navy/90"
  return "bg-navy-mist/90"
}

export function PlayerAvatar({ player, size = 34 }: { player: RosterPlayer; size?: number }) {
  const label = displayName(player).trim().slice(0, 2)
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-heading font-semibold text-white",
        avatarTone(player.level),
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden
    >
      {label}
    </span>
  )
}

export function PlayerTag({
  player,
  size = 30,
  className,
  right,
}: {
  player: RosterPlayer
  size?: number
  className?: string
  right?: React.ReactNode
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <PlayerAvatar player={player} size={size} />
      <span className="min-w-0 flex-1 truncate font-heading text-[14px] font-medium text-ink">
        {displayName(player)}
      </span>
      {right}
    </span>
  )
}

// ── นาฬิการอ ─────────────────────────────────────────────────────────────────

const TIER_STYLE: Record<WaitTier, { chip: string; icon: React.ReactNode; label: string }> = {
  fresh: { chip: "bg-subtle text-ink-soft", icon: <Clock size={12} />, label: "เพิ่งลงคิว" },
  waiting: { chip: "bg-navy/10 text-navy dark:bg-navy-soft/40 dark:text-sand", icon: <Clock size={12} />, label: "รออยู่" },
  warn: { chip: "bg-gold/25 text-gold-deep dark:text-gold-soft", icon: <Hourglass size={12} />, label: "รอนาน" },
  dong: { chip: "bg-hinomaru/20 text-hinomaru-deep dark:text-hinomaru-soft", icon: <Flame size={12} />, label: "ถูกดอง!" },
}

export function WaitClock({
  waitMs,
  tier,
  showLabel = false,
}: {
  waitMs: number
  tier: WaitTier
  showLabel?: boolean
}) {
  const style = TIER_STYLE[tier]
  return (
    <span className={cn("chip nums gap-1", style.chip)} title={style.label}>
      {style.icon}
      {formatDuration(waitMs)}
      {showLabel && tier === "dong" ? <span className="ml-0.5 font-semibold">ดอง</span> : null}
    </span>
  )
}

/** ข้อความบอกว่าใกล้ได้ลงแค่ไหน — เลี่ยงคำว่า "อีก 0 นาที" ที่อ่านแล้วงง */
export function etaText(queueAhead: number, etaMinutes: number | null): string {
  if (queueAhead === 0) return "คิวหน้า"
  if (etaMinutes == null) return `รออีก ${queueAhead} เกม`
  if (etaMinutes <= 0) return "ใกล้ได้ลง"
  return `~${etaMinutes} น.`
}

// ── แถวในคิว ─────────────────────────────────────────────────────────────────

export function QueueRow({
  entry,
  index,
  pinned,
  onMenu,
  compact = false,
}: {
  entry: QueueEntry
  index: number
  /** ถูกดันคิวด้วยมือ — ตีกรอบทองให้เห็นว่าหัวก๊วนสั่งไว้ */
  pinned?: boolean
  onMenu?: () => void
  compact?: boolean
}) {
  const { player, sp, waitMs, tier, queueAhead, etaMinutes } = entry
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors",
        `tier-${tier}`,
        pinned && "ring-2 ring-gold",
      )}
    >
      <span
        className={cn(
          "nums w-6 shrink-0 text-center font-heading text-[13px] font-semibold",
          index === 0 ? "text-hinomaru" : "text-ink-faint",
        )}
      >
        {index + 1}
      </span>

      <PlayerTag player={player} size={compact ? 28 : 32} className="flex-1" />

      <span className="flex shrink-0 items-center gap-1.5">
        {sp.boost > 0 ? (
          <span className="chip bg-gold/25 text-gold-deep" title="ดันคิวด้วยมือ">
            <Star size={11} />
          </span>
        ) : null}
        <LevelBadge level={player.level} />
        <WaitClock waitMs={waitMs} tier={tier} />
        {!compact ? (
          <span className="hidden w-16 flex-col items-end text-right sm:flex">
            <span className="nums text-[11px] font-medium text-ink-soft">{sp.gamesPlayed} เกม</span>
            <span className="text-[10.5px] text-ink-faint">{etaText(queueAhead, etaMinutes)}</span>
          </span>
        ) : null}
        {onMenu ? (
          <button type="button" onClick={onMenu} className="btn-sm btn-quiet !px-2" title="ตัวเลือก">
            ⋯
          </button>
        ) : null}
      </span>
    </div>
  )
}
