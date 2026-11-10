import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor } from 'react-native-vision-camera';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { Worklets } from 'react-native-worklets-core';
import { Txt, Btn, Gap } from '../ui/kit';
import { mapMoveNet, Landmark, Orient } from './movenet';

/**
 * On-device pose estimation: Vision Camera frame -> 192x192 RGB -> MoveNet Lightning (TFLite, CPU) -> 17 keypoints.
 * Frames are processed in memory and discarded. No frame, image or video is ever written or sent anywhere.
 * UNTESTED ON A REAL DEVICE in this repository's history: frame orientation, delegate choice and speed vary by phone.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MODEL = require('../../assets/models/movenet_lightning.tflite');

export interface PoseCameraProps { active: boolean; orient: Orient; facing: 'back' | 'front'; onLandmarks: (lm: Landmark[], tMs: number) => void; onStatus: (s: string) => void }
export function PoseCamera({ active, orient, facing, onLandmarks, onStatus }: PoseCameraProps) {
  const { hasPermission, requestPermission } = useCameraPermission(); const device = useCameraDevice(facing);
  const plugin = useTensorflowModel(MODEL); const model = plugin.state === 'loaded' ? plugin.model : undefined;
  const { resize } = useResizePlugin();
  const [dtype, setDtype] = useState<'uint8' | 'float32'>('uint8');
  useEffect(() => { if (!hasPermission) requestPermission(); }, [hasPermission]);
  useEffect(() => { onStatus(plugin.state === 'loaded' ? 'Pose model loaded' : plugin.state === 'error' ? 'Pose model failed to load: ' + String((plugin as any).error?.message || 'unknown') : 'Loading pose model…'); }, [plugin.state]);
  useEffect(() => { if (model) { const t = model.inputs?.[0]?.dataType; setDtype(t === 'float32' ? 'float32' : 'uint8'); } }, [model]);
  const orientRef = useRef(orient); orientRef.current = orient;
  const push = useMemo(() => Worklets.createRunOnJS((arr: number[]) => { try { onLandmarks(mapMoveNet(arr, orientRef.current), Date.now()); } catch (e: any) { onStatus(e.message); } }), [onLandmarks]);
  const frameProcessor = useFrameProcessor((frame: any) => {
    'worklet';
    if (model == null) return;
    const input = resize(frame, { scale: { width: 192, height: 192 }, pixelFormat: 'rgb', dataType: dtype });
    const out = model.runSync([input as any]);
    const kp = out[0] as any; const arr: number[] = []; for (let i = 0; i < 51; i++) arr.push(kp[i]);
    push(arr);
  }, [model, dtype, push]);
  if (!hasPermission) return <View style={{ padding: 20 }}><Txt c="sub">The camera is needed to see your movement. Nothing is recorded.</Txt><Gap /><Btn label="Allow camera" onPress={() => requestPermission()} /></View>;
  if (!device) return <View style={{ padding: 20 }}><Txt c="sub">No camera was found on this device.</Txt></View>;
  return <Camera style={{ flex: 1 }} device={device} isActive={active} frameProcessor={frameProcessor} fps={15} resizeMode="contain" pixelFormat="yuv" photo={false} video={false} audio={false} />;
}
