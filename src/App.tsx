import { useEffect } from "react"
import { AppProvider, useApp } from "@/lib/app"
import { queueCodeFromPath, useRoute } from "@/lib/router"
import { applyTheme, loadTheme } from "@/lib/util"
import { Shell } from "@/components/Shell"
import { Logo, Wordmark } from "@/components/ui"
import { BillPage } from "@/pages/BillPage"
import { CheckInPage } from "@/pages/CheckInPage"
import { LivePage } from "@/pages/LivePage"
import { PublicQueuePage } from "@/pages/PublicQueuePage"
import { QueuePage } from "@/pages/QueuePage"
import { SettingsPage } from "@/pages/SettingsPage"
import { SetupPage } from "@/pages/SetupPage"
import { StatsPage } from "@/pages/StatsPage"
import { TvPage } from "@/pages/TvPage"

export default function App() {
  const { path, navigate } = useRoute()

  // โหมดตามเครื่อง/ที่เคยเลือกไว้ ตั้งแต่เฟรมแรก กันจอขาววาบ
  useEffect(() => {
    applyTheme(loadTheme())
  }, [])

  // ลิงก์สาธารณะสำหรับลูกก๊วน — ไม่ต้องโหลดสถานะหัวก๊วนทั้งชุด
  const code = queueCodeFromPath(path)
  if (code) return <PublicQueuePage code={code} />

  return (
    <AppProvider>
      <Organizer path={path} navigate={navigate} />
    </AppProvider>
  )
}

function Organizer({ path, navigate }: { path: string; navigate: (to: string) => void }) {
  const { ready, view } = useApp()

  if (!ready) return <Splash />

  // จอใหญ่เต็มหน้าจอ ไม่มีแถบเมนู
  if (path === "/tv") return <TvPage navigate={navigate} />

  return (
    <Shell path={path} navigate={navigate}>
      {!view ? (
        path === "/stats" ? (
          <StatsPage />
        ) : path === "/settings" ? (
          <SettingsPage navigate={navigate} />
        ) : (
          <SetupPage />
        )
      ) : path === "/queue" ? (
        <QueuePage />
      ) : path === "/checkin" ? (
        <CheckInPage />
      ) : path === "/bill" ? (
        <BillPage />
      ) : path === "/stats" ? (
        <StatsPage />
      ) : path === "/settings" ? (
        <SettingsPage navigate={navigate} />
      ) : (
        <LivePage navigate={navigate} />
      )}
    </Shell>
  )
}

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <Logo size={96} ring className="animate-shuttle-drop" />
      <Wordmark />
      <p className="text-[12.5px] text-ink-faint">กำลังโหลดก๊วน...</p>
    </div>
  )
}
