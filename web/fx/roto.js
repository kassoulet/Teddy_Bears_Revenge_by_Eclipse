// fx/roto.js - rotozoom + wobbling typewriter text (rotozoom.asm). Used twice: opening and ending.
import { A, M, HP, Sinus, CoSinus, screenSwap, waitVbl, drawCaracOr } from '../core.js';
const S = {};
export function reset() {
  S.decY = 0; S.decX = 0; S.angle = 0; S.waitChange = 0x100; S.change = 1; S.wait = 0; S.end = 0; S.end2 = 0; S.valEnd = 0;
  S.line1 = new Int8Array([0, -1, -2, -3, -4, -5, -6, -7, -8, -9, -10, -11, -12, -13, -14]); S.line3 = 0; S.listText = 0;
  S.essai = new Uint8Array(15 * 19 + 1); for (let r = 0; r < 15; r++) { S.essai.fill(0x20, r * 19, r * 19 + 18); S.essai[r * 19 + 18] = 13; }
  S.ang1 = new Int32Array(A['angtext.bin'].buffer.slice(0)); S.ang2 = new Int32Array(A['angtext2.bin'].buffer.slice(0));
  S.pal = Uint8Array.from(A['teddy.bin'].subarray(0, 768));      // Test_End darkens this copy in place, for good
  S.tex = new Uint8Array(64 * 256);                              // Init_Rotozoom: 17 rows of 40 bytes at stride 256
  for (let r = 0; r < 17; r++) S.tex.set(A['teddy.bin'].subarray(768 + 40 * r, 768 + 40 * r + 40), r * 256);
}
const ORDER = [1, 2, 3, 4, 5, 5, 6, 6, 4];                       // List_Text
function changeCarac() {                                         // typewriter: reveal one more column on every row, every 3rd call
  if (++S.line3 !== 3) return; S.line3 = 0;
  const txt = A['texts.bin'], base = A.texts[ORDER[S.listText]];
  for (let b = 0, bp = 15; b < 15; b++, bp--) {
    const al = S.line1[b];
    if (al >= 0 && al < 19) { const o = al + (bp - 1) * 19; S.essai[o] = txt[base + o]; }
    S.line1[b]++;
  }
  if (S.line1[14] === 19) {
    for (let b = 0; b < 15; b++) S.line1[b] = -b;           // movsb Compt_Line2 -> Compt_Line1
    S.change = 0; S.listText = (S.listText + 1) % ORDER.length;
  }
}
function introText() {
  if (S.change) changeCarac();
  let row = HP + 320 * 20 + 20, x = 0;
  for (let i = 0; S.essai[i] !== 0 && i < S.essai.length; i++) {
    const c = S.essai[i];
    if (c === 13) { row += 10 * 320; x = 0; continue; }
    let dst = row + 16 * x;
    dst += Sinus[S.ang1[x]++ & 0x7FF] >> 7;
    dst += (Sinus[S.ang2[x] & 0x7FF] >> 7) * 320; S.ang2[x] += 2;
    drawCaracOr(c, dst); x++;
  }
}
function doRoto() {
  const R = 0x66 + 60, m = M.mem, tex = S.tex;
  let b = S.angle & 0x7FF;
  const v1x = Math.imul(CoSinus[b], R) >> 10, v1y = Math.imul(Sinus[b], R) >> 10;
  b = (b + 511) & 0x7FF;
  const v2x = Math.imul(CoSinus[b], R) >> 10, v2y = Math.imul(Sinus[b], R) >> 10;
  let edx = Math.imul(v1x + v2x, -80), ecx = Math.imul(v1y + v2y, -50), edi = HP;
  for (let row = 99; row >= 0; row--) {
    let dx = edx, cx = ecx;
    cx = (cx & ~0xFF00) | ((((cx >> 8) - S.decY) & 0xFF) << 8);
    dx = (dx & ~0xFF00) | ((((dx >> 8) - S.decX) & 0xFF) << 8);
    let bl = (dx >> 8) & 0xFF, bh = (cx >> 8) & 0xFF;
    for (let i = 0; i < 160; i++) {
      dx = (dx + v1x) | 0; cx = (cx + v1y) | 0;
      const al = tex[((bh & 0x1F) << 8) | (bl & 0x3F)];
      bl = (dx >> 8) & 0xFF; bh = (cx >> 8) & 0xFF;
      m[edi] = al; m[edi + 1] = al; m[edi + 320] = al; m[edi + 321] = al; m[edi + 322] = al; m[edi + 323] = al; edi += 2;
    }
    edx = (edx + v1y) | 0; ecx = (ecx - v1x) | 0; edi += 320;
  }
}
// Test_End: during the final rotozoom, fade the palette every other frame from order 0x1F on
function testEnd() {
  if (!S.end) return;
  S.end2 ^= 1; if (!S.end2) return;
  if (M.ax() < 0x1F00) return;
  for (let i = 0; i < 768; i++) if (S.pal[i] > 0) S.pal[i]--;
  S.valEnd++; M.setPal(S.pal);
  if (S.valEnd === 63 * 2) M.exit = true;
}
export function* roto(waitVal, isEnd) {
  S.wait = waitVal; S.end = isEnd ? 1 : 0;
  yield* waitVbl(); M.setPal(S.pal);
  M.updateTimer = () => {
    S.decY = (S.decY - 1) & 0xFF; S.angle += 2;
    const ax = M.ax();
    if (ax >= S.wait) M.exit = true;
    if (ax >= S.waitChange) { S.change = 1; S.waitChange += 0x100; }
  };
  do { screenSwap(); doRoto(); introText(); yield* waitVbl(); testEnd(); } while (!M.exit);
  M.exit = false; M.updateTimer = null;
}
