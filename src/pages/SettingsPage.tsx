import { useEffect, useState } from "react"
import { ChevronDown, Flag, Gauge, LayoutGrid, Settings2, Volume2 } from "lucide-react"
import { type MatchType, type SessionSettings, DEFAULT_SETTINGS, MAX_LEVEL } from "@shared/types"
import { api } from "@/lib/api"
import { useApp } from "@/lib/app"
import { EmptyState, Segmented, Stepper, Toggle } from "@/components/ui"
import { cn } from "@/lib/util"

const TYPE_OPTIONS: { value: MatchType | "auto"; label: string }[] = [
  { value: "auto", label: "อัตโนมัติ" },
  { value: "D", label: "คู่" },
  { value: "S", label: "เดี่ยว" },
]

export function SettingsPage({ navigate }: { navigate: (to: string) => void }) {
  const { view, run, needPin } = useApp()
  const [advanced, setAdvanced] = useState(false)
  const [name, setName] = useState(view?.session.name ?? "")
  const [venue, setVenue] = useState(view?.session.venue ?? "")

  useEffect(() => {
    setName(view?.session.name ?? "")
    setVenue(view?.session.venue ?? "")
  }, [view?.session.name, view?.session.venue])

  if (!view) {
    return (
      <div className="card">
        <EmptyState
          title="ยังไม่มีก๊วนที่เปิดอยู่"
          hint="เปิดก๊วนก่อน แล้วค่อยกลับมาปรับกฎการจัดคิว"
          action={
            <button className="btn-primary" onClick={() => navigate("/")}>
              ไปหน้าเปิดก๊วน
            </button>
          }
        />
      </div>
    )
  }

  const sessionId = view.session.id
  const s = view.session.settings
  const canControl = !needPin

  const patch = (settings: Partial<SessionSettings>) =>
    void run("บันทึกการตั้งค่าแล้ว", () => api.updateSession(sessionId, { settings }), { silent: true })

  return (
    <div className="flex flex-col gap-4">
      {/* ข้อมูลก๊วน */}
      <section className="card card-pad flex flex-col gap-3.5">
        <h2 className="section-title">
          <Flag size={15} className="text-gold-deep" />
          ก๊วนวันนี้
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="s-name">
              ชื่อก๊วน
            </label>
            <input
              id="s-name"
              className="input"
              value={name}
              disabled={!canControl}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name !== view.session.name && void run("", () => api.updateSession(sessionId, { name }), { silent: true })}
            />
          </div>
          <div>
            <label className="label" htmlFor="s-venue">
              สนามที่เล่น
            </label>
            <input
              id="s-venue"
              className="input"
              placeholder="เช่น สนามแบดมินตัน XYZ คอร์ต 3-4"
              value={venue}
              disabled={!canControl}
              onChange={(e) => setVenue(e.target.value)}
              onBlur={() => venue !== view.session.venue && void run("", () => api.updateSession(sessionId, { venue }), { silent: true })}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="flex items-center gap-1.5 font-heading text-[14px] font-medium text-ink">
              <LayoutGrid size={14} />
              จำนวนคอร์ต
            </span>
            <span className="block text-[12px] text-ink-soft">ลดจำนวนได้เฉพาะคอร์ตที่ไม่มีเกมอยู่</span>
          </span>
          <Stepper
            value={view.session.courts.length}
            onChange={(count) => void run("ปรับจำนวนคอร์ตแล้ว", () => api.setCourtCount(sessionId, count))}
            min={1}
            max={12}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          {view.session.courts.map((c) => (
            <div key={c.index} className="flex items-center gap-2">
              <input
                className="input flex-1"
                defaultValue={c.name}
                disabled={!canControl}
                onBlur={(e) => {
                  const next = e.target.value.trim()
                  if (next && next !== c.name) {
                    void run("เปลี่ยนชื่อคอร์ตแล้ว", () => api.courtPatch(sessionId, c.index, { name: next }), {
                      silent: true,
                    })
                  }
                }}
              />
              <button
                className={cn("btn-sm shrink-0", c.disabled ? "btn-gold" : "btn-ghost")}
                disabled={!canControl}
                onClick={() =>
                  void run(c.disabled ? "เปิดคอร์ตแล้ว" : "ปิดคอร์ตแล้ว", () =>
                    api.courtPatch(sessionId, c.index, { disabled: !c.disabled }),
                  )
                }
              >
                {c.disabled ? "เปิดใช้" : "ปิดชั่วคราว"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* กฎการจัดคิว */}
      <section className="card card-pad flex flex-col gap-4">
        <h2 className="section-title">
          <Gauge size={15} className="text-gold-deep" />
          กฎการจัดคิว
        </h2>

        <Field
          title="ระดับมือห่างกันได้ไม่เกิน"
          hint="0 = ต้องมือเท่ากันเป๊ะ · 1 = ห่างได้ขั้นเดียว เช่น N กับ S (ถ้าคนในคิวไม่พอ ระบบจะผ่อนให้เองชั่วคราว)"
        >
          <Stepper value={s.maxLevelGap} onChange={(maxLevelGap) => patch({ maxLevelGap })} min={0} max={MAX_LEVEL - 1} suffix="ขั้น" />
        </Field>

        <Field title="รอเกินเท่านี้ = เริ่มเตือน (สีทอง)" hint="การ์ดในคิวจะเปลี่ยนสีให้เห็นชัดว่าเริ่มรอนาน">
          <Stepper
            value={s.warnWaitMinutes}
            onChange={(warnWaitMinutes) => patch({ warnWaitMinutes })}
            min={1}
            max={60}
            suffix="นาที"
          />
        </Field>

        <Field
          title="รอเกินเท่านี้ = ถูกดอง (บังคับลง)"
          hint="กฎเหล็ก: ใครรอเกินเวลานี้ ระบบจะบังคับให้ลงเกมถัดไปก่อนใคร แม้ระดับมือจะห่างกว่าปกติ"
        >
          <Stepper
            value={s.dongWaitMinutes}
            onChange={(dongWaitMinutes) => patch({ dongWaitMinutes })}
            min={2}
            max={90}
            suffix="นาที"
          />
        </Field>

        <Field title="เกมหนึ่งใช้เวลาประมาณ" hint="ใช้ประเมินว่าลูกก๊วนอีกกี่นาทีจะได้ลง และเตือนเมื่อเกมยืดเกินเวลา">
          <Stepper
            value={s.targetGameMinutes}
            onChange={(targetGameMinutes) => patch({ targetGameMinutes })}
            min={5}
            max={45}
            suffix="นาที"
          />
        </Field>

        <div>
          <span className="label">ประเภทเกมเริ่มต้นเวลากดสุ่ม</span>
          <Segmented
            value={s.defaultMatchType}
            onChange={(defaultMatchType) => patch({ defaultMatchType })}
            options={TYPE_OPTIONS}
            size="sm"
          />
        </div>

        <Toggle
          checked={s.callSound}
          onChange={(callSound) => patch({ callSound })}
          label="เรียกชื่อด้วยเสียงเมื่อจัดลงคอร์ต"
          hint="กระดิ่งเรียก + อ่านชื่อเป็นภาษาไทย (ต้องกดปุ่มในเครื่องนั้นอย่างน้อยครั้งหนึ่งก่อน เบราว์เซอร์จึงอนุญาตให้เล่นเสียง)"
        />

        <button
          type="button"
          className="flex items-center gap-1.5 self-start font-heading text-[13px] font-medium text-ink-soft"
          onClick={() => setAdvanced((v) => !v)}
        >
          <ChevronDown size={15} className={cn("transition-transform", advanced && "rotate-180")} />
          ปรับน้ำหนักการตัดสินใจ (สำหรับคนชอบจูน)
        </button>

        {advanced ? (
          <div className="flex flex-col gap-3.5 rounded-washi border border-line/70 bg-subtle/40 p-3.5">
            <Field title="น้ำหนักเวลารอ (ต่อ 1 นาที)" hint="ยิ่งสูง ยิ่งเอาคนที่รอนานลงก่อนแบบไม่สนอย่างอื่น">
              <Stepper value={s.waitWeight} onChange={(waitWeight) => patch({ waitWeight })} min={0} max={10} />
            </Field>
            <Field title="น้ำหนักการตามหลัง 1 เกม" hint="ช่วยคนที่มาสายหรือยังลงน้อยให้ได้ไล่คิวขึ้นมา">
              <Stepper
                value={s.gamesBehindWeight}
                onChange={(gamesBehindWeight) => patch({ gamesBehindWeight })}
                min={0}
                max={30}
              />
            </Field>
            <Field title="น้ำหนักความห่างของระดับมือ" hint="ยิ่งสูง ยิ่งยึดว่ามือต้องใกล้กันมากกว่าเรื่องคิว">
              <Stepper value={s.levelWeight} onChange={(levelWeight) => patch({ levelWeight })} min={0} max={30} />
            </Field>
            <Field title="น้ำหนักการไม่ซ้ำคู่เดิม" hint="ยิ่งสูง ยิ่งพยายามสลับคู่ให้ได้เล่นกับคนใหม่">
              <Stepper value={s.varietyWeight} onChange={(varietyWeight) => patch({ varietyWeight })} min={0} max={30} />
            </Field>
            <button
              className="btn-ghost btn-sm self-start"
              onClick={() =>
                patch({
                  waitWeight: DEFAULT_SETTINGS.waitWeight,
                  gamesBehindWeight: DEFAULT_SETTINGS.gamesBehindWeight,
                  levelWeight: DEFAULT_SETTINGS.levelWeight,
                  varietyWeight: DEFAULT_SETTINGS.varietyWeight,
                })
              }
            >
              คืนค่าเริ่มต้น
            </button>
          </div>
        ) : null}
      </section>

      {/* ปิดก๊วน */}
      <section className="card card-pad flex flex-col gap-3">
        <h2 className="section-title">
          <Settings2 size={15} className="text-gold-deep" />
          จบก๊วน
        </h2>
        <p className="text-[12.5px] leading-relaxed text-ink-soft">
          ปิดก๊วนแล้วทุกคนจะถูกเช็คเอาต์ให้อัตโนมัติ ตัวเลขค่าใช้จ่ายจะหยุดนิ่ง
          และก๊วนนี้จะไปอยู่ในประวัติ (เปิดกลับมาแก้ได้ถ้ากดผิด)
        </p>
        <div className="flex flex-wrap gap-2">
          {view.session.status === "live" ? (
            <button
              className="btn-red"
              disabled={!canControl}
              onClick={() => {
                if (!window.confirm("ปิดก๊วนวันนี้เลยไหม?")) return
                void run("ปิดก๊วนแล้ว", () => api.endSession(sessionId))
              }}
            >
              <Flag size={16} />
              ปิดก๊วนวันนี้
            </button>
          ) : (
            <button
              className="btn-gold"
              disabled={!canControl}
              onClick={() => void run("เปิดก๊วนกลับมาแล้ว", () => api.reopenSession(sessionId))}
            >
              เปิดก๊วนนี้กลับมา
            </button>
          )}
          <button className="btn-ghost" onClick={() => navigate("/tv")}>
            <Volume2 size={16} />
            โหมดจอใหญ่
          </button>
        </div>
      </section>
    </div>
  )
}

function Field({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block font-heading text-[14px] font-medium text-ink">{title}</span>
        {hint ? <span className="block text-[12px] leading-snug text-ink-soft">{hint}</span> : null}
      </span>
      <span className="shrink-0">{children}</span>
    </div>
  )
}
