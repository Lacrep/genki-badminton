import { Volleyball, X } from "lucide-react"
import { displayName, formatDuration, levelInfo, levelInk, levelSolid, photoUrl, thaiTime } from "@shared/types"
import type { CourtView, PlannedView, RosterPlayer } from "@shared/types"
import { useApp, useNow } from "@/lib/app"
import { Logo } from "@/components/ui"
import { cn } from "@/lib/util"

/**
 * โหมดจอใหญ่ — เอาทีวี/จอมอนิเตอร์ตั้งไว้ข้างคอร์ต ให้ลูกก๊วนดูเองได้ว่า
 * ใครอยู่ในสนาม เหลือเวลาเท่าไร และคู่ไหนรอลงอยู่ (หัวก๊วนจะได้ไม่โดนถามทั้งวัน)
 *
 * วางเป็นแถบยาวเรียงลงมาทีละคอร์ต: ซ้ายสองคน · กลางเป็นชื่อคอร์ตกับนาฬิกา · ขวาสองคน
 * แต่ละคนเป็นรูปวงกลมใหญ่ มีชื่อกับระดับมืออยู่ใต้รูป เพราะคนยืนดูห่างจากจอหลายเมตร
 * จำหน้าได้ก่อนอ่านชื่อเสมอ ส่วนคู่ที่จัดรอไว้อยู่เป็นแถบล่าง (ไม่มีคิวรายคน จอจะได้ไม่รก)
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
  const assigned = new Set<string>()
  let nextPlan = 0
  for (const cv of courts) {
    if (cv.match) continue
    const pv = readyPlans[nextPlan]
    if (!pv) break
    planForCourt.set(cv.court.index, { order: view.planned.indexOf(pv) + 1, pv })
    assigned.add(pv.planned.id)
    nextPlan += 1
  }

  /** คู่ที่ยังไม่ได้ถูกจับคู่กับคอร์ตไหน — เอาไปโชว์แถบล่าง จะได้ไม่โชว์ซ้ำกับในคอร์ต */
  const waiting = view.planned.filter((pv) => !assigned.has(pv.planned.id))
  const strip = waiting.slice(0, 4)
  const hasStrip = strip.length > 0
  const hasAlert = view.dongAlerts.length > 0

  /**
   * คอร์ตว่างที่ยังไม่มีคู่รอ ไม่ต้องกินความสูงเท่าคอร์ตที่กำลังเล่น
   *
   * ก๊วน 5 คอร์ตที่เล่นอยู่จริง 2 คอร์ต ถ้าแบ่งความสูงเท่ากันหมด รูปจะเล็กลงครึ่งหนึ่ง
   * เพราะไปเฉลี่ยให้แถบเปล่า ๆ ด้วย บีบแถบว่างให้เตี้ยแล้วยกที่เหลือให้คอร์ตที่มีคนเล่น
   */
  const isActive = (cv: CourtView) => Boolean(cv.match) || planForCourt.has(cv.court.index)
  const activeCount = courts.filter(isActive).length
  const idleCount = courts.length - activeCount

  /**
   * ความสูงที่แถบคอร์ตที่กำลังเล่นได้จริง หลังหักหัวจอ แถบว่าง แถบคู่รอลง และแถบเตือนออกแล้ว
   * ขนาดรูปกับตัวอักษรคิดจากค่านี้ ก๊วน 2 คอร์ตจึงได้รูปใหญ่เต็มจอ
   * ส่วนก๊วน 8 คอร์ตก็ย่อลงมาเองโดยไม่ล้นขอบจอ
   */
  const reserved = 86 + idleCount * (IDLE_BAND + 8) + (hasStrip ? 152 : 0) + (hasAlert ? 62 : 0)
  const d: Density = { rows: activeCount || 1, space: `(100svh - ${reserved}px)` }
  const s = sizes(d)

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-navy-deep px-5 py-3 text-sand">
      <TvHeader view={view} now={now} onExit={() => navigate("/")} />

      {/* ── คอร์ตเรียงลงมาทีละแถบ ── */}
      <div className="flex min-h-0 flex-1 flex-col" style={{ gap: s.gap }}>
        {courts.map((cv) => (
          <CourtBand
            key={cv.court.index}
            cv={cv}
            now={now}
            targetMinutes={view.session.settings.targetGameMinutes}
            nextUp={planForCourt.get(cv.court.index) ?? null}
            d={d}
            idle={!isActive(cv)}
          />
        ))}
      </div>

      {hasStrip ? (
        <div className="mt-2 shrink-0">
          <h2 className="mb-1.5 flex items-center gap-3 font-heading text-[15px] font-semibold uppercase tracking-[0.12em] text-gold-soft">
            คู่ต่อไปที่รอลง ({waiting.length})
            <span className="h-px flex-1 bg-gradient-to-r from-gold/50 to-transparent" />
          </h2>
          <div className="flex gap-2.5">
            {strip.map((pv) => (
              <PlannedCard key={pv.planned.id} pv={pv} order={view.planned.indexOf(pv) + 1} />
            ))}
            {waiting.length > strip.length ? (
              <div className="flex w-28 shrink-0 items-center justify-center rounded-2xl border border-dashed border-sand/25 text-center font-heading text-[14px] leading-tight text-sand/55">
                + อีก {waiting.length - strip.length} คู่
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasAlert ? (
        <div className="mt-2 shrink-0 rounded-2xl border-2 border-hinomaru bg-hinomaru/25 px-5 py-2.5">
          <p className="truncate font-heading text-[18px] font-semibold text-white">
            รอนานเกินกำหนด — {view.dongAlerts.join(" · ")}
          </p>
        </div>
      ) : null}
    </div>
  )
}

/**
 * ขนาดบนจอใหญ่คิดจาก "ความสูงที่แถบหนึ่งแถบได้จริง" ไม่ใช่ค่าตายตัว
 *
 * ก๊วนมีตั้งแต่ 2 ถึง 8 คอร์ต และทีวีก็มีหลายขนาด ถ้าใช้ค่าตายตัว คอร์ตเยอะ ๆ
 * จะล้นออกนอกแถบจนโดนขอบจอตัด ส่วนคอร์ตน้อย ๆ จะเหลือที่ว่างครึ่งจอเปล่า ๆ
 * ใช้ svh ไม่ใช่ dvh เพราะบนมือถือ dvh ยืดหดตามแถบเบราว์เซอร์แล้วท้ายจอโดนบัง
 */
type Density = { rows: number; space: string }

/** ความสูงคงที่ของแถบคอร์ตว่าง — แค่พอให้รู้ว่ามีคอร์ตนี้อยู่และยังไม่มีใครลง */
const IDLE_BAND = 52

function fluid(d: Density, factor: number, min: number, max: number): string {
  return `clamp(${min}px, calc(${d.space} / ${d.rows} * ${factor}), ${max}px)`
}

const sizes = (d: Density) => ({
  /** รูปวงกลม — ตัวเอกของจอนี้ กินเกือบครึ่งความสูงของแถบ */
  face: fluid(d, 0.44, 30, 168),
  /** รูปตอนวางแนวนอน (คอร์ตเยอะ) — กินความสูงได้มากกว่าเพราะไม่มีชื่อมาต่อข้างล่าง */
  faceWide: fluid(d, 0.6, 30, 168),
  name: fluid(d, 0.12, 12, 38),
  code: fluid(d, 0.07, 9, 20),
  court: fluid(d, 0.1, 12, 30),
  clock: fluid(d, 0.17, 17, 54),
  meta: fluid(d, 0.068, 9, 18),
  pad: fluid(d, 0.05, 6, 20),
  gap: fluid(d, 0.028, 3, 13),
})

/**
 * รูปวงกลมใหญ่ + ชื่อ + ระดับมือ — หน่วยหลักของจอนี้
 *
 * ปกติเรียงลงมา (รูปบน ชื่อล่าง) เพราะอ่านง่ายและรูปใหญ่ได้เต็มที่
 * แต่ก๊วนที่เล่นพร้อมกันเกิน 6 คอร์ต แถบจะเตี้ยจนวางสามชั้นไม่พอ
 * (จอ 1366x768 เหลือแถบละ ~72px) จึงพลิกเป็นแนวนอน รูปซ้าย ชื่อขวา
 * ซึ่งกลับทำให้รูปใหญ่ขึ้นด้วย เพราะไปกินที่ว่างด้านกว้างที่เหลือเฟือ
 */
function Face({ player, d, dim }: { player: RosterPlayer; d: Density; dim?: boolean }) {
  const s = sizes(d)
  const tight = d.rows >= 7
  const photo = photoUrl(player)
  const ring = levelSolid(player.level)
  const face = tight ? s.faceWide : s.face

  const circle = photo ? (
    <img
      src={photo}
      alt=""
      className="shrink-0 rounded-full object-cover"
      // ขอบสีระดับมือรอบรูป — กวาดตาดูทั้งจอทีเดียวก็รู้ว่าคอร์ตไหนมือหนัก
      style={{ width: face, height: face, boxShadow: `0 0 0 ${tight ? 3 : 4}px ${ring}` }}
      loading="lazy"
    />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-heading font-bold"
      style={{
        width: face,
        height: face,
        backgroundColor: ring,
        color: levelInk(player.level),
        fontSize: `calc(${face} * 0.44)`,
      }}
      aria-hidden
    >
      {displayName(player).trim().slice(0, 1)}
    </span>
  )

  const name = (full: boolean) => (
    <span
      className={cn("truncate font-heading font-bold leading-tight text-white", full && "w-full text-center")}
      style={{ fontSize: s.name }}
    >
      {displayName(player)}
    </span>
  )

  const code = (
    <span
      className={cn("shrink-0 font-heading font-bold leading-none", tight ? "rounded px-1" : "rounded-md px-1.5 py-px")}
      style={{ backgroundColor: ring, color: levelInk(player.level), fontSize: s.code }}
    >
      {levelInfo(player.level).code}
    </span>
  )

  if (tight) {
    return (
      <span
        className={cn("flex min-w-0 flex-1 items-center justify-center", dim && "opacity-75")}
        style={{ gap: `calc(${s.gap} * 1.2)` }}
      >
        {circle}
        <span className="flex min-w-0 flex-col items-start" style={{ gap: `calc(${s.gap} * 0.4)` }}>
          {name(false)}
          {code}
        </span>
      </span>
    )
  }

  return (
    <span
      className={cn("flex min-w-0 flex-1 flex-col items-center", dim && "opacity-75")}
      style={{ gap: `calc(${s.gap} * 0.6)` }}
    >
      {circle}
      {name(true)}
      {code}
    </span>
  )
}

function CourtBand({
  cv,
  now,
  targetMinutes,
  nextUp,
  d,
  idle,
}: {
  cv: CourtView
  now: number
  targetMinutes: number
  /** คู่ที่พร้อมลงคอร์ตนี้เป็นคิวถัดไป — โชว์ไว้เลยให้คนเตรียมตัวได้ก่อนถูกเรียก */
  nextUp: { order: number; pv: PlannedView } | null
  d: Density
  /** คอร์ตว่างที่ยังไม่มีคู่รอ — บีบเป็นแถบเตี้ย ยกความสูงให้คอร์ตที่มีคนเล่น */
  idle: boolean
}) {
  const s = sizes(d)
  const elapsed = cv.match ? now - cv.match.startedAt : 0
  const over = elapsed > targetMinutes * 60_000
  // คอร์ตว่างที่มีคู่รออยู่ ก็โชว์หน้าคู่นั้นเลย แค่หรี่ลงนิดให้รู้ว่ายังไม่ได้เริ่ม
  const squad = cv.match ? cv.players : (nextUp?.pv.players ?? null)
  const side = (team: "A" | "B") => squad?.filter((x) => x.team === team) ?? []

  return (
    <div
      className={cn(
        "flex items-center overflow-hidden rounded-2xl border-2",
        idle ? "shrink-0" : "min-h-0 flex-1",
        cv.match ? "border-sand/25 bg-navy/55" : "border-dashed border-gold/45 bg-navy/20",
      )}
      style={{ padding: s.pad, gap: s.pad, ...(idle ? { height: IDLE_BAND } : null) }}
    >
      {squad ? (
        <>
          <div className="flex min-w-0 flex-1 items-center" style={{ gap: s.pad }}>
            {side("A").map((x) => (
              <Face key={x.player.id} player={x.player} d={d} dim={!cv.match} />
            ))}
          </div>

          {/* ตรงกลาง: ชื่อคอร์ต นาฬิกา และเลขเกม — จุดที่สายตาวิ่งมาหาเป็นอันดับแรก */}
          <div
            className="flex shrink-0 flex-col items-center justify-center text-center"
            style={{ minWidth: `calc(${s.clock} * 3.4)`, gap: `calc(${s.gap} * 0.5)` }}
          >
            {/* ลูกแบดคั่นกลาง — เส้นแบ่งสายตาระหว่างสองฝั่ง เหมือนตาข่ายกลางคอร์ต */}
            <Volleyball className="text-sand/35" style={{ width: s.court, height: s.court }} />
            <p className="font-heading font-bold leading-none text-white" style={{ fontSize: s.court }}>
              {cv.court.name}
            </p>
            {cv.match ? (
              <>
                <p
                  className={cn(
                    "nums font-heading font-bold leading-none",
                    over ? "text-hinomaru-soft" : "text-gold-soft",
                  )}
                  style={{ fontSize: s.clock }}
                >
                  {formatDuration(elapsed)}
                </p>
                {/* เลขเกม — คนดูจดไว้แล้วไปเทียบกับบิลทีหลังได้ */}
                <p
                  className="nums rounded-md bg-sand/15 px-1.5 font-heading font-bold leading-snug text-sand/75"
                  style={{ fontSize: s.meta }}
                >
                  เกม #{cv.match.no}
                </p>
              </>
            ) : (
              <>
                <p
                  className="font-heading font-bold uppercase leading-none tracking-[0.08em] text-gold-soft"
                  style={{ fontSize: `calc(${s.clock} * 0.5)` }}
                >
                  เตรียมลง
                </p>
                <p className="font-heading font-bold leading-snug text-sand/70" style={{ fontSize: s.meta }}>
                  คู่ที่ {nextUp?.order}
                </p>
              </>
            )}
          </div>

          <div className="flex min-w-0 flex-1 items-center" style={{ gap: s.pad }}>
            {side("B").map((x) => (
              <Face key={x.player.id} player={x.player} d={d} dim={!cv.match} />
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="shrink-0 font-heading text-[19px] font-bold leading-none text-white">{cv.court.name}</p>
          <p className="flex-1 truncate text-center font-heading text-[17px] text-sand/45">รอหัวก๊วนจัดคนลง</p>
          <span className="shrink-0 rounded-lg bg-gold/20 px-2.5 py-0.5 font-heading text-[14px] font-bold text-gold-soft">
            ว่าง
          </span>
        </>
      )}
    </div>
  )
}

/**
 * การ์ดคู่ที่รอลงในแถบล่าง — ความสูงคงที่ ไม่ต้องยืดหดตามจำนวนคอร์ต
 * โชว์แค่หน้ากับชื่อพอให้รู้ว่าคู่ไหนรอ ไม่ต้องละเอียดเท่าแถบคอร์ต
 */
function PlannedCard({ pv, order }: { pv: PlannedView; order: number }) {
  const status =
    pv.problems.length > 0
      ? pv.problems.join(" · ")
      : pv.waitingFor.length > 0
        ? `รอ ${pv.waitingFor.join(", ")} จบเกม`
        : "พร้อมลงคอร์ต"

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-1 rounded-2xl border px-2.5 py-2",
        order === 1 ? "border-gold/60 bg-gold/[0.12]" : "border-sand/20 bg-navy/40",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "nums flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-heading text-[11px] font-bold",
            order === 1 ? "bg-gold text-navy-deep" : "bg-navy-deep/70 text-sand/80",
          )}
        >
          {order}
        </span>
        <span
          className={cn(
            "truncate font-heading text-[12px] font-medium",
            pv.problems.length > 0 ? "text-hinomaru-soft" : "text-sand/70",
          )}
        >
          {status}
        </span>
      </div>
      <div className="flex items-start gap-1">
        {(["A", "B"] as const).map((team, i) => (
          <div key={team} className="flex min-w-0 flex-1 items-start gap-1">
            {i === 1 ? (
              <span className="self-center font-heading text-[10px] font-bold text-sand/35">VS</span>
            ) : null}
            {pv.players
              .filter((x) => x.team === team)
              .map((x) => (
                <span key={x.player.id} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
                  <MiniFace player={x.player} />
                  <span className="w-full truncate text-center font-heading text-[11px] font-semibold leading-tight text-white">
                    {displayName(x.player)}
                  </span>
                </span>
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function MiniFace({ player }: { player: RosterPlayer }) {
  const photo = photoUrl(player)
  const ring = levelSolid(player.level)
  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        className="h-9 w-9 shrink-0 rounded-full object-cover"
        style={{ boxShadow: `0 0 0 2px ${ring}` }}
        loading="lazy"
      />
    )
  }
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-heading text-[15px] font-bold"
      style={{ backgroundColor: ring, color: levelInk(player.level) }}
      aria-hidden
    >
      {displayName(player).trim().slice(0, 1)}
    </span>
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
    <div className="mb-2 flex shrink-0 items-center gap-4">
      <Logo size={48} plate />
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-heading text-[22px] font-bold leading-tight text-white">{view.session.name}</h1>
        <p className="truncate text-[13px] text-sand/70">
          {view.session.venue || "เกงกิเดสซ์"} · ดูคิวที่มือถือ พิมพ์รหัส{" "}
          <span className="font-heading font-bold tracking-widest text-gold-soft">#{view.session.code}</span>
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="nums font-heading text-[32px] font-bold leading-none text-white">{thaiTime(now)}</p>
        <p className="text-[13px] text-sand/65">
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
