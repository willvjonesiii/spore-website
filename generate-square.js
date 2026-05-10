const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

async function main() {
  const SIZE = 200;
  const ACCENT = '#3ECFCF';
  const PHOTO_IN  = 'C:\\Users\\WillV\\Desktop\\Wills Stuff\\Headshots\\Bioshot.jpg';
  const PHOTO_OUT = 'will-square.jpg';
  const FACE_POSITION = 0.18; // adjust if face isn't well-framed

  const img = await loadImage(PHOTO_IN);

  const scale = Math.max(SIZE / img.width, SIZE / img.height);
  const sW = img.width * scale;
  const sH = img.height * scale;
  const offsetX = -(sW - SIZE) * 0.5;
  const offsetY = -(sH - SIZE) * FACE_POSITION;

  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');

  // Circular crop
  ctx.save();
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 3, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, offsetX, offsetY, sW, sH);
  ctx.restore();

  // Teal ring baked in
  ctx.save();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  fs.writeFileSync(
    path.join(__dirname, PHOTO_OUT),
    canvas.toBuffer('image/jpeg', { quality: 92 })
  );
  console.log(`Done → ${PHOTO_OUT}`);
}

main().catch(console.error);
