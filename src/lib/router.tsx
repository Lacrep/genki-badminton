import { useCallback, useEffect, useState } from "react"

/**
 * เราเตอร์จิ๋ว — แอปนี้มีไม่กี่หน้า และอยากให้ไฟล์ที่ต้องโหลดบนมือถือเล็กที่สุด
 * จึงใช้ History API ตรง ๆ แทนไลบรารีเราเตอร์
 */
/** ตัด / ท้ายลิงก์ออก เพื่อให้ /bill กับ /bill/ เปิดหน้าเดียวกัน */
function normalize(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : pathname
}

export function useRoute() {
  const [path, setPath] = useState(() => normalize(window.location.pathname))

  useEffect(() => {
    const onPop = () => setPath(normalize(window.location.pathname))
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    if (normalize(to) === normalize(window.location.pathname)) return
    if (opts?.replace) window.history.replaceState(null, "", to)
    else window.history.pushState(null, "", to)
    setPath(normalize(to))
    window.scrollTo({ top: 0 })
  }, [])

  return { path, navigate }
}

/** ดึงรหัสก๊วนจากลิงก์ /q/XXXX */
export function queueCodeFromPath(path: string): string | null {
  const m = /^\/q\/([A-Za-z0-9]{3,8})\/?$/.exec(path)
  return m ? m[1].toUpperCase() : null
}
