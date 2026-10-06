import { useState } from "react"
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  History,
  ListOrdered,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react"
import { displayName, formatDuration, formatMinutes, scoreLabel, thaiTime } from "@shared/types"
import { api } from "@/lib/api"
import { speak } from "@/lib/sound"
import { useApp, useNow, useSession } from "@/lib/app"
import { CourtCard } from "@/components/CourtCard"
import { MatchProposal } from "@/components/MatchProposal"
import { FinishSheet, SwapSheet } from "@/components/MatchSheets"
import { QueueRow } from "@/components/player"
import { EmptyState, Stat } from "@/components/ui"

const QUEUE_PREVIEW = 6

export function LivePage({ navigate }: { navigate: (to: string) => void }) {
  const { view, sessionId } = useSession()
  const { run, toast, needPin } = useApp()
  const now = useNow()

  const [proposal, setProposal] = useState<{ courtIndex: number | null; mode: "auto" | "manual" } | null>(null)
  const [finishing, setFinishing] = useState<number | null>(null)
  const [swapping, setSwapping] = useState<number | null>(null)

  const canControl = !needPin && view.session.status === "live"
  const liveCourts = view.courts
  const freeCourts = liveCourts.filter((c) => !c.match && !c.court.disabled).length

  /**
   * จับคู่เกมในคิวกับคอร์ตว่าง — คอร์ตว่างใบแรกได้เกมที่ 1 ใบถัดไปได้เกมที่ 2
   * (ถ้าโชว์เกมเดียวกันทุกคอร์ต กดใบที่สองจะเด้ง error เพราะคนลงไปแล้ว)
   */
  const readyPlans = view.planned.filter((p) => p.ready)
  const planForCourt = new Map<number, (typeof readyPlans)[number]>()
  let nextPlan = 0
  for (const cv of liveCourts) {
    if (cv.match || cv.court.disabled) continue
    const plan = readyPlans[nextPlan]
    if (!plan) break
    planForCourt.set(cv.court.index, plan)
    nextPlan += 1
  }

  /** เริ่มเกมจากคิว — ต้องเรียกชื่อออกเสียงเหมือนตอนสุ่มจัดเกม ไม่งั้นคนไม่รู้ว่าถึงคิวตัวเอง */
  const startPlanned = async (plannedId: string, courtIndex: number) => {
    const reply = await run("เริ่มเกมจากคิวแล้ว", () => api.startPlan(sessionId, plannedId, courtIndex), {
      silent: true,
    })
    if (reply && "callText" in reply && reply.callText) {
      if (view.session.settings.callSound) speak(reply.callText)
      toast(reply.callText, "ok")
    }
  }
  const recent = [...view.session.matches]
    .filter((m) => m.endedAt)
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
    .slice(0, 5)

  return (
    <div className="flex flex-col gap-4">
      {/* ก๊วนปิดแล้ว — ต้องมีทางไปต่อ ไม่ใช่ค้างอยู่หน้านี้ */}
      {view.session.status === "ended" ? (
        <div className="card card-pad flex flex-col gap-3">
          <div>
            <p className="font-heading text-[15px] font-semibold text-ink">ก๊วนนี้ปิดแล้ว</p>
            <p className="text-[12.5px] leading-snug text-ink-soft">
              ข้อมูลทั้งหมดถูกเก็บไว้แล้ว — ดูค่าก๊วนกับสถิติย้อนหลังได้ หรือเปิดก๊วนครั้งใหม่ได้เลย
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => navigate("/new")}>
              <Plus size={16} />
              เปิดก๊วนใหม่
            </button>
            <button className="btn-ghost" onClick={() => navigate("/bill")}>
              ดูค่าก๊วนครั้งนี้
            </button>
            <button className="btn-ghost" onClick={() => navigate("/stats")}>
              ดูสถิติ
            </button>
          </div>
        </div>
      ) : null}

      {/* สรุปสถานะก๊วนวันนี้ */}
      <div className="card card-pad">
        {/* 4 ช่อง — ลงตัวทั้งจอมือถือ (2×2) และจอคอม (1×4) ไม่ตกบรรทัดแหว่ง */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="มาวันนี้" value={view.stats.checkedIn} hint={`${view.roster.length} คนในทะเบียน`} />
          <Stat label="อยู่ในคอร์ต" value={view.stats.playing} hint={`ว่าง ${freeCourts} คอร์ต`} />
          <Stat
            label="รอคิว"
            value={view.stats.waiting}
            hint={view.stats.waiting > 0 ? `รอเฉลี่ย ${Math.round(view.stats.avgWaitMs / 60_000)} นาที` : "ไม่มีใครรอ"}
            tone={view.dongAlerts.length > 0 ? "red" : "navy"}
          />
          <Stat
            label="รอนานสุด"
            value={view.stats.maxWaitMs > 0 ? formatDuration(view.stats.maxWaitMs) : "—"}
            hint={`จบไปแล้ว ${view.stats.matchesDone} เกม · ลูก ${view.stats.shuttlesUsed}`}
            tone={view.dongAlerts.length > 0 ? "red" : "gold"}
          />
        </div>
      </div>

      {/* คอร์ต */}
      <section className="flex flex-col gap-2.5">
        <h2 className="section-title">
          <Sparkles size={15} className="text-gold-deep" />
          คอร์ต ({liveCourts.length})
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {liveCourts.map((cv) => (
            <CourtCard
              key={cv.court.index}
              cv={{ ...cv, elapsedMs: cv.match ? now - cv.match.startedAt : 0 }}
              settings={view.session.settings}
              canControl={canControl}
              nextPlanned={(() => {
                const plan = planForCourt.get(cv.court.index)
                if (!plan) return null
                return {
                  names: plan.players.map((x) => displayName(x.player)),
                  onStart: () => startPlanned(plan.planned.id, cv.court.index),
                }
              })()}
              onAuto={() => setProposal({ courtIndex: cv.court.index, mode: "auto" })}
              onManual={() => setProposal({ courtIndex: cv.court.index, mode: "manual" })}
              onFinish={() => setFinishing(cv.court.index)}
              onSwap={() => setSwapping(cv.court.index)}
              onCancel={() => {
                if (!cv.match) return
                if (!window.confirm(`ยกเลิกเกมใน ${cv.court.name}? ทุกคนจะกลับไปที่คิวเดิม`)) return
                void run("ยกเลิกเกมแล้ว", () => api.cancelMatch(sessionId, cv.match!.id))
              }}
              onShuttle={(delta) => {
                if (!cv.match) return
                void run("บันทึกลูกแบดแล้ว", () => api.shuttles(sessionId, delta, cv.match!.id))
              }}
              onToggleCourt={(disabled) =>
                void run(disabled ? "ปิดคอร์ตแล้ว" : "เปิดคอร์ตแล้ว", () =>
                  api.courtPatch(sessionId, cv.court.index, { disabled }),
                )
              }
            />
          ))}
        </div>
      </section>

      {/* คิวเกมที่จัดไว้ล่วงหน้า */}
      {view.session.status === "live" ? (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="section-title">
              <CalendarClock size={15} className="text-gold-deep" />
              คิวเกมที่จัดไว้ ({view.planned.length})
            </h2>
            {canControl ? (
              <button className="btn-ghost btn-sm" onClick={() => setProposal({ courtIndex: null, mode: "auto" })}>
                <Plus size={14} />
                จัดเกมเข้าคิว
              </button>
            ) : null}
          </div>

          {view.planned.length === 0 ? (
            <div className="card card-pad text-center text-[12.5px] leading-snug text-ink-faint">
              จัดเกมล่วงหน้าไว้ได้ตอนนี้เลย — พอคอร์ตว่างก็กดลงได้ทันที
              ไม่ต้องมายืนจัดคนตอนที่กำลังวุ่นที่สุด
            </div>
          ) : (
            <ol className="flex flex-col gap-2">
              {view.planned.map((pv, i) => (
                <li key={pv.planned.id} className="card card-pad flex items-center gap-2.5">
                  <span className="nums flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-subtle font-heading text-[13px] font-semibold text-ink-soft">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-heading text-[13.5px] font-medium text-ink">
                      {pv.players.filter((x) => x.team === "A").map((x) => displayName(x.player)).join(" + ")}
                      <span className="mx-1.5 text-ink-faint">vs</span>
                      {pv.players.filter((x) => x.team === "B").map((x) => displayName(x.player)).join(" + ")}
                    </p>
                    <p className="truncate text-[11.5px] text-ink-faint">
                      {pv.problems.length > 0 ? (
                        <span className="text-hinomaru-deep dark:text-hinomaru-soft">{pv.problems.join(" · ")}</span>
                      ) : pv.waitingFor.length > 0 ? (
                        // เรื่องปกติของเกมที่จัดล่วงหน้า — บอกเฉย ๆ ไม่ต้องทำให้ดูเหมือนพัง
                        `รอ ${pv.waitingFor.join(", ")} จบเกมก่อน`
                      ) : freeCourts > 0 ? (
                        "พร้อมลง — มีคอร์ตว่างอยู่"
                      ) : (
                        "พร้อมลง รอคอร์ตว่าง"
                      )}
                    </p>
                  </div>
                  {canControl ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        className="btn-quiet btn-sm px-2"
                        title="เลื่อนขึ้น"
                        disabled={i === 0}
                        onClick={() => void run("", () => api.movePlan(sessionId, pv.planned.id, "up"), { silent: true })}
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        className="btn-quiet btn-sm px-2"
                        title="เลื่อนลง"
                        disabled={i === view.planned.length - 1}
                        onClick={() => void run("", () => api.movePlan(sessionId, pv.planned.id, "down"), { silent: true })}
                      >
                        <ChevronDown size={16} />
                      </button>
                      <button
                        className="btn-quiet btn-sm px-2 text-hinomaru-deep dark:text-hinomaru-soft"
                        title="เอาออกจากคิว"
                        onClick={() => void run("เอาเกมออกจากคิวแล้ว", () => api.unplan(sessionId, pv.planned.id))}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}

      {/* คิวรอ */}
      <section className="flex flex-col gap-2.5">
        <h2 className="section-title">
          <ListOrdered size={15} className="text-gold-deep" />
          คิวรอ ({view.queue.length})
        </h2>

        {view.queue.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<Users size={26} />}
              title="ยังไม่มีคนรอคิว"
              hint="เช็คอินลูกก๊วนที่มาถึงแล้ว ระบบจะเริ่มนับเวลารอให้ทันที"
              action={
                <button className="btn-primary" onClick={() => navigate("/checkin")}>
                  <Plus size={16} />
                  เช็คอินผู้เล่น
                </button>
              }
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {view.queue.slice(0, QUEUE_PREVIEW).map((q, i) => (
              <QueueRow
                key={q.player.id}
                entry={{ ...q, waitMs: q.sp.queueSince ? Math.max(0, now - q.sp.queueSince) : q.waitMs }}
                index={i}
              />
            ))}
            {view.queue.length > QUEUE_PREVIEW ? (
              <button className="btn-ghost btn-sm mt-0.5 self-center" onClick={() => navigate("/queue")}>
                ดูคิวทั้งหมด ({view.queue.length} คน)
              </button>
            ) : null}
          </div>
        )}
      </section>

      {/* เกมที่เพิ่งจบ */}
      {recent.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <h2 className="section-title">
            <History size={15} className="text-gold-deep" />
            เกมที่เพิ่งจบ
          </h2>
          <div className="card divide-y divide-line/60">
            {recent.map((m) => {
              const nameOf = (id: string) => {
                const p = view.roster.find((x) => x.id === id)
                return p ? displayName(p) : "—"
              }
              return (
                <div key={m.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
                  <span className="nums shrink-0 text-[11.5px] text-ink-faint">{thaiTime(m.endedAt ?? m.startedAt)}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {m.teamA.map(nameOf).join(" + ")}
                    <span className="mx-1.5 text-ink-faint">vs</span>
                    {m.teamB.map(nameOf).join(" + ")}
                  </span>
                  {scoreLabel(m) ? (
                    <span className="nums chip shrink-0 bg-subtle text-ink-soft">{scoreLabel(m)}</span>
                  ) : null}
                  {/* เกมที่เสมอต้องอ่านออกว่าเสมอ ไม่ใช่ปล่อยให้เดาเอาจากคะแนน */}
                  {m.winner === "draw" ? (
                    <span className="chip shrink-0 bg-gold/20 text-gold-deep">เสมอ</span>
                  ) : !scoreLabel(m) && m.winner ? (
                    <span className="chip shrink-0 bg-gold/20 text-gold-deep">ฝั่ง {m.winner} ชนะ</span>
                  ) : null}
                  <span className="nums shrink-0 text-[11.5px] text-ink-faint">
                    {formatMinutes((m.endedAt ?? m.startedAt) - m.startedAt)}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {/* หน้าต่างต่าง ๆ */}
      {proposal ? (
        <MatchProposal
          open
          onClose={() => setProposal(null)}
          view={view}
          courtIndex={proposal.courtIndex}
          startMode={proposal.mode}
        />
      ) : null}

      <FinishSheet
        open={finishing != null}
        onClose={() => setFinishing(null)}
        cv={finishing != null ? (view.courts[finishing] ?? null) : null}
        sessionId={sessionId}
      />

      <SwapSheet
        open={swapping != null}
        onClose={() => setSwapping(null)}
        cv={swapping != null ? (view.courts[swapping] ?? null) : null}
        view={view}
      />
    </div>
  )
}
