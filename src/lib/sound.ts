/**
 * เสียงเรียกลงสนาม — ในโรงยิมเสียงคนเยอะ ถ้าหัวก๊วนต้องตะโกนทุกเกมจะเหนื่อยมาก
 * เลยให้เว็บ "เรียกชื่อ" แทน: กระดิ่งสองเสียงเรียกความสนใจ แล้วอ่านชื่อเป็นภาษาไทย
 */

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === "suspended") void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** กระดิ่งวัดญี่ปุ่น (สองเสียงไล่ลง) */
export function chime() {
  const ac = audio()
  if (!ac) return
  const now = ac.currentTime
  const notes = [
    { freq: 1318.5, at: 0, len: 0.55 },
    { freq: 987.77, at: 0.16, len: 0.75 },
  ]
  for (const n of notes) {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = "sine"
    osc.frequency.value = n.freq
    gain.gain.setValueAtTime(0, now + n.at)
    gain.gain.linearRampToValueAtTime(0.22, now + n.at + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0008, now + n.at + n.len)
    osc.connect(gain).connect(ac.destination)
    osc.start(now + n.at)
    osc.stop(now + n.at + n.len + 0.05)
  }
}

/** เสียงสั้น ๆ เตือนว่ามีคนถูกดอง */
export function alertBeep() {
  const ac = audio()
  if (!ac) return
  const now = ac.currentTime
  for (let i = 0; i < 2; i++) {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = "triangle"
    osc.frequency.value = 660
    const at = now + i * 0.22
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(0.18, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0008, at + 0.18)
    osc.connect(gain).connect(ac.destination)
    osc.start(at)
    osc.stop(at + 0.2)
  }
}

let thaiVoice: SpeechSynthesisVoice | null = null

function pickVoice(): SpeechSynthesisVoice | null {
  if (thaiVoice) return thaiVoice
  try {
    const voices = window.speechSynthesis?.getVoices?.() ?? []
    thaiVoice = voices.find((v) => v.lang?.toLowerCase().startsWith("th")) ?? null
    return thaiVoice
  } catch {
    return null
  }
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    thaiVoice = null
    pickVoice()
  }
}

/** อ่านออกเสียง (ถ้าเครื่องไม่มีเสียงไทยก็ยังได้กระดิ่งเรียก) */
export function speak(text: string) {
  chime()
  try {
    if (!("speechSynthesis" in window)) return
    const u = new SpeechSynthesisUtterance(text)
    const v = pickVoice()
    if (v) u.voice = v
    u.lang = v?.lang ?? "th-TH"
    u.rate = 1.0
    u.pitch = 1.0
    window.speechSynthesis.cancel()
    // หน่วงให้กระดิ่งดังจบก่อน เสียงพูดจะไม่ทับ
    window.setTimeout(() => window.speechSynthesis.speak(u), 620)
  } catch {
    /* บางเบราว์เซอร์ปิด TTS ไว้ — มีกระดิ่งก็พอ */
  }
}
