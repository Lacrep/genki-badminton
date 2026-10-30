/**
 * บันทึกข้อมูลขึ้น git อัตโนมัติ — สำหรับรันบนที่ที่ดิสก์ไม่ถาวร (เช่น Render free tier)
 *
 * ปกติเว็บนี้เขียนไฟล์ลง data/ บนดิสก์เครื่องตัวเองตรง ๆ ซึ่งพอบนโฮสต์ฟรีบางเจ้า
 * (เช่น Render free) ดิสก์จะถูกล้างทุกครั้งที่เซิร์ฟเวอร์ถูกสั่งพักหรือรีสตาร์ต
 * โมดูลนี้แก้ปัญหานั้นด้วยการใช้ git repo (private) เป็นที่เก็บถาวรแทน:
 *
 *   ตอนเริ่มเซิร์ฟเวอร์ → clone ข้อมูลล่าสุดจาก git ลงมาก่อน
 *   ตอนมีการเขียนไฟล์ข้อมูล → รอเงียบสักพัก (debounce) แล้ว commit + push ขึ้น git
 *   ตอนเซิร์ฟเวอร์กำลังจะถูกปิด (SIGTERM) → พยายาม commit + push ครั้งสุดท้ายก่อนตาย
 *
 * ปิดเป็นค่าเริ่มต้นเสมอ (ต้องตั้ง GIT_AUTOSYNC=1 เอง) — โหมดใช้งานปกติ (เครื่องที่บ้าน,
 * VPS, Docker) จึงไม่ถูกแตะต้องเลยแม้แต่น้อย โมดูลนี้ทั้งก้อนจะไม่ทำงานอะไรเลยถ้าไม่เปิด
 *
 * ใช้ git CLI ธรรมดาผ่าน child_process (ไม่ใช้ไลบรารี git ในตัว Node) เพราะ:
 *   - เป็นวิธีเดียวกับที่ scripts/save-data.mjs ใช้อยู่แล้ว พิสูจน์แล้วว่าทำงานได้จริง
 *   - ทดสอบนอกเซิร์ฟเวอร์จริงได้ง่าย (เรียก preflight() เช็คได้ก่อนพึ่งมันตอนรัน)
 */
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import fs from "node:fs"
import path from "node:path"

const execFileP = promisify(execFile)

function cfg() {
  return {
    enabled: process.env.GIT_AUTOSYNC === "1",
    remote: process.env.GIT_AUTOSYNC_REMOTE || "",
    token: process.env.GIT_AUTOSYNC_TOKEN || "",
    branch: process.env.GIT_AUTOSYNC_BRANCH || "main",
    workdir: process.env.GIT_AUTOSYNC_WORKDIR || "/tmp/genki-autosync-repo",
    debounceMs: Number(process.env.GIT_AUTOSYNC_DEBOUNCE_MS || 8000),
    maxWaitMs: Number(process.env.GIT_AUTOSYNC_MAX_WAIT_MS || 60000),
  }
}

export function isEnabled() {
  return cfg().enabled
}

function authedUrl(remote, token) {
  // https://x-access-token:<token>@github.com/owner/repo.git
  let u
  try {
    u = new URL(remote)
  } catch {
    return remote // ไม่ใช่ URL มาตรฐาน (เช่น path ในเครื่องตอนทดสอบ) — ใช้ตามที่ให้มาเลย ไม่ใส่ token
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return remote
  u.username = "x-access-token"
  u.password = token
  return u.toString()
}

async function git(args, opts = {}) {
  return execFileP("git", args, { encoding: "utf8", ...opts })
}

/**
 * เช็คก่อนว่าพร้อมใช้งานจริงไหม — เรียกตั้งแต่ตอนเริ่มเซิร์ฟเวอร์
 * ถ้าตั้ง GIT_AUTOSYNC=1 แต่ขาดอะไรไป ให้ล้มทันทีแบบชัดเจน
 * (ดีกว่าปล่อยให้รันต่อไปแบบเงียบ ๆ โดยไม่ได้บันทึกอะไรขึ้น git จริง แล้วมารู้ตัวทีหลังว่าข้อมูลหาย)
 */
export async function preflight() {
  const c = cfg()
  if (!c.enabled) return
  const missing = []
  if (!c.remote) missing.push("GIT_AUTOSYNC_REMOTE")
  if (!c.token) missing.push("GIT_AUTOSYNC_TOKEN")
  if (missing.length > 0) {
    throw new Error(
      `GIT_AUTOSYNC=1 แต่ยังไม่ได้ตั้ง ${missing.join(", ")} — ตั้งให้ครบก่อนเริ่มเซิร์ฟเวอร์ ` +
        `(ดูวิธีใน README หัวข้อ "ขึ้น Render ฟรี")`,
    )
  }
  try {
    await git(["--version"])
  } catch {
    throw new Error(
      "GIT_AUTOSYNC=1 แต่เครื่องนี้ไม่มีโปรแกรม git ติดตั้งมาให้ — ใช้ autosync ผ่าน git ไม่ได้ " +
        "(โฮสต์นี้อาจไม่รองรับ ลองเปลี่ยนไปใช้ VPS/Docker แทน)",
    )
  }
}

/**
 * ดึงข้อมูลล่าสุดจาก git มาไว้ในโฟลเดอร์ชั่วคราว แล้วคืน path ของ data/ ข้างใน
 * ให้ตัวแอปใช้เป็น DATA_DIR ต่อ — เรียกครั้งเดียวตอนเริ่มเซิร์ฟเวอร์ ก่อนแอปโหลดใด ๆ
 */
export async function cloneData() {
  const c = cfg()
  if (!c.enabled) return null
  await preflight()

  fs.rmSync(c.workdir, { recursive: true, force: true })
  fs.mkdirSync(c.workdir, { recursive: true })

  const url = authedUrl(c.remote, c.token)
  console.log("[git-autosync] กำลังดึงข้อมูลล่าสุดจาก git...")
  try {
    await git(["clone", "--depth", "1", "--branch", c.branch, "--single-branch", url, c.workdir])
  } catch (err) {
    throw new Error(`[git-autosync] clone ไม่สำเร็จ: ${err?.stderr || err?.message || err}`)
  }

  // อย่าให้ token ค้างอยู่ใน .git/config ของ worktree — เซ็ตใหม่แบบไม่มี token
  // แล้วเก็บ token แยกไว้ใช้เฉพาะตอน push (ผ่าน authedRemote() ทุกครั้งที่ใช้จริง)
  await git(["remote", "set-url", "origin", c.remote], { cwd: c.workdir })
  await git(["config", "user.name", "Genki Auto-sync"], { cwd: c.workdir })
  await git(["config", "user.email", "autosync@genki-badminton.local"], { cwd: c.workdir })

  const dataDir = path.join(c.workdir, "data")
  fs.mkdirSync(dataDir, { recursive: true })
  console.log(`[git-autosync] พร้อมแล้ว — data อยู่ที่ ${dataDir}`)
  return dataDir
}

// ── ส่วนบันทึกอัตโนมัติตอนรันอยู่ (debounce แล้วค่อย commit+push) ──────────────

let timer = null
let firstDirtyAt = 0
let running = false
let pendingAfter = false

async function pushWithAuth() {
  const c = cfg()
  const url = authedUrl(c.remote, c.token)
  await git(["push", url, `HEAD:${c.branch}`], { cwd: c.workdir })
}

async function commitAndPush() {
  const c = cfg()
  const status = await git(["status", "--porcelain", "--", "data"], { cwd: c.workdir })
  if (!status.stdout.trim()) return // ไม่มีอะไรเปลี่ยน ไม่ต้อง commit เปล่า ๆ

  await git(["add", "-A", "--", "data"], { cwd: c.workdir })
  await git(["commit", "-m", `autosync ${new Date().toISOString()}`], { cwd: c.workdir })

  try {
    await pushWithAuth()
    console.log("[git-autosync] บันทึกขึ้น git แล้ว")
  } catch (err) {
    console.error(`[git-autosync] push ไม่สำเร็จ ลองดึงของใหม่มารวมแล้วลองอีกครั้ง: ${err?.stderr || err?.message || err}`)
    try {
      const url = authedUrl(c.remote, c.token)
      await git(["fetch", url, c.branch], { cwd: c.workdir })
      await git(["merge", "-X", "ours", "--no-edit", "FETCH_HEAD"], { cwd: c.workdir })
      await pushWithAuth()
      console.log("[git-autosync] บันทึกขึ้น git แล้ว (หลังรวมของใหม่)")
    } catch (err2) {
      // เหลือ commit ค้างอยู่ในเครื่องนี้ — รอบถัดไปที่มีการแก้ไขจะลองอีกครั้งเอง
      console.error(
        `[git-autosync] ยังบันทึกขึ้น git ไม่สำเร็จ จะลองใหม่ตอนมีการแก้ไขครั้งถัดไป: ${err2?.stderr || err2?.message || err2}`,
      )
    }
  }
}

async function flush() {
  if (running) {
    pendingAfter = true
    return
  }
  running = true
  timer = null
  firstDirtyAt = 0
  try {
    await commitAndPush()
  } catch (err) {
    console.error("[git-autosync] flush ผิดพลาด:", err)
  } finally {
    running = false
    if (pendingAfter) {
      pendingAfter = false
      markDataDirty()
    }
  }
}

/** เรียกทุกครั้งที่มีการเขียนไฟล์ข้อมูล — ตั้งเวลาไว้ commit+push ทีหลัง ไม่ใช่ทันที (กันพุชถี่เกิน) */
export function markDataDirty() {
  const c = cfg()
  if (!c.enabled) return
  const now = Date.now()
  if (!firstDirtyAt) firstDirtyAt = now
  if (timer) clearTimeout(timer)
  const waited = now - firstDirtyAt
  const delay = waited >= c.maxWaitMs ? 0 : Math.min(c.debounceMs, c.maxWaitMs - waited)
  timer = setTimeout(() => void flush(), delay)
}

/** เรียกตอนกำลังจะปิดเซิร์ฟเวอร์ (SIGTERM) — พยายามบันทึกครั้งสุดท้ายแบบจำกัดเวลารอ */
export async function flushBeforeShutdown(timeoutMs = 20000) {
  if (!isEnabled()) return
  if (timer) clearTimeout(timer)
  timer = null
  try {
    await Promise.race([
      flush(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("หมดเวลารอ")), timeoutMs)),
    ])
  } catch (err) {
    console.error("[git-autosync] บันทึกครั้งสุดท้ายก่อนปิดเครื่องไม่สำเร็จ:", err?.message || err)
  }
}
