import type { ComponentType } from 'react';

/** Camera access as the scanner screen sees it, whatever the platform. */
export interface CameraPermission {
  /** `pending` while the platform answers; `undetermined` until the user was asked. */
  status: 'pending' | 'undetermined' | 'granted' | 'denied';
  /** False when the system will not show the prompt again (only the settings can grant it). */
  canAskAgain: boolean;
  request(): Promise<void>;
}

/** Why a scanner camera could not deliver codes. */
export type ScannerError = 'denied' | 'unavailable' | 'no_barcode';

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
 * decodes barcodes and the permission it needs. Native uses expo-camera (`backend.tsx`), the
 * web / PWA its own decoders (`backend.web.tsx`); tests pass a fake.
 */
export interface ScannerBackend {
  useCameraPermission(): CameraPermission;
  Camera: ComponentType<ScannerCameraProps>;
  hasTorch: boolean;
}
