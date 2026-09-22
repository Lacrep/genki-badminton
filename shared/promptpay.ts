/**
 * สร้าง payload ของ QR พร้อมเพย์ (มาตรฐาน EMVCo / Thai QR Payment)
 *
 * QR ใบเดียวที่ก๊วนติดไว้เป็นแบบ "static" — สแกนแล้วต้องพิมพ์ยอดเอง
 * ไฟล์นี้สร้าง payload แบบ "dynamic" ที่ฝังยอดเงินไว้ในตัว QR เลย
 * คนสแกนจะเห็นจำนวนเงินขึ้นมาให้ ไม่ต้องกรอก → ไม่มีโอนผิดยอด
 *
 * โครงสร้าง: แต่ละฟิลด์คือ <tag 2 หลัก><ความยาว 2 หลัก><ค่า>
 *   00 ชนิด payload · 01 static/dynamic · 29 ข้อมูลบัญชีพร้อมเพย์
 *   53 สกุลเงิน (764 = บาท) · 54 จำนวนเงิน · 58 ประเทศ · 63 CRC ปิดท้าย
 */

const ID_PAYLOAD_FORMAT = "00"
const ID_POI_METHOD = "01"
const ID_MERCHANT_PROMPTPAY = "29"
const ID_CURRENCY = "53"
const ID_AMOUNT = "54"
const ID_COUNTRY = "58"
const ID_CRC = "63"

const PROMPTPAY_AID = "A000000677010111"
const CURRENCY_THB = "764"
const COUNTRY_TH = "TH"

/** static = สแกนแล้วกรอกยอดเอง · dynamic = ยอดฝังมากับ QR */
const POI_STATIC = "11"
const POI_DYNAMIC = "12"

function field(id: string, value: string): string {
  return id + String(value.length).padStart(2, "0") + value
}

export type PromptPayTargetType = "phone" | "nationalId" | "ewallet"

export interface PromptPayTarget {
  type: PromptPayTargetType
  /** ค่าที่ใส่ลง QR แล้ว (เบอร์เป็นรูปแบบสากล 13 หลัก) */
  value: string
}

/**
 * แปลงเบอร์โทร / เลขบัตรประชาชน / เลข e-wallet ให้อยู่ในรูปที่ QR ต้องการ
 * - เบอร์ 10 หลัก (0812345678) → 0066812345678
 * - บัตรประชาชน 13 หลัก → ใช้ตามนั้น
 * - e-wallet 15 หลัก → ใช้ตามนั้น
 */
export function normalizePromptPayTarget(raw: string): PromptPayTarget | null {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10 && digits.startsWith("0")) {
    return { type: "phone", value: `0066${digits.slice(1)}` }
  }
  if (digits.length === 13 && digits.startsWith("66")) {
    return { type: "phone", value: `00${digits}` }
  }
  if (digits.length === 13) return { type: "nationalId", value: digits }
  if (digits.length === 15) return { type: "ewallet", value: digits }
  return null
}

const TARGET_TAG: Record<PromptPayTargetType, string> = {
  phone: "01",
  nationalId: "02",
  ewallet: "03",
}

/**
 * CRC-16/CCITT-FALSE — ตัวปิดท้าย payload ตามสเปก EMVCo
 * (poly 0x1021, เริ่มที่ 0xFFFF, ไม่กลับบิต, ไม่ xor ตอนจบ)
 */
export function crc16(input: string): string {
  let crc = 0xffff
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0")
}

/**
 * สร้าง payload ของ QR พร้อมเพย์
 * ใส่ amountBaht = ยอดเงิน (บาท) เพื่อให้ QR ฝังยอด — ไม่ใส่ = QR แบบกรอกยอดเอง
 */
export function promptPayPayload(rawTarget: string, amountBaht?: number): string | null {
  const target = normalizePromptPayTarget(rawTarget)
  if (!target) return null

  const hasAmount = typeof amountBaht === "number" && Number.isFinite(amountBaht) && amountBaht > 0

  const merchant = field(ID_MERCHANT_PROMPTPAY, field("00", PROMPTPAY_AID) + field(TARGET_TAG[target.type], target.value))

  const body =
    field(ID_PAYLOAD_FORMAT, "01") +
    field(ID_POI_METHOD, hasAmount ? POI_DYNAMIC : POI_STATIC) +
    merchant +
    field(ID_CURRENCY, CURRENCY_THB) +
    (hasAmount ? field(ID_AMOUNT, amountBaht.toFixed(2)) : "") +
    field(ID_COUNTRY, COUNTRY_TH)

  // CRC คิดรวม "6304" ที่อยู่ข้างหน้าค่า CRC เองด้วย
  const withCrcTag = `${body}${ID_CRC}04`
  return withCrcTag + crc16(withCrcTag)
}
