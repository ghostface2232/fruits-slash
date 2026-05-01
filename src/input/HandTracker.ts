import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import {
  HAND_HISTORY_SIZE,
  HAND_MATCH_DISTANCE,
  HAND_MAX_PREDICTION_FRAMES,
  HAND_MIN_DETECTION_CONFIDENCE,
  HAND_MIN_PRESENCE_CONFIDENCE,
  HAND_MIN_TRACKING_CONFIDENCE,
  HAND_RECOVERY_BLEND_FRAMES,
  HAND_VELOCITY_WINDOW
} from '../config/gameConfig.ts';

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface NormalizedHand {
  id: number;
  handedness: 'Left' | 'Right';
  score: number;
  landmarks: HandLandmark[];
  predicted: boolean;
  gapFrames: number;
  dtMs: number;
}

export interface HandFrame {
  hands: NormalizedHand[];
  timestampMs: number;
}

export interface HandTrackerOptions {
  numHands?: number;
  mirror?: boolean;
  width?: number;
  height?: number;
  frameRate?: number;
}

interface RawObservation {
  landmarks: HandLandmark[];
  handedness: 'Left' | 'Right';
  score: number;
  cx: number;
  cy: number;
  cz: number;
}

interface HistorySample {
  t: number;
  landmarks: HandLandmark[];
  cx: number;
  cy: number;
  cz: number;
}

interface HandSlot {
  id: number;
  active: boolean;
  handedness: 'Left' | 'Right';
  score: number;
  history: HistorySample[];
  gapFrames: number;
  recoveryFrames: number;
  lastOutput: HandLandmark[] | null;
  lastOutputTime: number;
}

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_PATH = '/models/hand_landmarker.task';
const MATCH_DISTANCE_SQ = HAND_MATCH_DISTANCE * HAND_MATCH_DISTANCE;

export class HandTracker {
  private readonly video: HTMLVideoElement;
  private readonly numHands: number;
  private readonly mirror: boolean;
  private readonly width: number;
  private readonly height: number;
  private readonly frameRate: number;
  private readonly slots: HandSlot[] = [];
  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private nextSlotId = 0;

  constructor(video: HTMLVideoElement, options: HandTrackerOptions = {}) {
    this.video = video;
    this.numHands = options.numHands ?? 2;
    this.mirror = options.mirror ?? true;
    this.width = options.width ?? 1280;
    this.height = options.height ?? 720;
    this.frameRate = options.frameRate ?? 60;

    this.video.muted = true;
    this.video.playsInline = true;
    this.video.autoplay = true;
    this.video.style.position = 'absolute';
    this.video.style.visibility = 'hidden';
    this.video.style.pointerEvents = 'none';
    this.video.style.width = '0px';
    this.video.style.height = '0px';

    for (let i = 0; i < this.numHands; i++) {
      this.slots.push({
        id: -1,
        active: false,
        handedness: 'Left',
        score: 0,
        history: [],
        gapFrames: 0,
        recoveryFrames: 0,
        lastOutput: null,
        lastOutputTime: 0
      });
    }
  }

  async init(): Promise<void> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: this.width },
          height: { ideal: this.height },
          frameRate: { ideal: this.frameRate }
        },
        audio: false
      });
    } catch (err) {
      throw new Error(`Camera access denied or unavailable: ${(err as Error).message}`);
    }
    this.stream = stream;
    this.video.srcObject = stream;

    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    this.landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: MODEL_PATH
      },
      numHands: this.numHands,
      runningMode: 'VIDEO',
      minHandDetectionConfidence: HAND_MIN_DETECTION_CONFIDENCE,
      minHandPresenceConfidence: HAND_MIN_PRESENCE_CONFIDENCE,
      minTrackingConfidence: HAND_MIN_TRACKING_CONFIDENCE
    });

    await this.video.play();
    if (this.video.readyState < 2) {
      await new Promise<void>((resolve) => {
        this.video.addEventListener('loadeddata', () => resolve(), { once: true });
      });
    }
  }

  detect(timestampMs: number): HandFrame {
    if (!this.landmarker) {
      throw new Error('HandTracker.init() must be awaited before detect().');
    }

    const result = this.landmarker.detectForVideo(this.video, timestampMs);
    const observations = this.toObservations(result.landmarks, result.handednesses);
    const slotForObs = this.matchObservations(observations);

    const hands: NormalizedHand[] = [];
    for (let s = 0; s < this.slots.length; s++) {
      const slot = this.slots[s];
      const obsIdx = slotForObs[s];

      if (obsIdx >= 0) {
        const measured = observations[obsIdx];
        this.acceptMeasurement(slot, measured, timestampMs);
        const out = this.emitMeasured(slot, measured, timestampMs);
        hands.push(out);
      } else if (slot.active) {
        const predicted = this.tryPredict(slot, timestampMs);
        if (predicted) hands.push(predicted);
      }
    }

    return { hands, timestampMs };
  }

  dispose(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
    }
    if (this.video.srcObject) {
      this.video.srcObject = null;
    }
  }

  private toObservations(
    rawLandmarks: { x: number; y: number; z: number }[][],
    rawHandednesses: { categoryName?: string; score?: number }[][]
  ): RawObservation[] {
    const out: RawObservation[] = [];
    for (let i = 0; i < rawLandmarks.length; i++) {
      const raw = rawLandmarks[i];
      const hd = rawHandednesses[i]?.[0];
      const label: 'Left' | 'Right' = hd?.categoryName === 'Right' ? 'Right' : 'Left';
      const score = hd?.score ?? 0;

      const landmarks: HandLandmark[] = new Array(raw.length);
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let j = 0; j < raw.length; j++) {
        const lm = raw[j];
        const x = this.mirror ? 1 - lm.x : lm.x;
        landmarks[j] = { x, y: lm.y, z: lm.z };
        sx += x;
        sy += lm.y;
        sz += lm.z;
      }
      const inv = raw.length > 0 ? 1 / raw.length : 0;
      out.push({
        landmarks,
        handedness: label,
        score,
        cx: sx * inv,
        cy: sy * inv,
        cz: sz * inv
      });
    }
    return out;
  }

  // For each slot returns the matched observation index, or -1 if none.
  private matchObservations(observations: RawObservation[]): number[] {
    const slotForObs: number[] = new Array(this.slots.length).fill(-1);
    if (observations.length === 0) return slotForObs;

    const usedObs = new Set<number>();
    const activeIdx: number[] = [];
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i].active && this.slots[i].history.length > 0) activeIdx.push(i);
    }
    activeIdx.sort((a, b) => this.slots[b].history.length - this.slots[a].history.length);

    for (const slotIdx of activeIdx) {
      const slot = this.slots[slotIdx];
      const last = slot.history[slot.history.length - 1];
      let bestObs = -1;
      let bestSq = MATCH_DISTANCE_SQ;
      for (let r = 0; r < observations.length; r++) {
        if (usedObs.has(r)) continue;
        const o = observations[r];
        const dx = o.cx - last.cx;
        const dy = o.cy - last.cy;
        const sq = dx * dx + dy * dy;
        if (sq < bestSq) {
          bestSq = sq;
          bestObs = r;
        }
      }
      if (bestObs >= 0) {
        slotForObs[slotIdx] = bestObs;
        usedObs.add(bestObs);
      }
    }

    for (let r = 0; r < observations.length; r++) {
      if (usedObs.has(r)) continue;
      for (let s = 0; s < this.slots.length; s++) {
        if (slotForObs[s] === -1 && !this.slots[s].active) {
          slotForObs[s] = r;
          usedObs.add(r);
          break;
        }
      }
    }

    return slotForObs;
  }

  private acceptMeasurement(slot: HandSlot, obs: RawObservation, t: number): void {
    if (!slot.active) {
      slot.id = this.nextSlotId++;
      slot.active = true;
      slot.gapFrames = 0;
      slot.recoveryFrames = 0;
      slot.lastOutput = null;
      slot.lastOutputTime = 0;
    } else if (slot.gapFrames > 0) {
      slot.recoveryFrames = HAND_RECOVERY_BLEND_FRAMES;
    }
    slot.handedness = obs.handedness;
    slot.score = obs.score;
    slot.gapFrames = 0;

    slot.history.push({
      t,
      landmarks: obs.landmarks,
      cx: obs.cx,
      cy: obs.cy,
      cz: obs.cz
    });
    if (slot.history.length > HAND_HISTORY_SIZE) slot.history.shift();
  }

  private emitMeasured(slot: HandSlot, obs: RawObservation, t: number): NormalizedHand {
    let landmarks: HandLandmark[];
    if (slot.recoveryFrames > 0 && slot.lastOutput !== null) {
      const stepIndex = HAND_RECOVERY_BLEND_FRAMES - slot.recoveryFrames + 1;
      const alpha = stepIndex / HAND_RECOVERY_BLEND_FRAMES;
      landmarks = lerpLandmarks(slot.lastOutput, obs.landmarks, alpha);
      slot.recoveryFrames--;
    } else {
      landmarks = obs.landmarks;
    }

    const dtMs = slot.lastOutputTime > 0 ? t - slot.lastOutputTime : 0;
    slot.lastOutput = landmarks;
    slot.lastOutputTime = t;

    return {
      id: slot.id,
      handedness: slot.handedness,
      score: slot.score,
      landmarks,
      predicted: false,
      gapFrames: 0,
      dtMs
    };
  }

  private tryPredict(slot: HandSlot, t: number): NormalizedHand | null {
    if (slot.gapFrames >= HAND_MAX_PREDICTION_FRAMES || slot.history.length < 2) {
      slot.active = false;
      slot.history.length = 0;
      slot.gapFrames = 0;
      slot.recoveryFrames = 0;
      slot.lastOutput = null;
      return null;
    }
    slot.gapFrames++;
    const landmarks = extrapolate(slot.history, t);
    const dtMs = slot.lastOutputTime > 0 ? t - slot.lastOutputTime : 0;
    slot.lastOutput = landmarks;
    slot.lastOutputTime = t;
    return {
      id: slot.id,
      handedness: slot.handedness,
      score: slot.score * 0.8,
      landmarks,
      predicted: true,
      gapFrames: slot.gapFrames,
      dtMs
    };
  }
}

function lerpLandmarks(a: HandLandmark[], b: HandLandmark[], t: number): HandLandmark[] {
  const n = Math.min(a.length, b.length);
  const out: HandLandmark[] = new Array(n);
  const u = 1 - t;
  for (let i = 0; i < n; i++) {
    out[i] = {
      x: a[i].x * u + b[i].x * t,
      y: a[i].y * u + b[i].y * t,
      z: a[i].z * u + b[i].z * t
    };
  }
  return out;
}

// Rigid translation of the most recent pose by averaged velocity + damped accel.
function extrapolate(history: HistorySample[], targetTime: number): HandLandmark[] {
  const n = history.length;
  const newest = history[n - 1];
  const window = Math.min(n, HAND_VELOCITY_WINDOW);
  const oldest = history[n - window];

  const dtTotalSec = (newest.t - oldest.t) / 1000;
  let vx = 0;
  let vy = 0;
  let vz = 0;
  if (dtTotalSec > 1e-6) {
    vx = (newest.cx - oldest.cx) / dtTotalSec;
    vy = (newest.cy - oldest.cy) / dtTotalSec;
    vz = (newest.cz - oldest.cz) / dtTotalSec;
  }

  let ax = 0;
  let ay = 0;
  let az = 0;
  if (n >= 3) {
    const midIdx = Math.max(0, n - Math.max(2, Math.ceil(window / 2)));
    const mid = history[midIdx];
    const dtR = (newest.t - mid.t) / 1000;
    const dtO = (mid.t - oldest.t) / 1000;
    if (dtR > 1e-6 && dtO > 1e-6) {
      const vrx = (newest.cx - mid.cx) / dtR;
      const vry = (newest.cy - mid.cy) / dtR;
      const vrz = (newest.cz - mid.cz) / dtR;
      const vox = (mid.cx - oldest.cx) / dtO;
      const voy = (mid.cy - oldest.cy) / dtO;
      const voz = (mid.cz - oldest.cz) / dtO;
      const dtA = (dtR + dtO) * 0.5;
      if (dtA > 1e-6) {
        ax = (vrx - vox) / dtA;
        ay = (vry - voy) / dtA;
        az = (vrz - voz) / dtA;
      }
    }
  }

  const dtSec = (targetTime - newest.t) / 1000;
  const accelDamping = Math.exp(-dtSec * 8);
  const dx = vx * dtSec + 0.5 * ax * accelDamping * dtSec * dtSec;
  const dy = vy * dtSec + 0.5 * ay * accelDamping * dtSec * dtSec;
  const dz = vz * dtSec + 0.5 * az * accelDamping * dtSec * dtSec;

  const result: HandLandmark[] = new Array(newest.landmarks.length);
  for (let i = 0; i < newest.landmarks.length; i++) {
    const lm = newest.landmarks[i];
    result[i] = { x: lm.x + dx, y: lm.y + dy, z: lm.z + dz };
  }
  return result;
}
