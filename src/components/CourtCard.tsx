import { useState } from "react"
import { CheckCircle2, Hand, MoreVertical, Play, Plus, Shuffle, Sparkles, Trash2 } from "lucide-react"
import {
  type CourtView,
  type SessionSettings,
  MATCH_TYPE_LABEL,
  displayName,
  formatDuration,
  levelInfo,
} from "@shared/types"
import { cn } from "@/lib/util"

/** สีของนาฬิกาในเกม: ปกติ → เกินเป้าเล็กน้อย → เกินเป้าไปมาก (คนอื่นรอนานแล้ว) */
function elapsedTone(elapsedMs: number, targetMinutes: number): string {
  const ratio = elapsedMs / (targetMinutes * 60_000)
  if (ratio < 0.85) return "text-ink"
  if (ratio < 1.3) return "text-gold-deep dark:text-gold-soft"
  return "text-hinomaru"
}

export function CourtCard({
  cv,
  settings,
  canControl,
  onAuto,
  onManual,
  nextPlanned,
  onFinish,
  onCancel,
  onSwap,
  onShuttle,
  onToggleCourt,
}: {
  cv: CourtView
  settings: SessionSettings
  canControl: boolean
  onAuto: () => void
  onManual: () => void
  /** เกมถัดไปในคิวที่จัดไว้ — คอร์ตว่างเมื่อไรกดลงได้ทันที */
  nextPlanned?: { names: string[]; onStart: () => void } | null
  onFinish: () => void
  onCancel: () => void
  onSwap: () => void
  onShuttle: (delta: number) => void
  onToggleCourt: (disabled: boolean) => void
}) {
  const [menu, setMenu] = useState(false)
  const { court, match, players, elapsedMs } = cv
  const teamA = players.filter((p) => p.team === "A")
  const teamB = players.filter((p) => p.team === "B")
  const sum = (t: typeof players) => t.reduce((n, p) => n + p.player.level, 0)

  return (
    <div className="card overflow-hidden">
      {/* หัวคอร์ต */}
      <div className="flex items-center gap-2 border-b border-line/70 px-3.5 py-2.5">
        <span className="hinomaru-dot" />
        <h3 className="flex-1 truncate font-heading text-[14.5px] font-semibold text-ink">{court.name}</h3>
        {match ? (
          <span className="chip bg-navy/10 text-navy dark:bg-navy-soft/40 dark:text-sand">
            {MATCH_TYPE_LABEL[match.type]}
          </span>
        ) : court.disabled ? (
          <span className="chip bg-subtle text-ink-faint">ปิดอยู่</span>
        ) : (
          <span className="chip bg-gold/20 text-gold-deep dark:text-gold-soft">ว่าง</span>
        )}
        {canControl ? (
          <div className="relative">
            <button className="btn-quiet !px-1.5 !py-1" onClick={() => setMenu((v) => !v)} aria-label="ตัวเลือกคอร์ต">
              <MoreVertical size={16} />
            </button>
            {menu ? (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lift">
                  {match ? (
                    <>
                      <MenuItem
                        icon={<Hand size={14} />}
                        label="สลับคนในเกม"
                        onClick={() => {
                          setMenu(false)
                          onSwap()
                        }}
                      />
                      <MenuItem
                        icon={<Plus size={14} />}
                        label="เพิ่มลูกแบด 1 ลูก"
                        onClick={() => {
                          setMenu(false)
                          onShuttle(1)
                        }}
                      />
                      <MenuItem
                        icon={<Trash2 size={14} />}
                        label="ยกเลิกเกมนี้"
                        danger
                        onClick={() => {
                          setMenu(false)
                          onCancel()
                        }}
                      />
                    </>
                  ) : (
                    <MenuItem
                      icon={<Hand size={14} />}
                      label={court.disabled ? "เปิดคอร์ตนี้" : "ปิดคอร์ตนี้ชั่วคราว"}
                      onClick={() => {
                        setMenu(false)
                        onToggleCourt(!court.disabled)
                      }}
                    />
                  )}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {match ? (
        <>
          {/* พื้นสนาม + รายชื่อสองฝั่ง */}
          <div className="court-floor px-3 py-2.5">
            <div className="relative z-10 flex flex-col gap-1.5">
              <TeamRow players={teamA} sum={sum(teamA)} side="A" />
              <div className="flex items-center gap-2 px-1">
                <span className="h-px flex-1 bg-sand/25" />
                <span className="nums font-heading text-[11px] font-medium text-sand/70">VS</span>
                <span className="h-px flex-1 bg-sand/25" />
              </div>
              <TeamRow players={teamB} sum={sum(teamB)} side="B" />
            </div>
          </div>

          {/* เวลา + ปุ่มจบเกม */}
          <div className="flex items-center gap-2 px-3.5 py-2.5">
            <div className="flex flex-1 flex-col">
              <span
                className={cn(
                  "nums font-heading text-[20px] font-semibold leading-none",
                  elapsedTone(elapsedMs, settings.targetGameMinutes),
                )}
              >
                {formatDuration(elapsedMs)}
              </span>
              <span className="text-[11px] text-ink-faint">
                เป้า {settings.targetGameMinutes} นาที · ลูกที่ใช้ {match.shuttles}
              </span>
            </div>
            {canControl ? (
              <button className="btn-primary" onClick={onFinish}>
                <CheckCircle2 size={16} />
                จบเกม
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2.5 px-3.5 py-5">
          {court.disabled ? (
            <p className="text-[13px] text-ink-faint">คอร์ตนี้ปิดอยู่</p>
          ) : (
            <>
              {/* จัดคิวไว้แล้วก็ไม่ต้องมานั่งจัดใหม่ตอนคอร์ตว่าง — กดทีเดียวลงเลย */}
              {canControl && nextPlanned ? (
                <div className="w-full rounded-xl border border-gold/60 bg-gold/[0.1] p-2.5">
                  <p className="text-center font-heading text-[11.5px] text-gold-deep dark:text-gold-soft">
                    เกมถัดไปในคิว
                  </p>
                  <p className="mb-2 text-center text-[12.5px] leading-snug text-ink">
                    {nextPlanned.names.join(" · ")}
                  </p>
                  <button className="btn-primary w-full" onClick={nextPlanned.onStart}>
                    <Play size={16} />
                    ลงคอร์ตนี้เลย
                  </button>
                </div>
              ) : (
                <p className="text-center text-[12.5px] text-ink-soft">
                  คอร์ตว่าง — กดให้ระบบจัดคนที่รอนานสุดและมือใกล้กันลงเล่น
                </p>
              )}
              {canControl ? (
                <div className="flex w-full gap-2">
                  <button className={cn(nextPlanned ? "btn-ghost" : "btn-primary", "flex-1")} onClick={onAuto}>
                    <Sparkles size={16} />
                    สุ่มจัดเกม
                  </button>
                  <button className="btn-ghost" onClick={onManual} title="เลือกคนเอง">
                    <Shuffle size={16} />
                    จัดเอง
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function TeamRow({
  players,
  sum,
  side,
}: {
  players: CourtView["players"]
  sum: number
  side: "A" | "B"
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-navy-deep/35 px-2.5 py-1.5">
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded font-heading text-[10.5px] font-semibold",
          side === "A" ? "bg-sand/85 text-navy-deep" : "bg-hinomaru text-white",
        )}
      >
        {side}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
        {players.map((p) => (
          <span key={p.player.id} className="flex items-baseline gap-1">
            <span className="truncate font-heading text-[13.5px] font-medium text-sand">
              {displayName(p.player)}
            </span>
            {/* ในพื้นสนามสีเข้มใช้ตัวอักษรสีครีมแทนป้ายสี เพื่อให้อ่านชัด */}
            <span className="font-heading text-[10.5px] text-gold-soft/80">{levelInfo(p.player.level).code}</span>
          </span>
        ))}
      </div>
      <span className="nums shrink-0 font-heading text-[11px] text-sand/60" title="ผลรวมระดับมือของฝั่งนี้">
        Σ{sum}
      </span>
    </div>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 text-left font-heading text-[13px] transition-colors hover:bg-subtle",
        danger ? "text-hinomaru" : "text-ink",
      )}
    >
      {icon}
      {label}
    </button>
  )
}
