import { ChevronRight, Clock, Flame, Hourglass, Star } from "lucide-react"
import {
  type QueueEntry,
  type RosterPlayer,
  type WaitTier,
  displayName,
  recordLabel,
  formatDuration,
  levelInfo,
  levelSolid,
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

export function PlayerAvatar({ player, size = 34 }: { player: RosterPlayer; size?: number }) {
  const label = displayName(player).trim().slice(0, 2)
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-heading font-semibold text-white"
      // สีวงกลมไล่ตามระดับมือทั้ง 7 ขั้น — กวาดตาดูคิวทีเดียวก็รู้ว่าใครมือไหน
      style={{
        backgroundColor: levelSolid(player.level),
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
      }}
      aria-hidden
    >
      {label}
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
  const Row = onMenu ? "button" : "div"
  return (
    <Row
      type={onMenu ? "button" : undefined}
      onClick={onMenu}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors",
        `tier-${tier}`,
        pinned && "ring-2 ring-gold",
        onMenu && "active:scale-[0.995]",
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

      {/* ชื่อ + คิวของคนนี้ — ต้องเห็นบนมือถือด้วย ไม่ใช่เฉพาะจอกว้าง */}
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <PlayerAvatar player={player} size={compact ? 28 : 32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-heading text-[14px] font-medium text-ink">{displayName(player)}</span>
          {/*
            ปล่อยให้ตกบรรทัดแทนที่จะตัดทิ้ง — บนจอ 390px แถวนี้มีทั้งป้ายมือ นาฬิกา
            และลูกศร สถิติแพ้ชนะจึงโดนตัดหายทุกครั้ง ทั้งที่เป็นข้อมูลที่อยากดู
          */}
          <span className="nums block text-[11px] leading-snug text-ink-faint">
            {etaText(queueAhead, etaMinutes)} · ลงไป {sp.gamesPlayed} เกม
            {sp.wins + sp.losses + sp.draws > 0 ? ` · ${recordLabel(sp)}` : ""}
          </span>
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-1.5">
        {sp.boost > 0 ? (
          <span className="chip bg-gold/25 text-gold-deep" title="ดันคิวด้วยมือ">
            <Star size={11} />
          </span>
        ) : null}
        <LevelBadge level={player.level} />
        <WaitClock waitMs={waitMs} tier={tier} />
        {onMenu ? <ChevronRight size={16} className="shrink-0 text-ink-faint" /> : null}
      </span>
    </Row>
  )
}
