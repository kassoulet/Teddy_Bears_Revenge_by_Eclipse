// Pure helpers (no DOM): effect timetable, frame <-> music time, 4:3 display sizing. Tested by tools/uitest.mjs.
// The demo is a state machine stepped once per 70 Hz vsync. Frame 50 is when the module starts (Play_Module), so music time t = (frame-50)/70.
export const HZ = 70, KPLAY = 50, FRAMES = 7418, END = (FRAMES - 1 - KPLAY) / HZ;
// first captured frame of each effect, measured from the generator itself (M.fx in demo.js; see tools/difftest.mjs)
const START = [50, 1068, 1503, 2394, 3720, 3941, 4825, 5047, 5929, 6150];
const NAMES = ['Rotozoom', 'Intro', '3D glenz bears', 'Lines + credits', 'Bitmap 1', '3D phong bears', 'Bitmap 2', 'Tunnel', 'Bitmap 3', 'Rotozoom end'];
export const tOf = f => (f - KPLAY) / HZ;
export const frameOf = t => KPLAY + Math.floor(t * HZ + 1e-6);
export const FX = START.map((f, i) => ({ i, name: NAMES[i], f0: f, t0: tOf(f) }));
export const fxAt = t => { let k = 0; for (const e of FX) if (t >= e.t0) k = e.i; return k; };
export const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
// Display size in CSS px for the 320x200 source shown at 4:3: integer multiple of 320 device px when >=1, else fit.
export function displaySize(availW, availH, dpr = 1) {
  const fitW = Math.min(availW, availH * 4 / 3) * dpr, k = Math.floor(fitW / 320);
  const w = (k >= 1 ? 320 * k : fitW) / dpr;
  return { w, h: w * 3 / 4 };
}
