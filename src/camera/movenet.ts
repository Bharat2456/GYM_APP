/**
 * Pure (native-free) helpers that turn MoveNet output into the 33-point MediaPipe-style landmark array the tested analyzers expect.
 * MoveNet SinglePose output: Float32 [1,1,17,3] -> 17 keypoints as [y, x, score], normalised 0..1 in the model input frame.
 */
export interface Landmark { x: number; y: number; visibility: number }
export interface Orient { rotate: number; mirror: boolean }
/** Android back camera frames arrive in sensor orientation (landscape); 90 turns them upright for a portrait phone. NOT validated on every device. */
export const DEFAULT_ORIENT: Orient = { rotate: 90, mirror: false };

/** COCO-17 index -> MediaPipe-33 index. */
export const COCO_TO_MP: number[] = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
export const MIN_SCORE_FOR_DRAW = 0.2;

export function rotatePoint(x: number, y: number, deg: number): [number, number] {
  switch (((deg % 360) + 360) % 360) {
    case 90: return [1 - y, x];
    case 180: return [1 - x, 1 - y];
    case 270: return [y, 1 - x];
    default: return [x, y];
  }
}
/** Frame dimensions after applying the rotation. */
export const orientedSize = (w: number, h: number, deg: number): [number, number] => (((deg % 360) + 360) % 360) % 180 === 90 ? [h, w] : [w, h];

export function mapMoveNet(out: ArrayLike<number>, o: Orient = DEFAULT_ORIENT): Landmark[] {
  if (!out || out.length < 51) throw new Error('Unexpected pose model output (expected 17 keypoints).');
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  for (let i = 0; i < 17; i++) {
    const y = out[i * 3], x = out[i * 3 + 1], s = out[i * 3 + 2];
    let [rx, ry] = rotatePoint(x, y, o.rotate); if (o.mirror) rx = 1 - rx;
    lm[COCO_TO_MP[i]] = { x: rx, y: ry, visibility: Number.isFinite(s) ? Math.max(0, Math.min(1, s)) : 0 };
  }
  // Points MoveNet does not produce keep visibility 0 so the analyzers never trust them (heels, toes, hands).
  return lm;
}

/** Exponential smoothing per landmark; low-confidence points are not smoothed toward stale values. */
export class Smoother {
  private prev: Landmark[] | null = null;
  constructor(private alpha = 0.55) {}
  reset() { this.prev = null; }
  apply(lm: Landmark[]): Landmark[] {
    const p = this.prev; const out = lm.map((l, i) => (!p || l.visibility < 0.2 || p[i].visibility < 0.2 ? { ...l } : { x: p[i].x * (1 - this.alpha) + l.x * this.alpha, y: p[i].y * (1 - this.alpha) + l.y * this.alpha, visibility: l.visibility }));
    this.prev = out; return out;
  }
}
/** Inverse of mapMoveNet at rotate 0 / no mirror. Used by tests to feed analyzers through the real mapping path. */
export function encodeMoveNet(lm: Landmark[]): Float32Array {
  const o = new Float32Array(51); COCO_TO_MP.forEach((mp, i) => { o[i * 3] = lm[mp].y; o[i * 3 + 1] = lm[mp].x; o[i * 3 + 2] = lm[mp].visibility; }); return o;
}
export const MODEL_FILE = 'movenet_lightning.tflite';
