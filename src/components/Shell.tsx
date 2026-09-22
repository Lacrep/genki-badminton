import { useEffect, useState, type ReactNode } from "react"
import {
  AlertTriangle,
  BarChart3,
  KeyRound,
  LayoutGrid,
  ListOrdered,
  Moon,
  MoreHorizontal,
  Settings,
  Share2,
  Sun,
  Tv,
  Undo2,
  UserPlus,
  Wallet,
  WifiOff,
  X,
} from "lucide-react"
import { thaiTime } from "@shared/types"
import { api } from "@/lib/api"
import { useApp } from "@/lib/app"
import { applyTheme, cn, copyText, loadTheme, type Theme } from "@/lib/util"
import { Logo, Modal, Wordmark } from "./ui"

const TABS = [
  { path: "/", label: "คอร์ต", icon: LayoutGrid },
  { path: "/queue", label: "คิวรอ", icon: ListOrdered },
  { path: "/checkin", label: "เช็คอิน", icon: UserPlus },
  { path: "/bill", label: "ค่าก๊วน", icon: Wallet },
  { path: "/stats", label: "สถิติ", icon: BarChart3 },
]

export function Shell({
  path,
  navigate,
  children,
}: {
  path: string
  navigate: (to: string) => void
  children: ReactNode
}) {
  const { view, offline, undoDepth, run, needPin, pinRequired } = useApp()
  const [theme, setTheme] = useState<Theme>(() => loadTheme())
  const [menu, setMenu] = useState(false)
  const [share, setShare] = useState(false)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const session = view?.session
  const queueUrl = session ? `${window.location.origin}/q/${session.code}` : ""

  return (
    <div className="min-h-dvh pb-tabbar">
      {/* ── หัวเว็บ ── */}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-2.5 px-3.5 py-2.5 sm:px-5">
          <button onClick={() => navigate("/")} className="flex items-center gap-2.5" aria-label="หน้าแรก">
            <Logo size={36} />
            <Wordmark compact />
          </button>

          <div className="flex-1" />

          {offline ? (
            <span className="chip bg-gold/25 text-gold-deep" title="ต่อเซิร์ฟเวอร์ไม่ได้">
              <WifiOff size={12} />
              ออฟไลน์
            </span>
          ) : null}

          {session && undoDepth > 0 ? (
            <button
              className="btn-ghost btn-sm !px-2.5"
              title="ย้อนการกระทำล่าสุด"
              onClick={() => void run("ย้อนกลับแล้ว", () => api.undo(session.id))}
            >
              <Undo2 size={16} />
            </button>
          ) : null}

          <button
            className="btn-ghost btn-sm !px-2.5"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? "โหมดสว่าง" : "โหมดกลางคืน"}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <div className="relative">
            <button className="btn-ghost btn-sm !px-2.5" onClick={() => setMenu((v) => !v)} aria-label="เมนู">
              <MoreHorizontal size={16} />
            </button>
            {menu ? (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-full z-20 mt-1.5 w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lift">
                  {session ? (
                    <>
                      <Item
                        icon={<Share2 size={15} />}
                        label="แชร์ลิงก์ดูคิว"
                        onClick={() => {
                          setMenu(false)
                          setShare(true)
                        }}
                      />
                      <Item
                        icon={<Tv size={15} />}
                        label="โหมดจอใหญ่ (ทีวี)"
                        onClick={() => {
                          setMenu(false)
                          navigate("/tv")
                        }}
                      />
                    </>
                  ) : null}
                  <Item
                    icon={<Settings size={15} />}
                    label="ตั้งค่าก๊วน"
                    onClick={() => {
                      setMenu(false)
                      navigate("/settings")
                    }}
                  />
                  {pinRequired ? (
                    <Item
                      icon={<KeyRound size={15} />}
                      label="ใส่ PIN หัวก๊วน"
                      onClick={() => {
                        setMenu(false)
                        window.dispatchEvent(new CustomEvent("genki:pin"))
                      }}
                    />
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </div>

        {session ? (
          <div className="mx-auto flex max-w-5xl items-center gap-2 overflow-hidden px-3.5 pb-2 sm:px-5">
            <span className="truncate font-heading text-[12.5px] font-medium text-ink-soft">{session.name}</span>
            {session.venue ? (
              <span className="truncate text-[12px] text-ink-faint">· {session.venue}</span>
            ) : null}
            <span className="text-[12px] text-ink-faint">· เปิด {thaiTime(session.startAt)}</span>
            {session.status === "ended" ? <span className="chip bg-subtle text-ink-faint">ปิดก๊วนแล้ว</span> : null}
            <div className="flex-1" />
            <button
              className="chip shrink-0 bg-navy/10 text-navy dark:bg-navy-soft/40 dark:text-sand"
              onClick={() => setShare(true)}
              title="รหัสให้ลูกก๊วนเปิดดูคิว"
            >
              #{session.code}
            </button>
          </div>
        ) : null}
      </header>

      {/* ── เตือนว่ามีคนถูกดอง ── */}
      {view && view.dongAlerts.length > 0 && view.session.status === "live" ? (
        <div className="mx-auto max-w-5xl px-3.5 pt-3 sm:px-5">
          <div className="flex items-start gap-2.5 rounded-washi border border-hinomaru/60 bg-hinomaru/[0.09] px-3.5 py-2.5">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-hinomaru" />
            <div className="min-w-0 flex-1">
              <p className="font-heading text-[13px] font-semibold text-hinomaru-deep dark:text-hinomaru-soft">
                มีคนรอนานเกินกำหนด — จัดลงเกมถัดไปด่วน
              </p>
              <p className="truncate text-[12.5px] text-ink-soft">{view.dongAlerts.join(" · ")}</p>
            </div>
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-5xl px-3.5 py-4 sm:px-5">{children}</main>

      {/* ── เมนูล่าง ── */}
      <nav className="tabbar">
        <div className="mx-auto flex max-w-5xl">
          {TABS.map((t) => {
            const Icon = t.icon
            const active = path === t.path
            return (
              <button key={t.path} className="tab-item" data-active={active} onClick={() => navigate(t.path)}>
                <Icon size={19} strokeWidth={active ? 2.4 : 1.8} />
                {t.label}
              </button>
            )
          })}
        </div>
      </nav>

      <ShareModal open={share} onClose={() => setShare(false)} url={queueUrl} code={session?.code ?? ""} />
      <PinModal forced={needPin} />
      <Toasts />
      {/* เตือนบาง ๆ ว่าเครื่องนี้ยังไม่มีสิทธิ์สั่งการ */}
      {pinRequired && needPin ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[4.5rem] z-30 flex justify-center">
          <span className="chip bg-navy text-white shadow-lift">โหมดดูอย่างเดียว · ใส่ PIN เพื่อสั่งการ</span>
        </div>
      ) : null}
      <div className="h-2" />
      <p className="pb-2 text-center text-[11px] text-ink-faint">
        元気です · Genki Desu Badminton Society
      </p>
    </div>
  )
}

function Item({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left font-heading text-[13px] text-ink transition-colors hover:bg-subtle"
    >
      {icon}
      {label}
    </button>
  )
}

// ── แชร์ลิงก์ให้ลูกก๊วนดูคิวเอง ────────────────────────────────────────────────

function ShareModal({
  open,
  onClose,
  url,
  code,
}: {
  open: boolean
  onClose: () => void
  url: string
  code: string
}) {
  const { toast } = useApp()
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="แชร์ลิงก์ดูคิว"
      subtitle="ลูกก๊วนเปิดดูได้ว่าใครอยู่ในคอร์ต ตัวเองคิวที่เท่าไร — ดูได้อย่างเดียว แก้ไม่ได้"
    >
      <div className="flex flex-col gap-3">
        <div className="rounded-washi border border-line/70 bg-subtle/50 p-4 text-center">
          <p className="font-heading text-[12px] text-ink-faint">รหัสก๊วนวันนี้</p>
          <p className="nums font-heading text-[34px] font-bold tracking-[0.18em] text-navy dark:text-gold-soft">
            {code}
          </p>
        </div>
        <div className="break-all rounded-xl border border-line bg-surface px-3 py-2.5 text-[12.5px] text-ink-soft">
          {url}
        </div>
        <div className="flex gap-2">
          <button
            className="btn-primary flex-1"
            onClick={async () => {
              const ok = await copyText(url)
              toast(ok ? "ก็อปลิงก์แล้ว — วางในไลน์กลุ่มได้เลย" : "ก็อปไม่ได้ ลองกดค้างที่ลิงก์", ok ? "ok" : "warn")
            }}
          >
            ก็อปลิงก์
          </button>
          {typeof navigator !== "undefined" && "share" in navigator ? (
            <button
              className="btn-ghost"
              onClick={() => {
                void navigator
                  .share({ title: "คิวก๊วนแบดเกงกิเดสซ์", url })
                  .catch(() => undefined)
              }}
            >
              <Share2 size={16} />
              แชร์
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}

// ── PIN หัวก๊วน ───────────────────────────────────────────────────────────────

function PinModal({ forced }: { forced: boolean }) {
  const { submitPin } = useApp()
  const [open, setOpen] = useState(false)
  const [pin, setPinValue] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener("genki:pin", onOpen)
    return () => window.removeEventListener("genki:pin", onOpen)
  }, [])

  const visible = open || forced

  return (
    <Modal
      open={visible}
      onClose={() => setOpen(false)}
      title="ใส่ PIN หัวก๊วน"
      subtitle="เฉพาะเครื่องที่ใส่ PIN ถูกจึงจะจัดคิว เริ่ม/จบเกม และแก้ข้อมูลได้"
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          const ok = await submitPin(pin)
          setBusy(false)
          if (ok) {
            setOpen(false)
            setPinValue("")
          }
        }}
      >
        <input
          className="input nums text-center text-[22px] tracking-[0.3em]"
          value={pin}
          onChange={(e) => setPinValue(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          placeholder="••••"
          aria-label="PIN"
        />
        <button className="btn-primary btn-lg" type="submit" disabled={busy || pin.trim().length === 0}>
          <KeyRound size={16} />
          ปลดล็อก
        </button>
        <p className="text-center text-[12px] text-ink-faint">
          ไม่มี PIN ก็ดูคิวได้ตามปกติ — แค่สั่งการไม่ได้
        </p>
      </form>
    </Modal>
  )
}

// ── แจ้งเตือน ─────────────────────────────────────────────────────────────────

function Toasts() {
  const { toasts, dismissToast } = useApp()
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-50 flex flex-col items-center gap-1.5 px-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-xl px-3.5 py-2.5 shadow-lift animate-slide-up",
            t.kind === "error"
              ? "bg-hinomaru text-white"
              : t.kind === "warn"
                ? "bg-gold text-navy-deep"
                : "bg-navy text-white",
          )}
        >
          <span className="flex-1 font-heading text-[13px] font-medium leading-snug">{t.text}</span>
          <button onClick={() => dismissToast(t.id)} className="opacity-70 hover:opacity-100" aria-label="ปิด">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  )
}
