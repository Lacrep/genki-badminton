import { useMemo } from "react"
import { CLUB } from "@shared/club"
import { promptPayPayload } from "@shared/promptpay"
import { baht, cn } from "@/lib/util"
import { qrPath } from "./QrCode"

/**
 * QR พร้อมเพย์ที่ฝังยอดเงินของคนนั้นไว้เลย — สแกนแล้วแอปธนาคารขึ้นจำนวนเงินให้
 * ไม่ต้องกรอกเอง จึงไม่มีโอนผิดยอด (ซึ่งเป็นงานตามเก็บที่เสียเวลาที่สุดของหัวก๊วน)
 *
 * วาดเป็น SVG เองจากโมดูลของ QR — คมทุกความละเอียด ไม่ต้องโหลดรูป
 * และยังใช้ได้ตอนเน็ตโรงยิมหลุด
 */
export function PromptPayQr({
  amount,
  size = 240,
  className,
}: {
  /** ยอดเงิน (บาท) — ไม่ใส่ = QR แบบให้กรอกยอดเอง */
  amount?: number
  size?: number
  className?: string
}) {
  const art = useMemo(() => buildQr(amount), [amount])

  // เลขพร้อมเพย์ในไฟล์ตั้งค่าใช้ไม่ได้ → ถอยไปใช้รูป QR ใบเดิมของก๊วน
  if (!art) {
    return (
      <img
        src={CLUB.payment.qrImage}
        alt="QR พร้อมเพย์ของก๊วน"
        className={cn("w-full max-w-[260px] rounded-washi shadow-card", className)}
      />
    )
  }

  const { path, count } = art
  const quiet = 2 // ขอบขาวรอบ QR ตามสเปก (ต้องมี ไม่งั้นบางแอปสแกนไม่ติด)
  const box = count + quiet * 2
  const logo = Math.round(count * 0.22)
  const logoPos = (count - logo) / 2

  return (
    <div
      className={cn("overflow-hidden rounded-washi border border-line bg-white shadow-card", className)}
      style={{ width: size }}
    >
      <div className="flex items-center justify-center gap-1.5 bg-navy py-1.5">
        <span className="font-heading text-[11px] font-semibold tracking-wide text-white">พร้อมเพย์</span>
        <span className="text-[10px] text-sand/70">PromptPay</span>
      </div>

      <svg viewBox={`0 0 ${box} ${box}`} width={size} height={size} role="img" aria-label="QR พร้อมเพย์">
        <rect width={box} height={box} fill="#ffffff" />
        <g transform={`translate(${quiet} ${quiet})`}>
          <path d={path} fill="#16265b" shapeRendering="crispEdges" />
          {/* เว้นที่ตรงกลางแล้ววางโลโก้ก๊วน — ใช้ระดับกันพลาดสูงสุดจึงยังสแกนติด */}
          <rect
            x={logoPos - 0.6}
            y={logoPos - 0.6}
            width={logo + 1.2}
            height={logo + 1.2}
            rx={1.2}
            fill="#ffffff"
          />
          <image href="/logo.webp" x={logoPos} y={logoPos} width={logo} height={logo} preserveAspectRatio="xMidYMid meet" />
        </g>
      </svg>

      <div className="border-t border-line/70 px-3 py-2 text-center">
        {typeof amount === "number" && amount > 0 ? (
          <p className="nums font-heading text-[17px] font-bold leading-tight text-navy">
            {baht(amount)} <span className="text-[12px] font-medium">บาท</span>
          </p>
        ) : (
          <p className="font-heading text-[12px] font-medium text-ink-soft">สแกนแล้วกรอกยอดเอง</p>
        )}
        <p className="truncate text-[11px] text-ink-faint">{CLUB.payment.name}</p>
      </div>
    </div>
  )
}

function buildQr(amount?: number): { path: string; count: number } | null {
  const payload = promptPayPayload(CLUB.payment.promptPayId, amount)
  if (!payload) return null
  // ระดับกันพลาด H = ทนโดนโลโก้บังตรงกลางได้
  return qrPath(payload, "H")
}
