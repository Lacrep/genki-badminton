/**
 * ตัวห่อบางของ scripts/git-autosync.mjs สำหรับให้โค้ดฝั่ง TypeScript เรียกใช้
 *
 * ตรรกะจริงทั้งหมดอยู่ใน scripts/git-autosync.mjs ไฟล์เดียว (ใช้ร่วมกับ
 * scripts/start.mjs ตอน clone ข้อมูลก่อนเริ่มเซิร์ฟเวอร์) ไฟล์นี้แค่ import ซ้ำ
 * มาให้ store.ts / boot.ts เรียกตอนรันจริงได้แบบมี type
 */
// @ts-expect-error — ไฟล์ .mjs ไม่มี type declaration แยก ใช้ของจริงตรง ๆ ได้แต่ tsc มองไม่เห็น type
export { markDataDirty, flushBeforeShutdown, isEnabled } from "../scripts/git-autosync.mjs"
