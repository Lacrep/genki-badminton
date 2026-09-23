import { X } from "lucide-react"
import { displayName, formatDuration, levelInfo, thaiTime } from "@shared/types"
import { useApp, useNow } from "@/lib/app"
import { Logo } from "@/components/ui"
import { cn } from "@/lib/util"

/**
 * โหมดจอใหญ่ — เอาแท็บเล็ต/ทีวีตั้งไว้ข้างคอร์ต ทุกคนเห็นพร้อมกันว่า
 * ใครอยู่ในสนาม เหลือเวลาเท่าไร และคิวถัดไปคือใคร (ลดการถามหัวก๊วนไปเยอะ)
 */
export function TvPage({ navigate }: { navigate: (to: string) => void }) {
  const { view } = useApp()
  const now = useNow()

  if (!view) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-navy-deep text-sand">
        <Logo size={96} plate />
        <p className="font-heading text-xl">ยังไม่มีก๊วนที่เปิดอยู่</p>
        <button
          className="rounded-xl border border-sand/40 px-4 py-2 font-heading text-[14px] text-sand transition-colors hover:bg-sand/10"
          onClick={() => navigate("/")}
        >
          กลับหน้าหลัก
        </button>
      </div>
    )
  }

  const nextUp = view.queue.slice(0, 4)
  const later = view.queue.slice(4)

  return (
    <div className="flex min-h-dvh flex-col bg-navy-deep px-5 py-4 text-sand">
      {/* หัวจอ */}
      <div className="mb-4 flex shrink-0 items-center gap-4">
        <Logo size={54} plate />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-2xl font-bold text-white">{view.session.name}</h1>
          <p className="truncate text-[13px] text-sand/70">
            {view.session.venue || "เกงกิเดสซ์"} · เปิด {thaiTime(view.session.startAt)} · รหัสดูคิว #{view.session.code}
          </p>
        </div>
        <div className="text-right">
          <p className="nums font-heading text-3xl font-bold text-white">{thaiTime(now)}</p>
          <p className="text-[12px] text-sand/60">
            {view.stats.playing} คนในคอร์ต · รอ {view.stats.waiting} คน
          </p>
        </div>
        <button
          className="rounded-xl border border-sand/30 p-2 text-sand/70 transition-colors hover:bg-sand/10"
          onClick={() => navigate("/")}
          aria-label="ออกจากโหมดจอใหญ่"
        >
          <X size={20} />
        </button>
      </div>

      {/* คอร์ต — กินพื้นที่ที่เหลือทั้งหมด ตั้งทีวีห่าง ๆ ก็ยังอ่านออก */}
      <div
        className={cn(
          "mb-4 grid flex-1 auto-rows-fr gap-3",
          view.courts.length <= 4 ? "grid-cols-2" : "grid-cols-3",
        )}
      >
        {view.courts.map((cv) => {
          const elapsed = cv.match ? now - cv.match.startedAt : 0
          const over = elapsed > view.session.settings.targetGameMinutes * 60_000
          return (
            <div
              key={cv.court.index}
              className={cn(
                "rounded-2xl border p-4",
                cv.match ? "border-sand/25 bg-navy/60" : "border-dashed border-gold/40 bg-navy/25",
              )}
            >
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="flex-1 truncate font-heading text-lg font-semibold text-white">{cv.court.name}</h2>
                {cv.match ? (
                  <span className={cn("nums font-heading text-2xl font-bold", over ? "text-hinomaru-soft" : "text-gold-soft")}>
                    {formatDuration(elapsed)}
                  </span>
                ) : (
                  <span className="font-heading text-lg font-semibold text-gold-soft">ว่าง</span>
                )}
              </div>

              {cv.match ? (
                <div className="flex flex-col gap-1.5">
                  {(["A", "B"] as const).map((team) => (
                    <div key={team} className="flex items-center gap-2 rounded-xl bg-navy-deep/60 px-3 py-2">
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded font-heading text-[12px] font-bold",
                          team === "A" ? "bg-sand text-navy-deep" : "bg-hinomaru text-white",
                        )}
                      >
                        {team}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-wrap gap-x-3">
                        {cv.players
                          .filter((p) => p.team === team)
                          .map((p) => (
                            <span key={p.player.id} className="truncate font-heading text-[17px] font-medium text-white">
                              {displayName(p.player)}
                              <span className="ml-1 text-[12px] text-gold-soft/80">{levelInfo(p.player.level).code}</span>
                            </span>
                          ))}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-3 text-center text-[14px] text-sand/50">รอหัวก๊วนจัดคนลง</p>
              )}
            </div>
          )
        })}
      </div>

      {/* คิวหน้า */}
      <div className="shrink-0 rounded-2xl border border-sand/20 bg-navy/45 p-4">
        <h2 className="mb-3 font-heading text-[15px] font-semibold uppercase tracking-wide text-gold-soft">
          คิวถัดไป
        </h2>
        {view.queue.length === 0 ? (
          <p className="py-2 text-center text-[15px] text-sand/60">ไม่มีใครรอคิว</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {nextUp.map((q, i) => {
                const wait = q.sp.queueSince ? Math.max(0, now - q.sp.queueSince) : q.waitMs
                return (
                  <div
                    key={q.player.id}
                    className={cn(
                      "rounded-xl border px-3 py-2.5",
                      q.tier === "dong"
                        ? "border-hinomaru bg-hinomaru/25 animate-dong-pulse"
                        : q.tier === "warn"
                          ? "border-gold/70 bg-gold/15"
                          : "border-sand/25 bg-navy-deep/50",
                    )}
                  >
                    <div className="flex items-baseline gap-1.5">
                      <span className="nums font-heading text-[13px] font-bold text-gold-soft">{i + 1}</span>
                      <span className="truncate font-heading text-[17px] font-semibold text-white">
                        {displayName(q.player)}
                      </span>
                    </div>
                    <p className="nums text-[12.5px] text-sand/70">
                      รอ {formatDuration(wait)} · {levelInfo(q.player.level).code} · {q.sp.gamesPlayed} เกม
                    </p>
                  </div>
                )
              })}
            </div>

            {later.length > 0 ? (
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-sand/65">
                <span className="font-heading text-sand/45">ต่อจากนั้น:</span>
                {later.map((q, i) => (
                  <span key={q.player.id} className="nums">
                    {i + 5}. {displayName(q.player)}
                  </span>
                ))}
              </p>
            ) : null}
          </>
        )}
      </div>

      {view.dongAlerts.length > 0 ? (
        <div className="mt-3 shrink-0 rounded-2xl border border-hinomaru bg-hinomaru/20 px-4 py-3">
          <p className="font-heading text-[15px] font-semibold text-white">รอนานเกินกำหนด: {view.dongAlerts.join(" · ")}</p>
        </div>
      ) : null}
    </div>
  )
}
