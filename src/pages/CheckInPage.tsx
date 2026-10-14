import { useMemo, useRef, useState } from "react"
import { Archive, ArchiveRestore, Camera, Check, Pencil, Search, Trash2, UserPlus, Users } from "lucide-react"
import { type Level, type RosterPlayer, LEVELS, displayName, levelInfo, recordLabel } from "@shared/types"
import { api, type PlayerInput } from "@/lib/api"
import { squarePhotoDataUrl } from "@/lib/photo"
import { useApp, useSession } from "@/lib/app"
import { LevelBadge, PlayerAvatar } from "@/components/player"
import { EmptyState, Modal } from "@/components/ui"
import { cn } from "@/lib/util"

export function CheckInPage() {
  const { view, sessionId } = useSession()
  const { run, needPin } = useApp()
  const [term, setTerm] = useState("")
  const [picked, setPicked] = useState<string[]>([])
  const [editing, setEditing] = useState<RosterPlayer | "new" | null>(null)

  const canControl = !needPin && view.session.status === "live"
  const inSession = new Set(view.session.players.filter((p) => p.status !== "left").map((p) => p.playerId))

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

  const checkedIn = view.session.players
    .filter((p) => p.status !== "left")
    .map((sp) => ({ sp, player: view.roster.find((p) => p.id === sp.playerId) }))
    .filter((x): x is { sp: typeof x.sp; player: RosterPlayer } => !!x.player)

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
                    <PlayerAvatar player={p} size={32} />
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
        <h2 className="section-title">เช็คอินแล้ว ({checkedIn.length})</h2>
        <div className="card divide-y divide-line/60">
          {checkedIn.length === 0 ? (
            <EmptyState title="ยังไม่มีใครเช็คอิน" hint="เลือกชื่อจากด้านบนเพื่อเริ่มนับเวลารอ" />
          ) : (
            checkedIn.map(({ sp, player }) => (
              <div key={sp.playerId} className="flex items-center gap-2.5 px-3 py-2">
                <PlayerAvatar player={player} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-heading text-[14px] font-medium text-ink">
                    {displayName(player)}
                  </span>
                  <span className="block text-[11px] text-ink-faint">
                    {sp.gamesPlayed} เกม
                    {sp.wins + sp.losses + sp.draws > 0 ? ` · ${recordLabel(sp)}` : ""}
                    {sp.paid ? " · จ่ายแล้ว" : ""}
                  </span>
                </span>
                <LevelBadge level={player.level} />
                <span
                  className={cn(
                    "chip",
                    sp.status === "playing"
                      ? "bg-navy text-white"
                      : sp.status === "resting"
                        ? "bg-gold/25 text-gold-deep"
                        : "bg-subtle text-ink-soft",
                  )}
                >
                  {sp.status === "playing" ? "ในคอร์ต" : sp.status === "resting" ? "พัก" : "รอคิว"}
                </span>
                {canControl && sp.status !== "playing" ? (
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

// ── ฟอร์มเพิ่ม/แก้ผู้เล่น — เก็บแค่ชื่อที่ใช้เรียกกับระดับมือ ────────────────────

export function PlayerForm({
  player: openedPlayer,
  onClose,
  sessionId,
  checkInAfterCreate = false,
}: {
  /** ตัวที่เปิดมา — ใช้แค่ id ส่วนข้อมูลอ่านสด ๆ จากทะเบียนทุกครั้ง */
  player: RosterPlayer | null
  onClose: () => void
  sessionId?: string
  checkInAfterCreate?: boolean
}) {
  const { run, setRoster, toast, roster } = useApp()
  // เปลี่ยนรูปแล้วทะเบียนอัปเดต แต่ของที่ส่งเข้ามาเป็นสำเนาตอนเปิดหน้าต่าง
  // ถ้าไม่อ่านใหม่ รูปในหน้าต่างจะยังเป็นของเก่าจนกว่าจะปิดแล้วเปิดใหม่
  const live = openedPlayer ? (roster.find((r) => r.id === openedPlayer.id) ?? openedPlayer) : null
  const [name, setName] = useState(live?.name ?? "")
  const [level, setLevel] = useState<Level>(live?.level ?? 3)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /** เลือกรูปจากกล้องหรือคลังภาพ — ย่อในเครื่องก่อนส่ง จะได้ไม่ช้าและไม่กินที่ */
  const pickPhoto = async (file: File | undefined) => {
    if (!file || !live) return
    setBusy(true)
    try {
      const data = await squarePhotoDataUrl(file)
      const reply = await run("ใส่รูปแล้ว", () => api.setPhoto(live.id, data))
      if (reply && "roster" in reply) setRoster(reply.roster)
    } catch (err) {
      toast(err instanceof Error ? err.message : "ใส่รูปไม่สำเร็จ", "error")
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const removePhoto = async () => {
    if (!live) return
    setBusy(true)
    const reply = await run("เอารูปออกแล้ว", () => api.clearPhoto(live.id))
    if (reply && "roster" in reply) setRoster(reply.roster)
    setBusy(false)
  }

  const save = async () => {
    const input: PlayerInput = { name: name.trim(), level }
    if (!input.name) return
    setBusy(true)
    if (live) {
      await run("บันทึกข้อมูลแล้ว", () => api.updatePlayer(live.id, input))
    } else if (checkInAfterCreate && sessionId) {
      await run(`เพิ่ม ${input.name} และเช็คอินแล้ว`, () => api.checkInNew(sessionId, input))
    } else {
      const reply = await run(`เพิ่ม ${input.name} ในทะเบียนแล้ว`, () => api.addPlayer(input))
      if (reply && "roster" in reply) setRoster(reply.roster)
    }
    setBusy(false)
    onClose()
  }

  const remove = async () => {
    if (!live) return
    // ลบได้เฉพาะคนที่ยังไม่เคยลงก๊วน (เซิร์ฟเวอร์เป็นคนกัน) คนที่เคยเล่นแล้วให้เก็บเข้ากรุ
    if (!window.confirm(`ลบ ${displayName(live)} ออกจากทะเบียน? ใช้ได้เฉพาะคนที่ยังไม่เคยลงก๊วน`)) return
    setBusy(true)
    const reply = await run("ลบออกจากทะเบียนแล้ว", () => api.deletePlayer(live.id))
    if (reply && "roster" in reply) setRoster(reply.roster)
    setBusy(false)
    onClose()
  }

  /** เก็บเข้ากรุ = หายจากรายชื่อเช็คอิน แต่ชื่อกับประวัติยังอยู่ครบ */
  const setArchived = async (archived: boolean) => {
    if (!live) return
    setBusy(true)
    const reply = await run(archived ? "เก็บเข้ากรุแล้ว" : "เอากลับมาแล้ว", () =>
      api.updatePlayer(live.id, { archived }),
    )
    if (reply && "roster" in reply) setRoster(reply.roster)
    setBusy(false)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={live ? `แก้ข้อมูล ${displayName(live)}` : "เพิ่มผู้เล่นใหม่"}
      subtitle="ใช้ชื่อที่เรียกกันในก๊วนได้เลย ไม่ต้องเป็นชื่อจริง"
      footer={
        <div className="flex items-center gap-1 whitespace-nowrap">
          {live ? (
            live.archived ? (
              <button className="btn-quiet !px-2" onClick={() => setArchived(false)} disabled={busy}>
                <ArchiveRestore size={16} />
                เอากลับมา
              </button>
            ) : (
              <>
                <button className="btn-quiet !px-2" onClick={() => setArchived(true)} disabled={busy}>
                  <Archive size={16} />
                  เก็บเข้ากรุ
                </button>
                <button className="btn-quiet !px-2 !text-hinomaru" onClick={remove} disabled={busy}>
                  <Trash2 size={16} />
                  ลบ
                </button>
              </>
            )
          ) : null}
          <div className="flex-1" />
          <button className="btn-quiet !px-2" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" onClick={save} disabled={busy || !name.trim()}>
            {live ? "บันทึก" : checkInAfterCreate ? "เพิ่มและเช็คอิน" : "เพิ่ม"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {live ? (
          <div className="flex items-center gap-3">
            <PlayerAvatar player={live} size={64} />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                // บนมือถือจะมีทั้ง "ถ่ายรูป" และ "เลือกจากคลังภาพ" ให้เลือกเอง
                className="hidden"
                onChange={(e) => void pickPhoto(e.target.files?.[0])}
              />
              <div className="flex flex-wrap gap-1.5">
                <button className="btn-ghost !py-1.5 !text-[12.5px]" onClick={() => fileRef.current?.click()} disabled={busy}>
                  <Camera size={15} />
                  {live.photoAt ? "เปลี่ยนรูป" : "ใส่รูป"}
                </button>
                {live.photoAt ? (
                  <button className="btn-quiet !py-1.5 !text-[12.5px] !text-hinomaru" onClick={() => void removePhoto()} disabled={busy}>
                    <Trash2 size={15} />
                    เอารูปออก
                  </button>
                ) : null}
              </div>
              <p className="text-[11px] leading-snug text-ink-faint">ถ่ายใหม่หรือเลือกจากคลังภาพก็ได้ · ระบบย่อรูปให้เอง</p>
            </div>
          </div>
        ) : null}

        <div>
          <label className="label" htmlFor="pf-name">
            ชื่อที่ใช้เรียกในก๊วน
          </label>
          <input
            id="pf-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น ต้น, พี่หมู, แนน"
            autoFocus
          />
        </div>

        <div>
          <span className="label">ระดับมือ — {levelInfo(level).name}</span>
          <div className="grid grid-cols-4 gap-1.5">
            {LEVELS.map((l) => (
              <button
                key={l.level}
                type="button"
                onClick={() => setLevel(l.level)}
                className={cn(
                  "rounded-lg border px-1 py-2.5 font-heading text-[13px] font-semibold transition-all",
                  l.level === level
                    ? "border-navy bg-navy text-white"
                    : "border-line bg-surface text-ink-soft hover:bg-subtle",
                )}
              >
                {l.code}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] leading-snug text-ink-faint">{levelInfo(level).hint}</p>
        </div>
      </div>
    </Modal>
  )
}
