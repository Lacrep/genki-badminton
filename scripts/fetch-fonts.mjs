import fs from "node:fs"
import path from "node:path"

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
const OUT = path.resolve(process.argv[2])
fs.mkdirSync(OUT, { recursive: true })

// เอาเฉพาะชุดอักษรที่เว็บนี้ใช้จริง — ไทย + ละติน (ไม่เอา cyrillic/greek/vietnamese)
const KEEP = new Set(["latin", "latin-ext", "thai"])

const jobs = [
  { css: "https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&display=swap", slug: "kanit", keep: KEEP },
  { css: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap", slug: "plexthai", keep: KEEP },
  // ญี่ปุ่นทั้งฟอนต์ใหญ่มาก แต่เราใช้แค่ "元気です" → ขอ Google ตัดมาให้เฉพาะตัวที่ใช้
  { css: "https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@600;800&text=" + encodeURIComponent("元気です"), slug: "shippori", keep: null },
]

const blocks = []
for (const job of jobs) {
  const res = await fetch(job.css, { headers: { "User-Agent": UA } })
  if (!res.ok) throw new Error(job.slug + " css " + res.status)
  const css = await res.text()
  // ชุดเต็มมีคอมเมนต์ชื่อชุดอักษรนำหน้าทุกบล็อก เช่น /* thai */
  // ส่วนชุดที่สั่งตัดด้วย &text= ไม่มีคอมเมนต์ → ตั้งชื่อชุดเป็น "text" เอง
  const re = /(?:\/\* ([a-z0-9-]+) \*\/\s*)?(@font-face \{[\s\S]*?\})/g
  let m
  let n = 0
  while ((m = re.exec(css))) {
    const subset = m[1] ?? "text"
    const face = m[2]
    if (job.keep && !job.keep.has(subset)) continue
    const family = /font-family: '([^']+)'/.exec(face)[1]
    const weight = /font-weight: (\d+)/.exec(face)[1]
    const url = /src: url\((https:[^)]+)\) format\('woff2'\)/.exec(face)[1]
    const range = /unicode-range: ([^;]+);/.exec(face)
    const file = `${job.slug}-${weight}-${subset}.woff2`
    const bin = await fetch(url, { headers: { "User-Agent": UA } })
    if (!bin.ok) throw new Error(file + " " + bin.status)
    fs.writeFileSync(path.join(OUT, file), Buffer.from(await bin.arrayBuffer()))
    blocks.push(
      `@font-face {\n  font-family: "${family}";\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url("/fonts/${file}") format("woff2");${range ? `\n  unicode-range: ${range[1]};` : ""}\n}`,
    )
    n++
  }
  console.log(job.slug, "→", n, "files")
}

const header = `/**
 * ฟอนต์เก็บไว้ในเครื่องเอง ไม่ดึงจาก Google Fonts
 *
 * ก๊วนเปิดเว็บนี้จากเครื่องหัวก๊วนในสนาม ซึ่งเน็ตสนามล่มบ่อย ถ้าฟอนต์ต้องโหลด
 * จากอินเทอร์เน็ต พอเน็ตไม่มา ตัวหนังสือจะเด้งไปใช้ฟอนต์ระบบ ขนาดเพี้ยนทั้งจอ
 * (จอใหญ่ข้างคอร์ตเห็นชัดสุด) ไฟล์นี้สร้างจาก scripts/fetch-fonts.mjs
 *
 * เอาเฉพาะชุดอักษรไทย+ละตินของ Kanit และ IBM Plex Sans Thai
 * ส่วน Shippori Mincho ตัดมาเฉพาะตัว "元気です" ที่ใช้ในโลโก้ ไฟล์เลยเล็กมาก
 */

`
fs.writeFileSync(path.resolve("src/fonts.css"), header + blocks.join("\n\n") + "\n")
console.log("wrote src/fonts.css —", blocks.length, "faces")
