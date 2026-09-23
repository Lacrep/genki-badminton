import { useEffect } from "react"
import { AppProvider, useApp } from "@/lib/app"
import { queueCodeFromPath, useRoute } from "@/lib/router"
import { applyTheme, loadTheme } from "@/lib/util"
import { Shell } from "@/components/Shell"
import { EmptyState, Logo, Wordmark } from "@/components/ui"
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
        ) : path === "/" ? (
          <SetupPage />
        ) : (
          // แท็บอื่นยังใช้ไม่ได้ถ้ายังไม่เปิดก๊วน — บอกให้ชัดแทนที่จะเด้งหน้าอื่นเงียบ ๆ
          <NoSession navigate={navigate} tab={path} />
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

const TAB_NAME: Record<string, string> = {
  "/queue": "คิวรอ",
  "/checkin": "เช็คอิน",
  "/bill": "ค่าก๊วน",
}

function NoSession({ navigate, tab }: { navigate: (to: string) => void; tab: string }) {
  return (
    <div className="card">
      <EmptyState
        icon={<Logo size={64} />}
        title={`ยังไม่ได้เปิดก๊วนวันนี้`}
        hint={`หน้า “${TAB_NAME[tab] ?? "นี้"}” จะใช้ได้หลังเปิดก๊วนแล้ว — กดปุ่มด้านล่างเพื่อเปิดก๊วน แล้วค่อยกลับมา`}
        action={
          <button className="btn-primary btn-lg" onClick={() => navigate("/")}>
            ไปหน้าเปิดก๊วน
          </button>
        }
      />
    </div>
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
