import { HandTracker } from './input/HandTracker.ts';
import type { HandFrame } from './input/HandTracker.ts';
import {
  CAMERA_FPS,
  CAMERA_HEIGHT,
  CAMERA_WIDTH,
  MAX_HANDS,
  MIRROR_CAMERA
} from './config/gameConfig.ts';

const FINGER_CHAINS: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [0, 9, 10, 11, 12],
  [0, 13, 14, 15, 16],
  [0, 17, 18, 19, 20]
];

const FINGER_COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c780fa'];

document.body.style.margin = '0';
document.body.style.background = '#fff3e0';
document.body.style.overflow = 'hidden';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) app.innerHTML = '';

const video = document.createElement('video');
document.body.appendChild(video);

const canvas = document.createElement('canvas');
canvas.style.position = 'fixed';
canvas.style.inset = '0';
canvas.style.width = '100vw';
canvas.style.height = '100vh';
canvas.style.display = 'block';
document.body.appendChild(canvas);

const ctx = canvas.getContext('2d')!;

function resizeCanvas(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const tracker = new HandTracker(video, {
  numHands: MAX_HANDS,
  mirror: MIRROR_CAMERA,
  width: CAMERA_WIDTH,
  height: CAMERA_HEIGHT,
  frameRate: CAMERA_FPS
});

let smoothedFps = 0;
let lastTime = performance.now();

function drawFrame(frame: HandFrame): void {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  let predictedCount = 0;
  let maxGap = 0;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const hand of frame.hands) {
    if (hand.predicted) {
      predictedCount++;
      if (hand.gapFrames > maxGap) maxGap = hand.gapFrames;
      ctx.setLineDash([8, 5]);
      ctx.globalAlpha = 0.5;
    } else {
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    for (let f = 0; f < FINGER_CHAINS.length; f++) {
      const chain = FINGER_CHAINS[f];
      ctx.strokeStyle = FINGER_COLORS[f];
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let k = 0; k < chain.length; k++) {
        const lm = hand.landmarks[chain[k]];
        const x = lm.x * w;
        const y = lm.y * h;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.fillStyle = hand.predicted ? '#ffd6d6' : '#ffffff';
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.5;
    for (const lm of hand.landmarks) {
      const x = lm.x * w;
      const y = lm.y * h;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    const wrist = hand.landmarks[0];
    ctx.globalAlpha = 1;
    ctx.fillStyle = hand.predicted ? '#ff4d4d' : '#222';
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText(`#${hand.id}${hand.predicted ? ` pred(${hand.gapFrames})` : ''}`, wrist.x * w + 8, wrist.y * h - 8);
  }

  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(12, 12, 220, 76);
  ctx.fillStyle = '#fff';
  ctx.font = '14px ui-monospace, monospace';
  ctx.fillText(`FPS:   ${smoothedFps.toFixed(1)}`, 24, 36);
  ctx.fillText(`Hands: ${frame.hands.length}`, 24, 56);
  ctx.fillText(`Pred:  ${predictedCount} (gap=${maxGap})`, 24, 76);
}

function loop(): void {
  const now = performance.now();
  const dt = now - lastTime;
  lastTime = now;
  if (dt > 0) {
    const instantFps = 1000 / dt;
    smoothedFps = smoothedFps === 0 ? instantFps : smoothedFps * 0.9 + instantFps * 0.1;
  }

  try {
    const frame = tracker.detect(now);
    drawFrame(frame);
  } catch (err) {
    console.error('detect failed:', err);
  }

  requestAnimationFrame(loop);
}

tracker
  .init()
  .then(() => {
    requestAnimationFrame(loop);
  })
  .catch((err) => {
    console.error(err);
    document.body.innerHTML = `<pre style="color:#b00;padding:24px;font-family:monospace;">${(err as Error).message}</pre>`;
  });
