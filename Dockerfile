# ── ขั้นที่ 1: build ──
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── ขั้นที่ 2: ตัวที่รันจริง (เล็ก ไม่มีเครื่องมือ build ติดมา) ──
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3100
ENV DATA_DIR=/app/data

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# ข้อมูลก๊วน (ทะเบียนผู้เล่น + ประวัติทุกครั้ง) อยู่ใน volume นี้ — อย่าลืม mount
VOLUME ["/app/data"]
EXPOSE 3100

# เช็กว่ายังมีชีวิตอยู่ ถ้าไม่ตอบ docker จะรีสตาร์ทให้เอง
HEALTHCHECK --interval=60s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3100/api/bootstrap > /dev/null || exit 1

CMD ["node", "dist/boot.js"]
