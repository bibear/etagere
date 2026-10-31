import type { BarcodeDecoder, DecodeSource } from './decoders';

/**
 * Live scanning needs `getUserMedia`, which browsers only expose in a secure context
 * (HTTPS or localhost). Over the plain-HTTP home network the PWA decodes a photo instead (D-13).
 */
export function canScanLive(scope: {
  isSecureContext?: boolean;
  navigator?: { mediaDevices?: { getUserMedia?: unknown } };
}): boolean {
  return (
    scope.isSecureContext === true &&
    typeof scope.navigator?.mediaDevices?.getUserMedia === 'function'
  );
}

/** How a live scan ended early: the user refused the camera, or there is no usable camera. */
export type LiveScanError = 'denied' | 'unavailable';

export interface LiveScanOptions {
  video: HTMLVideoElement;
  decoder: BarcodeDecoder;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  onCode(code: string): void;
  onError(error: LiveScanError): void;
  /** Delay between two decoded frames. */
  intervalMs?: number;
  /** Injected timer (tests). */
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * Opens the back camera in `video` and decodes a frame every `intervalMs` until the returned
 * `stop()` is called (which also releases the camera).
 */
export function startLiveScan({
  video,
  decoder,
  getUserMedia,
  onCode,
  onError,
  intervalMs = 250,
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: LiveScanOptions): () => void {
  let stopped = false;
  let stream: MediaStream | null = null;
  let timer: unknown = null;

  const tick = async () => {
    if (stopped) return;
    let code: string | null = null;
    try {
      code = await decoder.decode(video as DecodeSource);
    } catch {
      code = null;
    }
    if (stopped) return;
    if (code) onCode(code);
    timer = setTimer(tick, intervalMs);
  };

  getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    .then(async (media) => {
      stream = media;
      if (stopped) return release();
      video.srcObject = media;
      video.setAttribute('playsinline', 'true');
      video.muted = true;
      await video.play().catch(() => {});
      timer = setTimer(tick, intervalMs);
    })
    .catch((error: unknown) => {
      if (stopped) return;
      const name = (error as { name?: string } | null)?.name;
      onError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
    });

  function release() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  return () => {
    stopped = true;
    if (timer !== null) clearTimer(timer);
    release();
    video.srcObject = null;
  };
}

/** Longest side, in pixels, of the turned copies: phone photos are much larger than needed. */
const MAX_SIDE = 1600;

/**
 * The picture as taken, then turned a quarter, a half and three quarters (browser only):
 * a barcode photographed sideways or upside down still reads. Copies are made lazily, only
 * when the previous orientation found nothing.
 */
export function* photoCandidates(image: HTMLImageElement): Generator<DecodeSource> {
  yield image;
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height || typeof document === 'undefined') return;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  for (const quarter of [1, 2, 3]) {
    const canvas = document.createElement('canvas');
    const sideways = quarter % 2 === 1;
    canvas.width = sideways ? h : w;
    canvas.height = sideways ? w : h;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((quarter * Math.PI) / 2);
    context.drawImage(image, -w / 2, -h / 2, w, h);
    yield canvas;
  }
}

/**
 * Decodes one picture (the photo fallback). `loadImage` turns the file into an image element;
 * every orientation from `candidates` is tried until one holds a barcode.
 */
export async function decodePhoto(
  file: Blob,
  {
    decoder,
    loadImage,
    candidates = photoCandidates,
  }: {
    decoder: BarcodeDecoder;
    loadImage: (file: Blob) => Promise<HTMLImageElement>;
    candidates?: (image: HTMLImageElement) => Iterable<DecodeSource>;
  },
): Promise<string | null> {
  try {
    const image = await loadImage(file);
    for (const candidate of candidates(image)) {
      const code = await decoder.decode(candidate);
      if (code) return code;
    }
    return null;
  } catch {
    return null;
  }
}

/** Loads a picked file into an `<img>` (browser only); the object URL is released afterwards. */
export function loadImageFile(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('unreadable image'));
    image.src = url;
  }).finally(() => URL.revokeObjectURL(url));
}
