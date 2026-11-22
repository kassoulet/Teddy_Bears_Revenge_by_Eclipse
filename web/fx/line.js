// fx/line.js - Prg_Line: the spinning line tunnel + credits (line.asm). Lines are drawn by the original Bresenham/Cohen-Sutherland code, ported 1:1.
import { A, M, HP, Sinus, CoSinus, screenSwap, waitVbl, Flash, drawCaracOr } from '../core.js';
import { clearHiddenPageNeige } from './intro.js';

const NB = 32 * 4 + 30, SIZE_AMPLI = 20;
const CREDITS = [[0xC00, 0, 120 * 320 + 20, ''], [0xC00, 8, 120 * 320 + 20, 'CODE - '], [0xC00, 24, 120 * 320 + 20, 'CODE - LIGHT '], [0xC00, 40, 120 * 320 + 20, 'CODE - LIGHT SHOW'], [0xC00, 56, 120 * 320 + 20, ''],
  [0xD00, 8, 120 * 320 + 10, 'AWFULL '], [0xD00, 24, 120 * 320 + 10, 'AWFULL NOISE - '], [0xD00, 40, 120 * 320 + 10, 'AWFULL NOISE - REZ'], [0xD00, 56, 120 * 320 + 10, ''],
  [0xE00, 8, 120 * 320 + 30, 'ART - '], [0xE00, 24, 120 * 320 + 30, 'ART - ZANY'], [0xE00, 40, 120 * 320 + 30, 'ART - ZANY BIRD'], [0xE00, 56, 120 * 320 + 35, ''],
  [0xF00, 8, 120 * 320 + 35, 'FONT'], [0xF00, 24, 120 * 320 + 35, 'FONT 3DS - '], [0xF00, 40, 120 * 320 + 35, 'FONT 3DS - REZ'], [0xF00, 56, 120 * 320 + 35, ''], [0x1000, 63, 120 * 320 + 35, '']];
const S = {};
export function reset() {
  S.listZ = new Int32Array(NB); S.angZ = new Int32Array(NB); S.cx = new Int32Array(NB); S.cy = new Int32Array(NB);
  S.coor = new Int32Array(NB * 4); S.coor2 = new Int32Array(NB * 4);               // Addr_Coor / Addr_Coor2, zeroed
  S.cax = 128; S.cay = 0; S.angle = 0; S.poofAngle = 0; S.poofZ = 0; S.credit = 0; S.t2 = 0;
  let edi = 0, ecx = 0;                                                            // Init_Line
  for (let k = NB - 1; k > 0; k--) {
    S.listZ[k] = edi; S.angZ[k] = ecx;
    S.cx[k] = ((CoSinus[S.cax & 0x7FF] * 100) >> 10) + 160; S.cy[k] = ((Sinus[S.cay & 0x7FF] * 70) >> 10) + 100;
    S.cax += 2; S.cay += 1; ecx += 256;
    if ((ecx & 0x7FF) === 0) edi += 200;
    ecx &= 0x7FF;
  }
  S.lastZ = edi;
}
// ---- Line (Bresenham, plus the Cohen-Sutherland clipper with its call-new_coor5 swap-and-swap-back control flow) ----
const MINX = 0, MINY = 0, MAXX = 319, MAXY = 199;
const T = { x1: 0, y1: 0, x2: 0, y2: 0 };
const code = (x, y) => (x < MINX ? 1 : 0) | (x > MAXX ? 2 : 0) | (y < MINY ? 4 : 0) | (y > MAXY ? 8 : 0);
const swapT = () => { let t = T.x1; T.x1 = T.x2; T.x2 = t; t = T.y1; T.y1 = T.y2; T.y2 = t; };
const idiv = (a, b) => Math.trunc(a / b);
function clip(x1, y1, x2, y2) {                                                   // returns false when the line is rejected
  T.x1 = x1; T.y1 = y1; T.x2 = x2; T.y2 = y2;
  const esi = x2 - x1, edi = y2 - y1;
  for (;;) {
    const c1 = code(T.x1, T.y1), c2 = code(T.x2, T.y2);
    if ((c1 | c2) === 0) return true;
    if (c1 & c2) return false;
    if (c1 === 0) swapT();
    if (esi === 0) T.y1 = Math.min(Math.max(T.y1, MINY), MAXY);
    else if (edi === 0) T.x1 = Math.min(Math.max(T.x1, MINX), MAXX);
    else if (T.x1 < MINX) { T.y1 += idiv((MINX - T.x1) * edi, esi); T.x1 = MINX; }
    else if (MAXX < T.x1) { T.y1 += idiv((MAXX - T.x1) * edi, esi); T.x1 = MAXX; }
    else if (T.y1 < MINY) { T.x1 += idiv((MINY - T.y1) * esi, edi); T.y1 = MINY; }
    else if (MAXY < T.y1) { T.x1 += idiv((MAXY - T.y1) * esi, edi); T.y1 = MAXY; }
    if (c1 === 0) swapT();
  }
}
function line(x1, y1, x2, y2, col) {
  const m = M.mem;
  if (!(x1 > MINX && x1 < MAXX && y1 > MINY && y1 < MAXY && x2 > MINX && x2 < MAXX && y2 > MINY && y2 < MAXY)) {
    if (!clip(x1, y1, x2, y2)) return;
    x1 = T.x1; y1 = T.y1; x2 = T.x2; y2 = T.y2;
  }
  let dx = x2 - x1, step = 320, a = x1, b = y1, d = y2;
  if (dx === 0) { let h = y2 - y1, y = y1; if (h < 0) { h = -h; y = y2; } for (let o = HP + y * 320 + x1, n = h + 1; n > 0; n--, o += 320) m[o] |= col; return; }
  if (dx < 0) { dx = -dx; b = y2; d = y1; a = x2; }
  let dy = d - b;
  if (dy === 0) { for (let o = HP + b * 320 + a, n = dx + 1; n > 0; n--, o++) m[o] |= col; return; }
  if (dy < 0) { dy = -dy; step = -320; }
  let o = HP + b * 320 + a, n, v1, v2, s;
  if (dy <= dx) {                                                                 // loslope: x-major
    v1 = 2 * dy; s = v1 - dx; v2 = s - dx; n = dx + 1;
    for (; n > 0; n--) { m[o++] |= col; if (s < 0) s += v1; else { s += v2; o += step; } }
  } else {                                                                        // hislope: y-major
    v1 = 2 * dx; s = v1 - dy; v2 = s - dy; n = dy + 1;
    for (; n > 0; n--) { m[o] |= col; o += step + 1; if (s < 0) { s += v1; o--; } else s += v2; }
  }
}
function rotZ(x, y, k, e) {                                                       // Rotate_Z_And_Perspective
  const c = CoSinus[e], s = Sinus[e];
  const X = (x * c + y * s) >> 1, Y = (y * c - x * s) >> 1;
  return [idiv(X, S.listZ[k]) + S.cx[k], idiv(Y, S.listZ[k]) + S.cy[k]];
}
function drawLine() {
  for (let k = NB - 1; k > 0; k--) {
    const c = S.coor, c2 = S.coor2, j = 4 * k;
    line(c2[j], c2[j + 1], c2[j + 2], c2[j + 3], 2);
    line(c[j], c[j + 1], c[j + 2], c[j + 3], 1);
    for (let i = 0; i < 4; i++) c2[j + i] = c[j + i];
    S.angZ[k] += S.poofAngle; S.listZ[k] -= S.poofZ;
    if (S.listZ[k] < 100) {
      S.listZ[k] += S.lastZ; S.angZ[k] += S.angle; S.angle = (S.angle + 11 + 128) & 0x7FF;
      S.cx[k] = ((CoSinus[S.cax & 0x7FF] * 110) >> 10) + 160; S.cy[k] = ((Sinus[S.cay & 0x7FF] * 70) >> 10) + 100;
      S.cax += 2; S.cay += 1;
    }
    const e = S.angZ[k] & 0x7FF;
    const p1 = rotZ(100, -100, k, e), p2 = rotZ(100, 100, k, e);
    c[j] = p2[0]; c[j + 1] = p2[1]; c[j + 2] = p1[0]; c[j + 3] = p1[1];
    line(c[j], c[j + 1], c[j + 2], c[j + 3], 4);
  }
  S.poofAngle = 0; S.poofZ = 0;
}
function displayCredits() {
  const [, , off, txt] = CREDITS[S.credit];
  for (let i = 0, dst = HP + off; i < txt.length; i++, dst += 16) drawCaracOr(txt.charCodeAt(i), dst);
}
function timer() {                                                                // Compteur_Line
  const e = CREDITS[S.credit];
  if (e) { const [o, p, q] = M.info(); if (((o << 8) | p) >= e[0] && q >= e[1]) S.credit++; }
  S.poofAngle += 4; S.poofZ += 60;
  const [o, , q] = M.info(); if (o === 10 && q === 60) { M.setSport = 1; M.amplitude = SIZE_AMPLI; }
}
export function* prgLine() {
  Flash.init(); M.updateTimer = timer;
  for (let i = 0; i < 63; i++) { screenSwap(); clearHiddenPageNeige(); drawLine(); yield* waitVbl(); Flash.do(A['line.pal']); }
  Flash.init();
  do { screenSwap(); clearHiddenPageNeige(); drawLine(); displayCredits(); yield* waitVbl(); } while (M.ax() < 0x1000);
  M.updateTimer = null;
}
