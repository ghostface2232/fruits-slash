import { HandTracker } from './input/HandTracker.ts';
import type { HandFrame } from './input/HandTracker.ts';
import {
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
  height: CAMERA_HEIGHT
});

let smoothedFps = 0;
let lastTime = performance.now();

function drawFrame(frame: HandFrame): void {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  for (const hand of frame.hands) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
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

    ctx.fillStyle = '#ffffff';
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
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(12, 12, 180, 56);
  ctx.fillStyle = '#fff';
  ctx.font = '14px ui-monospace, monospace';
  ctx.fillText(`FPS:   ${smoothedFps.toFixed(1)}`, 24, 36);
  ctx.fillText(`Hands: ${frame.hands.length}`, 24, 56);
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
