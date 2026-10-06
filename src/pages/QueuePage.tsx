import { useMemo, useState } from "react"
import { Coffee, DoorOpen, ListOrdered, Star, StarOff, Users } from "lucide-react"
import { type QueueEntry, displayName, formatDuration, formatMinutes } from "@shared/types"
import { api } from "@/lib/api"
import { useApp, useNow, useSession } from "@/lib/app"
import { LevelBadge, PlayerAvatar, QueueRow, WaitClock } from "@/components/player"
import { EmptyState, Modal, Segmented, Stat } from "@/components/ui"

type SortKey = "queue" | "wait" | "games"

export function QueuePage() {
  const { view, sessionId } = useSession()
  const { run, needPin } = useApp()
  const now = useNow()
  const [sort, setSort] = useState<SortKey>("queue")
  const [selected, setSelected] = useState<QueueEntry | null>(null)

  const canControl = !needPin && view.session.status === "live"

  const queue = useMemo(() => {
    const live = view.queue.map((q) => ({
      ...q,
      waitMs: q.sp.queueSince ? Math.max(0, now - q.sp.queueSince) : q.waitMs,
    }))
    if (sort === "wait") return live.sort((a, b) => b.waitMs - a.waitMs)
    if (sort === "games") return live.sort((a, b) => a.sp.gamesPlayed - b.sp.gamesPlayed || b.waitMs - a.waitMs)
    return live
  }, [view.queue, sort, now])

  const playing = view.courts.flatMap((c) =>
    c.players.map((p) => ({ ...p, courtName: c.court.name, since: c.match?.startedAt ?? now })),
  )
  const gone = view.session.players.filter((p) => p.status === "left")

  return (
    <div className="flex flex-col gap-4">
      <div className="card card-pad">
        <div className="mb-3 grid grid-cols-3 gap-3">
          <Stat label="รอคิว" value={queue.length} />
          <Stat
            label="รอเฉลี่ย"
            value={queue.length ? formatMinutes(view.stats.avgWaitMs) : "—"}
            tone="gold"
          />
          <Stat
            label="รอนานสุด"
            value={queue.length ? formatDuration(Math.max(...queue.map((q) => q.waitMs))) : "—"}
            tone={view.dongAlerts.length ? "red" : "navy"}
          />
        </div>
        <Segmented
          value={sort}
          onChange={setSort}
          size="sm"
          options={[
            { value: "queue", label: "ลำดับคิวจริง" },
            { value: "wait", label: "เรียงตามเวลารอ" },
            { value: "games", label: "เรียงตามเกมที่ลง" },
          ]}
        />
        <p className="mt-2 text-[11.5px] leading-snug text-ink-faint">
          ลำดับคิวจริงคิดจาก เวลารอ + จำนวนเกมที่ตามหลังคนอื่น + การดันคิวด้วยมือ —
          ใครรอเกิน {view.session.settings.dongWaitMinutes} นาที ระบบจะบังคับให้ลงเกมถัดไป
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="section-title">
          <ListOrdered size={15} className="text-gold-deep" />
          คิวรอ ({queue.length})
        </h2>
        {queue.length === 0 ? (
          <div className="card">
            <EmptyState icon={<Users size={24} />} title="ไม่มีใครนั่งรออยู่" hint="ทุกคนได้ลงคอร์ตครบแล้ว" />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {queue.map((q, i) => (
              <QueueRow
                key={q.player.id}
                entry={q}
                index={i}
                pinned={q.sp.boost > 0}
                onMenu={canControl ? () => setSelected(q) : undefined}
              />
            ))}
          </div>
        )}
      </section>

      {playing.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="section-title">กำลังเล่น ({playing.length})</h2>
          <div className="card divide-y divide-line/60">
            {playing.map((p) => (
              <div key={p.player.id} className="flex items-center gap-2.5 px-3 py-2">
                <PlayerAvatar player={p.player} size={30} />
                <span className="min-w-0 flex-1 truncate font-heading text-[14px] font-medium text-ink">
                  {displayName(p.player)}
                </span>
                <span className="chip bg-navy/10 text-navy dark:bg-navy-soft/40 dark:text-sand">{p.courtName}</span>
                <LevelBadge level={p.player.level} />
                <span className="nums text-[12px] text-ink-soft">{formatDuration(now - p.since)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {view.resting.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="section-title">
            <Coffee size={15} className="text-gold-deep" />
            ขอพัก ({view.resting.length})
          </h2>
          <div className="card divide-y divide-line/60">
            {view.resting.map((r) => (
              <div key={r.player.id} className="flex items-center gap-2.5 px-3 py-2">
                <PlayerAvatar player={r.player} size={30} />
                <span className="min-w-0 flex-1 truncate font-heading text-[14px] font-medium text-ink">
                  {displayName(r.player)}
                </span>
                <span className="nums text-[12px] text-ink-faint">ลงไป {r.sp.gamesPlayed} เกม</span>
                {canControl ? (
                  <button
                    className="btn-ghost btn-sm"
                    onClick={() => void run("กลับเข้าคิวแล้ว", () => api.rest(sessionId, r.player.id, false))}
                  >
                    กลับเข้าคิว
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {gone.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="section-title">
            <DoorOpen size={15} className="text-ink-faint" />
            กลับบ้านแล้ว ({gone.length})
          </h2>
          <div className="card divide-y divide-line/60">
            {gone.map((sp) => {
              const player = view.roster.find((p) => p.id === sp.playerId)
              if (!player) return null
              return (
                <div key={sp.playerId} className="flex items-center gap-2.5 px-3 py-2 opacity-70">
                  <PlayerAvatar player={player} size={28} />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{displayName(player)}</span>
                  <span className="nums text-[12px] text-ink-faint">{sp.gamesPlayed} เกม</span>
                  {canControl ? (
                    <button
                      className="btn-quiet btn-sm"
                      onClick={() => void run("เช็คอินกลับเข้าก๊วนแล้ว", () => api.checkIn(sessionId, sp.playerId))}
                    >
                      กลับมาแล้ว
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      <PlayerActionSheet
        entry={selected}
        onClose={() => setSelected(null)}
        onAction={(action) => {
          if (!selected) return
          const pid = selected.player.id
          setSelected(null)
          if (action === "boost") void run("ดันคิวให้ลงเกมถัดไป", () => api.boost(sessionId, pid, 1))
          if (action === "unboost") void run("ยกเลิกการดันคิว", () => api.boost(sessionId, pid, 0))
          if (action === "rest") void run("ให้พักแล้ว", () => api.rest(sessionId, pid, true))
          if (action === "leave") void run("บันทึกว่ากลับบ้านแล้ว", () => api.checkOut(sessionId, pid))
        }}
      />
    </div>
  )
}

function PlayerActionSheet({
  entry,
  onClose,
  onAction,
}: {
  entry: QueueEntry | null
  onClose: () => void
  onAction: (action: "boost" | "unboost" | "rest" | "leave") => void
}) {
  if (!entry) return null
  const { player, sp, waitMs, tier, queueAhead, etaMinutes } = entry
  return (
    <Modal open onClose={onClose} title={displayName(player)} subtitle={`มือ ${player.level} · ลงไป ${sp.gamesPlayed} เกม`}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-line/70 bg-subtle/50 px-3 py-2.5">
          <PlayerAvatar player={player} size={38} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <LevelBadge level={player.level} showName />
            </div>
            <p className="mt-0.5 text-[12px] text-ink-soft">
              รวมวันนี้: เล่น {formatMinutes(sp.playedMs)} · รอ {formatMinutes(sp.waitedMs)}
            </p>
          </div>
          <WaitClock waitMs={waitMs} tier={tier} />
        </div>

        <p className="text-[12.5px] text-ink-soft">
          {queueAhead === 0
            ? "อยู่หัวคิว — ได้ลงเกมถัดไปที่คอร์ตว่าง"
            : etaMinutes != null && etaMinutes <= 0
              ? "ใกล้ได้ลงแล้ว — รอคอร์ตว่างคอร์ตถัดไป"
              : `รออีกประมาณ ${queueAhead} เกม${etaMinutes != null ? ` (~${etaMinutes} นาที)` : ""}`}
        </p>

        <div className="flex flex-col gap-2">
          {sp.boost > 0 ? (
            <button className="btn-ghost" onClick={() => onAction("unboost")}>
              <StarOff size={16} />
              ยกเลิกการดันคิว
            </button>
          ) : (
            <button className="btn-gold" onClick={() => onAction("boost")}>
              <Star size={16} />
              ดันคิวให้ได้ลงเกมถัดไป
            </button>
          )}
          <button className="btn-ghost" onClick={() => onAction("rest")}>
            <Coffee size={16} />
            ขอพัก (ไม่ถูกสุ่มลงชั่วคราว)
          </button>
          <button className="btn-ghost !text-hinomaru" onClick={() => onAction("leave")}>
            <DoorOpen size={16} />
            กลับบ้านแล้ว
          </button>
        </div>
      </div>
    </Modal>
  )
}
