type NormalizedLandmark = { x: number; y: number; z: number; visibility?: number };
type PoseResults = { poseLandmarks: NormalizedLandmark[] };
type PoseInstance = {
  setOptions: (options: Record<string, number | boolean>) => void;
  initialize: () => Promise<void>;
  onResults: (listener: (results: PoseResults) => void) => void;
  send: (input: { image: HTMLCanvasElement }) => Promise<void>;
  close: () => Promise<void>;
};
type PoseConstructor = new (config: { locateFile: (file: string) => string }) => PoseInstance;

declare global {
  interface Window { Pose?: PoseConstructor }
}

export type PlayerPosition = "near-left" | "near-right" | "far-left" | "far-right";
export type Handedness = "right" | "left";
export type CourtPoint = { x: number; y: number };
export type ShotType = "unknown" | "forehand" | "backhand" | "overhead";
export type MomentType = "slow_recovery" | "off_balance" | "good_recovery" | "net_control" | "possible_shot";

export type PoseSample = {
  time: number;
  x: number;
  y: number;
  confidence: number;
  speed: number;
  readyScore: number;
  balanceScore: number;
  wristSpeed: number;
  partnerX: number | null;
  partnerY: number | null;
  partnerConfidence: number;
};

export type AnalysisMoment = {
  id: string;
  type: MomentType;
  timestampSeconds: number;
  confidence: number;
  title: string;
  detail: string;
  shotType?: ShotType;
};

export type HeatCell = { column: number; row: number; value: number };

export type MovementMetrics = {
  movementScore: number;
  positioningScore: number;
  recoveryScore: number;
  readyScore: number;
  balanceScore: number;
  partnerScore: number;
  distanceMeters: number;
  netControlPercent: number;
  courtCoveragePercent: number;
  averageRecoverySeconds: number;
  directionChanges: number;
  fastMoves: number;
  partnerTogetherPercent: number;
  averagePartnerDistance: number;
  trackingRate: number;
};

export type VideoAnalysis = {
  version: "pose-v3";
  durationSeconds: number;
  width: number;
  height: number;
  sampledFrames: number;
  sampleInterval: number;
  analysisConfidence: number;
  metrics: MovementMetrics;
  samples: PoseSample[];
  heatmap: HeatCell[];
  moments: AnalysisMoment[];
  courtPoints: CourtPoint[];
};

type AnalyzerOptions = {
  playerPosition: PlayerPosition;
  handedness: Handedness;
  courtPoints: CourtPoint[];
  analyzePartner?: boolean;
  onProgress?: (progress: number, message: string) => void;
};

type Crop = { x: number; y: number; width: number; height: number };
type RawPose = {
  time: number;
  x: number;
  y: number;
  confidence: number;
  readyScore: number;
  balanceScore: number;
  wristX: number;
  wristY: number;
};

const COURT_WIDTH = 10;
const COURT_LENGTH = 20;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

function waitFor(video: HTMLVideoElement, eventName: "loadeddata" | "seeked", timeoutMs = 15000) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("The browser could not read this video. Try MP4 (H.264) or MOV."));
    }, timeoutMs);
    const onEvent = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("This video could not be decoded in your browser.")); };
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener("error", onError);
    };
    video.addEventListener(eventName, onEvent, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

async function seek(video: HTMLVideoElement, time: number) {
  if (Math.abs(video.currentTime - time) < 0.015) return;
  const ready = waitFor(video, "seeked", 10000);
  video.currentTime = time;
  await ready;
}

function cropFor(position: PlayerPosition): Crop {
  const left = position.endsWith("left");
  const near = position.startsWith("near");
  return {
    x: left ? 0 : 0.36,
    y: near ? 0.34 : 0,
    width: 0.64,
    height: 0.66,
  };
}

function partnerPosition(position: PlayerPosition): PlayerPosition {
  return `${position.startsWith("near") ? "near" : "far"}-${position.endsWith("left") ? "right" : "left"}` as PlayerPosition;
}

function visibility(landmarks: NormalizedLandmark[], indexes: number[]) {
  return indexes.reduce((sum, index) => sum + (landmarks[index]?.visibility ?? 0), 0) / indexes.length;
}

function midpoint(landmarks: NormalizedLandmark[], a: number, b: number) {
  return { x: (landmarks[a].x + landmarks[b].x) / 2, y: (landmarks[a].y + landmarks[b].y) / 2 };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angle(a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark) {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const cosine = (ba.x * bc.x + ba.y * bc.y) / Math.max(Math.hypot(ba.x, ba.y) * Math.hypot(bc.x, bc.y), 0.0001);
  return Math.acos(clamp(cosine, -1, 1)) * 180 / Math.PI;
}

function poseFeatures(results: PoseResults, crop: Crop, time: number): RawPose | null {
  const landmarks = results.poseLandmarks;
  if (!landmarks?.length) return null;
  const coreVisibility = visibility(landmarks, [11, 12, 23, 24, 25, 26, 27, 28]);
  if (coreVisibility < 0.3) return null;

  const ankles = midpoint(landmarks, 27, 28);
  const hips = midpoint(landmarks, 23, 24);
  const shoulders = midpoint(landmarks, 11, 12);
  const feetWidth = distance(landmarks[27], landmarks[28]);
  const shoulderWidth = Math.max(distance(landmarks[11], landmarks[12]), 0.02);
  const leftKnee = angle(landmarks[23], landmarks[25], landmarks[27]);
  const rightKnee = angle(landmarks[24], landmarks[26], landmarks[28]);
  const kneeBend = clamp((165 - ((leftKnee + rightKnee) / 2)) / 55, 0, 1);
  const stance = clamp((feetWidth / shoulderWidth - 0.45) / 0.75, 0, 1);
  const readyScore = Math.round((kneeBend * 0.55 + stance * 0.45) * 100);
  const torsoLean = Math.abs(shoulders.x - hips.x) / shoulderWidth;
  const footCenterOffset = Math.abs(hips.x - ankles.x) / Math.max(feetWidth, shoulderWidth);
  const balanceScore = Math.round(clamp(1 - torsoLean * 0.62 - footCenterOffset * 0.75, 0, 1) * 100);
  const preferredWrist = landmarks[16].visibility! >= landmarks[15].visibility! ? landmarks[16] : landmarks[15];

  return {
    time,
    x: crop.x + ankles.x * crop.width,
    y: crop.y + ankles.y * crop.height,
    confidence: round(coreVisibility, 3),
    readyScore,
    balanceScore,
    wristX: crop.x + preferredWrist.x * crop.width,
    wristY: crop.y + preferredWrist.y * crop.height,
  };
}

function solveLinear(matrix: number[][], vector: number[]) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    if (Math.abs(divisor) < 1e-8) throw new Error("Court calibration points overlap. Adjust the four corners and try again.");
    for (let item = column; item <= size; item += 1) augmented[column][item] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let item = column; item <= size; item += 1) augmented[row][item] -= factor * augmented[column][item];
    }
  }
  return augmented.map((row) => row[size]);
}

function homography(points: CourtPoint[]) {
  if (points.length !== 4) throw new Error("Four court corners are required.");
  const destination = [{ x: 0, y: 0 }, { x: COURT_WIDTH, y: 0 }, { x: COURT_WIDTH, y: COURT_LENGTH }, { x: 0, y: COURT_LENGTH }];
  const matrix: number[][] = [];
  const vector: number[] = [];
  points.forEach((source, index) => {
    const target = destination[index];
    matrix.push([source.x, source.y, 1, 0, 0, 0, -target.x * source.x, -target.x * source.y]);
    vector.push(target.x);
    matrix.push([0, 0, 0, source.x, source.y, 1, -target.y * source.x, -target.y * source.y]);
    vector.push(target.y);
  });
  const h = solveLinear(matrix, vector);
  return (point: CourtPoint) => {
    const denominator = h[6] * point.x + h[7] * point.y + 1;
    return { x: (h[0] * point.x + h[1] * point.y + h[2]) / denominator, y: (h[3] * point.x + h[4] * point.y + h[5]) / denominator };
  };
}

function smoothPositions(raw: RawPose[], map: (point: CourtPoint) => CourtPoint) {
  let previous: CourtPoint | null = null;
  return raw.map((sample) => {
    const mapped = map({ x: sample.x, y: sample.y });
    const valid = mapped.x >= -1.5 && mapped.x <= COURT_WIDTH + 1.5 && mapped.y >= -2 && mapped.y <= COURT_LENGTH + 2;
    if (!valid) return { ...sample, court: null as CourtPoint | null };
    const next = previous ? { x: previous.x * 0.58 + mapped.x * 0.42, y: previous.y * 0.58 + mapped.y * 0.42 } : mapped;
    previous = next;
    return { ...sample, court: { x: clamp(next.x, 0, COURT_WIDTH), y: clamp(next.y, 0, COURT_LENGTH) } };
  });
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function buildResult(
  targetRaw: RawPose[],
  partnerRaw: Array<RawPose | null>,
  metadata: { duration: number; width: number; height: number; interval: number; plannedSamples: number },
  options: AnalyzerOptions,
): VideoAnalysis {
  const map = homography(options.courtPoints);
  const target = smoothPositions(targetRaw, map);
  const partnerMapped = smoothPositions(partnerRaw.filter((sample): sample is RawPose => Boolean(sample)), map);
  let totalDistance = 0;
  let fastMoves = 0;
  let directionChanges = 0;
  let previousVelocity: CourtPoint | null = null;
  let previousWrist: CourtPoint | null = null;

  const samples: PoseSample[] = target.map((sample, index) => {
    const before = target[index - 1];
    const dt = before ? Math.max(0.01, sample.time - before.time) : metadata.interval;
    let speed = 0;
    if (sample.court && before?.court) {
      const step = distance(sample.court, before.court);
      if (step <= Math.max(4.5, dt * 4.2)) {
        totalDistance += step;
        speed = step / dt;
        if (speed >= 2.2) fastMoves += 1;
        const velocity = { x: sample.court.x - before.court.x, y: sample.court.y - before.court.y };
        if (previousVelocity && speed > 0.55) {
          const dot = velocity.x * previousVelocity.x + velocity.y * previousVelocity.y;
          const magnitude = Math.max(Math.hypot(velocity.x, velocity.y) * Math.hypot(previousVelocity.x, previousVelocity.y), 0.001);
          if (Math.acos(clamp(dot / magnitude, -1, 1)) * 180 / Math.PI > 72) directionChanges += 1;
        }
        if (Math.hypot(velocity.x, velocity.y) > 0.15) previousVelocity = velocity;
      }
    }
    const wrist = { x: sample.wristX, y: sample.wristY };
    const wristSpeed = previousWrist ? distance(wrist, previousWrist) / dt : 0;
    previousWrist = wrist;
    const partner = partnerMapped.reduce<(typeof partnerMapped)[number] | null>((closest, candidate) => {
      if (Math.abs(candidate.time - sample.time) > metadata.interval * 0.65) return closest;
      return !closest || Math.abs(candidate.time - sample.time) < Math.abs(closest.time - sample.time) ? candidate : closest;
    }, null);
    return {
      time: round(sample.time),
      x: round(sample.court?.x ?? -1),
      y: round(sample.court?.y ?? -1),
      confidence: Math.round(sample.confidence * 100),
      speed: round(speed),
      readyScore: sample.readyScore,
      balanceScore: sample.balanceScore,
      wristSpeed: round(wristSpeed, 3),
      partnerX: partner?.court ? round(partner.court.x) : null,
      partnerY: partner?.court ? round(partner.court.y) : null,
      partnerConfidence: partner ? Math.round(partner.confidence * 100) : 0,
    };
  });

  const valid = samples.filter((sample) => sample.x >= 0 && sample.confidence >= 35);
  const nearPlayer = options.playerPosition.startsWith("near");
  const atNet = valid.filter((sample) => nearPlayer ? sample.y >= 6.2 && sample.y <= 10.8 : sample.y <= 13.8 && sample.y >= 9.2);
  const heatCounts = Array.from({ length: 32 }, () => 0);
  valid.forEach((sample) => {
    const column = clamp(Math.floor(sample.x / (COURT_WIDTH / 4)), 0, 3);
    const row = clamp(Math.floor(sample.y / (COURT_LENGTH / 8)), 0, 7);
    heatCounts[row * 4 + column] += 1;
  });
  const maxHeat = Math.max(...heatCounts, 1);
  const heatmap = heatCounts.map((count, index) => ({ column: index % 4, row: Math.floor(index / 4), value: Math.round((count / maxHeat) * 100) }));
  const coveredCells = heatCounts.filter((count) => count >= Math.max(1, valid.length * 0.015)).length;

  const recoveries: number[] = [];
  samples.forEach((sample, index) => {
    if (sample.speed < 2.2 || samples[index - 1]?.speed >= 2.2) return;
    const recovered = samples.slice(index + 1).find((candidate) => candidate.time - sample.time <= 6 && candidate.readyScore >= 58 && candidate.speed < 1.25);
    if (recovered) recoveries.push(recovered.time - sample.time);
  });
  const averageRecoverySeconds = average(recoveries);
  const recoveryScore = recoveries.length ? Math.round(clamp(100 - (averageRecoverySeconds - 1.2) * 22, 35, 98)) : Math.round(average(valid.map((sample) => sample.readyScore)));
  const readyScore = Math.round(average(valid.map((sample) => sample.readyScore)));
  const balanceScore = Math.round(average(valid.map((sample) => sample.balanceScore)));
  const paired = valid.filter((sample) => sample.partnerX !== null && sample.partnerY !== null && sample.partnerConfidence >= 35);
  const partnerDistances = paired.map((sample) => Math.hypot(sample.x - sample.partnerX!, sample.y - sample.partnerY!));
  const together = paired.filter((sample) => Math.abs(sample.y - sample.partnerY!) <= 2.2 && Math.abs(sample.x - sample.partnerX!) >= 2 && Math.abs(sample.x - sample.partnerX!) <= 7.5);
  const partnerTogetherPercent = paired.length ? Math.round(together.length / paired.length * 100) : 0;
  const partnerScore = paired.length ? Math.round(clamp(partnerTogetherPercent * 0.75 + (1 - Math.min(Math.abs(average(partnerDistances) - 5) / 5, 1)) * 25, 0, 100)) : 0;
  const positioningScore = Math.round(clamp((atNet.length / Math.max(valid.length, 1)) * 62 + (coveredCells / 18) * 38, 0, 100));
  const movementScore = Math.round(clamp(positioningScore * 0.25 + recoveryScore * 0.25 + readyScore * 0.18 + balanceScore * 0.17 + (paired.length ? partnerScore : positioningScore) * 0.15, 0, 100));
  const trackingRate = Math.round(valid.length / Math.max(metadata.plannedSamples, 1) * 100);

  const moments: AnalysisMoment[] = [];
  samples.forEach((sample, index) => {
    const previous = samples[index - 1];
    const next = samples[index + 1];
    if (sample.balanceScore < 48 && (!previous || previous.balanceScore >= 48) && moments.filter((item) => item.type === "off_balance").length < 5) {
      moments.push({ id: `balance-${index}`, type: "off_balance", timestampSeconds: sample.time, confidence: sample.confidence, title: "Off-balance movement", detail: `Body stability dropped to ${sample.balanceScore}/100. Check your finish and first recovery step.` });
    }
    if (sample.speed >= 2.2 && next && next.readyScore < 50 && moments.filter((item) => item.type === "slow_recovery").length < 5) {
      moments.push({ id: `recovery-${index}`, type: "slow_recovery", timestampSeconds: sample.time, confidence: Math.min(sample.confidence, next.confidence), title: "Recovery needs attention", detail: "A fast movement was followed by a low ready-position score." });
    }
    if (sample.wristSpeed > 0.16 && sample.confidence >= 55 && (!previous || sample.wristSpeed >= previous.wristSpeed) && (!next || sample.wristSpeed >= next.wristSpeed) && moments.filter((item) => item.type === "possible_shot").length < 12) {
      const center = options.playerPosition.endsWith("left") ? 0.28 : 0.72;
      const side = (sample.x / COURT_WIDTH) > center;
      const forehand = options.handedness === "right" ? side : !side;
      moments.push({ id: `shot-${index}`, type: "possible_shot", timestampSeconds: sample.time, confidence: Math.min(74, Math.round(sample.confidence * 0.72)), title: "Possible shot moment", detail: "Wrist and body speed peaked here. Shot type remains a suggestion.", shotType: forehand ? "forehand" : "backhand" });
    }
  });

  const confidence = Math.round(clamp(trackingRate * 0.55 + (metadata.width >= 1280 ? 22 : metadata.width >= 720 ? 15 : 8) + (valid.length >= 80 ? 18 : valid.length >= 35 ? 12 : 5), 25, 96));
  return {
    version: "pose-v3",
    durationSeconds: round(metadata.duration),
    width: metadata.width,
    height: metadata.height,
    sampledFrames: metadata.plannedSamples,
    sampleInterval: round(metadata.interval),
    analysisConfidence: confidence,
    metrics: {
      movementScore,
      positioningScore,
      recoveryScore,
      readyScore,
      balanceScore,
      partnerScore,
      distanceMeters: round(totalDistance, 1),
      netControlPercent: Math.round(atNet.length / Math.max(valid.length, 1) * 100),
      courtCoveragePercent: Math.round(coveredCells / 32 * 100),
      averageRecoverySeconds: round(averageRecoverySeconds, 1),
      directionChanges,
      fastMoves,
      partnerTogetherPercent,
      averagePartnerDistance: round(average(partnerDistances), 1),
      trackingRate,
    },
    samples,
    heatmap,
    moments: moments.sort((a, b) => a.timestampSeconds - b.timestampSeconds),
    courtPoints: options.courtPoints,
  };
}

let poseRuntimePromise: Promise<PoseConstructor> | null = null;

function loadPoseRuntime() {
  if (window.Pose) return Promise.resolve(window.Pose);
  if (poseRuntimePromise) return poseRuntimePromise;
  poseRuntimePromise = new Promise<PoseConstructor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-legite-pose]');
    const script = existing || document.createElement("script");
    const finish = () => window.Pose ? resolve(window.Pose) : reject(new Error("Body tracking could not start in this browser."));
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Body tracking files could not be loaded.")), { once: true });
    if (!existing) {
      script.src = "/mediapipe/pose.js";
      script.async = true;
      script.dataset.legitePose = "true";
      document.head.appendChild(script);
    }
  });
  return poseRuntimePromise;
}

function createPose(PoseRuntime: PoseConstructor) {
  const pose = new PoseRuntime({ locateFile: (file) => `/mediapipe/${file}` });
  pose.setOptions({ modelComplexity: 0, smoothLandmarks: false, enableSegmentation: false, minDetectionConfidence: 0.48, minTrackingConfidence: 0.42 });
  return pose;
}

export async function analyzeVideo(file: File, options: AnalyzerOptions): Promise<VideoAnalysis> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;
  const PoseRuntime = await loadPoseRuntime();
  const targetPose = createPose(PoseRuntime);
  const partnerPose = options.analyzePartner === false ? null : createPose(PoseRuntime);

  try {
    options.onProgress?.(2, "Loading body tracking");
    await waitFor(video, "loadeddata");
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("The video duration could not be read.");
    await Promise.all([targetPose.initialize(), partnerPose?.initialize()]);

    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 320;
    const context = canvas.getContext("2d", { willReadFrequently: false });
    if (!context) throw new Error("Body tracking is not supported in this browser.");
    const targetCrop = cropFor(options.playerPosition);
    const partnerCrop = cropFor(partnerPosition(options.playerPosition));
    const interval = clamp(video.duration / 220, 0.55, 2.5);
    const count = Math.max(3, Math.min(221, Math.floor(video.duration / interval) + 1));
    const targetRaw: RawPose[] = [];
    const partnerRaw: Array<RawPose | null> = [];
    let targetResult: PoseResults | null = null;
    let partnerResult: PoseResults | null = null;
    targetPose.onResults((result) => { targetResult = result; });
    partnerPose?.onResults((result) => { partnerResult = result; });

    const drawCrop = (crop: Crop) => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, crop.x * video.videoWidth, crop.y * video.videoHeight, crop.width * video.videoWidth, crop.height * video.videoHeight, 0, 0, canvas.width, canvas.height);
    };

    for (let index = 0; index < count; index += 1) {
      const time = Math.min(video.duration - 0.02, index * interval);
      await seek(video, Math.max(0, time));
      drawCrop(targetCrop);
      targetResult = null;
      await targetPose.send({ image: canvas });
      const target = targetResult ? poseFeatures(targetResult, targetCrop, time) : null;
      if (target) targetRaw.push(target);

      let partner: RawPose | null = null;
      if (partnerPose) {
        drawCrop(partnerCrop);
        partnerResult = null;
        await partnerPose.send({ image: canvas });
        partner = partnerResult ? poseFeatures(partnerResult, partnerCrop, time) : null;
      }
      partnerRaw.push(partner);
      if (index % 2 === 0 || index === count - 1) {
        options.onProgress?.(clamp(8 + Math.round(index / Math.max(count - 1, 1) * 86), 8, 94), partnerPose ? "Tracking you and your partner" : "Tracking your body position");
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
    }

    if (targetRaw.length < Math.max(4, count * 0.08)) throw new Error("The selected player could not be tracked reliably. Check the court corners and choose the correct starting position.");
    options.onProgress?.(97, "Building movement insights");
    return buildResult(targetRaw, partnerRaw, { duration: video.duration, width: video.videoWidth, height: video.videoHeight, interval, plannedSamples: count }, options);
  } finally {
    await Promise.allSettled([targetPose.close(), partnerPose?.close()]);
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

export function formatTimestamp(seconds: number) {
  const value = Math.max(0, Math.round(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export const defaultCourtPoints: CourtPoint[] = [
  { x: 0.08, y: 0.94 },
  { x: 0.92, y: 0.94 },
  { x: 0.67, y: 0.16 },
  { x: 0.33, y: 0.16 },
];
