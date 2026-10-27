#!/usr/bin/env node
/**
 * เก็บข้อมูลก๊วนขึ้น git — ใช้:  npm run save-data
 *
 * ทำไมต้องมีสคริปต์แทนที่จะพิมพ์ git เอง 3 คำสั่ง
 *
 * 1. กันเผลอดันข้อมูลขึ้น repo ที่เป็น public — ข้างใน data/ มีรูปหน้าและชื่อลูกก๊วน
 *    ถ้าหลุดขึ้น public แล้วลบทีหลังก็ไม่หายจริง (ยังอยู่ใน history กับ fork ของคนอื่น)
 *    สคริปต์จึงถาม GitHub ก่อนทุกครั้งว่า repo นี้ private จริงไหม ไม่ private = ไม่ push
 * 2. ดึงของใหม่จากเครื่องอื่นลงมาก่อนเสมอ — กัน conflict ที่แก้ยากในไฟล์ JSON
 * 3. ใช้คำสั่งเดียวจบ จะได้กดหลังจบก๊วนทุกครั้งโดยไม่ต้องจำอะไร
 */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"

const ROOT = path.resolve(import.meta.dirname, "..")
const OK_FILE = path.join(ROOT, ".data-in-git-ok")
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || "./data")

const c = {
  dim: (s) => `\u001b[2m${s}\u001b[0m`,
  red: (s) => `\u001b[31m${s}\u001b[0m`,
  green: (s) => `\u001b[32m${s}\u001b[0m`,
  gold: (s) => `\u001b[33m${s}\u001b[0m`,
  bold: (s) => `\u001b[1m${s}\u001b[0m`,
}

function git(args, opts = {}) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", ...opts }).trim()
}

function fail(msg, hint) {
  console.error(`\n${c.red("✗")} ${msg}`)
  if (hint) console.error(`\n${hint}\n`)
  process.exit(1)
}

// ── 1. มีข้อมูลให้เก็บไหม ────────────────────────────────────────────────────

if (!fs.existsSync(DATA_DIR)) {
  fail(`ไม่เจอโฟลเดอร์ข้อมูลที่ ${DATA_DIR}`, `สั่ง ${c.bold("npm run find-data")} เพื่อหาว่าโฟลเดอร์ data อยู่ตรงไหน`)
}

let remoteUrl = ""
try {
  remoteUrl = git(["remote", "get-url", "origin"])
} catch {
  fail("repo นี้ยังไม่ได้ผูกกับ GitHub", "ตั้ง remote ก่อน: git remote add origin <ลิงก์ repo>")
}

const slug = /github\.com[/:]([^/]+\/[^/.]+)/.exec(remoteUrl)?.[1]
if (!slug) fail(`อ่านชื่อ repo จาก remote ไม่ออก: ${remoteUrl}`)

// ── 2. repo เป็น private จริงไหม ─────────────────────────────────────────────
//
// เช็คแบบไม่ต้องล็อกอิน: repo ที่เป็น public ตอบ 200 ส่วน private ตอบ 404
// (คนที่ไม่ได้ล็อกอินมองไม่เห็น) จึงใช้แยกได้โดยไม่ต้องมี token
//
// แต่ดูแค่รหัสตอบกลับอย่างเดียวไม่พอ — บางเครื่องต่อเน็ตผ่าน proxy ที่แนบ credential
// ให้เอง repo ที่เป็น private เลยตอบ 200 กลับมาด้วย ถ้าเชื่อรหัสอย่างเดียวจะสรุปผิด
// ว่าเป็น public แล้วบล็อกไม่ให้เซฟทั้งที่ทำถูกแล้ว จึงอ่านค่า private ในเนื้อตอบด้วย

async function visibility() {
  try {
    const res = await fetch(`https://api.github.com/repos/${slug}`, {
      headers: { "User-Agent": "genki-badminton-save-data", Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 404) return "private"
    if (res.status === 200) {
      const body = await res.json().catch(() => null)
      if (body && typeof body.private === "boolean") return body.private ? "private" : "public"
      // อ่านเนื้อตอบไม่ได้ ก็อย่าเดาว่าปลอดภัย ให้ไปถามเจ้าของแทน
      return "unknown"
    }
    return "unknown"
  } catch {
    return "offline"
  }
}

const vis = await visibility()

if (vis === "public") {
  fail(
    `repo ${c.bold(slug)} ยัง${c.red("เป็น public")} อยู่ — ไม่ push ข้อมูลขึ้นให้`,
    [
      `ข้างในโฟลเดอร์ data/ มี ${c.bold("รูปหน้าและชื่อลูกก๊วน")} กับประวัติการจ่ายเงิน`,
      `ถ้าขึ้น public แล้วลบทีหลังก็ไม่หายจริง (ยังอยู่ใน history และใน fork ของคนอื่น)`,
      ``,
      `ทำให้เป็น private ก่อน:`,
      `  https://github.com/${slug}/settings  →  เลื่อนลงล่างสุด Danger Zone`,
      `  →  Change repository visibility  →  Make private`,
      ``,
      `แล้วค่อยสั่ง ${c.bold("npm run save-data")} อีกที`,
    ].join("\n"),
  )
}

if (vis === "offline" || vis === "unknown") {
  // เช็คไม่ได้ก็ไม่เดาเอง ให้เจ้าของยืนยันเองครั้งเดียวแล้วจำไว้
  if (!fs.existsSync(OK_FILE)) {
    console.log(`\n${c.gold("!")} เช็คกับ GitHub ไม่ได้ตอนนี้ (เน็ตมีปัญหา?) เลยไม่รู้ว่า repo เป็น public หรือ private`)
    console.log(`\n  ข้างในโฟลเดอร์ data/ มี ${c.bold("รูปหน้าและชื่อลูกก๊วน")} กับประวัติการจ่ายเงิน`)
    console.log(`  ถ้า repo เป็น public อยู่ ข้อมูลพวกนี้จะขึ้นเน็ตให้ใครก็โหลดได้`)
    console.log(`\n  เช็คเองได้ที่ https://github.com/${slug}  (ถ้าเป็น private จะมีป้าย "Private" ข้างชื่อ)\n`)
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const ans = await new Promise((r) => rl.question(`  ยืนยันว่า repo นี้เป็น private แล้วใช่ไหม? (พิมพ์ ${c.bold("private")} เพื่อยืนยัน) `, r))
    rl.close()
    if (ans.trim().toLowerCase() !== "private") fail("ยังไม่ได้ยืนยัน — ไม่ push ข้อมูลขึ้นให้")
    fs.writeFileSync(OK_FILE, `ยืนยันแล้วว่า ${slug} เป็น private เมื่อ ${new Date().toISOString()}\n`)
    console.log(`${c.dim("  จำไว้แล้ว ครั้งต่อไปไม่ถามซ้ำ (ลบไฟล์ .data-in-git-ok ถ้าอยากให้ถามใหม่)")}`)
  }
} else {
  console.log(`${c.green("✓")} repo ${c.bold(slug)} เป็น private`)
}

// ── 3. ดึงของใหม่จากเครื่องอื่นลงมาก่อน ────────────────────────────────────────

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"])
console.log(`${c.dim(`  สาขา ${branch} · ข้อมูลที่ ${DATA_DIR}`)}`)

try {
  git(["fetch", "origin", branch], { stdio: "pipe" })
} catch {
  console.log(`${c.gold("!")} ดึงจาก GitHub ไม่ได้ (เน็ต?) — จะลอง commit ไว้ในเครื่องก่อน`)
}

let behind = "0"
try {
  // กลืน stderr ไว้ — ครั้งแรกที่ยังไม่เคย push ขึ้นไป git จะบ่นว่าไม่รู้จัก origin/<สาขา>
  // ซึ่งเป็นเรื่องปกติ ไม่ใช่ความผิดพลาดที่ต้องให้คนอ่านเห็น
  behind = git(["rev-list", "--count", `HEAD..origin/${branch}`], { stdio: ["ignore", "pipe", "ignore"] })
} catch {
  /* ยังไม่เคย push ขึ้นไปเลยก็ไม่เป็นไร */
}

if (behind !== "0") {
  console.log(`${c.dim(`  มีของใหม่จากเครื่องอื่น ${behind} commit — ดึงลงมาก่อน`)}`)
  try {
    git(["pull", "--no-rebase", "origin", branch], { stdio: "inherit" })
  } catch {
    fail(
      "ดึงของจากเครื่องอื่นลงมาแล้วชนกัน (conflict)",
      [
        `แปลว่ามีอีกเครื่องแก้ข้อมูลไว้ด้วย ซึ่งรวมอัตโนมัติไม่ได้`,
        ``,
        `ทางที่ปลอดภัยที่สุด:`,
        `  1. ${c.bold("git merge --abort")}`,
        `  2. เปิดเว็บแล้วกด "สำรองข้อมูล" เก็บของในเครื่องนี้ไว้เป็นไฟล์ก่อน`,
        `  3. ${c.bold("git reset --hard origin/" + branch)}  (เอาของจาก GitHub มาเป็นหลัก)`,
        `  4. ถ้าของในเครื่องนี้ใหม่กว่า ค่อยกด "กู้ข้อมูล" จากไฟล์ที่เก็บไว้ในข้อ 2`,
        ``,
        `${c.gold("กันไว้ก่อนดีกว่า:")} ใช้ทีละเครื่อง — จบก๊วนแล้ว save-data ทุกครั้ง`,
        `แล้วเครื่องถัดไป ${c.bold("git pull")} ก่อนเริ่มเสมอ`,
      ].join("\n"),
    )
  }
}

// ── 4. commit + push ─────────────────────────────────────────────────────────

git(["add", "-A", "--", path.relative(ROOT, DATA_DIR) || "data"])

const staged = git(["diff", "--cached", "--name-only"])
if (!staged) {
  console.log(`\n${c.green("✓")} ข้อมูลตรงกับที่เก็บไว้อยู่แล้ว ไม่มีอะไรต้องเก็บเพิ่ม\n`)
  process.exit(0)
}

const files = staged.split("\n").filter(Boolean)
console.log(`${c.dim(`  ไฟล์ที่เปลี่ยน ${files.length} ไฟล์`)}`)
for (const f of files.slice(0, 8)) console.log(`${c.dim(`    ${f}`)}`)
if (files.length > 8) console.log(`${c.dim(`    … และอีก ${files.length - 8} ไฟล์`)}`)

const stamp = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" })
git(["commit", "-m", `ข้อมูลก๊วน ${stamp}`])

try {
  git(["push", "-u", "origin", branch], { stdio: "inherit" })
} catch {
  fail("push ไม่สำเร็จ", `commit ไว้ในเครื่องแล้ว ลองใหม่ทีหลังด้วย ${c.bold("git push")} ได้เลย`)
}

console.log(`\n${c.green("✓")} เก็บข้อมูลขึ้น GitHub แล้ว`)
console.log(`${c.dim(`  เครื่องอื่นสั่ง git pull แล้ว npm start ได้ข้อมูลชุดนี้เลย`)}\n`)
