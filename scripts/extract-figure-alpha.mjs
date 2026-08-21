import { resolve } from "node:path";
import { rename } from "node:fs/promises";
import sharp from "../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js";

const files = process.argv.slice(2).map((file) => resolve(file));
if (!files.length) throw new Error("Pass one or more generated PNG paths.");

function isBackgroundPixel(data, offset) {
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  return Math.min(r, g, b) >= 232 && Math.max(r, g, b) - Math.min(r, g, b) <= 16;
}

for (const file of files) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  const outside = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  let read = 0;
  let write = 0;

  const enqueue = (index) => {
    if (outside[index] || !isBackgroundPixel(data, index * 4)) return;
    outside[index] = 1;
    queue[write++] = index;
  };

  for (let x = 0; x < info.width; x += 1) {
    enqueue(x);
    enqueue((info.height - 1) * info.width + x);
  }
  for (let y = 0; y < info.height; y += 1) {
    enqueue(y * info.width);
    enqueue(y * info.width + info.width - 1);
  }

  while (read < write) {
    const index = queue[read++];
    const x = index % info.width;
    const y = Math.floor(index / info.width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < info.width) enqueue(index + 1);
    if (y > 0) enqueue(index - info.width);
    if (y + 1 < info.height) enqueue(index + info.width);
  }

  for (let index = 0; index < pixels; index += 1) {
    if (outside[index]) data[index * 4 + 3] = 0;
  }

  const temporaryFile = `${file}.alpha.png`;
  await sharp(data, { raw: info }).png().toFile(temporaryFile);
  await rename(temporaryFile, file);
  console.log(`Extracted alpha: ${file}`);
}
