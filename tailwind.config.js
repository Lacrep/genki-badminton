/**
 * โทนสีทั้งหมดถอดมาจากตัวโลโก้จริง (สุ่มพิกเซลจากไฟล์โลโก้)
 *   navy #1d2447 · red #c2223c · gold #bf9d65 · sand #ede1d1 · washi #fbf7ef
 */
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        heading: ["Kanit", "IBM Plex Sans Thai", "system-ui", "sans-serif"],
        body: ["'IBM Plex Sans Thai'", "Kanit", "system-ui", "sans-serif"],
        jp: ["'Shippori Mincho'", "serif"],
      },
      colors: {
        // สีแบรนด์ (ค่าคงที่ ไม่เปลี่ยนตามโหมด)
        navy: {
          DEFAULT: "#1d2447",
          deep: "#121736",
          soft: "#2e3860",
          mist: "#5a6489",
        },
        hinomaru: {
          DEFAULT: "#c2223c",
          deep: "#a71936",
          soft: "#e05a6d",
        },
        gold: {
          DEFAULT: "#bf9d65",
          deep: "#9c7c47",
          soft: "#dcc69b",
        },
        sand: {
          DEFAULT: "#ede1d1",
          deep: "#d9c7ad",
        },
        // สีพื้นผิว (พลิกค่าตอนโหมดกลางคืน)
        paper: "rgb(var(--paper) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        subtle: "rgb(var(--subtle) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-soft": "rgb(var(--ink-soft) / <alpha-value>)",
        "ink-faint": "rgb(var(--ink-faint) / <alpha-value>)",
      },
      borderRadius: {
        washi: "1.25rem",
      },
      boxShadow: {
        card: "0 2px 10px rgba(18, 23, 54, 0.06), 0 1px 2px rgba(18, 23, 54, 0.04)",
        lift: "0 10px 30px rgba(18, 23, 54, 0.12)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.6)",
      },
      keyframes: {
        "dong-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(194, 34, 60, 0.45)" },
          "50%": { boxShadow: "0 0 0 8px rgba(194, 34, 60, 0)" },
        },
        "shuttle-drop": {
          "0%": { transform: "translateY(-6px) rotate(-8deg)", opacity: "0" },
          "100%": { transform: "translateY(0) rotate(0)", opacity: "1" },
        },
        "slide-up": {
          from: { transform: "translateY(10px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "wave-drift": {
          from: { backgroundPosition: "0 0" },
          to: { backgroundPosition: "120px 0" },
        },
      },
      animation: {
        "dong-pulse": "dong-pulse 1.6s ease-out infinite",
        "shuttle-drop": "shuttle-drop 0.35s ease-out",
        "slide-up": "slide-up 0.25s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "wave-drift": "wave-drift 40s linear infinite",
      },
    },
  },
  plugins: [],
}
