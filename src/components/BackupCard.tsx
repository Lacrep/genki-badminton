import { useRef, useState } from "react"
import { AlertTriangle, Download, HardDriveDownload, Upload } from "lucide-react"
import { api, type BackupInfo } from "@/lib/api"
import { useApp } from "@/lib/app"
import { Modal } from "@/components/ui"
import { thaiTime } from "@shared/types"

/**
 * สำรอง / กู้ข้อมูลทั้งก๊วนเป็นไฟล์เดียว
 *
 * ไว้ใช้ตอนพกคอมไปคนละเครื่อง — ข้อมูลก๊วนอยู่ในโฟลเดอร์ data/ ของเครื่องที่รันระบบ
 * ซึ่งไม่ได้ขึ้น git (และไม่ควรขึ้นด้วย) ถ้าให้ไล่ก็อปโฟลเดอร์เองมีโอกาสตกหล่น
 * ไฟล์เดียวจบจึงเป็นวิธีที่ก็อปยากที่จะผิด เอาไปวางใน Drive หรือส่งเข้าไลน์ตัวเองก็ได้
 *
 * ต้องใช้ได้แม้ยังไม่เปิดก๊วน เพราะเคสหลักคือเครื่องใหม่ที่ยังไม่มีข้อมูลอะไรเลย
 */
export function BackupCard() {
  const { setRoster, toast, needPin } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  /** ไฟล์ที่เลือกมาแล้วอ่านได้ — รอให้ยืนยันก่อนทับของเดิม */
  const [pending, setPending] = useState<{ raw: unknown; info: BackupInfo; fileName: string } | null>(null)

  const download = () => {
    // ให้เบราว์เซอร์โหลดเองจะได้ไม่ต้องอุ้มไฟล์หลายเมกะไบต์ไว้ในหน่วยความจำ
    window.location.href = "/api/backup"
    toast("กำลังดาวน์โหลดไฟล์สำรอง", "ok")
  }

  const pickFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = ""
    if (!file) return
    setBusy(true)
    try {
      const raw: unknown = JSON.parse(await file.text())
      const info = await api.inspectBackup(raw)
      setPending({ raw, info, fileName: file.name })
    } catch (err) {
      toast(
        err instanceof SyntaxError ? "ไฟล์นี้อ่านไม่ออก — เลือกไฟล์สำรองที่ลงท้าย .json" : errText(err),
        "error",
      )
    } finally {
      setBusy(false)
    }
  }

  const restore = async () => {
    if (!pending) return
    setBusy(true)
    try {
      const out = await api.restoreBackup(pending.raw)
      setRoster(out.roster)
      setPending(null)
      toast(`กู้ข้อมูลแล้ว — สมาชิก ${out.counts.players} คน · ก๊วน ${out.counts.sessions} ครั้ง`, "ok")
      // ต้องโหลดหน้าใหม่ ของที่ค้างอยู่ในหน้า (ก๊วนที่เปิดอยู่ คิว บิล) เป็นของชุดเก่าหมดแล้ว
      setTimeout(() => window.location.reload(), 900)
    } catch (err) {
      toast(errText(err), "error")
      setBusy(false)
    }
  }

  return (
    <section className="card card-pad flex flex-col gap-3">
      <h2 className="section-title">
        <HardDriveDownload size={15} className="text-gold-deep" />
        สำรอง / ย้ายข้อมูลไปเครื่องอื่น
      </h2>
      <p className="text-[12.5px] leading-relaxed text-ink-soft">
        ทะเบียนสมาชิก ประวัติก๊วนทุกครั้ง บิล และรูป รวมอยู่ในไฟล์เดียว —
        เอาไปวางใน Google Drive หรือส่งเข้าไลน์ตัวเองไว้ก็ได้
        <span className="mt-1 block text-ink-faint">
          พกคอมไปอีกเครื่อง: โคลนโปรเจกต์ใหม่ แล้วกด “กู้ข้อมูล” เลือกไฟล์นี้ ได้ของครบทันที
        </span>
      </p>

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={download} disabled={busy}>
          <Download size={16} />
          สำรองข้อมูล (ดาวน์โหลด)
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => void pickFile(e.target.files?.[0])}
        />
        <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={busy || needPin}>
          <Upload size={16} />
          กู้ข้อมูลจากไฟล์สำรอง
        </button>
      </div>

      {pending ? (
        <Modal
          open
          onClose={() => setPending(null)}
          title="กู้ข้อมูลจากไฟล์นี้?"
          subtitle={pending.fileName}
          footer={
            <div className="flex w-full flex-col gap-2">
              <button className="btn-red btn-lg w-full" onClick={() => void restore()} disabled={busy}>
                <Upload size={17} />
                กู้ข้อมูล ทับของในเครื่องนี้
              </button>
              <button className="btn-quiet w-full" onClick={() => setPending(null)} disabled={busy}>
                ยกเลิก
              </button>
            </div>
          }
        >
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-line/70 bg-subtle/50 p-3">
              <p className="mb-1.5 font-heading text-[13px] font-semibold text-ink">ในไฟล์นี้มี</p>
              <ul className="nums flex flex-col gap-1 text-[12.5px] leading-snug text-ink-soft">
                <li>• สมาชิก {pending.info.players} คน</li>
                <li>• ประวัติก๊วน {pending.info.sessions} ครั้ง</li>
                <li>• รูปสมาชิก {pending.info.photos} รูป</li>
                <li>
                  • สำรองไว้เมื่อ {new Date(pending.info.createdAt).toLocaleDateString("th-TH")}{" "}
                  {thaiTime(pending.info.createdAt)} น.
                </li>
                {pending.info.latestSession ? (
                  <li>
                    • ก๊วนล่าสุดในไฟล์: {pending.info.latestSession.name} ({pending.info.latestSession.date})
                  </li>
                ) : null}
              </ul>
            </div>
            <div className="flex items-start gap-2.5 rounded-xl border-2 border-hinomaru/55 bg-hinomaru/[0.1] px-3 py-2.5">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-hinomaru" />
              <p className="text-[12.5px] leading-snug text-ink">
                ข้อมูลที่อยู่ในเครื่องนี้ตอนนี้จะถูกทับทั้งหมด
                <span className="block text-ink-soft">
                  ของเดิมไม่ได้หายไปไหน — ระบบยกโฟลเดอร์ <b className="font-heading">data</b> เดิมไปเก็บไว้เป็น{" "}
                  <b className="font-heading">data.before-restore-…</b> ข้าง ๆ กันให้ก่อนเสมอ กดผิดไฟล์ก็เอากลับมาได้
                </span>
              </p>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  )
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ"
}
