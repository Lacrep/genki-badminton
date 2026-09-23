import { useEffect, useRef, type ReactNode } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/util"

// ── โลโก้ก๊วน ─────────────────────────────────────────────────────────────────

export function Logo({
  size = 40,
  ring = false,
  plate,
  className,
}: {
  size?: number
  ring?: boolean
  /** แผ่นรองสีครีมใต้โลโก้ — จำเป็นบนพื้นสีเข้ม เพราะลายเส้นโลโก้เป็นสีน้ำเงินเข้ม */
  plate?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        ring && "brush-ring",
        plate ? "rounded-full bg-sand p-1 shadow-card" : "rounded-full p-0.5 dark:bg-sand",
        className,
      )}
    >
      <img
        src="/logo.webp"
        width={size}
        height={size}
        alt="Genki Desu Badminton Society"
        className="object-contain"
        style={{ width: size, height: size }}
      />
    </span>
  )
}

/** ชื่อก๊วนแบบป้ายร้าน — ไทยตัวหนา + คันจิเล็กด้านล่าง */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex flex-col leading-none">
      <span className={cn("font-heading font-semibold tracking-tight text-ink", compact ? "text-[15px]" : "text-lg")}>
        เกงกิเดสซ์
      </span>
      <span className={cn("font-jp text-gold-deep dark:text-gold-soft", compact ? "text-[10px]" : "text-[11px]")}>
        元気です · Badminton Society
      </span>
    </span>
  )
}

// ── กล่องซ้อน (ใช้เป็น modal บนจอใหญ่ / sheet บนมือถือ) ───────────────────────

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const panel = useRef<HTMLDivElement>(null)
  // เก็บ onClose ไว้ใน ref — ผู้เรียกส่ง arrow function ใหม่ทุก render (หน้าเว็บ
  // re-render ทุกวินาทีเพราะนาฬิกาเดิน) ถ้าใส่ใน deps ตรง ๆ effect จะถอด/ตั้งใหม่
  // ทุกวินาที ทำให้ body overflow สลับไปมาจนจอกระตุก
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current()
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-navy-deep/55 animate-fade-in backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 max-h-[92vh] w-full overflow-hidden rounded-t-washi border border-line/80 bg-surface shadow-lift",
          "animate-slide-up sm:rounded-washi",
          wide ? "sm:max-w-2xl" : "sm:max-w-md",
        )}
      >
        <div className="flex items-start gap-3 border-b border-line/70 px-4 py-3.5 sm:px-5">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-heading text-[16px] font-semibold text-ink">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-[12.5px] text-ink-soft">{subtitle}</p> : null}
          </div>
          <button onClick={onClose} className="btn-quiet -mr-1.5 !px-2 !py-1.5" aria-label="ปิด">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[calc(92vh-9rem)] overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer ? <div className="border-t border-line/70 bg-subtle/60 px-4 py-3 sm:px-5">{footer}</div> : null}
      </div>
    </div>
  )
}

// ── ชิ้นเล็ก ๆ ที่ใช้ซ้ำ ────────────────────────────────────────────────────────

export function Stat({
  label,
  value,
  hint,
  tone = "navy",
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: "navy" | "gold" | "red"
}) {
  const toneClass =
    tone === "red" ? "text-hinomaru" : tone === "gold" ? "text-gold-deep dark:text-gold-soft" : "text-ink"
  return (
    <div className="flex flex-col">
      <span className="font-heading text-[11px] font-medium uppercase tracking-wide text-ink-faint">{label}</span>
      <span className={cn("nums font-heading text-[19px] font-semibold leading-tight", toneClass)}>{value}</span>
      {hint ? <span className="text-[11px] text-ink-faint">{hint}</span> : null}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  size?: "sm" | "md"
}) {
  return (
    <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-line bg-subtle/70 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "shrink-0 rounded-lg px-3 font-heading font-medium transition-all",
            size === "sm" ? "py-1 text-[12px]" : "py-1.5 text-[13px]",
            o.value === value
              ? "bg-navy text-white shadow-card"
              : "text-ink-soft hover:bg-surface hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span className="min-w-0">
        <span className="block font-heading text-[14px] font-medium text-ink">{label}</span>
        {hint ? <span className="block text-[12px] leading-snug text-ink-soft">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-navy" : "bg-line",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
          )}
        />
      </button>
    </label>
  )
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  suffix,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
      <button
        type="button"
        aria-label="ลด"
        className="btn-quiet flex h-8 w-8 items-center justify-center !p-0 text-[17px] leading-none"
        onClick={() => onChange(clamp(value - step))}
      >
        −
      </button>
      <span className="nums min-w-[3.25rem] text-center font-heading text-[15px] font-semibold text-ink">
        {value}
        {suffix ? <span className="ml-0.5 text-[11px] font-normal text-ink-faint">{suffix}</span> : null}
      </span>
      <button
        type="button"
        aria-label="เพิ่ม"
        className="btn-quiet flex h-8 w-8 items-center justify-center !p-0 text-[17px] leading-none"
        onClick={() => onChange(clamp(value + step))}
      >
        +
      </button>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon ? <div className="text-ink-faint">{icon}</div> : null}
      <p className="font-heading text-[15px] font-medium text-ink">{title}</p>
      {hint ? <p className="max-w-xs text-[13px] leading-relaxed text-ink-soft">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

/** เส้นคั่นลายทอง แบบเส้นแปรง */
export function BrushDivider({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/50 to-gold/20" />
      <span className="hinomaru-dot opacity-70" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-gold/50 to-gold/20" />
    </div>
  )
}
