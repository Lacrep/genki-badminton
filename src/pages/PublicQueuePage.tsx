import { useCallback, useEffect, useState } from "react"
import { Clock, RefreshCw, UserCheck } from "lucide-react"
import { type SessionView, displayName, formatDuration, levelInfo, thaiTime } from "@shared/types"
import { api } from "@/lib/api"
import { BrushDivider, EmptyState, Logo, Wordmark } from "@/components/ui"
import { cn } from "@/lib/util"

const ME_KEY = "genki.me"

/**
 * หน้าสำหรับลูกก๊วน (/q/<รหัส>) — ดูอย่างเดียว ไม่ต้องล็อกอิน ไม่ต้องมี PIN
 * จุดประสงค์: ตอบคำถามที่ถูกถามบ่อยที่สุดในโรงยิม "อีกกี่คิวจะถึงตาผม"
 */
export function PublicQueuePage({ code }: { code: string }) {
  const [view, setView] = useState<SessionView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [me, setMe] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ME_KEY)
    } catch {
      return null
    }
  })

  const load = useCallback(async () => {
    try {
      const reply = await api.publicQueue(code)
      setView(reply.view)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่ได้")
    }
  }, [code])

  useEffect(() => {
    void load()
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load()
    }, 5000)
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.clearInterval(poll)
      window.clearInterval(tick)
    }
  }, [load])

  const pickMe = (id: string | null) => {
    setMe(id)
    try {
      if (id) localStorage.setItem(ME_KEY, id)
      else localStorage.removeItem(ME_KEY)
    } catch {
      /* เขียน storage ไม่ได้ก็ไม่เป็นไร */
    }
  }

  if (error) {
    return (
      <Frame>
        <div className="card">
          <EmptyState
            title="ไม่พบก๊วนจากรหัสนี้"
            hint={`รหัส "${code}" อาจพิมพ์ผิด หรือก๊วนถูกปิดไปแล้ว — ขอลิงก์ใหม่จากหัวก๊วนได้เลย`}
            action={
              <button className="btn-ghost" onClick={() => void load()}>
                <RefreshCw size={16} />
                ลองอีกครั้ง
              </button>
            }
          />
        </div>
      </Frame>
    )
  }

  if (!view) {
    return (
      <Frame>
        <div className="card">
          <EmptyState title="กำลังโหลดคิว..." />
        </div>
      </Frame>
    )
  }

  const myEntry = me ? view.queue.find((q) => q.player.id === me) : undefined
  const myPlaying = me ? view.courts.find((c) => c.players.some((p) => p.player.id === me)) : undefined
  const mySp = me ? view.session.players.find((p) => p.playerId === me) : undefined
  const myIndex = myEntry ? view.queue.findIndex((q) => q.player.id === me) : -1

  const checkedIn = view.session.players
    .filter((p) => p.status !== "left")
    .map((sp) => view.roster.find((p) => p.id === sp.playerId))
    .filter((p): p is NonNullable<typeof p> => !!p)

  return (
    <Frame>
      <div className="flex flex-col gap-4">
        <div className="card card-pad">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-heading text-[16px] font-semibold text-ink">
                {view.session.name}
              </span>
              <span className="block truncate text-[12px] text-ink-soft">
                {view.session.venue ? `${view.session.venue} · ` : ""}
                เปิด {thaiTime(view.session.startAt)} · {view.stats.checkedIn} คน
              </span>
            </span>
            <span className="chip bg-navy/10 text-navy dark:bg-navy-soft/40 dark:text-sand">#{view.session.code}</span>
          </div>
        </div>

        {/* ของฉัน */}
        {me ? (
          <div
            className={cn(
              "card card-pad flex flex-col gap-1.5 text-center",
              myEntry?.tier === "dong" && "border-hinomaru/70 bg-hinomaru/[0.08]",
            )}
          >
            {myPlaying ? (
              <>
                <p className="font-heading text-[13px] text-ink-soft">คุณอยู่ใน</p>
                <p className="font-heading text-[26px] font-bold text-navy dark:text-gold-soft">
                  {myPlaying.court.name}
                </p>
                <p className="nums text-[13px] text-ink-soft">
                  เล่นมาแล้ว {formatDuration(now - (myPlaying.match?.startedAt ?? now))}
                </p>
              </>
            ) : myEntry ? (
              <>
                <p className="font-heading text-[13px] text-ink-soft">คิวของคุณ</p>
                <p className="font-heading text-[40px] font-bold leading-none text-navy dark:text-gold-soft">
                  {myIndex + 1}
                  <span className="ml-1 text-[15px] font-medium text-ink-faint">/ {view.queue.length}</span>
                </p>
                <p className="nums text-[13px] text-ink-soft">
                  รอมา {formatDuration(myEntry.sp.queueSince ? now - myEntry.sp.queueSince : myEntry.waitMs)}
                </p>
                <p className="font-heading text-[14px] font-medium text-ink">
                  {myEntry.queueAhead === 0
                    ? "🏸 เตรียมตัว! คิวหน้าได้ลงแล้ว"
                    : myEntry.etaMinutes != null && myEntry.etaMinutes <= 0
                      ? "ใกล้ได้ลงแล้ว — เตรียมตัวไว้"
                      : `อีกประมาณ ${myEntry.queueAhead} เกม${myEntry.etaMinutes != null ? ` (~${myEntry.etaMinutes} นาที)` : ""}`}
                </p>
              </>
            ) : mySp?.status === "resting" ? (
              <p className="font-heading text-[15px] text-ink">คุณอยู่ในสถานะ “ขอพัก” — บอกหัวก๊วนเมื่อพร้อมลงต่อ</p>
            ) : (
              <p className="font-heading text-[15px] text-ink">ยังไม่ได้เช็คอินวันนี้ — แจ้งหัวก๊วนเพื่อเข้าคิว</p>
            )}
            <button className="btn-quiet btn-sm mt-1 self-center" onClick={() => pickMe(null)}>
              เปลี่ยนชื่อที่เลือกไว้
            </button>
          </div>
        ) : (
          <div className="card card-pad">
            <p className="mb-2 flex items-center gap-1.5 font-heading text-[14px] font-medium text-ink">
              <UserCheck size={15} className="text-gold-deep" />
              เลือกชื่อของคุณ เพื่อดูว่าอีกกี่คิวถึงตา
            </p>
            <div className="flex flex-wrap gap-1.5">
              {checkedIn.map((p) => (
                <button key={p.id} className="btn-ghost btn-sm" onClick={() => pickMe(p.id)}>
                  {displayName(p)}
                </button>
              ))}
              {checkedIn.length === 0 ? (
                <p className="text-[13px] text-ink-faint">ยังไม่มีใครเช็คอิน</p>
              ) : null}
            </div>
          </div>
        )}

        {/* คอร์ต */}
        <section className="flex flex-col gap-2">
          <h2 className="section-title">ในคอร์ตตอนนี้</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {view.courts.map((cv) => (
              <div key={cv.court.index} className="card px-3.5 py-3">
                <div className="mb-1 flex items-baseline gap-2">
                  <span className="flex-1 font-heading text-[14px] font-semibold text-ink">{cv.court.name}</span>
                  {cv.match ? (
                    <span className="nums font-heading text-[14px] font-semibold text-gold-deep dark:text-gold-soft">
                      {formatDuration(now - cv.match.startedAt)}
                    </span>
                  ) : (
                    <span className="chip bg-gold/20 text-gold-deep">ว่าง</span>
                  )}
                </div>
                {cv.match ? (
                  <p className="text-[13px] leading-snug text-ink-soft">
                    {cv.players
                      .filter((p) => p.team === "A")
                      .map((p) => displayName(p.player))
                      .join(" + ")}
                    <span className="mx-1.5 text-ink-faint">vs</span>
                    {cv.players
                      .filter((p) => p.team === "B")
                      .map((p) => displayName(p.player))
                      .join(" + ")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        {/* คิวทั้งหมด */}
        <section className="flex flex-col gap-2">
          <h2 className="section-title">
            <Clock size={14} className="text-gold-deep" />
            คิวรอ ({view.queue.length})
          </h2>
          <div className="card divide-y divide-line/60">
            {view.queue.map((q, i) => {
              const wait = q.sp.queueSince ? Math.max(0, now - q.sp.queueSince) : q.waitMs
              return (
                <div
                  key={q.player.id}
                  className={cn(
                    "flex items-center gap-2.5 px-3.5 py-2",
                    q.player.id === me && "bg-gold/[0.12]",
                  )}
                >
                  <span
                    className={cn(
                      "nums w-6 text-center font-heading text-[13px] font-semibold",
                      i < 4 ? "text-hinomaru" : "text-ink-faint",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-heading text-[14px] font-medium text-ink">
                    {displayName(q.player)}
                  </span>
                  <span className={cn("chip", levelInfo(q.player.level).tone)}>{levelInfo(q.player.level).code}</span>
                  <span className="nums text-[12px] text-ink-soft">{formatDuration(wait)}</span>
                </div>
              )
            })}
            {view.queue.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-ink-faint">ไม่มีใครรอคิว</p>
            ) : null}
          </div>
        </section>

        <BrushDivider className="my-1" />
        <p className="pb-6 text-center text-[11.5px] text-ink-faint">
          หน้านี้อัปเดตเองทุก 5 วินาที · ดูได้อย่างเดียว แก้ไขไม่ได้
        </p>
      </div>
    </Frame>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/90 px-3.5 py-2.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5">
          <Logo size={34} />
          <Wordmark compact />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-3.5 py-4">{children}</main>
    </div>
  )
}
