/**
 * เซิร์ฟเวอร์ — Hono + REST ธรรมดา
 *
 * ทุก endpoint ที่แก้ข้อมูลจะตอบ SessionView ชุดใหม่กลับมาเลย หน้าเว็บจึงอัปเดต
 * ได้ในรอบเดียวโดยไม่ต้องยิงถามซ้ำ (สำคัญตอนเน็ตโรงยิมอืด)
 */

import { Hono } from "hono"
import type { HttpBindings } from "@hono/node-server"
import { z } from "zod"
import { type Level, type MatchType, MAX_LEVEL, displayName, scoreLabel, thaiTime } from "@shared/types"
import { suggestMatch } from "./matching"
import { billFilename, billWorkbook } from "./billsheet"
import {
  type CreateSessionInput,
  StoreError,
  addPlayer,
  addShuttles,
  allTimeStats,
  buildView,
  cancelMatch,
  checkIn,
  checkOut,
  computeBill,
  createSession,
  currentSession,
  deletePlayer,
  endSession,
  findSessionByCode,
  finishMatch,
  getRoster,
  getSession,
  listSessions,
  renameCourt,
  reopenSession,
  rosterMap,
  setBoost,
  setCourtCount,
  setPaid,
  setRest,
  startMatch,
  summaryText,
  swapPlayer,
  toggleCourt,
  undo,
  undoDepth,
  updatePlayer,
  updateSession,
} from "./store"

const ORGANIZER_PIN = (process.env.ORGANIZER_PIN ?? "").trim()

const app = new Hono<{ Bindings: HttpBindings }>()

// ── ตัวช่วยตอบกลับ ────────────────────────────────────────────────────────────

function view(sessionId: string) {
  const session = getSession(sessionId)
  return { view: buildView(session), undoDepth: undoDepth(sessionId) }
}

/** ผู้ที่ถือ PIN เท่านั้นที่สั่งการได้ (ปล่อยว่าง = ใครเปิดลิงก์ได้ก็คุมได้) */
app.use("/api/*", async (c, next) => {
  const method = c.req.method
  const isWrite = method === "POST" || method === "PATCH" || method === "DELETE"
  if (isWrite && ORGANIZER_PIN) {
    const pin = c.req.header("x-organizer-pin") ?? ""
    if (pin !== ORGANIZER_PIN) {
      return c.json({ error: "ต้องใส่ PIN ของหัวก๊วนก่อนสั่งการ", needPin: true }, 401)
    }
  }
  await next()
})

app.onError((err, c) => {
  if (err instanceof StoreError) return c.json({ error: err.message }, err.status as 400)
  if (err instanceof z.ZodError) {
    return c.json({ error: "ข้อมูลที่ส่งมาไม่ถูกต้อง", detail: err.issues }, 400)
  }
  console.error("[api] ", err)
  return c.json({ error: "เซิร์ฟเวอร์มีปัญหา ลองใหม่อีกครั้ง" }, 500)
})

async function body<T extends z.ZodTypeAny>(c: { req: { json: () => Promise<unknown> } }, schema: T): Promise<z.infer<T>> {
  const raw = await c.req.json().catch(() => ({}))
  return schema.parse(raw)
}

// ── ตรวจ PIN ──────────────────────────────────────────────────────────────────

/** ให้หน้าเว็บทดสอบว่า PIN ที่กรอกใช้ได้จริงไหม (middleware ด้านบนเป็นคนตรวจ) */
app.post("/api/auth/check", (c) => c.json({ ok: true }))

// ── สถานะเริ่มต้นของหน้าเว็บ ──────────────────────────────────────────────────

app.get("/api/bootstrap", (c) => {
  const session = currentSession()
  return c.json({
    pinRequired: ORGANIZER_PIN.length > 0,
    roster: getRoster(),
    view: session ? buildView(session) : null,
    undoDepth: session ? undoDepth(session.id) : 0,
    sessions: listSessions()
      .slice(0, 30)
      .map((s) => ({
        id: s.id,
        name: s.name,
        date: s.date,
        venue: s.venue,
        status: s.status,
        code: s.code,
        players: s.players.length,
        matches: s.matches.filter((m) => m.endedAt).length,
        startAt: s.startAt,
        endAt: s.endAt,
      })),
  })
})

app.get("/api/view/:id", (c) => c.json(view(c.req.param("id"))))

/** ลิงก์ให้ลูกก๊วนดูคิวเอง — ไม่ต้องมี PIN, อ่านได้อย่างเดียว */
app.get("/api/q/:code", (c) => {
  const session = findSessionByCode(c.req.param("code"))
  if (!session) return c.json({ error: "ไม่พบก๊วนจากรหัสนี้" }, 404)
  return c.json({ view: buildView(session) })
})

// ── ทะเบียนผู้เล่น ────────────────────────────────────────────────────────────

const playerSchema = z.object({
  /** ชื่อที่ใช้เรียกในก๊วน — ไม่ต้องเป็นชื่อจริง */
  name: z.string().trim().min(1, "ต้องมีชื่อ").max(24),
  level: z.number().int().min(1).max(MAX_LEVEL),
  note: z.string().trim().max(200).optional(),
  archived: z.boolean().optional(),
})

app.get("/api/players", (c) => c.json({ roster: getRoster() }))

app.post("/api/players", async (c) => {
  const input = await body(c, playerSchema)
  const player = addPlayer({ ...input, level: input.level as Level })
  return c.json({ player, roster: getRoster() })
})

app.patch("/api/players/:id", async (c) => {
  const input = await body(c, playerSchema.partial())
  const player = updatePlayer(c.req.param("id"), {
    ...input,
    level: input.level as Level | undefined,
  })
  return c.json({ player, roster: getRoster() })
})

app.delete("/api/players/:id", (c) => {
  deletePlayer(c.req.param("id"))
  return c.json({ roster: getRoster() })
})

// ── ก๊วน ─────────────────────────────────────────────────────────────────────

const settingsSchema = z.object({
  maxLevelGap: z.number().int().min(0).max(MAX_LEVEL - 1).optional(),
  waitWeight: z.number().min(0).max(20).optional(),
  gamesBehindWeight: z.number().min(0).max(60).optional(),
  varietyWeight: z.number().min(0).max(60).optional(),
  levelWeight: z.number().min(0).max(60).optional(),
  warnWaitMinutes: z.number().min(1).max(120).optional(),
  dongWaitMinutes: z.number().min(1).max(180).optional(),
  targetGameMinutes: z.number().min(3).max(60).optional(),
  defaultMatchType: z.enum(["auto", "D", "S"]).optional(),
  callSound: z.boolean().optional(),
})

const feesSchema = z.object({
  mode: z.enum(["club", "equal"]).optional(),
  courtFeePerHead: z.number().min(0).max(100_000).optional(),
  shuttlePrice: z.number().min(0).max(10_000).optional(),
  courtCost: z.number().min(0).max(1_000_000).optional(),
  extraCost: z.number().min(0).max(1_000_000).optional(),
  extraNote: z.string().trim().max(80).optional(),
  roundTo: z.number().min(1).max(100).optional(),
  promptPay: z.string().trim().max(60).optional(),
})

app.post("/api/session", async (c) => {
  const input = await body(
    c,
    z.object({
      name: z.string().trim().max(60).optional(),
      venue: z.string().trim().max(80).optional(),
      courtCount: z.number().int().min(1).max(20).optional(),
      courtNames: z.array(z.string().trim().max(24)).optional(),
      notes: z.string().trim().max(500).optional(),
      settings: settingsSchema.optional(),
      fees: feesSchema.optional(),
    }),
  )
  const session = createSession(input as CreateSessionInput)
  return c.json(view(session.id))
})

app.patch("/api/session/:id", async (c) => {
  const input = await body(
    c,
    z.object({
      name: z.string().trim().max(60).optional(),
      venue: z.string().trim().max(80).optional(),
      notes: z.string().trim().max(500).optional(),
      settings: settingsSchema.optional(),
      fees: feesSchema.optional(),
    }),
  )
  const session = updateSession(c.req.param("id"), input)
  return c.json(view(session.id))
})

app.post("/api/session/:id/end", (c) => {
  const session = endSession(c.req.param("id"))
  return c.json(view(session.id))
})

app.post("/api/session/:id/reopen", (c) => {
  const session = reopenSession(c.req.param("id"))
  return c.json(view(session.id))
})

app.post("/api/session/:id/courts", async (c) => {
  const { count } = await body(c, z.object({ count: z.number().int().min(1).max(20) }))
  const session = setCourtCount(c.req.param("id"), count)
  return c.json(view(session.id))
})

app.post("/api/session/:id/courts/:index", async (c) => {
  const input = await body(
    c,
    z.object({ name: z.string().trim().max(24).optional(), disabled: z.boolean().optional() }),
  )
  const sessionId = c.req.param("id")
  const index = Number(c.req.param("index"))
  if (input.name !== undefined) renameCourt(sessionId, index, input.name)
  if (input.disabled !== undefined) toggleCourt(sessionId, index, input.disabled)
  return c.json(view(sessionId))
})

// ── คน เข้า-ออก-พัก ──────────────────────────────────────────────────────────

const playerIdSchema = z.object({ playerId: z.string().min(1) })

app.post("/api/session/:id/checkin", async (c) => {
  const input = await body(
    c,
    z.union([playerIdSchema, z.object({ newPlayer: playerSchema })]),
  )
  const sessionId = c.req.param("id")
  const playerId =
    "playerId" in input
      ? input.playerId
      : addPlayer({ ...input.newPlayer, level: input.newPlayer.level as Level }).id
  const session = checkIn(sessionId, playerId)
  return c.json(view(session.id))
})

app.post("/api/session/:id/checkin-many", async (c) => {
  const { playerIds } = await body(c, z.object({ playerIds: z.array(z.string().min(1)).max(60) }))
  const sessionId = c.req.param("id")
  const failed: string[] = []
  for (const pid of playerIds) {
    try {
      checkIn(sessionId, pid)
    } catch (err) {
      failed.push(err instanceof Error ? err.message : String(pid))
    }
  }
  return c.json({ ...view(sessionId), failed })
})

app.post("/api/session/:id/checkout", async (c) => {
  const { playerId } = await body(c, playerIdSchema)
  const session = checkOut(c.req.param("id"), playerId)
  return c.json(view(session.id))
})

app.post("/api/session/:id/rest", async (c) => {
  const { playerId, resting } = await body(c, playerIdSchema.extend({ resting: z.boolean() }))
  const session = setRest(c.req.param("id"), playerId, resting)
  return c.json(view(session.id))
})

app.post("/api/session/:id/boost", async (c) => {
  const { playerId, boost } = await body(
    c,
    playerIdSchema.extend({ boost: z.number().int().min(-3).max(3) }),
  )
  const session = setBoost(c.req.param("id"), playerId, boost)
  return c.json(view(session.id))
})

app.post("/api/session/:id/paid", async (c) => {
  const { playerId, paid } = await body(c, playerIdSchema.extend({ paid: z.boolean() }))
  const session = setPaid(c.req.param("id"), playerId, paid)
  return c.json(view(session.id))
})

// ── จัดเกม ───────────────────────────────────────────────────────────────────

const matchTypeSchema = z.enum(["D", "S"])

app.post("/api/session/:id/suggest", async (c) => {
  const input = await body(
    c,
    z.object({
      type: z.union([matchTypeSchema, z.literal("auto")]).optional(),
      include: z.array(z.string()).max(4).optional(),
      exclude: z.array(z.string()).max(60).optional(),
      /** true = ผู้ใช้กด "สุ่มใหม่" → ใส่ความสุ่มเล็กน้อยให้ได้ชุดอื่น */
      shuffle: z.boolean().optional(),
    }),
  )
  const session = getSession(c.req.param("id"))
  const result = suggestMatch({
    session,
    roster: rosterMap(),
    now: Date.now(),
    type: input.type ?? session.settings.defaultMatchType,
    include: input.include,
    exclude: input.exclude,
    jitter: input.shuffle ? 4 : 0,
  })
  return c.json(result)
})

app.post("/api/session/:id/start", async (c) => {
  const input = await body(
    c,
    z.object({
      courtIndex: z.number().int().min(0).max(19),
      type: matchTypeSchema,
      teamA: z.array(z.string().min(1)).min(1).max(2),
      teamB: z.array(z.string().min(1)).min(1).max(2),
      createdBy: z.enum(["auto", "manual"]).optional(),
    }),
  )
  const sessionId = c.req.param("id")
  const { match } = startMatch(sessionId, { ...input, type: input.type as MatchType })
  const roster = rosterMap()
  const court = getSession(sessionId).courts[input.courtIndex]
  // ข้อความสำหรับ "เรียกลงสนาม" (หน้าเว็บนำไปอ่านออกเสียง)
  const names = [...match.teamA, ...match.teamB].map((pid) => {
    const p = roster.get(pid)
    return p ? displayName(p) : pid
  })
  return c.json({
    ...view(sessionId),
    match,
    callText: `${court?.name ?? `คอร์ต ${input.courtIndex + 1}`} เชิญ ${names.join(", ")} ลงสนามครับ`,
  })
})

app.post("/api/session/:id/finish", async (c) => {
  const input = await body(
    c,
    z.object({
      matchId: z.string().min(1),
      /** คะแนนรายเซ็ต — ปกติ 2 เซ็ต (21 แต้ม) ถ้าเสมอมีเซ็ตที่ 3 */
      sets: z
        .array(z.object({ a: z.number().int().min(0).max(99), b: z.number().int().min(0).max(99) }))
        .max(5)
        .optional(),
      shuttles: z.number().min(0).max(30).optional(),
      winner: z.enum(["A", "B"]).optional(),
    }),
  )
  const session = finishMatch(c.req.param("id"), input)
  return c.json(view(session.id))
})

app.post("/api/session/:id/cancel", async (c) => {
  const { matchId } = await body(c, z.object({ matchId: z.string().min(1) }))
  const session = cancelMatch(c.req.param("id"), matchId)
  return c.json(view(session.id))
})

app.post("/api/session/:id/swap", async (c) => {
  const input = await body(
    c,
    z.object({
      matchId: z.string().min(1),
      outPlayerId: z.string().min(1),
      inPlayerId: z.string().min(1),
    }),
  )
  const session = swapPlayer(c.req.param("id"), input)
  return c.json(view(session.id))
})

app.post("/api/session/:id/shuttles", async (c) => {
  const { delta, matchId } = await body(
    c,
    z.object({ delta: z.number().int().min(-30).max(30), matchId: z.string().optional() }),
  )
  const session = addShuttles(c.req.param("id"), delta, matchId)
  return c.json(view(session.id))
})

app.post("/api/session/:id/undo", (c) => {
  const session = undo(c.req.param("id"))
  return c.json(view(session.id))
})

// ── สรุป / ส่งออก ────────────────────────────────────────────────────────────

app.get("/api/session/:id/summary", (c) => {
  const session = getSession(c.req.param("id"))
  return c.json({ text: summaryText(session) })
})

app.get("/api/session/:id/matches.csv", (c) => {
  const session = getSession(c.req.param("id"))
  const roster = rosterMap()
  const nameOf = (pid: string) => {
    const p = roster.get(pid)
    return p ? displayName(p) : pid
  }
  const rows = [
    ["court", "type", "start", "end", "minutes", "teamA", "teamB", "score", "winner", "shuttles", "levelGap"],
    ...session.matches.map((m) => [
      session.courts[m.courtIndex]?.name ?? `คอร์ต ${m.courtIndex + 1}`,
      m.type,
      thaiTime(m.startedAt),
      m.endedAt ? thaiTime(m.endedAt) : "",
      m.endedAt ? String(Math.round((m.endedAt - m.startedAt) / 60_000)) : "",
      m.teamA.map(nameOf).join(" + "),
      m.teamB.map(nameOf).join(" + "),
      scoreLabel(m),
      m.winner ?? "",
      String(m.shuttles),
      String(m.levelGap),
    ]),
  ]
  const csv = "﻿" + rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="genki-${session.date}.csv"`,
      "Cache-Control": "no-store",
    },
  })
})

app.get("/api/session/:id/bill.xlsx", (c) => {
  const session = getSession(c.req.param("id"))
  const roster = rosterMap()
  const file = billWorkbook(session, computeBill(session, roster), roster)
  const name = billFilename(session)
  // ชื่อไฟล์ภาษาไทยต้องส่งแบบ RFC 5987 ไม่งั้นเบราว์เซอร์เก่าได้ชื่อเป็นตัวยึกยือ
  const ascii = `genki-bill-${session.date}.xlsx`

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Content-Length": String(file.length),
      "Cache-Control": "no-store",
    },
  })
})

app.get("/api/stats", (c) => c.json({ stats: allTimeStats() }))

app.get("/api/sessions", (c) =>
  c.json({
    sessions: listSessions().map((s) => ({
      id: s.id,
      name: s.name,
      date: s.date,
      venue: s.venue,
      status: s.status,
      code: s.code,
      players: s.players.length,
      matches: s.matches.filter((m) => m.endedAt).length,
      shuttles: s.matches.reduce((n, m) => n + m.shuttles, 0) + s.shuttlesExtra,
      startAt: s.startAt,
      endAt: s.endAt,
    })),
  }),
)

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404))

export default app

/**
 * รันเป็นเซิร์ฟเวอร์จริงเมื่อไม่ได้อยู่ในโหมด dev
 *
 * ที่เช็ก "ไม่ใช่ development" แทนที่จะเช็ก "เป็น production" เพราะการสั่ง
 * NODE_ENV=production นำหน้าคำสั่งเป็นไวยากรณ์ของ bash — PowerShell กับ cmd
 * บน Windows รันไม่ได้ ถ้าต้องตั้งค่านี้ก่อนเสมอ ก็เท่ากับเปิดเว็บบน Windows ไม่ได้เลย
 * (ตอน vite dev มันตั้ง NODE_ENV=development ให้อยู่แล้ว จึงไม่เปิดพอร์ตซ้อน)
 */
if (process.env.NODE_ENV !== "development") {
  const { serve } = await import("@hono/node-server")
  const { serveStatic } = await import("@hono/node-server/serve-static")
  const fs = await import("node:fs")
  const path = await import("node:path")

  const distPath = path.resolve(import.meta.dirname, "./public")
  app.use("*", serveStatic({ root: path.relative(process.cwd(), distPath) || "./dist/public" }))
  app.notFound((c) => {
    const accept = c.req.header("accept") ?? ""
    if (!accept.includes("text/html")) return c.json({ error: "Not Found" }, 404)
    return c.html(fs.readFileSync(path.join(distPath, "index.html"), "utf8"))
  })

  const port = Number(process.env.PORT || 3100)
  const os = await import("node:os")

  /** ไอพีในวง Wi-Fi — ลูกก๊วนเอาไปพิมพ์ในมือถือได้เลย ไม่ต้องมานั่งหาเอง */
  const lanAddresses = () =>
    Object.values(os.networkInterfaces())
      .flatMap((list) => list ?? [])
      .filter((n) => n.family === "IPv4" && !n.internal)
      .map((n) => n.address)

  serve({ fetch: app.fetch, port }, () => {
    const lines = [
      "",
      "🏸 Genki Desu Badminton — เปิดใช้งานแล้ว",
      `   เครื่องนี้        http://localhost:${port}/`,
      ...lanAddresses().map((ip) => `   มือถือใน Wi-Fi นี้  http://${ip}:${port}/`),
      `   ข้อมูลเก็บที่      ${path.resolve(process.env.DATA_DIR || "./data")}`,
      "",
    ]
    console.log(lines.join("\n"))
  })
}
