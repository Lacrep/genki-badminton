import { useMemo, useState } from "react"
import { Check, Pencil, Search, UserPlus, Users } from "lucide-react"
import { type RosterPlayer, displayName, levelInfo, recordLabel } from "@shared/types"
import { api } from "@/lib/api"
import { PlayerForm } from "@/components/PlayerForm"
import { useApp, useSession } from "@/lib/app"
import { LevelBadge, PlayerAvatar } from "@/components/player"
import { EmptyState } from "@/components/ui"
import { cn } from "@/lib/util"

export function CheckInPage() {
  const { view, sessionId } = useSession()
  const { run, needPin } = useApp()
  const [term, setTerm] = useState("")
  const [picked, setPicked] = useState<string[]>([])
  const [editing, setEditing] = useState<RosterPlayer | "new" | null>(null)

  const canControl = !needPin && view.session.status === "live"
  // ใครที่มาก๊วนนี้แล้วถือว่าอยู่ในรายชื่อ "มาวันนี้" ด้านล่าง ไม่ต้องโผล่ซ้ำข้างบน
  // คนที่กลับบ้านไปแล้วเรียกกลับได้จากปุ่มในรายชื่อนั้นเลย
  const inSession = new Set(view.session.players.map((p) => p.playerId))

  const available = useMemo(() => {
    const q = term.trim().toLowerCase()
    return view.roster
      .filter((p) => !p.archived && !inSession.has(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, "th"))
  }, [view.roster, term, inSession])

  /** คนที่เก็บเข้ากรุไว้ — ซ่อนจากรายชื่อเช็คอิน แต่ต้องมีทางเอากลับมา */
  const archived = useMemo(
    () => view.roster.filter((p) => p.archived).sort((a, b) => a.name.localeCompare(b.name, "th")),
    [view.roster],
  )

  /**
   * ทุกคนที่มาก๊วนวันนี้ รวมคนที่กลับบ้านไปแล้ว
   *
   * เดิมกรองคนที่ "กลับบ้านแล้ว" ทิ้ง พอเก็บเงินครบตอนจบก๊วน (ซึ่งเช็คเอาท์
   * ให้อัตโนมัติ) รายชื่อเลยว่างเปล่าเหมือนไม่มีใครมาเลย ทั้งที่ข้อมูลยังอยู่ครบ
   * คนที่กลับแล้วให้เรียงไว้ท้ายสุดและทำให้จางลง แต่ต้องเห็นเสมอ
   */
  const checkedIn = view.session.players
    .map((sp) => ({ sp, player: view.roster.find((p) => p.id === sp.playerId) }))
    .filter((x): x is { sp: typeof x.sp; player: RosterPlayer } => !!x.player)
    .sort((a, b) => Number(a.sp.status === "left") - Number(b.sp.status === "left"))
  const stillHere = checkedIn.filter((x) => x.sp.status !== "left").length

  const checkInPicked = async () => {
    if (picked.length === 0) return
    await run(`เช็คอิน ${picked.length} คนแล้ว`, () => api.checkInMany(sessionId, picked))
    setPicked([])
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ค้นหา + เพิ่มคน */}
      <div className="card card-pad flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              className="input pl-9"
              placeholder="ค้นหาชื่อในทะเบียนก๊วน"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
          {canControl ? (
            <button className="btn-primary shrink-0" onClick={() => setEditing("new")}>
              <UserPlus size={16} />
              เพิ่มคน
            </button>
          ) : null}
        </div>

        {picked.length > 0 ? (
          <button className="btn-gold btn-lg w-full" onClick={checkInPicked}>
            <Check size={18} />
            เช็คอิน {picked.length} คนที่เลือกไว้
          </button>
        ) : null}
      </div>

      {/* คนที่ยังไม่เช็คอิน */}
      <section className="flex flex-col gap-2">
        <h2 className="section-title">
          <Users size={15} className="text-gold-deep" />
          ยังไม่เช็คอิน ({available.length})
        </h2>
        {available.length === 0 ? (
          <div className="card">
            <EmptyState
              title={term ? "ไม่เจอชื่อนี้ในทะเบียน" : "ทุกคนในทะเบียนเช็คอินครบแล้ว"}
              hint={term ? "กด “เพิ่มคน” เพื่อสร้างชื่อใหม่ แล้วเช็คอินได้เลย" : undefined}
              action={
                canControl ? (
                  <button className="btn-ghost" onClick={() => setEditing("new")}>
                    <UserPlus size={16} />
                    เพิ่มคนใหม่
                  </button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {available.map((p) => {
              const on = picked.includes(p.id)
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-all",
                    on ? "border-gold bg-gold/[0.12]" : "border-line/70 bg-surface",
                  )}
                >
                  <button
                    type="button"
                    disabled={!canControl}
                    onClick={() => setPicked((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <PlayerAvatar player={p} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-heading text-[14px] font-medium text-ink">
                        {displayName(p)}
                      </span>
                      <span className="block truncate text-[11px] text-ink-faint">{levelInfo(p.level).name}</span>
                    </span>
                    <LevelBadge level={p.level} />
                    {on ? <Check size={16} className="text-gold-deep" /> : null}
                  </button>
                  {canControl ? (
                    <button className="btn-quiet !px-1.5 !py-1" onClick={() => setEditing(p)} aria-label="แก้ข้อมูล">
                      <Pencil size={14} />
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* คนที่เก็บเข้ากรุ — ไม่รกรายชื่อหลัก แต่กดเอากลับมาได้ตลอด */}
      {archived.length > 0 ? (
        <details className="card card-pad">
          <summary className="cursor-pointer font-heading text-[13.5px] font-medium text-ink-soft">
            คนที่เก็บเข้ากรุ ({archived.length})
          </summary>
          <p className="mt-1.5 text-[11.5px] text-ink-faint">
            ไม่ขึ้นในรายชื่อเช็คอิน แต่ชื่อและสถิติเก่ายังอยู่ครบ — กดแก้ข้อมูลเพื่อเอากลับมา
          </p>
          <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
            {archived.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5 rounded-xl border border-line/70 px-2.5 py-2">
                <PlayerAvatar player={p} size={28} />
                <span className="min-w-0 flex-1 truncate font-heading text-[13.5px] text-ink-soft">
                  {displayName(p)}
                </span>
                <LevelBadge level={p.level} />
                {canControl ? (
                  <button className="btn-quiet !px-1.5 !py-1" onClick={() => setEditing(p)} aria-label="แก้ข้อมูล">
                    <Pencil size={14} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {/* คนที่เช็คอินแล้ว */}
      <section className="flex flex-col gap-2">
        <h2 className="section-title">
          มาวันนี้ ({checkedIn.length})
          {stillHere < checkedIn.length ? (
            <span className="font-normal text-ink-faint">· ยังอยู่ {stillHere} คน</span>
          ) : null}
        </h2>
        {canControl && checkedIn.length > 0 ? (
          <p className="-mt-1 text-[11.5px] text-ink-faint">
            กดปุ่มดินสอ (หรือแตะที่ชื่อ) เพื่อแก้ชื่อ · ระดับมือ · ใส่รูป — ไม่ต้องเช็คเอาท์ก่อน
          </p>
        ) : null}
        <div className="card divide-y divide-line/60">
          {checkedIn.length === 0 ? (
            <EmptyState title="ยังไม่มีใครมาก๊วนนี้" hint="เลือกชื่อจากด้านบนเพื่อเริ่มนับเวลารอ" />
          ) : (
            checkedIn.map(({ sp, player }) => (
              <div
                key={sp.playerId}
                className={cn("flex items-center gap-2.5 px-3 py-2", sp.status === "left" && "opacity-60")}
              >
                {/* แตะชื่อเพื่อแก้ข้อมูล/ใส่รูปได้เลย ไม่ต้องเช็คเอาท์ออกมาก่อน */}
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  onClick={() => setEditing(player)}
                  disabled={!canControl}
                >
                  <PlayerAvatar player={player} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-heading text-[14px] font-medium text-ink">
                      {displayName(player)}
                    </span>
                    <span className="block truncate text-[11px] text-ink-faint">
                      {sp.gamesPlayed} เกม
                      {sp.wins + sp.losses + sp.draws > 0 ? ` · ${recordLabel(sp)}` : ""}
                      {sp.paid ? " · จ่ายแล้ว" : ""}
                    </span>
                  </span>
                </button>
                {/* คนที่กลับแล้วไม่ต้องโชว์ระดับมือ — เอาที่ว่างไว้ให้ชื่อกับสถิติพอดีบรรทัด */}
                {sp.status === "left" ? null : <LevelBadge level={player.level} />}
                {/* "รอคิว" คือสถานะปกติของเกือบทุกคน ไม่ต้องติดป้ายให้รกและเบียดที่ชื่อ
                    ติดเฉพาะตอนที่ต่างไปจากปกติเท่านั้น */}
                {sp.status === "queue" ? null : (
                  <span
                    className={cn(
                      "chip shrink-0",
                      sp.status === "playing"
                        ? "bg-navy text-white"
                        : sp.status === "resting"
                          ? "bg-gold/25 text-gold-deep"
                          : "bg-subtle text-ink-faint",
                    )}
                  >
                    {sp.status === "playing" ? "ในคอร์ต" : sp.status === "resting" ? "พัก" : "กลับแล้ว"}
                  </span>
                )}
                {/* ปุ่มแก้ข้อมูล/ใส่รูป — ต้องมีให้เห็น ไม่ใช่ซ่อนไว้ให้แตะที่ชื่อเอาเอง */}
                {canControl ? (
                  <button
                    className="btn-quiet !px-1.5 !py-1"
                    onClick={() => setEditing(player)}
                    aria-label={`แก้ข้อมูล ${displayName(player)}`}
                    title="แก้ชื่อ · ระดับมือ · ใส่รูป"
                  >
                    <Pencil size={14} />
                  </button>
                ) : null}
                {canControl && sp.status === "left" ? (
                  <button
                    className="btn-quiet btn-sm"
                    onClick={() => void run("กลับเข้าคิวแล้ว", () => api.checkIn(sessionId, sp.playerId))}
                  >
                    เรียกกลับ
                  </button>
                ) : canControl && sp.status !== "playing" ? (
                  <button
                    className="btn-quiet btn-sm"
                    onClick={() => void run("บันทึกว่ากลับบ้านแล้ว", () => api.checkOut(sessionId, sp.playerId))}
                  >
                    ออก
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>

      {editing ? (
        <PlayerForm
          player={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          checkInAfterCreate
          sessionId={sessionId}
        />
      ) : null}
    </div>
  )
}
