import { useMemo, useState } from "react"
import { Check, Pencil, Search, Trash2, UserPlus, Users } from "lucide-react"
import { type Gender, type Level, type RosterPlayer, LEVELS, displayName, levelInfo } from "@shared/types"
import { api, type PlayerInput } from "@/lib/api"
import { useApp, useSession } from "@/lib/app"
import { LevelBadge, PlayerAvatar } from "@/components/player"
import { EmptyState, Modal, Segmented } from "@/components/ui"
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
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.nickname ?? "").toLowerCase().includes(q))
      .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, "th"))
  }, [view.roster, term, inSession])

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
              <span className="hidden sm:inline">เพิ่มคน</span>
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
              hint={term ? "กด “เพิ่มคน” เพื่อสร้างสมาชิกใหม่ แล้วเช็คอินได้เลย" : undefined}
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
                      <span className="block truncate text-[11px] text-ink-faint">
                        {levelInfo(p.level).name}
                        {p.member ? "" : " · ขาจร"}
                      </span>
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
                    {sp.gamesPlayed} เกม{sp.paid ? " · จ่ายแล้ว" : ""}
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

// ── ฟอร์มเพิ่ม/แก้ผู้เล่น ──────────────────────────────────────────────────────

export function PlayerForm({
  player,
  onClose,
  sessionId,
  checkInAfterCreate = false,
}: {
  player: RosterPlayer | null
  onClose: () => void
  sessionId?: string
  checkInAfterCreate?: boolean
}) {
  const { run, setRoster } = useApp()
  const [name, setName] = useState(player?.name ?? "")
  const [nickname, setNickname] = useState(player?.nickname ?? "")
  const [gender, setGender] = useState<Gender>(player?.gender ?? "m")
  const [level, setLevel] = useState<Level>(player?.level ?? 4)
  const [member, setMember] = useState(player?.member ?? true)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const input: PlayerInput = {
      name: name.trim(),
      nickname: nickname.trim() || undefined,
      gender,
      level,
      member,
    }
    if (!input.name) return
    setBusy(true)
    if (player) {
      await run("บันทึกข้อมูลแล้ว", () => api.updatePlayer(player.id, input))
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
    if (!player) return
    if (!window.confirm(`ลบ ${displayName(player)} ออกจากทะเบียน? สถิติเก่าของก๊วนที่ผ่านมาจะยังอยู่`)) return
    setBusy(true)
    const reply = await run("ลบออกจากทะเบียนแล้ว", () => api.deletePlayer(player.id))
    if (reply && "roster" in reply) setRoster(reply.roster)
    setBusy(false)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={player ? `แก้ข้อมูล ${displayName(player)}` : "เพิ่มผู้เล่นใหม่"}
      subtitle={player ? undefined : "ใส่ระดับมือให้ใกล้ความจริง ระบบจะจับคู่ให้สนุกขึ้นเอง"}
      footer={
        <div className="flex items-center gap-2">
          {player ? (
            <button className="btn-quiet !text-hinomaru" onClick={remove} disabled={busy}>
              <Trash2 size={16} />
              ลบ
            </button>
          ) : null}
          <div className="flex-1" />
          <button className="btn-quiet" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" onClick={save} disabled={busy || !name.trim()}>
            {player ? "บันทึก" : checkInAfterCreate ? "เพิ่มและเช็คอิน" : "เพิ่ม"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div>
          <label className="label" htmlFor="pf-name">
            ชื่อ-นามสกุล
          </label>
          <input id="pf-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="สมชาย ใจดี" />
        </div>
        <div>
          <label className="label" htmlFor="pf-nick">
            ชื่อเล่น (ใช้เรียกในก๊วน)
          </label>
          <input id="pf-nick" className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="ชาย" />
        </div>

        <div>
          <span className="label">เพศ (ใช้จัดชายคู่ / หญิงคู่ / คู่ผสม)</span>
          <Segmented
            value={gender}
            onChange={setGender}
            options={[
              { value: "m", label: "ชาย" },
              { value: "f", label: "หญิง" },
            ]}
            size="sm"
          />
        </div>

        <div>
          <span className="label">ระดับมือ — {levelInfo(level).name}</span>
          <div className="grid grid-cols-5 gap-1.5">
            {LEVELS.map((l) => (
              <button
                key={l.level}
                type="button"
                onClick={() => setLevel(l.level)}
                className={cn(
                  "rounded-lg border px-1 py-2 font-heading text-[12.5px] font-semibold transition-all",
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

        <div>
          <span className="label">ประเภทสมาชิก</span>
          <Segmented
            value={member ? "member" : "guest"}
            onChange={(v) => setMember(v === "member")}
            options={[
              { value: "member", label: "สมาชิกก๊วน" },
              { value: "guest", label: "ขาจร" },
            ]}
            size="sm"
          />
        </div>
      </div>
    </Modal>
  )
}
