#!/usr/bin/env node
/**
 * จุดเริ่มของ `npm start` — ปกติแค่โหลด dist/boot.js ตรง ๆ
 *
 * ถ้าเปิด GIT_AUTOSYNC=1 ไว้ (ใช้ตอนรันบนโฮสต์ที่ดิสก์ไม่ถาวร เช่น Render free)
 * จะ clone ข้อมูลล่าสุดจาก git มาไว้ในโฟลเดอร์ชั่วคราวก่อน แล้วตั้ง DATA_DIR ให้ชี้
 * ไปที่นั่น ก่อนค่อยโหลดตัวเซิร์ฟเวอร์จริง — ต้องทำก่อนเสมอ เพราะ api/store.ts
 * จะอ่านค่า DATA_DIR ตั้งแต่บรรทัดแรกที่ถูก import
 *
 * ปิดอยู่เป็นค่าเริ่มต้น (ไม่ตั้ง GIT_AUTOSYNC) จึงข้ามขั้นตอนนี้ไปเลย พฤติกรรม
 * เหมือน `node dist/boot.js` ตรง ๆ ทุกประการ — ไม่กระทบคนที่รันแบบเดิมอยู่แล้ว
 */
import { cloneData, isEnabled } from "./git-autosync.mjs"

if (isEnabled()) {
  try {
    const dataDir = await cloneData()
    process.env.DATA_DIR = dataDir
  } catch (err) {
    console.error(`\n✗ ${err?.message || err}\n`)
    process.exit(1)
  }
}

await import("../dist/boot.js")
