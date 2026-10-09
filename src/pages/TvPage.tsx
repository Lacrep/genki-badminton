import { X } from "lucide-react"
import { displayName, formatDuration, levelInfo, levelSolid, thaiTime } from "@shared/types"
import type { CourtView, PlannedView, RosterPlayer } from "@shared/types"
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
   * เลือกจำนวนคอลัมน์ให้เหลือแถวน้อยที่สุด — 5 คอร์ตต้องเป็น 3 คอลัมน์ 2 แถว
   * ถ้าปล่อยเป็น 2 คอลัมน์ จะกลายเป็น 3 แถว แล้วคอร์ตสุดท้ายโดนขอบจอตัดหัวท้าย
   * (จอก๊วนจริงมี 5 คอร์ต เจอปัญหานี้เต็ม ๆ) ยิ่งแน่นยิ่งต้องย่อตัวอักษรลง
   * ไม่งั้นเนื้อในล้นออกนอกการ์ด
   */
  const cols = courts.length <= 2 ? 1 : courts.length <= 4 ? 2 : courts.length <= 9 ? 3 : 4
  const density: Density = { rows: Math.ceil(courts.length / cols) || 1, cols }
  /**
   * แถวสุดท้ายมักมีคอร์ตไม่ครบ (5 คอร์ต 3 คอลัมน์ → แถวล่างเหลือ 2 ใบ)
   * ถ้าปล่อยไว้จะมีช่องว่างโหว่ข้างขวา เลยยืดใบที่เหลือให้เต็มแถวแทน
   * ใช้ตาราง 12 ช่องเพราะหารด้วย 1·2·3·4·6 ลงตัวหมด
   */
  const remainder = courts.length % cols
  const lastRow = remainder === 0 ? cols : remainder
  // ฝั่งคู่ที่รอลงมีงบความสูงของตัวเอง — โชว์กี่ใบก็หารความสูงตามจำนวนนั้น
  const shown = Math.min(view.planned.length, 6)
  const plannedDensity: Density = { rows: Math.max(3, shown * 0.8 + 1), cols: 1 }

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

      <div
        className={cn(
          "grid min-h-0 flex-1 gap-5",
          courts.length >= 5 ? "lg:grid-cols-[2.1fr_1fr]" : "lg:grid-cols-[1.55fr_1fr]",
        )}
      >
        {/* ── ซ้าย: คอร์ตที่กำลังเล่น ── */}
        <section className="flex min-h-0 flex-col">
          <TvHeading>คอร์ต</TvHeading>
          <div
            className="grid min-h-0 flex-1 auto-rows-fr"
            style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: sizes(density).gap }}
          >
            {courts.map((cv, i) => (
              <CourtPanel
                key={cv.court.index}
                span={i >= courts.length - lastRow ? 12 / lastRow : 12 / cols}
                cv={cv}
                now={now}
                targetMinutes={view.session.settings.targetGameMinutes}
                nextUp={planForCourt.get(cv.court.index) ?? null}
                density={density}
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
                    density={plannedDensity}
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

/**
 * ขนาดตัวอักษรบนจอใหญ่คิดจาก "ความสูงที่การ์ดหนึ่งใบได้จริง" ไม่ใช่ค่าตายตัว
 *
 * ก๊วนมีตั้งแต่ 2 ถึง 8 คอร์ต และทีวีก็มีหลายขนาด ถ้าใช้ค่าตายตัว คอร์ตเยอะ ๆ
 * จะล้นออกนอกการ์ดจนโดนขอบจอตัด (ก๊วน 5 คอร์ตเจอเต็ม ๆ) ส่วนคอร์ตน้อย ๆ
 * จะเหลือที่ว่างครึ่งจอเปล่า ๆ สูตรนี้โตและหดตามจำนวนแถวกับความสูงจอเอง
 */
type Density = { rows: number; cols: number }

/** ความสูงที่เหลือให้ตารางคอร์ต หลังหักหัวจอกับหัวข้อออกแล้ว */
const GRID_SPACE = "(100dvh - 148px)"

/** ขนาดที่ยืดหยุ่นตามความสูงต่อหนึ่งแถว — บีบไว้ไม่ให้เล็กเกินอ่านหรือใหญ่เกินการ์ด */
function fluid(d: Density, factor: number, min: number, max: number): string {
  return `clamp(${min}px, calc(${GRID_SPACE} / ${d.rows} * ${factor}), ${max}px)`
}

const sizes = (d: Density) => ({
  name: fluid(d, 0.082, 15, 30),
  code: fluid(d, 0.042, 9, 15),
  dot: fluid(d, 0.038, 8, 14),
  head: fluid(d, 0.07, 14, 24),
  clock: fluid(d, 0.09, 17, 32),
  vs: fluid(d, 0.042, 10, 15),
  pad: fluid(d, 0.045, 10, 16),
  rowY: fluid(d, 0.03, 5, 11),
  gap: fluid(d, 0.025, 4, 9),
})

/** ชื่อ + ป้ายระดับมือ — หน่วยที่ใช้ซ้ำทั้งจอ ให้ขนาดตัวอักษรสั่งจากข้างนอกได้ */
function PlayerTag({ name, level, size }: { name: string; level: number; size: Density }) {
  const s = sizes(size)
  return (
    <span className="flex min-w-0 items-center" style={{ gap: s.gap }}>
      <span
        className="inline-block shrink-0 rounded-full ring-1 ring-white/25"
        style={{ backgroundColor: levelSolid(level), width: s.dot, height: s.dot }}
        aria-hidden
      />
      <span className="truncate font-heading font-semibold leading-tight text-white" style={{ fontSize: s.name }}>
        {name}
      </span>
      <span
        className="shrink-0 rounded-md px-1.5 py-0.5 font-heading font-bold leading-tight text-white/95"
        style={{ backgroundColor: levelSolid(level), fontSize: s.code }}
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
  density,
  span,
}: {
  cv: CourtView
  now: number
  targetMinutes: number
  /** คู่ที่พร้อมลงคอร์ตนี้เป็นคิวถัดไป — โชว์ไว้เลยให้คนเตรียมตัวได้ก่อนถูกเรียก */
  nextUp: { order: number; pv: PlannedView } | null
  density: Density
  /** กินกี่ช่องจากตาราง 12 ช่อง — แถวสุดท้ายที่ไม่เต็มจะกินช่องละมากกว่าปกติ */
  span: number
}) {
  const elapsed = cv.match ? now - cv.match.startedAt : 0
  const over = elapsed > targetMinutes * 60_000
  const s = sizes(density)

  /** ฝั่ง A / ฝั่ง B — ยืดเต็มความสูงที่เหลือ ไม่ปล่อยที่ว่างคาการ์ด */
  const side = (team: "A" | "B", players: { player: RosterPlayer; team: "A" | "B" }[]) => (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 items-center rounded-xl bg-navy-deep/65 px-2.5",
        team === "A" ? "" : "",
      )}
      style={{ paddingTop: s.rowY, paddingBottom: s.rowY, gap: s.pad }}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg font-heading font-bold leading-none",
          team === "A" ? "bg-sand text-navy-deep" : "bg-hinomaru text-white",
        )}
        style={{ width: `calc(${s.name} * 1.15)`, height: `calc(${s.name} * 1.15)`, fontSize: s.code }}
      >
        {team}
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-center" style={{ gap: s.gap }}>
        {players
          .filter((x) => x.team === team)
          .map((x) => <PlayerTag key={x.player.id} name={displayName(x.player)} level={x.player.level} size={density} />)}
      </span>
    </div>
  )

  const vs = (
    <p
      className="shrink-0 text-center font-heading font-bold leading-none tracking-widest text-sand/40"
      style={{ fontSize: s.vs }}
    >
      VS
    </p>
  )

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-2xl border-2",
        cv.match ? "border-sand/25 bg-navy/55" : "border-dashed border-gold/45 bg-navy/20",
      )}
      style={{ padding: s.pad, gap: s.gap, gridColumn: `span ${span} / span ${span}` }}
    >
      <div className="flex shrink-0 items-baseline gap-3">
        <h3 className="flex-1 truncate font-heading font-bold text-white" style={{ fontSize: s.head }}>
          {cv.court.name}
        </h3>
        {cv.match ? (
          <span
            className={cn("nums font-heading font-bold leading-none", over ? "text-hinomaru-soft" : "text-gold-soft")}
            style={{ fontSize: s.clock }}
          >
            {formatDuration(elapsed)}
          </span>
        ) : (
          <span
            className="shrink-0 rounded-lg bg-gold/20 px-2 py-0.5 font-heading font-bold text-gold-soft"
            style={{ fontSize: s.vs }}
          >
            ว่าง
          </span>
        )}
      </div>

      {cv.match ? (
        <div className="flex min-h-0 flex-1 flex-col" style={{ gap: s.gap }}>
          {side("A", cv.players)}
          {vs}
          {side("B", cv.players)}
        </div>
      ) : nextUp ? (
        <div className="flex min-h-0 flex-1 flex-col" style={{ gap: s.gap }}>
          <p
            className="shrink-0 text-center font-heading font-bold uppercase leading-none tracking-[0.14em] text-gold-soft"
            style={{ fontSize: s.vs }}
          >
            คู่ที่ {nextUp.order} · เตรียมลง
          </p>
          {side("A", nextUp.pv.players)}
          {vs}
          {side("B", nextUp.pv.players)}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-center font-heading text-sand/50" style={{ fontSize: s.head }}>
            รอหัวก๊วนจัดคนลง
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * การ์ดคู่ที่รอลง — บีบให้เตี้ย (ฝั่งละบรรทัด) เพราะจอ 768px สูงไม่พอ
 * ถ้าการ์ดสูง จะโดนตัดครึ่งคาตา ซึ่งอ่านแล้วงงกว่าไม่โชว์เลย
 */
function PlannedPanel({
  pv,
  order,
  courtName,
  density,
}: {
  pv: PlannedView
  order: number
  courtName: string | null
  density: Density
}) {
  const s = sizes(density)
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
              <p
                className="py-0.5 font-heading font-bold leading-none tracking-[0.2em] text-sand/35"
                style={{ fontSize: s.vs }}
              >
                VS
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {side(team).map((p) => (
                <PlayerTag key={p.player.id} name={displayName(p.player)} level={p.player.level} size={density} />
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
