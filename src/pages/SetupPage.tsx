import { useState } from "react"
import { CalendarDays, MapPin, PlayCircle, RotateCcw } from "lucide-react"
import { DEFAULT_FEES, thaiDateKey, thaiTime } from "@shared/types"
import { api } from "@/lib/api"
import { useApp } from "@/lib/app"
import { BrushDivider, Logo, Stepper } from "@/components/ui"
import { cn } from "@/lib/util"

export function SetupPage() {
  const { run, sessions, needPin, pinRequired } = useApp()
  const [name, setName] = useState("")
  const [venue, setVenue] = useState("")
  const [courtCount, setCourtCount] = useState(2)
  const [courtCost, setCourtCost] = useState("")
  const [shuttlePrice, setShuttlePrice] = useState(String(DEFAULT_FEES.shuttlePrice))
  const [busy, setBusy] = useState(false)

  const open = async () => {
    setBusy(true)
    await run("เปิดก๊วนแล้ว — เช็คอินลูกก๊วนได้เลย", () =>
      api.createSession({
        name: name.trim() || undefined,
        venue: venue.trim() || undefined,
        courtCount,
        fees: {
          courtCost: Number(courtCost.replace(/[^0-9.]/g, "")) || 0,
          shuttlePrice: Number(shuttlePrice.replace(/[^0-9.]/g, "")) || DEFAULT_FEES.shuttlePrice,
        },
      }),
    )
    setBusy(false)
  }

  const past = sessions.slice(0, 5)

  return (
    <div className="flex flex-col gap-5">
      {/* ป้ายร้าน */}
      <div className="card card-pad flex flex-col items-center gap-2 py-7 text-center">
        <Logo size={128} ring />
        <h1 className="mt-2 font-heading text-[22px] font-bold text-ink">เกงกิเดสซ์</h1>
        <p className="font-jp text-[15px] text-gold-deep dark:text-gold-soft">元気です · Badminton Society</p>
        <BrushDivider className="my-1 w-40" />
        <p className="max-w-sm text-[13px] leading-relaxed text-ink-soft">
          ระบบจัดก๊วน: จัดคิวตามเวลารอจริง จับคู่มือใกล้เคียง สลับคู่ไม่ให้ซ้ำ
          และ<span className="font-medium text-ink"> ไม่ดองใครไว้เฉย ๆ</span>
        </p>
      </div>

      {/* เปิดก๊วนใหม่ */}
      <section className="card card-pad flex flex-col gap-3.5">
        <h2 className="section-title">
          <CalendarDays size={15} className="text-gold-deep" />
          เปิดก๊วนวันนี้
        </h2>

        <div>
          <label className="label" htmlFor="su-name">
            ชื่อก๊วน
          </label>
          <input
            id="su-name"
            className="input"
            placeholder={`ก๊วนวันที่ ${thaiDateKey()}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="su-venue">
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} />
              สนามที่เล่น
            </span>
          </label>
          <input
            id="su-venue"
            className="input"
            placeholder="เช่น สนามแบด ABC คอร์ต 5-6"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="block font-heading text-[14px] font-medium text-ink">จองไว้กี่คอร์ต</span>
            <span className="block text-[12px] text-ink-soft">เพิ่ม/ลดภายหลังได้ในหน้าตั้งค่า</span>
          </span>
          <Stepper value={courtCount} onChange={setCourtCount} min={1} max={12} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="su-court">
              ค่าคอร์ตรวม (บาท)
            </label>
            <input
              id="su-court"
              className="input nums"
              inputMode="numeric"
              placeholder="0"
              value={courtCost}
              onChange={(e) => setCourtCost(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="su-shuttle">
              ราคาลูกแบด (บาท/ลูก)
            </label>
            <input
              id="su-shuttle"
              className="input nums"
              inputMode="numeric"
              value={shuttlePrice}
              onChange={(e) => setShuttlePrice(e.target.value)}
            />
          </div>
        </div>

        <button className="btn-primary btn-lg" onClick={open} disabled={busy || (pinRequired && needPin)}>
          <PlayCircle size={18} />
          เปิดก๊วน
        </button>
        {pinRequired && needPin ? (
          <p className="text-center text-[12px] text-hinomaru">ต้องใส่ PIN หัวก๊วนก่อนจึงเปิดก๊วนได้</p>
        ) : null}
      </section>

      {/* ก๊วนที่ผ่านมา */}
      {past.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="section-title">
            <RotateCcw size={15} className="text-gold-deep" />
            ก๊วนที่ผ่านมา
          </h2>
          {past.map((s) => (
            <div key={s.id} className="card card-pad flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-heading text-[14px] font-semibold text-ink">{s.name}</span>
                <span className="block truncate text-[12px] text-ink-soft">
                  {s.date} · {thaiTime(s.startAt)} · {s.players} คน · {s.matches} เกม
                </span>
              </span>
              <span
                className={cn("chip shrink-0", s.status === "live" ? "bg-gold/25 text-gold-deep" : "bg-subtle text-ink-faint")}
              >
                {s.status === "live" ? "ยังเปิดอยู่" : "จบแล้ว"}
              </span>
              <button
                className="btn-ghost btn-sm shrink-0"
                onClick={() => void run("เปิดก๊วนนี้ขึ้นมาแล้ว", () => api.reopenSession(s.id))}
              >
                เปิดต่อ
              </button>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  )
}
