import { describe, expect, it } from "vitest"
import { crc16, normalizePromptPayTarget, promptPayPayload } from "./promptpay"
import { CLUB } from "./club"

/**
 * payload ของ QR ใบจริงที่ก๊วนติดไว้ (ถอดจากรูปด้วยตัวอ่าน QR)
 * ใช้เป็นตัวตั้งว่าเลขบัญชีและสูตร CRC ที่เราสร้างตรงกับของจริง
 */
const CLUB_QR = "00020101021229370016A0000006770101110213110470009097653037645802TH6304D3EF"
/** ส่วนข้อมูลบัญชีพร้อมเพย์ในใบจริง (tag 29) */
const CLUB_MERCHANT = "29370016A00000067701011102131104700090976"

describe("crc16 — ตัวปิดท้าย payload", () => {
  it("คำนวณตรงกับ QR จริงของก๊วน", () => {
    const withoutCrc = CLUB_QR.slice(0, -4)
    expect(crc16(withoutCrc)).toBe("D3EF")
  })
})

describe("normalizePromptPayTarget", () => {
  it("เบอร์มือถือไทยแปลงเป็นรูปแบบสากล", () => {
    expect(normalizePromptPayTarget("081-234-5678")).toEqual({ type: "phone", value: "0066812345678" })
  })
  it("เลขบัตรประชาชน 13 หลักใช้ตามนั้น", () => {
    expect(normalizePromptPayTarget("1-1047-00090-97-6")).toEqual({ type: "nationalId", value: "1104700090976" })
  })
  it("เลข e-wallet 15 หลัก", () => {
    expect(normalizePromptPayTarget("012345678901234")?.type).toBe("ewallet")
  })
  it("เลขที่ไม่เข้ารูปแบบไหนเลย → null (หน้าเว็บจะถอยไปใช้ QR ใบเดิม)", () => {
    expect(normalizePromptPayTarget("12345")).toBeNull()
  })
})

describe("promptPayPayload", () => {
  it("ไม่ใส่ยอด → ได้ QR แบบกรอกยอดเอง ที่ชี้บัญชีเดียวกับใบจริง", () => {
    const payload = promptPayPayload(CLUB.payment.promptPayId)!
    expect(payload).toContain(CLUB_MERCHANT)
    expect(payload.startsWith("000201010211")).toBe(true) // 01 02 11 = static
    expect(crc16(payload.slice(0, -4))).toBe(payload.slice(-4))
  })

  it("เลขบัญชีที่เก็บไว้ตรงกับ QR ใบจริงของก๊วน", () => {
    expect(CLUB_QR).toContain(CLUB.payment.promptPayId)
  })

  it("ใส่ยอด → ฝังจำนวนเงินและเปลี่ยนเป็น QR ใช้ครั้งเดียว", () => {
    const payload = promptPayPayload(CLUB.payment.promptPayId, 89)!
    expect(payload.startsWith("000201010212")).toBe(true) // 01 02 12 = dynamic
    expect(payload).toContain("540589.00") // 54 05 "89.00"
    expect(payload.slice(-8, -4)).toBe("6304")
  })

  it("ยอดมีเศษสตางค์ก็ใส่ครบ", () => {
    expect(promptPayPayload(CLUB.payment.promptPayId, 88.75)).toContain("540588.75")
  })

  it("ยอดหลักพันความยาวฟิลด์ถูกต้อง", () => {
    expect(promptPayPayload(CLUB.payment.promptPayId, 1234.5)).toContain("54071234.50")
  })

  it("CRC ของ payload ที่มียอด ตรวจสอบย้อนได้", () => {
    const payload = promptPayPayload(CLUB.payment.promptPayId, 120)!
    expect(crc16(payload.slice(0, -4))).toBe(payload.slice(-4))
  })

  it("ยอด 0 หรือติดลบ → ถือว่าไม่มียอด (QR แบบกรอกเอง)", () => {
    const noAmount = promptPayPayload(CLUB.payment.promptPayId)
    expect(promptPayPayload(CLUB.payment.promptPayId, 0)).toBe(noAmount)
    expect(promptPayPayload(CLUB.payment.promptPayId, -5)).toBe(noAmount)
    expect(noAmount).not.toContain("5406")
  })

  it("เลขพร้อมเพย์ใช้ไม่ได้ → null", () => {
    expect(promptPayPayload("ไม่ใช่เลข", 100)).toBeNull()
  })
})
