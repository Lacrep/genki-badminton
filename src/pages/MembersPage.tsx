import { useEffect, useMemo, useState } from "react"
import { Archive, ArchiveRestore, Pencil, Search, UserPlus, Users } from "lucide-react"
import { type RosterPlayer, LEVELS, displayName, formatMinutes, levelInfo, recordLabel } from "@shared/types"
import { api } from "@/lib/api"
import { useApp } from "@/lib/app"
import { PlayerForm } from "@/components/PlayerForm"
import { LevelBadge, PlayerAvatar } from "@/components/player"
import { EmptyState, Segmented } from "@/components/ui"
import { cn } from "@/lib/util"

/** สถิติรวมทุกก๊วนของคนหนึ่งคน — ใช้โชว์ว่าคนนี้มากี่ครั้ง ลงไปกี่เกม */
interface AllTime {
  playerId: string
  sessions: number
  games: number
  wins: number
  losses: number
  draws: number
  playedMs: number
}

/**
 * ทะเบียนสมาชิกก๊วน — เปิดดูและแก้ไขได้ตลอด ไม่ต้องเปิดก๊วนหรือเช็คอินก่อน
 *
 * หน้าเช็คอินใช้ได้เฉพาะตอนมีก๊วนเปิดอยู่ แต่การแก้ชื่อ เปลี่ยนระดับมือ หรือใส่รูป
 * เป็นงานที่ทำตอนว่าง ๆ ระหว่างสัปดาห์ ไม่ใช่ตอนสนามกำลังวุ่น หน้านี้จึงแยกออกมา
 * และเข้าได้เสมอ ทั้งวันที่มีก๊วนและวันที่ไม่มี
 */
export function MembersPage() {
  const { roster, needPin } = useApp()
  const [term, setTerm] = useState("")
  const [tab, setTab] = useState<"active" | "archived">("active")
  const [editing, setEditing] = useState<RosterPlayer | "new" | null>(null)
  const [stats, setStats] = useState<Map<string, AllTime> | null>(null)

  // สถิติรวมโหลดครั้งเดียวพอ — ไม่ได้เปลี่ยนระหว่างที่นั่งแก้ทะเบียนอยู่
  useEffect(() => {
    let alive = true
    void api
      .stats()
      .then((r) => {
        if (alive) setStats(new Map(r.stats.map((s) => [s.playerId, s])))
      })
      .catch(() => {
        // สถิติโหลดไม่ได้ก็แค่ไม่โชว์ ไม่ต้องทำให้ทั้งหน้าพัง — แก้ทะเบียนยังทำได้
        if (alive) setStats(new Map())
      })
    return () => {
      alive = false
    }
  }, [])

  const shown = useMemo(() => {
    const q = term.replace(/\s+/g, "").toLowerCase()
    return roster
      .filter((p) => (tab === "archived" ? p.archived : !p.archived))
      .filter((p) => !q || p.name.replace(/\s+/g, "").toLowerCase().includes(q))
      .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, "th"))
  }, [roster, term, tab])

  const activeCount = roster.filter((p) => !p.archived).length
  const archivedCount = roster.length - activeCount

  /** กี่คนในแต่ละระดับมือ — ดูภาพรวมก๊วนว่ามือหนักมือเบาอย่างละเท่าไร */
  const byLevel = useMemo(() => {
    const map = new Map<number, number>()
    for (const p of roster) if (!p.archived) map.set(p.level, (map.get(p.level) ?? 0) + 1)
    return map
  }, [roster])

  return (
    <div className="flex flex-col gap-4">
      <div className="card card-pad flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-[17px] font-semibold text-ink">ทะเบียนสมาชิกก๊วน</h1>
            <p className="text-[12px] leading-snug text-ink-faint">
              แก้ชื่อ เปลี่ยนระดับมือ ใส่รูป หรือเพิ่มคนใหม่ได้ตลอด ไม่ต้องรอเปิดก๊วน
            </p>
          </div>
          {!needPin ? (
            <button className="btn-primary shrink-0" onClick={() => setEditing("new")}>
              <UserPlus size={16} />
              เพิ่มคน
            </button>
          ) : null}
        </div>

        {/* สรุปจำนวนคนในแต่ละระดับมือ — กวาดตาทีเดียวรู้ว่าก๊วนมีมือไหนเยอะ */}
        <div className="flex flex-wrap gap-1.5">
          <span className="chip bg-subtle font-semibold text-ink-soft">ทั้งหมด {activeCount} คน</span>
          {LEVELS.map((l) =>
            byLevel.get(l.level) ? (
              <span key={l.level} className={cn("chip", l.tone)}>
                {l.code} {byLevel.get(l.level)}
              </span>
            ) : null,
          )}
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            className="input pl-9"
            placeholder="ค้นหาชื่อในทะเบียน"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>

        {archivedCount > 0 ? (
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "active", label: `ใช้งานอยู่ (${activeCount})` },
              { value: "archived", label: `เก็บเข้ากรุ (${archivedCount})` },
            ]}
          />
        ) : null}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="section-title">
          <Users size={15} className="text-gold-deep" />
          {tab === "archived" ? "คนที่เก็บเข้ากรุไว้" : "รายชื่อทั้งหมด"} ({shown.length})
        </h2>

        {shown.length === 0 ? (
          <div className="card">
            <EmptyState
              title={term ? "ไม่เจอชื่อนี้ในทะเบียน" : tab === "archived" ? "ยังไม่มีใครถูกเก็บเข้ากรุ" : "ทะเบียนยังว่างอยู่"}
              hint={
                term
                  ? "ลองพิมพ์สั้นลง หรือกด “เพิ่มคน” เพื่อสร้างชื่อใหม่"
                  : tab === "archived"
                    ? "คนที่เลิกมาก๊วนแล้วเก็บเข้ากรุได้ ชื่อจะหายจากรายชื่อเช็คอินแต่สถิติเก่ายังอยู่ครบ"
                    : "กด “เพิ่มคน” เพื่อเริ่มสร้างทะเบียนก๊วน"
              }
              action={
                !needPin ? (
                  <button className="btn-ghost" onClick={() => setEditing("new")}>
                    <UserPlus size={16} />
                    เพิ่มคนใหม่
                  </button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="card divide-y divide-line/60">
            {shown.map((p) => {
              const st = stats?.get(p.id)
              return (
                <div key={p.id} className={cn("flex items-center gap-2.5 px-3 py-2.5", p.archived && "opacity-70")}>
                  <PlayerAvatar player={p} size={44} />
                  <div className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-heading text-[14.5px] font-semibold text-ink">
                        {displayName(p)}
                      </span>
                      {p.archived ? (
                        <span className="chip shrink-0 bg-subtle text-ink-faint">
                          <Archive size={11} />
                          ในกรุ
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-[11.5px] leading-snug text-ink-faint">
                      {levelInfo(p.level).name}
                      {/* สถิติรวมทุกครั้งที่เคยมา — ยืนยันว่าของเก่ายังอยู่ครบ */}
                      {st
                        ? ` · มา ${st.sessions} ครั้ง · ลงไป ${st.games} เกม${
                            st.wins + st.losses + st.draws > 0 ? ` · ${recordLabel(st)}` : ""
                          }`
                        : ""}
                    </span>
                    {/* ต่ำกว่าหนึ่งนาทีเขียน "0 นาที" ซึ่งอ่านแล้วงงกว่าไม่เขียน */}
                    {st && st.playedMs >= 60_000 ? (
                      <span className="block text-[11px] leading-snug text-ink-faint/80">
                        อยู่ในคอร์ตรวม {formatMinutes(st.playedMs)}
                      </span>
                    ) : null}
                  </div>
                  <LevelBadge level={p.level} />
                  {!needPin ? (
                    <button
                      className="btn-quiet !px-2 !py-1.5"
                      onClick={() => setEditing(p)}
                      title={`แก้ข้อมูล ${displayName(p)}`}
                      aria-label={`แก้ข้อมูล ${displayName(p)}`}
                    >
                      {p.archived ? <ArchiveRestore size={16} /> : <Pencil size={16} />}
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <p className="px-1 text-center text-[11.5px] leading-snug text-ink-faint">
        ชื่อกับสถิติเก็บไว้ถาวรในเครื่องที่รันระบบ · ลบคนได้เฉพาะคนที่ยังไม่เคยลงก๊วน
        คนที่เคยเล่นแล้วให้ “เก็บเข้ากรุ” แทน สถิติเก่าจะได้ไม่หาย
      </p>

      {editing ? (
        <PlayerForm player={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  )
}
