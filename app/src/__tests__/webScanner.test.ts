import { canScanLive, decodePhoto, startLiveScan } from '../scan/web/camera';
import {
  type BarcodeDecoder,
  type BarcodeDetectorConstructor,
  type DecodeSource,
  barcodeDetectorDecoder,
  createBrowserDecoder,
  findBarcodeDetector,
  zxingDecoder,
} from '../scan/web/decoders';

const source = {} as DecodeSource;
const canvas = {} as HTMLCanvasElement;

function fakeDetector(formats: string[] | null, found: string[] = []) {
  const created: { formats: string[] }[] = [];
  class Detector {
    constructor(options: { formats: string[] }) {
      created.push(options);
    }
    async detect() {
      return found.map((rawValue) => ({ rawValue }));
    }
    static getSupportedFormats = formats ? async () => formats : undefined;
  }
  return { Detector: Detector as unknown as BarcodeDetectorConstructor, created };
}

describe('scan mode (D-13)', () => {
  const getUserMedia = () => {};
  it('scans live only in a secure context with a camera API', () => {
    expect(
      canScanLive({ isSecureContext: true, navigator: { mediaDevices: { getUserMedia } } }),
    ).toBe(true);
    expect(
      canScanLive({ isSecureContext: false, navigator: { mediaDevices: { getUserMedia } } }),
    ).toBe(false);
    expect(canScanLive({ isSecureContext: true, navigator: {} })).toBe(false);
    expect(canScanLive({})).toBe(false);
  });
});

describe('browser decoders', () => {
  it('uses BarcodeDetector when it reads EAN-13', async () => {
    const { Detector, created } = fakeDetector(['qr_code', 'ean_13'], ['9782352940159']);
    expect(await findBarcodeDetector({ BarcodeDetector: Detector })).toBe(Detector);

    const decoder = barcodeDetectorDecoder(Detector);
    expect(created).toEqual([{ formats: ['ean_13'] }]);
    await expect(decoder.decode(source)).resolves.toBe('9782352940159');
  });

  it('ignores a BarcodeDetector without EAN-13, or no BarcodeDetector at all', async () => {
    expect(
      await findBarcodeDetector({ BarcodeDetector: fakeDetector(['qr_code']).Detector }),
    ).toBeNull();
    expect(await findBarcodeDetector({})).toBeNull();
  });

  it('answers null when BarcodeDetector sees nothing', async () => {
    const decoder = barcodeDetectorDecoder(fakeDetector(null, []).Detector);
    await expect(decoder.decode(source)).resolves.toBeNull();
  });

  it('falls back to ZXing, drawing the source on a canvas first', async () => {
    const reader = { decodeFromCanvas: jest.fn(() => ({ getText: () => '9782266111560' })) };
    const draw = jest.fn(() => canvas);
    const decoder = await createBrowserDecoder({
      findDetector: async () => null,
      loadZxing: async () => reader,
      draw,
    });

    await expect(decoder.decode(source)).resolves.toBe('9782266111560');
    expect(draw).toHaveBeenCalledWith(source);
    expect(reader.decodeFromCanvas).toHaveBeenCalledWith(canvas);
  });

  it('prefers BarcodeDetector and never loads ZXing then', async () => {
    const loadZxing = jest.fn();
    await createBrowserDecoder({
      findDetector: async () => fakeDetector(['ean_13']).Detector,
      loadZxing,
    });
    expect(loadZxing).not.toHaveBeenCalled();
  });

  it('maps ZXing "not found" and an empty frame to null', async () => {
    const reader = {
      decodeFromCanvas: () => {
        throw new Error('NotFoundException');
      },
    };
    await expect(zxingDecoder(reader, () => canvas).decode(source)).resolves.toBeNull();
    await expect(zxingDecoder(reader, () => null).decode(source)).resolves.toBeNull();
  });
});

/** A fake <video>, a fake camera stream and manual timers. */
function liveRig({
  codes = [] as (string | null)[],
  refuse,
}: { codes?: (string | null)[]; refuse?: string } = {}) {
  const track = { stop: jest.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const video = {
    srcObject: null as unknown,
    muted: false,
    setAttribute: jest.fn(),
    play: jest.fn(async () => {}),
  };
  const queue = [...codes];
  const decoder: BarcodeDecoder = { decode: jest.fn(async () => queue.shift() ?? null) };
  const timers: (() => void)[] = [];
  const getUserMedia = jest.fn(async () => {
    if (refuse) throw Object.assign(new Error(refuse), { name: refuse });
    return stream;
  });
  const onCode = jest.fn();
  const onError = jest.fn();
  const stop = startLiveScan({
    video: video as unknown as HTMLVideoElement,
    decoder,
    getUserMedia,
    onCode,
    onError,
    setTimer: (callback) => timers.push(callback),
    clearTimer: () => {},
  });
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  /** Runs the pending decode tick. */
  const tick = async () => {
    const next = timers.shift();
    next?.();
    await flush();
  };
  return {
    video,
    track,
    stream,
    decoder,
    getUserMedia,
    onCode,
    onError,
    stop,
    flush,
    tick,
    timers,
  };
}

describe('live scan', () => {
  it('opens the back camera and reports decoded codes frame after frame', async () => {
    const rig = liveRig({ codes: [null, '9782352940159'] });
    await rig.flush();

    expect(rig.getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    expect(rig.video.srcObject).toBe(rig.stream);
    expect(rig.video.play).toHaveBeenCalled();

    await rig.tick();
    expect(rig.onCode).not.toHaveBeenCalled();
    await rig.tick();
    expect(rig.onCode).toHaveBeenCalledWith('9782352940159');
  });

  it('releases the camera on stop and decodes nothing more', async () => {
    const rig = liveRig({ codes: ['9782352940159'] });
    await rig.flush();

    rig.stop();
    await rig.tick();

    expect(rig.track.stop).toHaveBeenCalled();
    expect(rig.video.srcObject).toBeNull();
    expect(rig.onCode).not.toHaveBeenCalled();
  });

  it('reports a refused camera as denied, a missing one as unavailable', async () => {
    const refused = liveRig({ refuse: 'NotAllowedError' });
    await refused.flush();
    expect(refused.onError).toHaveBeenCalledWith('denied');

    const missing = liveRig({ refuse: 'NotFoundError' });
    await missing.flush();
    expect(missing.onError).toHaveBeenCalledWith('unavailable');
  });
});

describe('photo fallback', () => {
  it('decodes the picked picture', async () => {
    const image = {} as HTMLImageElement;
    const decoder: BarcodeDecoder = { decode: jest.fn(async () => '9782352940159') };
    const loadImage = jest.fn(async () => image);

    await expect(decodePhoto(new Blob(['x']), { decoder, loadImage })).resolves.toBe(
      '9782352940159',
    );
    expect(decoder.decode).toHaveBeenCalledWith(image);
  });

  it('tries the picture turned a quarter, a half and three quarters, so its orientation does not matter', async () => {
    const image = {} as HTMLImageElement;
    const turned = [90, 180, 270].map((angle) => ({ angle }) as unknown as DecodeSource);
    const decoder: BarcodeDecoder = {
      decode: jest.fn(async (candidate: DecodeSource) =>
        candidate === turned[1] ? '9782352940159' : null,
      ),
    };

    await expect(
      decodePhoto(new Blob(['x']), {
        decoder,
        loadImage: async () => image,
        candidates: function* (picture) {
          yield picture;
          yield* turned;
        },
      }),
    ).resolves.toBe('9782352940159');
    expect(decoder.decode).toHaveBeenNthCalledWith(1, image);
    expect(decoder.decode).toHaveBeenCalledTimes(3);
  });

  it('answers null when no orientation of the picture holds a barcode', async () => {
    const decoder: BarcodeDecoder = { decode: jest.fn(async () => null) };
    const turned = [90, 180, 270].map((angle) => ({ angle }) as unknown as DecodeSource);

    await expect(
      decodePhoto(new Blob(['x']), {
        decoder,
        loadImage: async () => ({}) as HTMLImageElement,
        candidates: function* (picture) {
          yield picture;
          yield* turned;
        },
      }),
    ).resolves.toBeNull();
    expect(decoder.decode).toHaveBeenCalledTimes(4);
  });

  it('answers null for an unreadable picture', async () => {
    const decoder: BarcodeDecoder = { decode: jest.fn(async () => null) };
    const broken = async () => {
      throw new Error('unreadable image');
    };
    await expect(decodePhoto(new Blob(['x']), { decoder, loadImage: broken })).resolves.toBeNull();
  });
});
