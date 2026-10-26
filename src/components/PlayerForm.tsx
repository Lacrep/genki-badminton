import { useRef, useState } from "react"
import { Archive, ArchiveRestore, Camera, Trash2 } from "lucide-react"
import { type Level, type RosterPlayer, LEVELS, displayName, levelInfo } from "@shared/types"
import { api, type PlayerInput } from "@/lib/api"
import { useApp } from "@/lib/app"
import { PhotoCropper } from "@/components/PhotoCropper"
import { PlayerAvatar } from "@/components/player"
import { Modal } from "@/components/ui"
import { cn } from "@/lib/util"

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
  const [cropping, setCropping] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /** ชื่อซ้ำกับคนที่มีอยู่แล้วไหม — เทียบแบบไม่สนช่องว่างกับตัวพิมพ์ เหมือนฝั่งเซิร์ฟเวอร์ */
  const nameKey = (v: string) => v.replace(/\s+/g, "").toLowerCase()
  const clash = roster.find((r) => r.id !== live?.id && nameKey(r.name) === nameKey(name) && name.trim() !== "")

  /** เลือกไฟล์แล้วเปิดหน้าต่างปรับรูปก่อน ไม่บันทึกทันที */
  const pickPhoto = (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = ""
    if (!file || !live) return
    if (!file.type.startsWith("image/")) {
      toast("ไฟล์นี้ไม่ใช่รูปภาพ", "error")
      return
    }
    setCropping(file)
  }

  /** ปรับเสร็จแล้วค่อยส่งขึ้นเซิร์ฟเวอร์ */
  const savePhoto = async (data: string) => {
    if (!live) return
    setCropping(null)
    setBusy(true)
    try {
      const reply = await run("ใส่รูปแล้ว", () => api.setPhoto(live.id, data))
      if (reply && "roster" in reply) setRoster(reply.roster)
    } catch (err) {
      toast(err instanceof Error ? err.message : "ใส่รูปไม่สำเร็จ", "error")
    } finally {
      setBusy(false)
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
          <button className="btn-primary" onClick={save} disabled={busy || !name.trim() || !!clash}>
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
                onChange={(e) => pickPhoto(e.target.files?.[0])}
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
          {cropping ? (
            <PhotoCropper file={cropping} onCancel={() => setCropping(null)} onDone={(d) => void savePhoto(d)} />
          ) : null}
          {clash ? (
            <p className="mt-1.5 text-[12px] leading-snug text-hinomaru">
              มีชื่อ “{clash.name}” อยู่ในทะเบียนแล้ว — ใช้ชื่อซ้ำกันไม่ได้
              {clash.archived ? " (ถูกเก็บเข้ากรุไว้ เอากลับมาใช้แทนได้)" : ""}
            </p>
          ) : null}
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
