import { crc32, deflateSync } from 'node:zlib';

// The app icon of the PWA, drawn in code (no binary in the repository): four book spines on a
// shelf, on the primary green. Shapes are fractions of the side, inside the maskable safe zone.

type Rgb = readonly [number, number, number];

const hex = (value: string): Rgb => [
  Number.parseInt(value.slice(1, 3), 16),
  Number.parseInt(value.slice(3, 5), 16),
  Number.parseInt(value.slice(5, 7), 16),
];

export const ICON_BACKGROUND = '#1F6B4A';

/** [x, y, width, height, color] in fractions of the side. */
const SHAPES: readonly [number, number, number, number, string][] = [
  [0.27, 0.34, 0.09, 0.36, '#E3B448'],
  [0.38, 0.4, 0.1, 0.3, '#F3F4F1'],
  [0.5, 0.3, 0.09, 0.4, '#B5523B'],
  [0.61, 0.37, 0.11, 0.33, '#DCEFE4'],
  [0.22, 0.7, 0.56, 0.045, '#F3F4F1'], // the shelf
  // Title bands across the spines.
  [0.27, 0.4, 0.09, 0.025, '#1F6B4A'],
  [0.38, 0.46, 0.1, 0.025, '#1F6B4A'],
  [0.5, 0.36, 0.09, 0.025, '#1F6B4A'],
  [0.61, 0.43, 0.11, 0.025, '#1F6B4A'],
];

/** The icon as SVG (the browser tab and any size). */
export function iconSvg(): string {
  const rects = SHAPES.map(
    ([x, y, w, h, color]) =>
      `<rect x="${x * 512}" y="${y * 512}" width="${w * 512}" height="${h * 512}" fill="${color}"/>`,
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${ICON_BACKGROUND}"/>${rects}</svg>\n`;
}

const chunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

/** The icon as an RGB PNG of `size` × `size` pixels. */
export function iconPng(size: number): Buffer {
  if (!Number.isInteger(size) || size < 16 || size > 2048) throw new Error(`bad icon size ${size}`);
  const shapes = SHAPES.map(([x, y, w, h, color]) => ({
    x0: Math.round(x * size),
    y0: Math.round(y * size),
    x1: Math.round((x + w) * size),
    y1: Math.round((y + h) * size),
    rgb: hex(color),
  }));
  const background = hex(ICON_BACKGROUND);
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      let rgb = background;
      for (const shape of shapes) {
        if (x >= shape.x0 && x < shape.x1 && y >= shape.y0 && y < shape.y1) rgb = shape.rgb;
      }
      raw.set(rgb, y * stride + 1 + x * 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
