import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react"

/**
 * กันจอขาว — ถ้าหน้าไหนพังกลางการวาด React จะถอดทั้งแอปทิ้งแล้วเหลือจอว่างเปล่า
 * ซึ่งหาสาเหตุไม่ได้เลยตอนอยู่หน้างาน กล่องนี้ดักไว้แล้วโชว์ว่าพังตรงไหน
 * พร้อมปุ่มล้างแคช (เผื่อเป็นไฟล์เก่าค้างในเครื่อง)
 */
interface State {
  error: Error | null
  info: string
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, info: "" }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[genki] หน้าพัง:", error, info.componentStack)
    this.setState({ info: (info.componentStack ?? "").split("\n").slice(0, 6).join("\n") })
  }

  private hardReload = async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.()
      await Promise.all((regs ?? []).map((r) => r.unregister()))
      const keys = await caches?.keys?.()
      await Promise.all((keys ?? []).map((k) => caches.delete(k)))
    } catch {
      /* เบราว์เซอร์ไม่ให้ล้าง ก็โหลดใหม่เฉย ๆ */
    }
    window.location.reload()
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-dvh items-center justify-center p-5">
        <div className="card card-pad w-full max-w-lg">
          <div className="mb-3 flex items-center gap-2.5">
            <AlertTriangle size={20} className="shrink-0 text-hinomaru" />
            <h1 className="font-heading text-[17px] font-semibold text-ink">หน้านี้แสดงผลไม่ได้</h1>
          </div>
          <p className="mb-3 text-[13px] leading-relaxed text-ink-soft">
            ข้อมูลของก๊วนยังอยู่ครบในเซิร์ฟเวอร์ ไม่ได้หายไปไหน — ลองโหลดใหม่ก่อน
            ถ้ายังไม่หาย ให้กด “ล้างแคชแล้วโหลดใหม่” (เผื่อเครื่องยังใช้ไฟล์เวอร์ชันเก่าค้างอยู่)
          </p>

          <div className="mb-3 overflow-x-auto rounded-xl border border-line bg-subtle/60 p-3">
            <p className="font-heading text-[12px] font-semibold text-hinomaru-deep dark:text-hinomaru-soft">
              {error.name}: {error.message}
            </p>
            {info ? <pre className="mt-1 whitespace-pre-wrap text-[11px] leading-snug text-ink-faint">{info}</pre> : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn-primary flex-1" onClick={() => window.location.reload()}>
              <RefreshCw size={16} />
              โหลดใหม่
            </button>
            <button className="btn-ghost" onClick={this.hardReload}>
              <Trash2 size={16} />
              ล้างแคชแล้วโหลดใหม่
            </button>
            <a className="btn-quiet" href="/">
              กลับหน้าแรก
            </a>
          </div>
        </div>
      </div>
    )
  }
}
