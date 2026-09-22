import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ติดตั้งเป็นแอปบนมือถือได้ (PWA) — เปิดเร็วขึ้นและเต็มจอ ไม่มีแถบเบราว์เซอร์
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined)
  })
}
