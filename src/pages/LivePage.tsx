import { useState } from "react"
import { History, ListOrdered, Plus, Sparkles, Users } from "lucide-react"
import { displayName, formatDuration, formatMinutes, thaiTime } from "@shared/types"
import { api } from "@/lib/api"
import { useApp, useNow, useSession } from "@/lib/app"
import { CourtCard } from "@/components/CourtCard"
import { MatchProposal } from "@/components/MatchProposal"
import { FinishSheet, SwapSheet } from "@/components/MatchSheets"
import { QueueRow } from "@/components/player"
import { EmptyState, Stat } from "@/components/ui"

const QUEUE_PREVIEW = 6

export function LivePage({ navigate }: { navigate: (to: string) => void }) {
  const { view, sessionId } = useSession()
  const { run, needPin } = useApp()
  const now = useNow()

  const [proposal, setProposal] = useState<{ courtIndex: number; mode: "auto" | "manual" } | null>(null)
  const [finishing, setFinishing] = useState<number | null>(null)
  const [swapping, setSwapping] = useState<number | null>(null)

  const canControl = !needPin && view.session.status === "live"
  const liveCourts = view.courts
  const freeCourts = liveCourts.filter((c) => !c.match && !c.court.disabled).length
  const recent = [...view.session.matches]
    .filter((m) => m.endedAt)
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
    .slice(0, 5)

  return (
    <div className="flex flex-col gap-4">
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
              onAuto={() => setProposal({ courtIndex: cv.court.index, mode: "auto" })}
              onManual={() => setProposal({ courtIndex: cv.court.index, mode: "manual" })}
              onFinish={() => setFinishing(cv.court.index)}
              onSwap={() => setSwapping(cv.court.index)}
              onCancel={() => {
                if (!cv.match) return
                if (!window.confirm(`ยกเลิกเกมใน ${cv.court.name}? ทุกคนจะกลับไปที่คิวเดิม`)) return
                void run("ยกเลิกเกมแล้ว", () => api.cancelMatch(sessionId, cv.match!.id))
              }}
              onShuttle={(delta) => void run("บันทึกลูกแบดแล้ว", () => api.shuttles(sessionId, delta, cv.match?.id))}
              onToggleCourt={(disabled) =>
                void run(disabled ? "ปิดคอร์ตแล้ว" : "เปิดคอร์ตแล้ว", () =>
                  api.courtPatch(sessionId, cv.court.index, { disabled }),
                )
              }
            />
          ))}
        </div>
      </section>

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
                  {m.scoreA != null ? (
                    <span className="nums chip bg-subtle text-ink-soft">
                      {m.scoreA}-{m.scoreB}
                    </span>
                  ) : m.winner ? (
                    <span className="chip bg-gold/20 text-gold-deep">ฝั่ง {m.winner} ชนะ</span>
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
