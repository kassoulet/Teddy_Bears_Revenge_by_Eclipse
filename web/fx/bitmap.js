// fx/bitmap.js - Prg_BitMap: the plasma-like "bitmap" tunnel (bitmap.asm). A 160x100 polar table (distance, angle) indexes a 256x256
// texture, displaced each frame by a 256-entry wobble table (Make_Table_), then every cell is drawn doubled to 320x200.
import { A, M, HP, Sinus, CoSinus, rne, screenSwap, waitVbl, Flash } from '../core.js';

export const B = { val00: 1, val01: 2, wait: 0 };
const S = {};
export function reset() {
  // Init_Cir: word = (round(sqrt(x^2 + y^2/0.8)) << 8) | (round(atan2(y,x)*128/pi) & 255)
  const F = Math.fround(0.8); S.cir = new Uint16Array(160 * 100);
  for (let y = -50, i = 0; y < 50; y++) for (let x = -80; x < 80; x++, i++) {
    const d = rne(Math.sqrt(x * x + y * y / F)), a = rne(Math.atan2(y, x) * 128 / Math.PI);
    S.cir[i] = (((d << 8) & 0xFFFF) | (a & 255));
  }
  // Init_BitMap: the 64x64 MAP3 tile repeated 4x4 into a 256x256 texture
  S.tex = new Uint8Array(65536); const raw = A['MAP3.RAW'];
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) S.tex[(y << 8) | x] = raw[(y & 63) * 64 + (x & 63)];
  S.angle1 = 100; S.angle2 = 56320; S.pof1 = 1000; S.pof2 = 20; S.doFlash = 0; S.table = new Uint16Array(256);
  B.val00 = 1; B.val01 = 2;
}
function makeTable() {                                                        // Make_Table_ (Amplitudes are patched into the imul immediates; shr is logical)
  const ampX = Sinus[S.pof1] >>> 6, ampY = Sinus[S.pof2] >>> 6;
  for (let i = 0, d = S.angle1, e = S.angle2; i < 256; i++, d += B.val00, e += B.val01) {
    const a = Math.imul(Sinus[d & 0x7FF], ampX), b = Math.imul(CoSinus[e & 0x7FF], ampY);
    const sum = (a + b) | 0;
    S.table[i] = (((b >>> 8) & 0xFF) << 8) | ((sum >>> 8) & 0xFF);
  }
}
function draw() {
  makeTable();
  const m = M.mem, t = S.tex, T = S.table, c = S.cir;
  for (let y = 0, k = 0, o = HP; y < 100; y++, o += 320) for (let x = 0; x < 160; x++, k++, o += 2) {
    const w = c[k], p = t[(w + T[w >> 8]) & 0xFFFF];
    m[o] = p; m[o + 1] = p; m[o + 320] = p; m[o + 321] = p;
  }
}
const FLASH_ROWS = [48, 50, 54, 56, 58, 60, 62];
function timer() {
  S.angle1 += 11; S.angle2 += 20; S.pof1 = (S.pof1 + 16) & 0x7FF; S.pof2 = (S.pof2 + 21) & 0x7FF;
  if (M.ax() >= B.wait) M.exit = true;
  if (FLASH_ROWS.includes(M.info()[2])) S.doFlash = 1;
}
export function* prgBitmap(wait, v0, v1) {
  B.wait = wait; B.val00 = v0; B.val01 = v1;
  Flash.init(); M.setPal(A['MAP3.PAL']); yield* waitVbl();
  M.updateTimer = timer;
  do {
    screenSwap(); draw(); yield* waitVbl();
    if (S.doFlash) { Flash.do(A['MAP3.PAL']); if (--Flash.count === 0) { S.doFlash = 0; Flash.init(); } }
  } while (!M.exit);
  M.exit = false; M.updateTimer = null;
}
