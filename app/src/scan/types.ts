import type { ComponentType } from 'react';

/** Camera access as the scanner screen sees it, whatever the platform. */
export interface CameraPermission {
  /** `pending` while the platform answers; `undetermined` until the user was asked. */
  status: 'pending' | 'undetermined' | 'granted' | 'denied';
  /** False when the system will not show the prompt again (only the settings can grant it). */
  canAskAgain: boolean;
  request(): Promise<void>;
}

/** Why a live camera could not deliver codes: refused by the user, or no usable camera. */
export type ScannerError = 'denied' | 'unavailable';

export interface ScannerCameraProps {
  /** Decode only while true (paused while a result is shown). */
  active: boolean;
  torch: boolean;
  /** Every decoded barcode payload, unfiltered (the screen keeps the ISBNs). */
  onCode(code: string): void;
  onError?(error: ScannerError): void;
}

/**
 * Everything platform-specific about scanning, behind one small interface: the camera view that
 * decodes barcodes, the permission it needs and, on the web, a photo fallback. Native uses expo-camera (`backend.tsx`), the
 * web / PWA its own decoders (`backend.web.tsx`); tests pass a fake.
 */
export interface PhotoCaptureProps {
  /** The payload decoded from the picture. */
  onCode(code: string): void;
  /** The picture holds no readable barcode. */
  onNoBarcode(): void;
  disabled?: boolean;
}

export interface ScannerBackend {
  useCameraPermission(): CameraPermission;
  /** Live camera decoding continuously; null where only photos can be decoded. */
  Camera: ComponentType<ScannerCameraProps> | null;
  /** "Take a photo of the barcode" fallback (PWA over plain HTTP, or no live camera). */
  PhotoCapture?: ComponentType<PhotoCaptureProps>;
  hasTorch: boolean;
}
