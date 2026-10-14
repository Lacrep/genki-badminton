import { useEffect, useRef, useState } from "react"
import { Camera, RotateCcw, ZoomIn } from "lucide-react"
import { Modal } from "./ui"

/**
 * ปรับรูปก่อนบันทึก — ซูมเข้า-ออก และลากเลื่อนให้หน้าอยู่กลางกรอบ
 *
 * รูปจากกล้องมือถือเป็นแนวตั้ง ถ้าตัดกลางให้อัตโนมัติอย่างเดียว หน้าคนมักหลุด
 * ออกนอกกรอบ (คนถ่ายมักอยู่ครึ่งบน) หัวก๊วนเลยต้องเลื่อนเองได้
 * กรอบเป็นวงกลมเพราะทุกที่ที่เอารูปไปใช้เป็นวงกลมหมด จะได้เห็นผลจริงตั้งแต่ตอนปรับ
 */
const OUT = 320
const BOX = 260

export function PhotoCropper({
  file,
  onCancel,
  onDone,
}: {
  file: File
  onCancel: () => void
  onDone: (dataUrl: string) => void
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const el = new Image()
    el.onload = () => {
      setImg(el)
      setZoom(1)
      setPos({ x: 0, y: 0 })
    }
    el.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  /** ย่อรูปให้ด้านสั้นพอดีกรอบก่อน แล้วค่อยคูณด้วยซูมที่ผู้ใช้ปรับ */
  const base = img ? Math.max(BOX / img.width, BOX / img.height) : 1
  const scale = base * zoom
  const w = img ? img.width * scale : 0
  const h = img ? img.height * scale : 0

  /** กันลากรูปจนขอบหลุดออกจากกรอบ */
  const clamp = (v: number, span: number) => {
    const limit = Math.max(0, (span - BOX) / 2)
    return Math.max(-limit, Math.min(limit, v))
  }

  const startDrag = (cx: number, cy: number) => {
    drag.current = { x: cx, y: cy, px: pos.x, py: pos.y }
  }
  const moveDrag = (cx: number, cy: number) => {
    const d = drag.current
    if (!d) return
    setPos({ x: clamp(d.px + (cx - d.x), w), y: clamp(d.py + (cy - d.y), h) })
  }
  const endDrag = () => {
    drag.current = null
  }

  // ซูมแล้วรูปอาจเลยขอบ ต้องดึงกลับเข้ากรอบ
  useEffect(() => {
    setPos((prev) => ({ x: clamp(prev.x, w), y: clamp(prev.y, h) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, w, h])

  const save = () => {
    if (!img) return
    setBusy(true)
    const canvas = document.createElement("canvas")
    canvas.width = OUT
    canvas.height = OUT
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    // แปลงพิกัดจากกรอบพรีวิว (BOX) ไปเป็นรูปจริง (OUT) ด้วยอัตราส่วนเดียวกัน
    const k = OUT / BOX
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, OUT, OUT)
    ctx.drawImage(img, (BOX / 2 - w / 2 + pos.x) * k, (BOX / 2 - h / 2 + pos.y) * k, w * k, h * k)
    onDone(canvas.toDataURL("image/jpeg", 0.85))
  }

  return (
    <Modal
      open
      onClose={onCancel}
      title="ปรับรูปก่อนบันทึก"
      subtitle="ลากเพื่อเลื่อน · ใช้แถบเลื่อนเพื่อซูมเข้า-ออก"
      footer={
        <div className="flex items-center gap-2">
          <button className="btn-quiet !px-2" onClick={() => { setZoom(1); setPos({ x: 0, y: 0 }) }} disabled={busy}>
            <RotateCcw size={15} />
            รีเซ็ต
          </button>
          <div className="flex-1" />
          <button className="btn-quiet !px-2" onClick={onCancel} disabled={busy}>
            ยกเลิก
          </button>
          <button className="btn-primary" onClick={save} disabled={!img || busy}>
            <Camera size={16} />
            ใช้รูปนี้
          </button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="relative touch-none overflow-hidden rounded-full border-4 border-gold/60 bg-subtle"
          style={{ width: BOX, height: BOX }}
          onPointerDown={(e) => {
            ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
            startDrag(e.clientX, e.clientY)
          }}
          onPointerMove={(e) => moveDrag(e.clientX, e.clientY)}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {img ? (
            <img
              src={img.src}
              alt=""
              draggable={false}
              className="absolute left-1/2 top-1/2 max-w-none select-none"
              style={{ width: w, height: h, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[13px] text-ink-faint">กำลังเปิดรูป…</div>
          )}
        </div>

        <label className="flex w-full max-w-xs items-center gap-3">
          <ZoomIn size={18} className="shrink-0 text-ink-soft" />
          <input
            type="range"
            min={1}
            max={4}
            step={0.02}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-subtle accent-navy dark:accent-gold"
            aria-label="ซูมรูป"
          />
          <span className="nums w-10 shrink-0 text-right text-[12px] text-ink-soft">{zoom.toFixed(1)}×</span>
        </label>
        <p className="text-center text-[11.5px] leading-snug text-ink-faint">
          รูปจะถูกบันทึกเป็นวงกลมตามกรอบนี้ — เลื่อนให้หน้าอยู่กลางกรอบจะดูดีที่สุด
        </p>
      </div>
    </Modal>
  )
}
