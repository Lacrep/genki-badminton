/**
 * เช็คว่า Node ในเครื่องนี้ใหม่พอจะ build ได้ไหม — รันก่อน build ทุกครั้ง
 *
 * ทำไมต้องมี: Ubuntu แถม Node 12 มาให้ ส่วน Vite ต้องการ 20.19 ขึ้นไป
 * ถ้าปล่อยให้ไปตกเองจะได้ SyntaxError: Unexpected token '.' ซึ่งอ่านไม่ออกเลยว่า
 * เป็นเรื่องเวอร์ชัน Node (ที่จริงคือ Node เก่าอ่านโค้ดใหม่ ๆ ของ vite ไม่ออก)
 *
 * ไฟล์นี้ต้องรันได้บน Node เก่า ๆ ด้วย ไม่งั้นมันจะพังก่อนได้พิมพ์ข้อความออกมา
 * จึงตั้งใจเขียนแบบเชย ๆ: เป็น .cjs (รันได้ทุกเวอร์ชัน ไม่ต้องพึ่ง ESM)
 * และไม่ใช้ ?. · ?? · top-level await เลย
 */

var MIN_MAJOR = 20
var MIN_MINOR = 19

// รับเวอร์ชันทางอาร์กิวเมนต์ได้ เอาไว้ทดสอบว่าข้อความออกถูกไหม
var raw = process.argv[2] || process.versions.node
var parts = String(raw).split(".")
var major = parseInt(parts[0], 10) || 0
var minor = parseInt(parts[1], 10) || 0

var tooOld = major < MIN_MAJOR || (major === MIN_MAJOR && minor < MIN_MINOR)

if (tooOld) {
  var bold = function (s) {
    return "\u001b[1m" + s + "\u001b[0m"
  }
  var lines = [
    "",
    "\u001b[31m✗\u001b[0m Node ในเครื่องนี้เก่าเกินไป — build ไม่ได้",
    "",
    "  ตอนนี้มี  Node v" + raw,
    "  ต้องการ   Node v" + MIN_MAJOR + "." + MIN_MINOR + " ขึ้นไป (แนะนำ v22 LTS)",
    "",
    "  Ubuntu / Debian:",
    "    " + bold("curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"),
    "    " + bold("sudo apt-get install -y nodejs"),
    "",
    "  macOS (homebrew):",
    "    " + bold("brew install node@22"),
    "",
    "  Windows: โหลดตัวติดตั้งจาก " + bold("https://nodejs.org") + " (เลือก LTS)",
    "",
    "  ลงเสร็จแล้วเช็คด้วย " + bold("node -v") + " แล้วลง dependency ใหม่:",
    "    " + bold("rm -rf node_modules && npm ci"),
    "",
  ]
  console.error(lines.join("\n"))
  process.exit(1)
}
