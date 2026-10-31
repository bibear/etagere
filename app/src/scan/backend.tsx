import { CameraView, type PermissionResponse, useCameraPermissions } from 'expo-camera';
import { StyleSheet } from 'react-native';

import type { CameraPermission, ScannerBackend, ScannerCameraProps } from './types';

/** expo-camera's permission answer in the scanner's terms. */
export function permissionStatus(response: PermissionResponse | null): CameraPermission['status'] {
  if (!response) return 'pending';
  if (response.granted) return 'granted';
  return response.status === 'undetermined' ? 'undetermined' : 'denied';
}

function useCameraPermission(): CameraPermission {
  const [response, request] = useCameraPermissions();
  return {
    status: permissionStatus(response),
    canAskAgain: response?.canAskAgain ?? true,
    request: async () => {
      await request();
    },
  };
}

/** Back camera, EAN-13 only (ISBN barcodes), torch on demand. */
export function NativeScannerCamera({ active, torch, onCode }: ScannerCameraProps) {
  return (
    <CameraView
      testID="scanner-camera"
      style={StyleSheet.absoluteFill}
      facing="back"
      active={active}
      enableTorch={torch}
      barcodeScannerSettings={{ barcodeTypes: ['ean13'] }}
      onBarcodeScanned={active ? (result) => onCode(result.data) : undefined}
    />
  );
}

/** iOS / Android scanner: expo-camera barcode scanning. */
export const scannerBackend: ScannerBackend = {
  useCameraPermission,
  Camera: NativeScannerCamera,
  hasTorch: true,
};
