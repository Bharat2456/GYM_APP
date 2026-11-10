import { t, section, eq, ok, done } from './helpers';
import FIT from '../src/engine';
import { mapMoveNet, encodeMoveNet, Smoother, rotatePoint, orientedSize, COCO_TO_MP, DEFAULT_ORIENT } from '../src/camera/movenet';

section('MoveNet mapping (synthetic data; real-device accuracy is NOT tested here)');
t('rotation helpers round-trip and mirror', () => {
  const [x, y] = [0.3, 0.7]; let p: [number, number] = [x, y]; for (let i = 0; i < 4; i++) p = rotatePoint(p[0], p[1], 90);
  ok(Math.abs(p[0] - x) < 1e-9 && Math.abs(p[1] - y) < 1e-9); eq(orientedSize(1280, 720, 90).join('x'), '720x1280'); eq(orientedSize(1280, 720, 180).join('x'), '1280x720');
});
t('keypoint index map covers the landmarks the analyzers use', () => {
  eq(COCO_TO_MP.length, 17); eq(new Set(COCO_TO_MP).size, 17); [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach((i) => ok(COCO_TO_MP.includes(i), 'missing ' + i));
  let threw = false; try { mapMoveNet(new Float32Array(10)); } catch { threw = true; } ok(threw, 'short output must throw');
});
t('analyzers count the same reps through encode -> map as on the original landmarks', () => {
  for (const key of ['squat', 'pushup', 'curl', 'press', 'lunge']) {
    const frames = FIT.pose.genSequence(key, { reps: 5 });
    const direct = FIT.pose.runSequence(key, frames, 1).summary;
    const A = FIT.pose.createAnalyzer(key); const sm = new Smoother(1);
    frames.forEach((f: any) => A.update(sm.apply(mapMoveNet(encodeMoveNet(f.lm), { rotate: 0, mirror: false })), f.t, 1));
    const via = A.summary();
    eq(direct.reps, 5, key + ' baseline reps'); ok(Math.abs(via.reps - direct.reps) <= 1, key + ': ' + via.reps + ' vs ' + direct.reps);
  }
});
t('smoother keeps low-confidence points raw and default orientation is a documented constant', () => {
  const s = new Smoother(0.5); const a = mapMoveNet(new Float32Array(51).fill(0.5), { rotate: 0, mirror: false }); s.apply(a);
  const b = a.map((l) => ({ ...l, x: 0.9, visibility: 0.05 })); eq(s.apply(b)[0].x, 0.9); eq(DEFAULT_ORIENT.rotate, 90);
});
done();
