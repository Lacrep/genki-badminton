import { useEffect, useState } from "react"
import { Ban, Check, ClipboardList, Download, FileSpreadsheet, QrCode, Receipt, Volleyball, Wallet } from "lucide-react"
import { type BillLine, type FeeMode, FEE_MODE_LABEL, displayName, thaiTime } from "@shared/types"
import { CLUB } from "@shared/club"
import { api } from "@/lib/api"
import { useApp, useSession } from "@/lib/app"
import { Modal, Segmented, Stat, Stepper } from "@/components/ui"
import { PlayerAvatar } from "@/components/player"
import { PromptPayQr } from "@/components/PromptPayQr"
import { baht, cn, copyText } from "@/lib/util"

/** ตัวเลขที่เชื่อถือได้ — ถ้าเซิร์ฟเวอร์ (เวอร์ชันเก่า) ไม่ได้ส่งมา ให้เป็น 0 แทนที่จะพังทั้งหน้า */
const nz = (v: number | undefined | null): number => (typeof v === "number" && Number.isFinite(v) ? v : 0)

/** ที่มาของยอดคนนี้ แยกเป็นก้อน ๆ */
function feeBreakdown(line: BillLine, long = false): string {
  const parts = [line.noCourtFee ? "ยกเว้นค่าสนาม" : `${long ? "ค่าสนาม" : "สนาม"} ${baht(nz(line.courtPart))}`]
  if (nz(line.shuttlePart) > 0) parts.push(`${long ? "ค่าลูก" : "ลูก"} ${baht(nz(line.shuttlePart))}`)
  if (nz(line.extraPart) > 0) parts.push(`${long ? "อื่น ๆ" : "อื่น"} ${baht(nz(line.extraPart))}`)
  return parts.join(" + ")
}

export function BillPage() {
  const { view, sessionId } = useSession()
  const { run, toast, needPin } = useApp()
  const fees = view.session.fees
  const bill = view.bill
  const canControl = !needPin

  const [courtFeePerHead, setCourtFeePerHead] = useState(String(fees.courtFeePerHead))
  const [shuttlePrice, setShuttlePrice] = useState(String(fees.shuttlePrice))
  const [shuttleCostTotal, setShuttleCostTotal] = useState(String(fees.shuttleCostTotal))
  const [courtCost, setCourtCost] = useState(String(fees.courtCost))
  const [extraCost, setExtraCost] = useState(String(fees.extraCost))
  const [extraNote, setExtraNote] = useState(fees.extraNote ?? "")
  const [collecting, setCollecting] = useState<BillLine | null>(null)
  const [showQr, setShowQr] = useState(false)

  // ถ้าเครื่องอื่นแก้ค่าใช้จ่าย ให้ช่องกรอกตามไปด้วย
  useEffect(() => {
    setCourtFeePerHead(String(fees.courtFeePerHead))
    setShuttlePrice(String(fees.shuttlePrice))
    setShuttleCostTotal(String(fees.shuttleCostTotal))
    setCourtCost(String(fees.courtCost))
    setExtraCost(String(fees.extraCost))
    setExtraNote(fees.extraNote ?? "")
  }, [fees.courtFeePerHead, fees.shuttlePrice, fees.shuttleCostTotal, fees.courtCost, fees.extraCost, fees.extraNote])

  const saveFees = (patch: Record<string, unknown>) =>
    void run("บันทึกค่าใช้จ่ายแล้ว", () => api.updateSession(sessionId, { fees: patch }), { silent: true })

  const num = (s: string) => {
    const n = Number(s.replace(/[^0-9.]/g, ""))
    return Number.isFinite(n) ? n : 0
  }

  const unpaid = bill.lines.filter((l) => !l.paid)
  const playedMatches = [...view.session.matches]
    .filter((m) => m.endedAt)
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
  const missingShuttles = playedMatches.filter((m) => m.shuttles === 0).length
  const setPaid = (playerId: string, paid: boolean) =>
    run(paid ? "รับเงินแล้ว" : "ยกเลิกการจ่าย", () => api.paid(sessionId, playerId, paid), { silent: true })
  const waived = bill.lines.filter((l) => l.noCourtFee).length
  const payingCourt = bill.lines.length - waived
  /** หัวก๊วนที่ลงไปตีเองมักไม่เก็บค่าสนามตัวเอง — เก็บแต่ค่าลูก */
  const setCourtFee = (playerId: string, noCourtFee: boolean) =>
    run(noCourtFee ? "ยกเว้นค่าสนามให้แล้ว" : "กลับมาคิดค่าสนามแล้ว", () =>
      api.courtFee(sessionId, playerId, noCourtFee),
    )

  return (
    <div className="flex flex-col gap-4">
      {/* สรุปเงิน */}
      <div className="card card-pad">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="ต้องเก็บรวม"
            value={`${baht(bill.billed)} ฿`}
            hint={`${bill.lines.length} คน · ลูกที่ใช้ ${bill.shuttlesUsed}`}
          />
          <Stat
            label="เก็บแล้ว"
            value={`${baht(bill.collected)} ฿`}
            hint={`${bill.lines.length - unpaid.length}/${bill.lines.length} คน`}
            tone="gold"
          />
          <Stat label="ยังไม่จ่าย" value={`${baht(bill.billed - bill.collected)} ฿`} tone="red" hint={`${unpaid.length} คน`} />
          {/* บอกกำไร/ขาดทุนได้ต่อเมื่อรู้ต้นทุนจริง — ไม่กรอกก็อย่าเดาให้ */}
          <Stat
            label={!bill.costTracked || bill.balance >= 0 ? "เหลือเข้าก๊วน" : "ขาดอยู่"}
            value={bill.costTracked ? `${baht(Math.abs(bill.balance))} ฿` : "—"}
            tone={bill.costTracked && bill.balance < 0 ? "red" : "gold"}
            hint={bill.costTracked ? "ยอดที่เก็บ − ต้นทุนจริง" : "กรอกต้นทุนด้านล่างเพื่อดูยอดนี้"}
          />
        </div>
      </div>

      {/* วิธีคิดเงิน */}
      <section className="card card-pad flex flex-col gap-3.5">
        <h2 className="section-title">
          <Wallet size={15} className="text-gold-deep" />
          วิธีคิดเงิน
        </h2>

        <Segmented
          value={fees.mode}
          onChange={(mode: FeeMode) => saveFees({ mode })}
          options={(Object.keys(FEE_MODE_LABEL) as FeeMode[]).map((m) => ({ value: m, label: FEE_MODE_LABEL[m] }))}
        />
        <p className="text-[12px] leading-snug text-ink-faint">
          {fees.mode === "club"
            ? `เก็บค่าสนามเท่ากันทุกคน ส่วนค่าลูกคิดเฉพาะคนที่ลงเกมนั้น — เกมที่ใช้ 1 ลูก ทั้ง 4 คนจ่ายคนละ ${baht(fees.shuttlePrice)} บาท`
            : `รวม 3 ยอด (ค่าสนามทั้งหมด + ค่าลูกทั้งหมด + ค่าอื่น ๆ) แล้วหารด้วยจำนวนคนที่มาวันนี้ ${bill.lines.length} คน — ไม่สนว่าใครลงกี่เกม`}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {fees.mode === "club" ? (
            <>
              <div>
                <label className="label" htmlFor="b-perhead">
                  ค่าสนาม คนละ (บาท)
                </label>
                <input
                  id="b-perhead"
                  className="input nums"
                  inputMode="numeric"
                  value={courtFeePerHead}
                  disabled={!canControl}
                  onChange={(e) => setCourtFeePerHead(e.target.value)}
                  onBlur={() => saveFees({ courtFeePerHead: num(courtFeePerHead) })}
                />
              </div>

              <div>
                <label className="label" htmlFor="b-shuttle">
                  ค่าลูก เก็บคนละ (บาท/ลูก)
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
                <p className="mt-1 text-[11.5px] text-ink-faint">
                  เกมที่ใช้ 1 ลูก ทั้ง 4 คนจ่ายคนละเท่านี้ · ลูกที่ก๊วนใช้: {CLUB.shuttle}
                </p>
              </div>

              {/* สองช่องนี้คือ "ต้นทุน" ไม่ใช่ยอดที่เก็บ — ใส่เมื่ออยากรู้ว่าก๊วนเหลือเท่าไร */}
              <div>
                <label className="label" htmlFor="b-courtreal">
                  ค่าสนามที่จ่ายจริงทั้งวัน (ใส่หรือไม่ใส่ก็ได้)
                </label>
                <input
                  id="b-courtreal"
                  className="input nums"
                  inputMode="numeric"
                  placeholder="0"
                  value={courtCost}
                  disabled={!canControl}
                  onChange={(e) => setCourtCost(e.target.value)}
                  onBlur={() => saveFees({ courtCost: num(courtCost) })}
                />
              </div>

              <div>
                <label className="label" htmlFor="b-shuttletotal">
                  ค่าลูกที่จ่ายจริงทั้งวัน (ใส่หรือไม่ใส่ก็ได้)
                </label>
                <input
                  id="b-shuttletotal"
                  className="input nums"
                  inputMode="numeric"
                  placeholder="0"
                  value={shuttleCostTotal}
                  disabled={!canControl}
                  onChange={(e) => setShuttleCostTotal(e.target.value)}
                  onBlur={() => saveFees({ shuttleCostTotal: num(shuttleCostTotal) })}
                />
                <p className="mt-1 text-[11.5px] text-ink-faint">
                  สองช่องบนนี้คือต้นทุนที่ก๊วนจ่ายออกไปจริง ใส่แล้วจะรู้ว่าวันนี้เหลือหรือขาดเท่าไร
                </p>
              </div>
            </>
          ) : (
            <>
              {/* หารเท่า: กรอกแค่ยอดรวม 3 ก้อน แล้วหารจำนวนคนที่มาวันนั้น */}
              <div>
                <label className="label" htmlFor="b-courttotal">
                  ค่าสนามทั้งหมด (บาท)
                </label>
                <input
                  id="b-courttotal"
                  className="input nums"
                  inputMode="numeric"
                  value={courtCost}
                  disabled={!canControl}
                  onChange={(e) => setCourtCost(e.target.value)}
                  onBlur={() => saveFees({ courtCost: num(courtCost) })}
                />
              </div>

              <div>
                <label className="label" htmlFor="b-shuttletotal">
                  ค่าลูกทั้งหมด (บาท)
                </label>
                <input
                  id="b-shuttletotal"
                  className="input nums"
                  inputMode="numeric"
                  value={shuttleCostTotal}
                  disabled={!canControl}
                  onChange={(e) => setShuttleCostTotal(e.target.value)}
                  onBlur={() => saveFees({ shuttleCostTotal: num(shuttleCostTotal) })}
                />
                <p className="mt-1 text-[11.5px] text-ink-faint">
                  ยอดรวมค่าลูกที่ใช้ไปทั้งวัน ไม่ต้องนับเป็นลูก
                </p>
              </div>
            </>
          )}

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

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-2">
            <span>
              <span className="block font-heading text-[13.5px] text-ink">ปัดเศษขึ้นทีละ</span>
              <span className="block text-[11.5px] text-ink-faint">เก็บเงินง่าย ไม่ต้องทอนเศษ</span>
            </span>
            <Stepper value={fees.roundTo} onChange={(roundTo) => saveFees({ roundTo })} min={1} max={50} suffix="฿" />
          </div>
        </div>
      </section>

      {/* ใบเสร็จรายคน */}
      <section className="card card-pad">
        <h2 className="section-title mb-1">
          <Receipt size={15} className="text-gold-deep" />
          คนละเท่าไร ({bill.lines.length} คน)
        </h2>
        <p className="mb-3 text-[11.5px] leading-snug text-ink-faint">
          แตะที่ชื่อเพื่อเปิด QR พร้อมยอดของคนนั้น · ปุ่ม <Ban size={11} className="inline -mt-0.5" /> คือ
          ไม่คิดค่าสนามคนนั้น (เก็บแต่ค่าลูก) สำหรับหัวก๊วนที่ลงไปตีเอง
        </p>

        <div className="flex flex-col">
          {bill.lines.map((l) => {
            const player = view.roster.find((p) => p.id === l.playerId)
            const sp = view.session.players.find((p) => p.playerId === l.playerId)
            return (
              <div key={l.playerId} className="receipt-row">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  onClick={() => setCollecting(l)}
                >
                  {player ? <PlayerAvatar player={player} size={30} /> : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-heading text-[14px] font-medium text-ink">{l.name}</span>
                    <span className="block truncate text-[11.5px] text-ink-faint">
                      {l.games} เกม
                      {sp && sp.wins + sp.losses + sp.draws > 0
                        ? ` · ชนะ ${sp.wins}${sp.draws > 0 ? ` เสมอ ${sp.draws}` : ""} แพ้ ${sp.losses}`
                        : ""}
                    </span>
                    {/* ที่มาของยอดอยู่บรรทัดของตัวเอง — ยัดรวมบรรทัดเดียวแล้วโดนตัดหายบนจอมือถือ */}
                    {view.session.fees.mode === "club" ? (
                      <span className="block text-[11px] leading-snug text-ink-faint/80">{feeBreakdown(l)}</span>
                    ) : l.noCourtFee ? (
                      <span className="block text-[11px] leading-snug text-ink-faint/80">ยกเว้นค่าสนาม</span>
                    ) : null}
                  </span>
                </button>
                <span className="nums font-heading text-[15px] font-semibold text-ink">{baht(l.amount)} ฿</span>
                <button
                  type="button"
                  disabled={!canControl}
                  onClick={() => void setCourtFee(l.playerId, !l.noCourtFee)}
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all",
                    l.noCourtFee
                      ? "border-navy bg-navy text-sand dark:border-gold-soft dark:bg-navy-soft dark:text-gold-soft"
                      : "border-line bg-surface text-ink-faint hover:bg-subtle",
                  )}
                  title={l.noCourtFee ? "ยกเว้นค่าสนามอยู่ — กดเพื่อกลับมาคิด" : "ไม่คิดค่าสนามคนนี้ (เก็บแต่ค่าลูก)"}
                  aria-label={l.noCourtFee ? "ยกเว้นค่าสนามอยู่" : "ไม่คิดค่าสนามคนนี้"}
                  aria-pressed={l.noCourtFee}
                >
                  <Ban size={15} />
                </button>
                <button
                  type="button"
                  disabled={!canControl}
                  onClick={() => void setPaid(l.playerId, !l.paid)}
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all",
                    l.paid ? "border-gold bg-gold text-navy-deep" : "border-line bg-surface text-ink-faint hover:bg-subtle",
                  )}
                  aria-label={l.paid ? "จ่ายแล้ว" : "ยังไม่จ่าย"}
                >
                  <Check size={16} />
                </button>
              </div>
            )
          })}
          {bill.lines.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-ink-faint">ยังไม่มีใครเช็คอิน</p>
          ) : null}
        </div>

        <div className="mt-3 flex flex-col gap-1 border-t border-line pt-3 text-[13px]">
          {fees.mode === "club" ? (
            <>
              {/* นับเฉพาะคนที่คิดค่าสนามจริง — มีคนถูกยกเว้น ยอดบรรทัดนี้ต้องลดตาม */}
              <Row
                label={`ค่าสนาม ${baht(fees.courtFeePerHead)} × ${payingCourt} คน${
                  waived > 0 ? ` (ยกเว้น ${waived} คน)` : ""
                }`}
                value={`${baht(fees.courtFeePerHead * payingCourt)} ฿`}
              />
              <Row label={`ค่าลูกที่เก็บได้ (ใช้ ${bill.shuttlesUsed} ลูก)`} value={`${baht(bill.shuttleCharged)} ฿`} />
            </>
          ) : (
            <>
              {/* หารเท่า: โชว์ 3 ยอดที่กรอกไว้ตรง ๆ จะได้ตรวจทานง่าย */}
              <Row label="ค่าสนามทั้งหมด" value={`${baht(bill.courtCost)} ฿`} />
              <Row label="ค่าลูกทั้งหมด" value={`${baht(bill.shuttleCost)} ฿`} />
            </>
          )}
          {bill.extraCost > 0 ? <Row label={fees.extraNote || "ค่าอื่น ๆ"} value={`${baht(bill.extraCost)} ฿`} /> : null}
          {fees.mode === "equal" ? (
            <Row label={`หาร ${bill.lines.length} คน`} value={`คนละ ${baht(bill.lines[0]?.amount ?? 0)} ฿`} />
          ) : null}
          <Row label="ยอดที่ต้องเก็บรวม" value={`${baht(bill.billed)} ฿`} bold />
          {bill.costTracked && fees.mode === "club" ? (
            <Row label="ต้นทุนจริงที่จ่ายไป" value={`${baht(bill.total)} ฿`} />
          ) : null}
        </div>
      </section>

      {/* ค่าลูกรายเกม — ให้เห็นว่าเงินค่าลูกไปลงที่ใครบ้าง และแก้ย้อนหลังได้ */}
      {fees.mode === "club" ? (
        <section className="card card-pad">
          <h2 className="section-title mb-1">
            <Volleyball size={15} className="text-gold-deep" />
            ค่าลูกรายเกม ({playedMatches.length} เกม)
          </h2>
          <p className="mb-3 text-[11.5px] leading-snug text-ink-faint">
            คนที่ลงเกมนั้นจ่ายค่าลูก <b>คนละ {baht(fees.shuttlePrice)} บาทต่อลูก</b> — เกมที่ใช้ 1 ลูก
            ทั้ง 4 คนจ่ายคนละ {baht(fees.shuttlePrice)} บาท · แก้จำนวนลูกย้อนหลังได้ที่นี่
          </p>

          {missingShuttles > 0 ? (
            <div className="mb-3 rounded-xl border border-gold/60 bg-gold/[0.12] px-3 py-2.5 text-[12.5px] leading-snug text-ink">
              มี {missingShuttles} เกมที่ยังไม่ได้ใส่จำนวนลูก — ค่าลูกของเกมนั้นจะยังไม่ถูกคิดให้ใคร
              ใส่จำนวนได้ที่รายการด้านล่าง
            </div>
          ) : null}

          <div className="flex flex-col divide-y divide-line/60">
            {playedMatches.map((m) => {
              const names = [...m.teamA, ...m.teamB].map((pid) => {
                const p = view.roster.find((r) => r.id === pid)
                return p ? displayName(p) : "—"
              })
              return (
                <div key={m.id} className="flex items-center gap-2.5 py-2">
                  <span className="nums shrink-0 text-[11.5px] text-ink-faint">{thaiTime(m.endedAt ?? m.startedAt)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">
                      {names.slice(0, 2).join(" + ")}
                      <span className="mx-1 text-ink-faint">vs</span>
                      {names.slice(2).join(" + ")}
                    </span>
                    <span className="block text-[11px] text-ink-faint">
                      {m.shuttles > 0
                        ? `คนละ ${baht(m.shuttles * fees.shuttlePrice)} บาท`
                        : "ยังไม่ได้ใส่จำนวนลูก"}
                    </span>
                  </span>
                  <Stepper
                    value={m.shuttles}
                    onChange={(v) =>
                      void run("", () => api.shuttles(sessionId, v - m.shuttles, m.id), { silent: true })
                    }
                    max={20}
                    suffix="ลูก"
                  />
                </div>
              )
            })}
            {playedMatches.length === 0 ? (
              <p className="py-3 text-center text-[13px] text-ink-faint">ยังไม่มีเกมที่จบ</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* QR พร้อมเพย์ */}
      <section className="card card-pad flex flex-col items-center gap-2">
        <h2 className="section-title w-full">
          <QrCode size={15} className="text-gold-deep" />
          สแกนจ่ายค่าก๊วน
        </h2>
        <button type="button" onClick={() => setShowQr(true)} className="mt-1">
          <img
            src={CLUB.payment.qrImage}
            alt="QR พร้อมเพย์ของก๊วน"
            className="w-56 rounded-washi border border-line shadow-card transition-transform hover:scale-[1.02]"
          />
        </button>
        <p className="text-center font-heading text-[13.5px] font-medium text-ink">{fees.promptPay || CLUB.payment.name}</p>
        <p className="text-center text-[12px] text-ink-faint">{CLUB.payment.bank} · แตะรูปเพื่อขยาย</p>
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
        <a className="btn-ghost" href={`/api/session/${sessionId}/bill.xlsx`} download>
          <FileSpreadsheet size={16} />
          ไฟล์ Excel
        </a>
        <a className="btn-ghost" href={`/api/session/${sessionId}/matches.csv`} download>
          <Download size={16} />
          CSV รายเกม
        </a>
      </div>
      <p className="-mt-1 text-center text-[11.5px] text-ink-faint">
        ไฟล์ Excel มี 4 ชีต — ยอดรายคน · คนที่ยังค้าง · ที่มาของค่าลูกรายเกม · สรุปทั้งก๊วน
      </p>

      {/* เก็บเงินรายคน */}
      {collecting ? (
        <CollectModal
          line={collecting}
          promptPay={fees.promptPay || CLUB.payment.name}
          mode={fees.mode}
          canControl={canControl}
          onClose={() => setCollecting(null)}
          onPaid={async () => {
            await setPaid(collecting.playerId, !collecting.paid)
            setCollecting(null)
          }}
          onToggleCourtFee={async () => {
            await setCourtFee(collecting.playerId, !collecting.noCourtFee)
            setCollecting(null)
          }}
        />
      ) : null}

      {showQr ? (
        <Modal open onClose={() => setShowQr(false)} title="QR พร้อมเพย์ของก๊วน" subtitle={CLUB.payment.bank}>
          <div className="flex flex-col items-center gap-2">
            <img src={CLUB.payment.qrImage} alt="QR พร้อมเพย์ของก๊วน" className="w-full max-w-sm rounded-washi" />
            <p className="font-heading text-[14px] font-medium text-ink">{fees.promptPay || CLUB.payment.name}</p>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

function CollectModal({
  line,
  promptPay,
  mode,
  canControl,
  onClose,
  onPaid,
  onToggleCourtFee,
}: {
  line: BillLine
  promptPay: string
  mode: FeeMode
  canControl: boolean
  onClose: () => void
  onPaid: () => void
  onToggleCourtFee: () => void
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={`เก็บเงิน ${line.name}`}
      subtitle={`ลง ${line.games} เกม`}
      footer={
        canControl ? (
          <div className="flex w-full flex-col gap-2">
            <button className={cn("btn-lg w-full", line.paid ? "btn-ghost" : "btn-gold")} onClick={onPaid}>
              <Check size={18} />
              {line.paid ? "ยกเลิกว่าจ่ายแล้ว" : "รับเงินแล้ว"}
            </button>
            {/* ยกเว้นค่าสนามใช้ได้ทั้งสองโหมด — โหมดหารเท่าก็หักส่วนค่าสนามออกให้เหมือนกัน */}
            <button className="btn-quiet w-full !text-[12.5px]" onClick={onToggleCourtFee}>
              <Ban size={15} />
              {line.noCourtFee ? "กลับมาคิดค่าสนามคนนี้" : "ไม่คิดค่าสนามคนนี้ (เก็บแต่ค่าลูก)"}
            </button>
          </div>
        ) : null
      }
    >
      <div className="flex flex-col items-center gap-3">
        <div className="text-center">
          <p className="font-heading text-[12.5px] text-ink-soft">ยอดที่ต้องจ่าย</p>
          <p className="nums font-heading text-[42px] font-bold leading-none text-navy dark:text-gold-soft">
            {baht(line.amount)}
            <span className="ml-1 text-[18px] font-medium">บาท</span>
          </p>
          {mode === "club" ? (
            <p className="mt-1 text-[12px] text-ink-faint">{feeBreakdown(line, true)}</p>
          ) : null}
        </div>

        <PromptPayQr amount={line.amount} size={250} />
        <p className="text-center font-heading text-[13.5px] font-medium text-ink">{promptPay}</p>
        {/* ยอด 0 ผูกลงใน QR ไม่ได้ อย่าบอกว่าผูกไว้แล้วทั้งที่ไม่ได้ผูก */}
        <p className="text-center text-[12px] leading-snug text-ink-faint">
          {line.amount > 0
            ? `QR นี้ผูกยอด ${baht(line.amount)} บาทไว้แล้ว — สแกนแล้วแอปธนาคารขึ้นจำนวนเงินให้เลย`
            : "คนนี้ไม่มียอดต้องเก็บ — กด “รับเงินแล้ว” เพื่อปิดยอดได้เลย"}
        </p>
      </div>
    </Modal>
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
