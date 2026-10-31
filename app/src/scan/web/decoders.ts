// Barcode decoding in the browser, behind one interface (D-13): the native `BarcodeDetector`
// when the browser has it, else ZXing (loaded on demand, it is only needed on the web).

/** What a browser decoder reads: a video frame or a still picture. */
export type DecodeSource = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

export interface BarcodeDecoder {
  /** The first EAN-13 payload found in the source, or null. */
  decode(source: DecodeSource): Promise<string | null>;
}

/** The part of the Shape Detection API we use (not in TypeScript's DOM types yet). */
export interface BarcodeDetectorLike {
  detect(source: DecodeSource): Promise<{ rawValue: string }[]>;
}
export interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?(): Promise<string[]>;
}

/** The `BarcodeDetector` constructor when it can read EAN-13, else null. */
export async function findBarcodeDetector(
  scope: { BarcodeDetector?: BarcodeDetectorConstructor } = globalThis as never,
): Promise<BarcodeDetectorConstructor | null> {
  const Detector = scope.BarcodeDetector;
  if (!Detector) return null;
  try {
    const formats = (await Detector.getSupportedFormats?.()) ?? ['ean_13'];
    return formats.includes('ean_13') ? Detector : null;
  } catch {
    return null;
  }
}

export function barcodeDetectorDecoder(Detector: BarcodeDetectorConstructor): BarcodeDecoder {
  const detector = new Detector({ formats: ['ean_13'] });
  return {
    async decode(source) {
      const codes = await detector.detect(source);
      return codes[0]?.rawValue ?? null;
    },
  };
}

/** The slice of ZXing's browser reader we use. */
export interface ZxingReader {
  decodeFromCanvas(canvas: HTMLCanvasElement): { getText(): string };
}

/**
 * ZXing reader for EAN-13. Every source is first drawn on a canvas (`drawToCanvas`), then decoded;
 * "nothing found" (ZXing throws) is null.
 */
export function zxingDecoder(
  reader: ZxingReader,
  drawToCanvas: (source: DecodeSource) => HTMLCanvasElement | null,
): BarcodeDecoder {
  return {
    async decode(source) {
      const canvas = drawToCanvas(source);
      if (!canvas) return null;
      try {
        return reader.decodeFromCanvas(canvas).getText();
      } catch {
        return null;
      }
    },
  };
}

/** Draws a video frame or an image on a canvas at its natural size (browser only). */
export function drawToCanvas(source: DecodeSource): HTMLCanvasElement | null {
  if (source instanceof HTMLCanvasElement) return source;
  const width = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const height = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  if (!width || !height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function loadZxingReader(): Promise<ZxingReader> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ]);
  const hints = new Map<unknown, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]],
    [DecodeHintType.TRY_HARDER, true],
  ]);
  return new BrowserMultiFormatReader(hints as never);
}

/** The best decoder this browser offers: `BarcodeDetector`, else ZXing. */
export async function createBrowserDecoder({
  findDetector = findBarcodeDetector,
  loadZxing = loadZxingReader,
  draw = drawToCanvas,
}: {
  findDetector?: () => Promise<BarcodeDetectorConstructor | null>;
  loadZxing?: () => Promise<ZxingReader>;
  draw?: (source: DecodeSource) => HTMLCanvasElement | null;
} = {}): Promise<BarcodeDecoder> {
  const Detector = await findDetector();
  if (Detector) return barcodeDetectorDecoder(Detector);
  return zxingDecoder(await loadZxing(), draw);
}
