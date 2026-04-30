import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface NormalizedHand {
  handedness: 'Left' | 'Right';
  score: number;
  landmarks: HandLandmark[];
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
}

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_PATH = '/models/hand_landmarker.task';

export class HandTracker {
  private readonly video: HTMLVideoElement;
  private readonly numHands: number;
  private readonly mirror: boolean;
  private readonly width: number;
  private readonly height: number;
  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;

  constructor(video: HTMLVideoElement, options: HandTrackerOptions = {}) {
    this.video = video;
    this.numHands = options.numHands ?? 2;
    this.mirror = options.mirror ?? true;
    this.width = options.width ?? 1280;
    this.height = options.height ?? 720;

    this.video.muted = true;
    this.video.playsInline = true;
    this.video.autoplay = true;
    this.video.style.position = 'absolute';
    this.video.style.visibility = 'hidden';
    this.video.style.pointerEvents = 'none';
    this.video.style.width = '0px';
    this.video.style.height = '0px';
  }

  async init(): Promise<void> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: this.width },
          height: { ideal: this.height }
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
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
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
    const hands: NormalizedHand[] = [];
    for (let i = 0; i < result.landmarks.length; i++) {
      const raw = result.landmarks[i];
      const handedness = result.handednesses[i]?.[0];
      const label: 'Left' | 'Right' = handedness?.categoryName === 'Right' ? 'Right' : 'Left';
      const score = handedness?.score ?? 0;

      const landmarks: HandLandmark[] = new Array(raw.length);
      for (let j = 0; j < raw.length; j++) {
        const lm = raw[j];
        landmarks[j] = {
          x: this.mirror ? 1 - lm.x : lm.x,
          y: lm.y,
          z: lm.z
        };
      }
      hands.push({ handedness: label, score, landmarks });
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
}
