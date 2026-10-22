/** Renderer-independent camera framing. All distances use the race's world units. */
export interface CameraSubject { x: number; z: number }
export interface RaceCameraFrame { x: number; y: number; z: number; height: number }

const RIGHT_X = 23 / Math.hypot(23, 13);
const RIGHT_Z = 13 / Math.hypot(23, 13);
const UP_X = 260 / Math.hypot(260, 698, 460);
const UP_Z = 460 / Math.hypot(260, 698, 460);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Include the finish gradually between the leader's Z=-5 and Z=-16. */
export function fitRaceCamera(babies: readonly CameraSubject[], aspect: number, out: RaceCameraFrame): RaceCameraFrame {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, leaderZ = Infinity;
  for (const baby of babies) {
    minX = Math.min(minX, baby.x - 1.2); maxX = Math.max(maxX, baby.x + 1.2);
    minZ = Math.min(minZ, baby.z - 2); maxZ = Math.max(maxZ, baby.z + 1.7); leaderZ = Math.min(leaderZ, baby.z);
  }
  if (!babies.length) { out.x = 0; out.y = 0; out.z = 10; out.height = Math.max(15.5, 15.8 / safeAspect); return out; }
  const approach = clamp01((-5 - leaderZ) / 11);
  const goalAmount = approach * approach * (3 - 2 * approach);
  minX += (Math.min(minX, -6.5) - minX) * goalAmount;
  maxX += (Math.max(maxX, 6.5) - maxX) * goalAmount;
  minZ += (Math.min(minZ, -22.5) - minZ) * goalAmount;
  const spanX = maxX - minX, spanZ = maxZ - minZ;
  const projectedWidth = spanX * RIGHT_X + spanZ * RIGHT_Z;
  const projectedHeight = spanX * UP_X + spanZ * UP_Z;
  out.x = (minX + maxX) / 2; out.y = 0; out.z = (minZ + maxZ) / 2 - 1.4;
  out.height = Math.max(15.5, projectedHeight + 6.8, (projectedWidth + 3) / safeAspect, 15.8 / safeAspect);
  return out;
}

/** Invalid/paused frames do nothing; a suspended tab cannot cause a camera cut. */
export function cameraStepAlpha(dt: number, rate = 4.5): number {
  return Number.isFinite(dt) && dt > 0 ? -Math.expm1(-Math.min(dt, .1) * rate) : 0;
}

/** Smooth both tracking and apparent scale, independent of the display's FPS. */
export function dampRaceCamera(current: RaceCameraFrame, desired: Readonly<RaceCameraFrame>, dt: number, reducedMotion = false): void {
  const alpha = cameraStepAlpha(dt, reducedMotion ? 8 : 4.5);
  if (alpha === 0) return;
  current.x += (desired.x - current.x) * alpha;
  current.y += (desired.y - current.y) * alpha;
  current.z += (desired.z - current.z) * alpha;
  current.height = Math.exp(Math.log(current.height) + (Math.log(desired.height) - Math.log(current.height)) * alpha);
}
