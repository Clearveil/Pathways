// Builds the app icons from public/logo.png.
//
// The logo is a black hand with a lot of empty space around it. Home-screen
// icons need to be square, opaque, and tightly framed, so this script:
//   1. finds the bounding box of the hand,
//   2. crops a square around it with some breathing room,
//   3. downsamples to each target size with a box filter (average of the
//      source pixels behind each output pixel), composited over white.
//
// Run with: node scripts/make-icons.mjs
import fs from "node:fs";
import { PNG } from "pngjs";

const src = PNG.sync.read(fs.readFileSync("public/logo.png"));
const { width: W, height: H, data } = src;

// 1. Bounding box of "ink": visible and dark.
let minX = W, minY = H, maxX = 0, maxY = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4;
  const a = data[i + 3], lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
  if (a > 40 && lum < 200) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
}
const inkW = maxX - minX + 1, inkH = maxY - minY + 1;
const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
console.log(`hand bbox ${inkW}x${inkH} at ${minX},${minY}`);

// Colour of a source pixel composited over white. Outside the image = white.
function over(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return [255, 255, 255];
  const i = (y * W + x) * 4, a = data[i + 3] / 255;
  return [255 + (data[i] - 255) * a, 255 + (data[i + 1] - 255) * a, 255 + (data[i + 2] - 255) * a];
}

// 2 + 3. Render one icon. `room` is how much larger than the hand the square
// is (1.35 = 35% breathing room). Maskable icons need more, since Android
// may crop them to a circle.
function render(size, room, file) {
  const S = Math.round(Math.max(inkW, inkH) * room);
  const x0 = Math.round(cx - S / 2), y0 = Math.round(cy - S / 2);
  const scale = S / size;
  const out = new PNG({ width: size, height: size });
  for (let oy = 0; oy < size; oy++) for (let ox = 0; ox < size; ox++) {
    const sx0 = x0 + Math.floor(ox * scale), sx1 = x0 + Math.floor((ox + 1) * scale);
    const sy0 = y0 + Math.floor(oy * scale), sy1 = y0 + Math.floor((oy + 1) * scale);
    let r = 0, g = 0, b = 0, n = 0;
    for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) { const c = over(sx, sy); r += c[0]; g += c[1]; b += c[2]; n++; }
    const o = (oy * size + ox) * 4;
    out.data[o] = Math.round(r / n); out.data[o + 1] = Math.round(g / n); out.data[o + 2] = Math.round(b / n); out.data[o + 3] = 255;
  }
  fs.writeFileSync(file, PNG.sync.write(out));
  console.log(`wrote ${file} (${size}x${size})`);
}

render(192, 1.35, "public/icon-192.png");
render(512, 1.35, "public/icon-512.png");
render(512, 1.9, "public/icon-maskable-512.png");
render(180, 1.35, "public/apple-touch-icon.png");
