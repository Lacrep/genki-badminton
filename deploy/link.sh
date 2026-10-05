#!/usr/bin/env bash
# พิมพ์ลิงก์สาธารณะของ docker compose --profile public ออกมา
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

for _ in $(seq 1 30); do
  url="$(docker compose logs tunnel 2>/dev/null | grep -om1 'https://[a-z0-9-]*\.trycloudflare\.com' || true)"
  [ -n "$url" ] && break
  sleep 1
done

if [ -z "${url:-}" ]; then
  echo "✗ ยังไม่เจอลิงก์ — เปิดด้วย  docker compose --profile public up -d --build  ก่อน" >&2
  docker compose logs --tail 20 tunnel 2>&1 >&2 || true
  exit 1
fi

cat <<MSG

✅ ลิงก์สาธารณะของก๊วน — ส่งเข้าไลน์กลุ่มได้เลย

   $url

   ลิงก์เปลี่ยนทุกครั้งที่ restart — อยากได้ลิงก์ที่ไม่เปลี่ยน ดู README หัวข้อ "ลิงก์ถาวร"

MSG
