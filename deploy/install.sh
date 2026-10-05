#!/usr/bin/env bash
# ติดตั้งให้รันตลอดเวลาบนเครื่อง Linux (VM / Raspberry Pi / มินิพีซี) แบบไม่ใช้ Docker
# ใช้: bash deploy/install.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3100}"

echo "▸ ติดตั้งก๊วนเกงกิเดสซ์ที่ $APP_DIR (พอร์ต $PORT)"

# 1) Node 22 ถ้ายังไม่มีหรือเก่าเกิน
need_node=1
if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 20 ] && need_node=0
fi
if [ "$need_node" = 1 ]; then
  echo "▸ ติดตั้ง Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# 2) build
cd "$APP_DIR"
echo "▸ ติดตั้ง dependency และ build"
npm ci
npm run build

# 3) ให้รันตลอดเวลาด้วย pm2 (ขึ้นเองเมื่อเครื่องรีบูต)
if ! command -v pm2 >/dev/null 2>&1; then
  echo "▸ ติดตั้ง pm2"
  sudo npm install -g pm2
fi

pm2 delete genki >/dev/null 2>&1 || true
PORT="$PORT" NODE_ENV=production pm2 start "node dist/boot.js" --name genki --cwd "$APP_DIR"
pm2 save
echo "▸ ตั้งให้ขึ้นเองตอนเปิดเครื่อง (อาจต้องรันคำสั่งที่ pm2 พิมพ์ออกมา)"
pm2 startup || true

ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
cat <<MSG

✅ เสร็จแล้ว — เว็บรันอยู่ตลอดเวลา

   เครื่องนี้            http://localhost:$PORT/
   มือถือในวง Wi-Fi นี้   http://${ip:-<ไอพีเครื่องนี้>}:$PORT/

   ดู log       pm2 logs genki
   รีสตาร์ท      pm2 restart genki
   อัปเดต       git pull && npm ci && npm run build && pm2 restart genki
   ข้อมูลก๊วน    $APP_DIR/data   ← สำรองแค่ก็อปโฟลเดอร์นี้

MSG
