/**
 * ย่อรูปที่เลือก/ถ่ายมา ให้เป็นสี่เหลี่ยมจัตุรัสเล็ก ๆ ก่อนส่งขึ้นเซิร์ฟเวอร์
 *
 * รูปจากกล้องมือถือใบละ 3-8 MB ถ้าส่งดิบ ๆ จะช้าและกินที่เก็บโดยไม่จำเป็น
 * ในเว็บนี้รูปโชว์ใหญ่สุดแค่ไม่กี่สิบพิกเซล ย่อเหลือ 320px ก็เกินพอ
 * ตัดตรงกลางเป็นจัตุรัสด้วย เพราะทุกที่ที่ใช้เป็นวงกลมหมด
 */
const SIZE = 320
const QUALITY = 0.82

export async function squarePhotoDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("ไฟล์นี้ไม่ใช่รูปภาพ")

  const bitmap = await loadBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2

  const canvas = document.createElement("canvas")
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("เบราว์เซอร์นี้ย่อรูปไม่ได้")
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE)
  if ("close" in bitmap) bitmap.close()

  return canvas.toDataURL("image/jpeg", QUALITY)
}

/** createImageBitmap เร็วกว่าและกันรูปหมุนตาม EXIF ให้ แต่เบราว์เซอร์เก่าไม่มี */
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" })
    } catch {
      /* ตกไปใช้ <img> ข้างล่าง */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error("เปิดไฟล์รูปไม่ได้"))
      img.src = url
    })
  } finally {
    // ปล่อยตอนรูปโหลดเสร็จแล้ว canvas ก็วาดจากตัว img ได้ต่อ
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}
