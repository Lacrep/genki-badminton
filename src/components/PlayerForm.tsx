import { useRef, useState } from "react"
import { AlertTriangle, Archive, ArchiveRestore, Camera, Trash2 } from "lucide-react"
import { type Level, type RosterPlayer, LEVELS, displayName, levelInfo } from "@shared/types"
import { ApiError, api, type PlayerInput } from "@/lib/api"
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
  /**
   * หน้าต่างยืนยันการลบ
   *
   * "ask" = ถามครั้งแรก · "confirm" = เคยลงก๊วนมาแล้ว ต้องยืนยันอีกชั้นพร้อมบอกว่าเสียอะไร
   * ไม่ใช้ window.confirm เพราะข้อความยาวและต้องอ่านให้ออกว่าลบแล้วเกิดอะไรขึ้นบ้าง
   */
  const [removing, setRemoving] = useState<
    | null
    | { stage: "ask" }
    | { stage: "confirm"; sessions: number; games: number }
    | { stage: "checkout"; sessionId: string; playing: boolean }
  >(null)
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

  /**
   * ลบออกจากทะเบียน
   *
   * ลองลบแบบไม่บังคับก่อน ถ้าคนนี้เคยลงก๊วนมาแล้วเซิร์ฟเวอร์จะตอบ 409 พร้อมบอกว่า
   * กี่ครั้งกี่เกม แล้วค่อยเปิดหน้าต่างยืนยันอีกชั้น — คนที่เพิ่งเพิ่มผิดจะได้ลบจบในคลิกเดียว
   * ส่วนคนที่มีประวัติจริงถึงจะต้องอ่านก่อนกด
   */
  const remove = async (force: boolean) => {
    if (!live) return
    setBusy(true)
    try {
      const reply = await api.deletePlayer(live.id, force)
      setRoster(reply.roster)
      toast(
        reply.removed.sessions > 0
          ? `ลบ ${reply.removed.name} ออกจากทะเบียนแล้ว (ประวัติก๊วนเก่ายังอยู่)`
          : `ลบ ${reply.removed.name} ออกจากทะเบียนแล้ว`,
        "ok",
      )
      setRemoving(null)
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.data.needConfirm) {
        setRemoving({
          stage: "confirm",
          sessions: Number(err.data.sessions ?? 0),
          games: Number(err.data.games ?? 0),
        })
      } else if (err instanceof ApiError && err.status === 409 && err.data.needCheckout) {
        setRemoving({
          stage: "checkout",
          sessionId: String(err.data.sessionId ?? ""),
          playing: Boolean(err.data.playing),
        })
      } else {
        toast(err instanceof Error ? err.message : "ลบไม่สำเร็จ", "error")
        setRemoving(null)
      }
    } finally {
      setBusy(false)
    }
  }

  /** ติดอยู่ในก๊วนที่กำลังเล่น — เช็คเอาท์ให้ก่อนแล้วลบต่อเลย ไม่ต้องไปกดเองสองที่ */
  const checkOutThenRemove = async (sid: string) => {
    if (!live) return
    setBusy(true)
    try {
      await api.checkOut(sid, live.id)
    } catch (err) {
      toast(err instanceof Error ? err.message : "เช็คเอาท์ไม่สำเร็จ", "error")
      setBusy(false)
      return
    }
    setBusy(false)
    await remove(false)
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
    <>
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
                <button className="btn-quiet !px-2 !text-hinomaru" onClick={() => setRemoving({ stage: "ask" })} disabled={busy}>
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
    {removing && live ? (
      <ConfirmRemove
        name={displayName(live)}
        stage={removing}
        busy={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing.stage === "checkout") void checkOutThenRemove(removing.sessionId)
          else void remove(removing.stage === "confirm")
        }}
        onArchive={() => {
          setRemoving(null)
          void setArchived(true)
        }}
      />
    ) : null}
    </>
  )
}

/**
 * ยืนยันก่อนลบคนออกจากทะเบียน
 *
 * สองขั้น: ถามปกติ แล้วถ้าคนนี้เคยลงก๊วนมาแล้วค่อยถามซ้ำพร้อมบอกจำนวนครั้ง/เกม
 * และเสนอ "เก็บเข้ากรุ" ให้เป็นทางเลือก เพราะส่วนใหญ่ที่อยากลบคนเก่าจริง ๆ ต้องการแค่
 * ให้ชื่อหายจากรายชื่อเช็คอิน ไม่ได้อยากให้ประวัติหายไปด้วย
 */
function ConfirmRemove({
  name,
  stage,
  busy,
  onCancel,
  onConfirm,
  onArchive,
}: {
  name: string
  stage:
    | { stage: "ask" }
    | { stage: "confirm"; sessions: number; games: number }
    | { stage: "checkout"; sessionId: string; playing: boolean }
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
  onArchive: () => void
}) {
  const hard = stage.stage === "confirm"
  const stuck = stage.stage === "checkout"
  // อยู่ในคอร์ตอยู่ เช็คเอาท์ยังไม่ได้ ต้องจบเกมก่อน จึงไม่มีปุ่มให้กดต่อ
  const playing = stuck && stage.playing

  return (
    <Modal
      open
      onClose={onCancel}
      title={
        stuck
          ? `${name} ยังอยู่ในก๊วนวันนี้`
          : hard
            ? `${name} เคยลงก๊วนมาแล้ว`
            : `ลบ ${name} ออกจากทะเบียน?`
      }
      subtitle={hard ? "ยืนยันอีกครั้งก่อนลบถาวร" : undefined}
      footer={
        <div className="flex w-full flex-col gap-2">
          {/* btn-red คือคลาสฐานที่มี flex/gap/จัดกลางให้อยู่แล้ว — btn-lg เป็นแค่ขนาด */}
          {playing ? null : (
            <button className="btn-red btn-lg w-full" onClick={onConfirm} disabled={busy}>
              <Trash2 size={17} />
              {stuck ? "เช็คเอาท์แล้วลบเลย" : hard ? "ลบถาวร เข้าใจแล้ว" : "ลบออกจากทะเบียน"}
            </button>
          )}
          {hard ? (
            <button className="btn-ghost w-full" onClick={onArchive} disabled={busy}>
              <Archive size={16} />
              เก็บเข้ากรุแทน (ประวัติอยู่ครบ)
            </button>
          ) : null}
          <button className="btn-quiet w-full" onClick={onCancel} disabled={busy}>
            {playing ? "ปิด" : "ยกเลิก"}
          </button>
        </div>
      }
    >
      {stuck ? (
        <div className="flex items-start gap-2.5 rounded-xl border-2 border-gold/60 bg-gold/[0.12] px-3 py-2.5">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-gold-deep dark:text-gold-soft" />
          <p className="text-[13px] leading-snug text-ink">
            {playing ? (
              <>
                <b className="font-heading">{name}</b> กำลังอยู่ในคอร์ตตอนนี้
                <span className="block text-ink-soft">จบเกมที่เขาเล่นอยู่ก่อน แล้วค่อยกลับมาลบได้</span>
              </>
            ) : (
              <>
                <b className="font-heading">{name}</b> เช็คอินอยู่ในก๊วนวันนี้
                <span className="block text-ink-soft">
                  กดปุ่มด้านล่างแล้วระบบจะเช็คเอาท์ให้ก่อน แล้วลบออกจากทะเบียนต่อให้เลย
                </span>
              </>
            )}
          </p>
        </div>
      ) : hard ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2.5 rounded-xl border-2 border-hinomaru/55 bg-hinomaru/[0.1] px-3 py-2.5">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-hinomaru" />
            <p className="text-[13px] leading-snug text-ink">
              <b className="font-heading">{name}</b> ลงก๊วนไปแล้ว{" "}
              <b className="font-heading nums">{stage.sessions}</b> ครั้ง รวม{" "}
              <b className="font-heading nums">{stage.games}</b> เกม
            </p>
          </div>
          <ul className="flex flex-col gap-1.5 text-[12.5px] leading-snug text-ink-soft">
            <li>• ชื่อจะหายจากทะเบียน หน้าเช็คอิน และหน้าจัดคน — เพิ่มกลับเองไม่ได้ ต้องสร้างใหม่</li>
            <li>• รูปจะถูกลบทิ้ง</li>
            <li>• บิลกับสถิติของก๊วนที่ผ่านมา<b className="font-heading text-ink"> ไม่ถูกแตะต้อง</b> ยอดเงินเก่าไม่ขยับ และยังขึ้นชื่อเดิมให้อ่านออก</li>
            <li>• ถ้าแค่อยากให้หายจากรายชื่อเช็คอิน ใช้ “เก็บเข้ากรุ” ดีกว่า — เอากลับมาได้ทุกเมื่อ</li>
          </ul>
        </div>
      ) : (
        <p className="text-[13px] leading-snug text-ink-soft">
          ใช้ตอนเพิ่มชื่อซ้ำหรือเพิ่มผิดคน · ถ้าคนนี้เคยลงก๊วนมาแล้ว ระบบจะถามยืนยันอีกครั้งก่อนลบจริง
        </p>
      )}
    </Modal>
  )
}
