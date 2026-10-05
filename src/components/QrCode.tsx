import { useMemo } from "react"
import qrcode from "qrcode-generator"
import { cn } from "@/lib/util"

/**
 * แปลงข้อความเป็น path เดียวของ SVG (รวมช่องดำที่ติดกันในแถวเดียวกันให้เป็น
 * สี่เหลี่ยมเดียว — ได้ path สั้นลงหลายเท่า เบราว์เซอร์วาดเร็วกว่า)
 *
 * @param ecc ระดับกันพลาด — "H" ถ้าจะเอาโลโก้ไปทับกลาง QR
 */
export function qrPath(text: string, ecc: "L" | "M" | "Q" | "H" = "M"): { path: string; count: number } {
  const qr = qrcode(0, ecc)
  qr.addData(text)
  qr.make()

  const count = qr.getModuleCount()
  let path = ""
  for (let row = 0; row < count; row++) {
    let start = -1
    for (let col = 0; col <= count; col++) {
      const dark = col < count && qr.isDark(row, col)
      if (dark && start < 0) start = col
      if (!dark && start >= 0) {
        path += `M${start} ${row}h${col - start}v1h-${col - start}z`
        start = -1
      }
    }
  }
  return { path, count }
}

/**
 * QR ของลิงก์ — ให้ลูกก๊วนส่องด้วยกล้องมือถือแทนการพิมพ์
 *
 * ที่โรงยิมลิงก์มักเป็นไอพีในวง Wi-Fi (http://192.168.1.20:3100/q/8VLN) ซึ่ง
 * พิมพ์ในมือถือแล้วผิดง่ายมาก ยื่นจอให้ส่องจบในสองวินาที และใช้ได้แม้เน็ตหลุด
 */
export function QrCode({
  text,
  size = 180,
  className,
  label,
}: {
  text: string
  size?: number
  className?: string
  /** ข้อความสำหรับโปรแกรมอ่านหน้าจอ */
  label?: string
}) {
  const { path, count } = useMemo(() => qrPath(text), [text])

  const quiet = 2 // ขอบขาวรอบ QR ตามสเปก (ต้องมี ไม่งั้นบางแอปสแกนไม่ติด)
  const box = count + quiet * 2

  return (
    <svg
      viewBox={`0 0 ${box} ${box}`}
      width={size}
      height={size}
      role="img"
      aria-label={label ?? "QR ของลิงก์"}
      className={cn("rounded-xl border border-line bg-white shadow-card", className)}
    >
      <rect width={box} height={box} fill="#ffffff" />
      <path d={path} fill="#16265b" shapeRendering="crispEdges" transform={`translate(${quiet} ${quiet})`} />
    </svg>
  )
}
