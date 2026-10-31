import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '../components/Button';
import { useI18n } from '../i18n/I18nProvider';
import type {
  CameraPermission,
  PhotoCaptureProps,
  ScannerBackend,
  ScannerCameraProps,
} from './types';
import { canScanLive, decodePhoto, loadImageFile, startLiveScan } from './web/camera';
import { type BarcodeDecoder, createBrowserDecoder } from './web/decoders';

// Web / PWA scanner (D-13): live camera in a secure context, else a photo of the barcode.

let decoder: Promise<BarcodeDecoder> | null = null;
/** One decoder per page, created on first use (ZXing is only downloaded when needed). */
function browserDecoder(): Promise<BarcodeDecoder> {
  decoder ??= createBrowserDecoder().catch((error: unknown) => {
    decoder = null;
    throw error;
  });
  return decoder;
}

// The browser asks for the camera itself when the stream opens; a refusal arrives as
// `onError('denied')`.
const BROWSER_PERMISSION: CameraPermission = {
  status: 'granted',
  canAskAgain: false,
  request: async () => {},
};

function WebLiveCamera({ active, onCode, onError }: ScannerCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handlers = useRef({ onCode, onError });
  useEffect(() => {
    handlers.current = { onCode, onError };
  }, [onCode, onError]);

  useEffect(() => {
    const video = videoRef.current;
    if (!active || !video) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    browserDecoder()
      .then((instance) => {
        if (cancelled) return;
        stop = startLiveScan({
          video,
          decoder: instance,
          getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
          onCode: (code) => handlers.current.onCode(code),
          onError: (error) => handlers.current.onError?.(error),
        });
      })
      .catch(() => handlers.current.onError?.('unavailable'));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [active]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <video
        ref={videoRef}
        muted
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </View>
  );
}

function WebPhotoCapture({ onCode, onNoBarcode, disabled }: PhotoCaptureProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const code = await decodePhoto(file, {
        decoder: await browserDecoder(),
        loadImage: loadImageFile,
      });
      if (code) onCode(code);
      else onNoBarcode();
    } catch {
      onNoBarcode();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onChange}
        aria-hidden
        tabIndex={-1}
        style={{ display: 'none' }}
      />
      <Button
        label={busy ? t('scan.readingPhoto') : t('scan.takePhoto')}
        busy={busy}
        disabled={disabled}
        onPress={() => inputRef.current?.click()}
      />
    </>
  );
}

const live = typeof window !== 'undefined' && canScanLive(window);

/** Browser scanner: BarcodeDetector or ZXing on the live camera, photo fallback otherwise. */
export const scannerBackend: ScannerBackend = {
  useCameraPermission: () => BROWSER_PERMISSION,
  Camera: live ? WebLiveCamera : null,
  PhotoCapture: WebPhotoCapture,
  hasTorch: false,
};
