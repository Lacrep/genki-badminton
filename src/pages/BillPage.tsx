import { useEffect, useState } from "react"
import { Check, ClipboardList, Download, Receipt, Wallet } from "lucide-react"
import { type FeeMode, FEE_MODE_LABEL } from "@shared/types"
import { api } from "@/lib/api"
import { useApp, useSession } from "@/lib/app"
import { Segmented, Stat, Stepper } from "@/components/ui"
import { baht, cn, copyText } from "@/lib/util"

export function BillPage() {
  const { view, sessionId } = useSession()
  const { run, toast, needPin } = useApp()
  const fees = view.session.fees
  const bill = view.bill
  const canControl = !needPin

  const [courtCost, setCourtCost] = useState(String(fees.courtCost))
  const [shuttlePrice, setShuttlePrice] = useState(String(fees.shuttlePrice))
  const [extraCost, setExtraCost] = useState(String(fees.extraCost))
  const [extraNote, setExtraNote] = useState(fees.extraNote ?? "")
  const [promptPay, setPromptPay] = useState(fees.promptPay ?? "")

  // ถ้าเครื่องอื่นแก้ค่าใช้จ่าย ให้ช่องกรอกตามไปด้วย
  useEffect(() => {
    setCourtCost(String(fees.courtCost))
    setShuttlePrice(String(fees.shuttlePrice))
    setExtraCost(String(fees.extraCost))
    setExtraNote(fees.extraNote ?? "")
    setPromptPay(fees.promptPay ?? "")
  }, [fees.courtCost, fees.shuttlePrice, fees.extraCost, fees.extraNote, fees.promptPay])

  const saveFees = (patch: Record<string, unknown>) =>
    void run("บันทึกค่าใช้จ่ายแล้ว", () => api.updateSession(sessionId, { fees: patch }), { silent: true })

  const num = (s: string) => {
    const n = Number(s.replace(/[^0-9.]/g, ""))
    return Number.isFinite(n) ? n : 0
  }

  const unpaid = bill.lines.filter((l) => !l.paid)
  const billed = bill.lines.reduce((sum, l) => sum + l.amount, 0)

  return (
    <div className="flex flex-col gap-4">
      {/* สรุปเงิน */}
      <div className="card card-pad">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="ต้นทุนรวม" value={`${baht(bill.total)} ฿`} hint={`ลูกที่ใช้ ${bill.shuttlesUsed} ลูก`} />
          <Stat label="เก็บได้แล้ว" value={`${baht(bill.collected)} ฿`} hint={`${bill.lines.length - unpaid.length}/${bill.lines.length} คน`} />
          <Stat label="ยังไม่จ่าย" value={`${baht(billed - bill.collected)} ฿`} tone="red" hint={`${unpaid.length} คน`} />
          <Stat
            label={bill.balance >= 0 ? "เหลือเข้าก๊วน" : "ขาดอยู่"}
            value={`${baht(Math.abs(bill.balance))} ฿`}
            tone={bill.balance >= 0 ? "gold" : "red"}
            hint="ยอดที่เรียกเก็บ − ต้นทุน"
          />
        </div>
      </div>

      {/* ตั้งค่าเงิน */}
      <section className="card card-pad flex flex-col gap-3.5">
        <h2 className="section-title">
          <Wallet size={15} className="text-gold-deep" />
          ค่าใช้จ่ายวันนี้
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="b-court">
              ค่าเช่าคอร์ตรวม (บาท)
            </label>
            <input
              id="b-court"
              className="input nums"
              inputMode="numeric"
              value={courtCost}
              disabled={!canControl}
              onChange={(e) => setCourtCost(e.target.value)}
              onBlur={() => saveFees({ courtCost: num(courtCost) })}
            />
          </div>
          <div>
            <label className="label" htmlFor="b-shuttle">
              ราคาลูกแบด (บาท/ลูก)
            </label>
            <input
              id="b-shuttle"
              className="input nums"
              inputMode="numeric"
              value={shuttlePrice}
              disabled={!canControl}
              onChange={(e) => setShuttlePrice(e.target.value)}
              onBlur={() => saveFees({ shuttlePrice: num(shuttlePrice) })}
            />
          </div>
          <div>
            <label className="label" htmlFor="b-extra">
              ค่าอื่น ๆ (บาท)
            </label>
            <input
              id="b-extra"
              className="input nums"
              inputMode="numeric"
              value={extraCost}
              disabled={!canControl}
              onChange={(e) => setExtraCost(e.target.value)}
              onBlur={() => saveFees({ extraCost: num(extraCost) })}
            />
          </div>
          <div>
            <label className="label" htmlFor="b-note">
              ค่าอื่น ๆ คืออะไร
            </label>
            <input
              id="b-note"
              className="input"
              placeholder="น้ำ / ขนม / ค่าที่จอดรถ"
              value={extraNote}
              disabled={!canControl}
              onChange={(e) => setExtraNote(e.target.value)}
              onBlur={() => saveFees({ extraNote })}
            />
          </div>
        </div>

        <div>
          <span className="label">วิธีหารเงิน</span>
          <Segmented
            value={fees.mode}
            onChange={(mode: FeeMode) => saveFees({ mode })}
            size="sm"
            options={(Object.keys(FEE_MODE_LABEL) as FeeMode[]).map((m) => ({ value: m, label: FEE_MODE_LABEL[m] }))}
          />
          <p className="mt-1.5 text-[12px] leading-snug text-ink-faint">
            {fees.mode === "split"
              ? "ค่าคอร์ตหารเท่ากันทุกคน ส่วนค่าลูกคิดตามจำนวนเกมที่ลง — คนมาสายหรือลงน้อยจ่ายน้อยลง"
              : fees.mode === "byGames"
                ? "ทุกอย่างคิดตามจำนวนเกมที่ลง คนที่ไม่ได้ลงเลยไม่ต้องจ่าย"
                : fees.mode === "equal"
                  ? "หารเท่ากันทุกคนที่เช็คอินวันนี้"
                  : "เก็บเรทคงที่ต่อหัว (สมาชิก/ขาจร) แล้วดูว่ายอดรวมขาดหรือเกินต้นทุน"}
          </p>
        </div>

        {fees.mode === "flat" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-heading text-[13.5px] text-ink">เรทสมาชิก</span>
              <Stepper
                value={fees.memberFee}
                onChange={(memberFee) => saveFees({ memberFee })}
                step={10}
                max={2000}
                suffix="฿"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-heading text-[13.5px] text-ink">เรทขาจร</span>
              <Stepper
                value={fees.guestFee}
                onChange={(guestFee) => saveFees({ guestFee })}
                step={10}
                max={2000}
                suffix="฿"
              />
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-2">
            <span>
              <span className="block font-heading text-[13.5px] text-ink">ปัดเศษขึ้นทีละ</span>
              <span className="block text-[11.5px] text-ink-faint">เก็บเงินง่าย ไม่ต้องทอนเศษ</span>
            </span>
            <Stepper value={fees.roundTo} onChange={(roundTo) => saveFees({ roundTo })} min={1} max={50} step={1} suffix="฿" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>
              <span className="block font-heading text-[13.5px] text-ink">ลูกที่ใช้เพิ่ม (นอกเกม)</span>
              <span className="block text-[11.5px] text-ink-faint">เช่น ลูกที่เปิดไว้ซ้อมก่อนเริ่ม</span>
            </span>
            <Stepper
              value={view.session.shuttlesExtra}
              onChange={(v) => void run("", () => api.shuttles(sessionId, v - view.session.shuttlesExtra), { silent: true })}
              max={99}
              suffix="ลูก"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="b-pp">
            พร้อมเพย์ที่ให้โอน (เบอร์/ชื่อบัญชี)
          </label>
          <input
            id="b-pp"
            className="input"
            placeholder="08x-xxx-xxxx (ชื่อหัวก๊วน)"
            value={promptPay}
            disabled={!canControl}
            onChange={(e) => setPromptPay(e.target.value)}
            onBlur={() => saveFees({ promptPay })}
          />
        </div>
      </section>

      {/* ใบเสร็จ */}
      <section className="card card-pad">
        <h2 className="section-title mb-3">
          <Receipt size={15} className="text-gold-deep" />
          คนละเท่าไร ({bill.lines.length} คน)
        </h2>

        <div className="flex flex-col">
          {bill.lines.map((l) => (
            <div key={l.playerId} className="receipt-row">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-heading text-[14px] font-medium text-ink">{l.name}</span>
                <span className="block text-[11.5px] text-ink-faint">
                  {l.games} เกม{l.member ? "" : " · ขาจร"}
                </span>
              </span>
              <span className="nums font-heading text-[15px] font-semibold text-ink">{baht(l.amount)} ฿</span>
              <button
                type="button"
                disabled={!canControl}
                onClick={() => void run(l.paid ? "ยกเลิกการจ่าย" : "รับเงินแล้ว", () => api.paid(sessionId, l.playerId, !l.paid), { silent: true })}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all",
                  l.paid
                    ? "border-gold bg-gold text-navy-deep"
                    : "border-line bg-surface text-ink-faint hover:bg-subtle",
                )}
                aria-label={l.paid ? "จ่ายแล้ว" : "ยังไม่จ่าย"}
              >
                <Check size={16} />
              </button>
            </div>
          ))}
          {bill.lines.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-ink-faint">ยังไม่มีใครเช็คอิน</p>
          ) : null}
        </div>

        <div className="mt-3 flex flex-col gap-1 border-t border-line pt-3 text-[13px]">
          <Row label="ค่าคอร์ต" value={`${baht(bill.courtCost)} ฿`} />
          <Row label={`ค่าลูก (${bill.shuttlesUsed} ลูก)`} value={`${baht(bill.shuttleCost)} ฿`} />
          {bill.extraCost > 0 ? <Row label={fees.extraNote || "ค่าอื่น ๆ"} value={`${baht(bill.extraCost)} ฿`} /> : null}
          <Row label="ต้นทุนรวม" value={`${baht(bill.total)} ฿`} bold />
          <Row label="ยอดที่เรียกเก็บรวม" value={`${baht(billed)} ฿`} />
        </div>
      </section>

      {/* ส่งออก */}
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-primary flex-1"
          onClick={async () => {
            try {
              const { text } = await api.summary(sessionId)
              const ok = await copyText(text)
              toast(ok ? "ก็อปสรุปแล้ว — วางในไลน์กลุ่มได้เลย" : "ก็อปไม่สำเร็จ", ok ? "ok" : "warn")
            } catch {
              toast("ดึงสรุปไม่สำเร็จ", "error")
            }
          }}
        >
          <ClipboardList size={16} />
          ก็อปสรุปส่งไลน์
        </button>
        <a className="btn-ghost" href={`/api/session/${sessionId}/matches.csv`} download>
          <Download size={16} />
          ดาวน์โหลด CSV
        </a>
      </div>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn("text-ink-soft", bold && "font-heading font-semibold text-ink")}>{label}</span>
      <span className={cn("nums text-ink", bold && "font-heading font-semibold")}>{value}</span>
    </div>
  )
}
