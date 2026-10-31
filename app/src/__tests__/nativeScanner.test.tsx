import { render, screen } from '@testing-library/react-native';

import { type PermissionResponse, PermissionStatus } from 'expo-camera';

import { NativeScannerCamera, permissionStatus } from '../scan/backend';

jest.mock('expo-camera', () => {
  const { View } = jest.requireActual('react-native');
  return {
    CameraView: (props: object) => <View {...props} />,
    useCameraPermissions: () => [null, jest.fn()],
    PermissionStatus: { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' },
  };
});

const response = (status: PermissionStatus, canAskAgain = true): PermissionResponse => ({
  status,
  granted: status === PermissionStatus.GRANTED,
  canAskAgain,
  expires: 'never',
});

describe('native scanner backend', () => {
  it('maps expo-camera permissions', () => {
    expect(permissionStatus(null)).toBe('pending');
    expect(permissionStatus(response(PermissionStatus.GRANTED))).toBe('granted');
    expect(permissionStatus(response(PermissionStatus.UNDETERMINED))).toBe('undetermined');
    expect(permissionStatus(response(PermissionStatus.DENIED, false))).toBe('denied');
  });

  it('scans EAN-13 with the back camera and forwards the payload while active', async () => {
    const onCode = jest.fn();
    await render(<NativeScannerCamera active torch onCode={onCode} />);
    const camera = screen.getByTestId('scanner-camera');

    expect(camera.props.facing).toBe('back');
    expect(camera.props.enableTorch).toBe(true);
    expect(camera.props.barcodeScannerSettings).toEqual({ barcodeTypes: ['ean13'] });
    camera.props.onBarcodeScanned({ type: 'ean13', data: '9782352940159' });
    expect(onCode).toHaveBeenCalledWith('9782352940159');
  });

  it('stops decoding while paused', async () => {
    await render(<NativeScannerCamera active={false} torch={false} onCode={jest.fn()} />);
    const camera = screen.getByTestId('scanner-camera');
    expect(camera.props.active).toBe(false);
    expect(camera.props.onBarcodeScanned).toBeUndefined();
  });
});
