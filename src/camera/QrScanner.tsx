import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useCodeScanner } from 'react-native-vision-camera';
import { Txt, Btn } from '../ui/kit';

/** Scans a gym join QR. Only the decoded text is used; nothing is recorded. */
export function QrScanner({ onCode, onError }: { onCode: (v: string) => void; onError: (m: string) => void }) {
  const { hasPermission, requestPermission } = useCameraPermission(); const device = useCameraDevice('back'); const done = React.useRef(false);
  useEffect(() => { if (!hasPermission) requestPermission().then((ok: boolean) => { if (!ok) onError('Camera permission was not granted. Type the code instead.'); }); }, [hasPermission]);
  const scanner = useCodeScanner({ codeTypes: ['qr'], onCodeScanned: (codes: { value?: string }[]) => { const v = codes[0]?.value; if (v && !done.current) { done.current = true; onCode(v); } } });
  if (!hasPermission) return <Txt c="sub">Waiting for camera permission…</Txt>;
  if (!device) return <View><Txt c="sub">No camera found on this device. Type the code instead.</Txt></View>;
  return <View style={{ height: 320, borderRadius: 20, overflow: 'hidden' }}><Camera style={{ flex: 1 }} device={device} isActive codeScanner={scanner} /></View>;
}
