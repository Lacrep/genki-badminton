import { X } from "lucide-react"
import { displayName, formatDuration, levelInfo, levelSolid, thaiTime } from "@shared/types"
import type { CourtView, PlannedView } from "@shared/types"
import { useApp, useNow } from "@/lib/app"
import { Logo } from "@/components/ui"
import { cn } from "@/lib/util"

/**
 * โหมดจอใหญ่ — เอาทีวี/จอมอนิเตอร์ตั้งไว้ข้างคอร์ต ให้ลูกก๊วนดูเองได้ว่า
 * ใครอยู่ในสนาม เหลือเวลาเท่าไร และคู่ไหนรอลงอยู่ (หัวก๊วนจะได้ไม่โดนถามทั้งวัน)
 *
 * แบ่งสองคอลัมน์: ซ้าย = คอร์ต · ขวา = คู่ที่จัดรอลงไว้ (ไม่มีคิวรายคน จอจะได้ไม่รก)
 * ตัวอักษรใหญ่กว่าหน้าปกติทุกจุด เพราะคนยืนดูห่างจากจอหลายเมตร
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

  const courts = view.courts.filter((c) => !c.court.disabled)

  /**
   * คอร์ตว่างใบแรกได้คู่ที่พร้อมคู่แรก ใบถัดไปได้คู่ถัดไป — ตรงกับหน้าคุมเกม
   * ถ้าไม่โชว์ คนดูจะเห็นคอร์ตว่างพร้อมคู่ที่พร้อมลง แล้วงงว่าทำไมยังไม่มีใครลง
   */
  const readyPlans = view.planned.filter((p) => p.ready)
  const planForCourt = new Map<number, { order: number; pv: PlannedView }>()
  const courtForPlan = new Map<string, string>()
  let nextPlan = 0
  for (const cv of courts) {
    if (cv.match) continue
    const pv = readyPlans[nextPlan]
    if (!pv) break
    const order = view.planned.indexOf(pv) + 1
    planForCourt.set(cv.court.index, { order, pv })
    courtForPlan.set(pv.planned.id, cv.court.name)
    nextPlan += 1
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-navy-deep px-6 py-4 text-sand">
      <TvHeader view={view} now={now} onExit={() => navigate("/")} />

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[1.55fr_1fr]">
        {/* ── ซ้าย: คอร์ตที่กำลังเล่น ── */}
        <section className="flex min-h-0 flex-col">
          <TvHeading>คอร์ต</TvHeading>
          <div
            className={cn(
              "grid min-h-0 flex-1 auto-rows-fr gap-4",
              courts.length <= 2 ? "grid-cols-1" : courts.length <= 6 ? "grid-cols-2" : "grid-cols-3",
            )}
          >
            {courts.map((cv) => (
              <CourtPanel
                key={cv.court.index}
                cv={cv}
                now={now}
                targetMinutes={view.session.settings.targetGameMinutes}
                nextUp={planForCourt.get(cv.court.index) ?? null}
              />
            ))}
          </div>
        </section>

        {/* ── ขวา: คู่ที่รอลง (ไม่เอาคิวรายคนแล้ว จอจะได้ไม่รก) ── */}
        <section className="flex min-h-0 flex-col">
          <TvHeading>คู่ต่อไปที่รอลง ({view.planned.length})</TvHeading>
          <div className="min-h-0 flex-1 space-y-2.5 overflow-hidden">
            {view.planned.length === 0 ? (
              <EmptyPanel>ยังไม่มีคู่ที่จัดรอไว้</EmptyPanel>
            ) : (
              view.planned
                .slice(0, 6)
                .map((pv, i) => (
                  <PlannedPanel
                    key={pv.planned.id}
                    pv={pv}
                    order={i + 1}
                    courtName={courtForPlan.get(pv.planned.id) ?? null}
                  />
                ))
            )}
            {view.planned.length > 6 ? (
              <p className="pt-0.5 text-center font-heading text-[14px] text-sand/55">
                + อีก {view.planned.length - 6} คู่ที่จัดรอไว้
              </p>
            ) : null}
          </div>
        </section>
      </div>

      {view.dongAlerts.length > 0 ? (
        <div className="mt-3 shrink-0 rounded-2xl border-2 border-hinomaru bg-hinomaru/25 px-5 py-3">
          <p className="truncate font-heading text-[19px] font-semibold text-white">
            รอนานเกินกำหนด — {view.dongAlerts.join(" · ")}
          </p>
        </div>
      ) : null}
    </div>
  )
}

function TvHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2.5 flex shrink-0 items-center gap-3 font-heading text-[17px] font-semibold uppercase tracking-[0.12em] text-gold-soft">
      {children}
      <span className="h-px flex-1 bg-gradient-to-r from-gold/50 to-transparent" />
    </h2>
  )
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-sand/25 bg-navy/25 px-4 py-6">
      <p className="text-center font-heading text-[17px] text-sand/55">{children}</p>
    </div>
  )
}

/** ชื่อ + ป้ายระดับมือ — หน่วยที่ใช้ซ้ำทั้งจอ ให้ขนาดตัวอักษรสั่งจากข้างนอกได้ */
function PlayerTag({ name, level, size }: { name: string; level: number; size: "lg" | "md" }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        className="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-white/25"
        style={{ backgroundColor: levelSolid(level) }}
        aria-hidden
      />
      <span className={cn("truncate font-heading font-semibold text-white", size === "lg" ? "text-[26px]" : "text-[18px]")}>
        {name}
      </span>
      <span
        className={cn(
          "shrink-0 rounded-md px-1.5 py-0.5 font-heading font-bold text-white/95",
          size === "lg" ? "text-[13px]" : "text-[11px]",
        )}
        style={{ backgroundColor: levelSolid(level) }}
      >
        {levelInfo(level).code}
      </span>
    </span>
  )
}

function CourtPanel({
  cv,
  now,
  targetMinutes,
  nextUp,
}: {
  cv: CourtView
  now: number
  targetMinutes: number
  /** คู่ที่พร้อมลงคอร์ตนี้เป็นคิวถัดไป — โชว์ไว้เลยให้คนเตรียมตัวได้ก่อนถูกเรียก */
  nextUp: { order: number; pv: PlannedView } | null
}) {
  const elapsed = cv.match ? now - cv.match.startedAt : 0
  const over = elapsed > targetMinutes * 60_000

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col rounded-2xl border-2 p-4",
        cv.match ? "border-sand/25 bg-navy/55" : "border-dashed border-gold/45 bg-navy/20",
      )}
    >
      <div className="mb-3 flex shrink-0 items-baseline gap-3">
        <h3 className="flex-1 truncate font-heading text-[22px] font-bold text-white">{cv.court.name}</h3>
        {cv.match ? (
          <span
            className={cn(
              "nums font-heading text-[30px] font-bold leading-none",
              over ? "text-hinomaru-soft" : "text-gold-soft",
            )}
          >
            {formatDuration(elapsed)}
          </span>
        ) : (
          <span className="rounded-lg bg-gold/20 px-2.5 py-1 font-heading text-[17px] font-bold text-gold-soft">ว่าง</span>
        )}
      </div>

      {cv.match ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-2">
          {(["A", "B"] as const).map((team, i) => (
            <div key={team}>
              {i === 1 ? (
                <p className="my-1 text-center font-heading text-[14px] font-bold tracking-widest text-sand/40">VS</p>
              ) : null}
              <div className="flex items-center gap-3 rounded-xl bg-navy-deep/65 px-3 py-2.5">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-heading text-[16px] font-bold",
                    team === "A" ? "bg-sand text-navy-deep" : "bg-hinomaru text-white",
                  )}
                >
                  {team}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  {cv.players
                    .filter((p) => p.team === team)
                    .map((p) => (
                      <PlayerTag key={p.player.id} name={displayName(p.player)} level={p.player.level} size="lg" />
                    ))}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : nextUp ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-2">
          <p className="text-center font-heading text-[16px] font-bold uppercase tracking-[0.14em] text-gold-soft">
            คู่ที่ {nextUp.order} · เตรียมลง
          </p>
          {(["A", "B"] as const).map((team, i) => (
            <div key={team}>
              {i === 1 ? (
                <p className="my-1 text-center font-heading text-[14px] font-bold tracking-widest text-sand/40">VS</p>
              ) : null}
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 rounded-xl bg-navy-deep/45 px-3 py-2.5">
                {nextUp.pv.players
                  .filter((p) => p.team === team)
                  .map((p) => (
                    <PlayerTag key={p.player.id} name={displayName(p.player)} level={p.player.level} size="lg" />
                  ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-center font-heading text-[17px] text-sand/50">รอหัวก๊วนจัดคนลง</p>
        </div>
      )}
    </div>
  )
}

/**
 * การ์ดคู่ที่รอลง — บีบให้เตี้ย (ฝั่งละบรรทัด) เพราะจอ 768px สูงไม่พอ
 * ถ้าการ์ดสูง จะโดนตัดครึ่งคาตา ซึ่งอ่านแล้วงงกว่าไม่โชว์เลย
 */
function PlannedPanel({ pv, order, courtName }: { pv: PlannedView; order: number; courtName: string | null }) {
  const side = (team: "A" | "B") => pv.players.filter((p) => p.team === team)
  const status =
    pv.problems.length > 0
      ? pv.problems.join(" · ")
      : pv.waitingFor.length > 0
        ? `รอ ${pv.waitingFor.join(", ")} จบเกม`
        : "พร้อมลงคอร์ต"

  return (
    <div
      className={cn(
        "rounded-2xl border px-3.5 py-2.5",
        order === 1 ? "border-gold/60 bg-gold/[0.12]" : "border-sand/20 bg-navy/40",
      )}
    >
      <div className="mb-1.5 flex items-center gap-2.5">
        <span
          className={cn(
            "nums flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-heading text-[13px] font-bold",
            order === 1 ? "bg-gold text-navy-deep" : "bg-navy-deep/70 text-sand/80",
          )}
        >
          {order}
        </span>
        <span className={cn("truncate font-heading text-[13px] font-medium", pv.problems.length > 0 ? "text-hinomaru-soft" : "text-sand/70")}>
          {status}
        </span>
        {courtName ? (
          <span className="ml-auto shrink-0 rounded-md bg-gold px-2 py-0.5 font-heading text-[12px] font-bold text-navy-deep">
            → {courtName}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        {(["A", "B"] as const).map((team, i) => (
          <div key={team}>
            {i === 1 ? (
              <p className="py-0.5 font-heading text-[10.5px] font-bold tracking-[0.2em] text-sand/35">VS</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {side(team).map((p) => (
                <PlayerTag key={p.player.id} name={displayName(p.player)} level={p.player.level} size="md" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TvHeader({
  view,
  now,
  onExit,
}: {
  view: NonNullable<ReturnType<typeof useApp>["view"]>
  now: number
  onExit: () => void
}) {
  return (
    <div className="mb-4 flex shrink-0 items-center gap-5">
      <Logo size={56} plate />
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-heading text-[26px] font-bold leading-tight text-white">{view.session.name}</h1>
        <p className="truncate text-[14px] text-sand/70">
          {view.session.venue || "เกงกิเดสซ์"} · ดูคิวที่มือถือ พิมพ์รหัส{" "}
          <span className="font-heading font-bold tracking-widest text-gold-soft">#{view.session.code}</span>
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="nums font-heading text-[38px] font-bold leading-none text-white">{thaiTime(now)}</p>
        <p className="text-[14px] text-sand/65">
          ในคอร์ต {view.stats.playing} · รอ {view.stats.waiting} คน
        </p>
      </div>
      <button
        className="shrink-0 rounded-xl border border-sand/30 p-2 text-sand/60 transition-colors hover:bg-sand/10"
        onClick={onExit}
        aria-label="ออกจากโหมดจอใหญ่"
      >
        <X size={20} />
      </button>
    </div>
  )
}
