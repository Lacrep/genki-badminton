#!/usr/bin/env bash
# เปิดลิงก์ https ให้คนนอกวง Wi-Fi เข้าได้ — ไม่ต้องตั้งพอร์ตที่เราเตอร์
#
#   bash deploy/tunnel.sh              ← ลิงก์ชั่วคราว (เปลี่ยนทุกครั้งที่รันใหม่)
#   CLOUDFLARE_TUNNEL_TOKEN=xxx \
#   bash deploy/tunnel.sh              ← ลิงก์ถาวร (เอา token จากหน้าเว็บ Cloudflare)
set -euo pipefail

PORT="${PORT:-3100}"
BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/bin"

# ── 1) ต้องมีเว็บรันอยู่ก่อน ไม่งั้นเปิดลิงก์ไปก็เจอหน้าเปล่า ──
if ! curl -fs -m 5 -o /dev/null "http://127.0.0.1:$PORT/api/bootstrap"; then
  cat >&2 <<MSG
✗ ยังไม่มีเว็บรันอยู่ที่พอร์ต $PORT

  เปิดเว็บก่อนด้วยวิธีใดวิธีหนึ่ง แล้วค่อยรันคำสั่งนี้อีกที
     docker compose up -d --build
     bash deploy/install.sh
     npm run serve
MSG
  exit 1
fi

# ── 2) เตือนเรื่อง PIN — ลิงก์สาธารณะที่ไม่มี PIN ใครกดเจอก็สั่งการก๊วนได้ ──
if [ -z "${ORGANIZER_PIN:-}" ]; then
  cat <<MSG

⚠️  ยังไม่ได้ตั้ง PIN หัวก๊วน

   พอเปิดเป็นลิงก์สาธารณะ ใครได้ลิงก์ไปก็กดจบเกม/ลบคน/ปิดก๊วนได้หมด
   ตั้ง PIN ก่อนแล้วเปิดเว็บใหม่ จะปลอดภัยกว่ามาก (คนอื่นยังดูคิวได้ตามปกติ)

      docker compose  →  เอา # หน้า ORGANIZER_PIN ใน docker-compose.yml ออก
      pm2            →  pm2 delete genki && ORGANIZER_PIN=1234 bash deploy/install.sh

MSG
  read -r -p "   เปิดลิงก์แบบไม่มี PIN ต่อเลยไหม? [y/N] " yn
  [[ "$yn" =~ ^[Yy]$ ]] || exit 1
fi

# ── 3) หา cloudflared (ถ้ายังไม่มีก็โหลดมาเก็บไว้ใน deploy/bin) ──
if command -v cloudflared >/dev/null 2>&1; then
  CF="$(command -v cloudflared)"
else
  CF="$BIN_DIR/cloudflared"
  if [ ! -x "$CF" ]; then
    case "$(uname -s)-$(uname -m)" in
      Linux-x86_64)        asset=cloudflared-linux-amd64 ;;
      Linux-aarch64|Linux-arm64) asset=cloudflared-linux-arm64 ;;
      Linux-armv7l)        asset=cloudflared-linux-arm ;;
      Darwin-arm64)        asset=cloudflared-darwin-arm64.tgz ;;
      Darwin-x86_64)       asset=cloudflared-darwin-amd64.tgz ;;
      *) echo "✗ ไม่รู้จักเครื่องรุ่นนี้ ลงเองที่ https://github.com/cloudflare/cloudflared/releases" >&2; exit 1 ;;
    esac
    echo "▸ โหลด cloudflared ($asset)"
    mkdir -p "$BIN_DIR"
    url="https://github.com/cloudflare/cloudflared/releases/latest/download/$asset"
    if [[ "$asset" == *.tgz ]]; then
      curl -fsSL "$url" | tar -xz -C "$BIN_DIR" cloudflared
    else
      curl -fsSL "$url" -o "$CF"
    fi
    chmod +x "$CF"
  fi
fi

# ── 4) ลิงก์ถาวร ถ้ามี token ──
if [ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
  echo "▸ เปิดลิงก์ถาวรตาม token ที่ตั้งไว้ในหน้าเว็บ Cloudflare"
  exec "$CF" tunnel --no-autoupdate run --token "$CLOUDFLARE_TUNNEL_TOKEN"
fi

# ── 5) ลิงก์ชั่วคราว — ดักอ่าน url จาก log มาพิมพ์ให้เห็นชัด ๆ ──
log="$(mktemp)"
trap 'rm -f "$log"' EXIT
"$CF" tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" >"$log" 2>&1 &
cf_pid=$!
trap 'kill "$cf_pid" 2>/dev/null || true; rm -f "$log"' EXIT INT TERM

echo "▸ กำลังขอลิงก์..."
url=""
for _ in $(seq 1 60); do
  url="$(grep -om1 'https://[a-z0-9-]*\.trycloudflare\.com' "$log" || true)"
  [ -n "$url" ] && break
  kill -0 "$cf_pid" 2>/dev/null || break
  sleep 1
done

if [ -z "$url" ]; then
  echo "✗ ขอลิงก์ไม่สำเร็จ — log ของ cloudflared:" >&2
  tail -20 "$log" >&2
  exit 1
fi

cat <<MSG

✅ เปิดจากที่ไหนก็ได้แล้ว — ส่งลิงก์นี้เข้าไลน์กลุ่มได้เลย

   $url

   ลิงก์นี้อยู่แค่ตอนที่หน้าต่างนี้เปิดค้างไว้ ปิดเมื่อไรลิงก์ตายทันที
   และได้ลิงก์ใหม่ทุกครั้งที่รันใหม่ — อยากได้ลิงก์ที่ไม่เปลี่ยน ดู README หัวข้อ
   "ลิงก์ถาวร"

   กด Ctrl+C เพื่อปิดลิงก์ (เว็บยังรันต่อตามปกติ)

MSG
wait "$cf_pid"
