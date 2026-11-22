// fx/tunnel.js - Prg_Tunnel: the wobbling texture tunnel (tunnel.asm). A 320x200 polar map (distance, angle) is looked up twice in a
// 256x128 texture (two 64x64 tiles) with a sine wobble, the two samples are added; the centre hole is painted by Erase_Trou.
import { A, M, HP, Sinus2, screenSwap, waitVbl } from '../core.js';
import { rne } from '../core.js';

const S = {};
export function reset() {
  const src = A['TBR-TEXT.RAW'];                                              // 128x64: Init_Tunnel tiles block A (left 64 cols) and B (right 64 cols) 2x2 into 256x128
  S.pic = new Uint8Array(256 * 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) S.pic[y * 256 + x] = src[(y & 63) * 128 + (x & 63) + (x >= 128 ? 64 : 0)];
  // Init_Tube: word = (round(4800/sqrt(x^2+y^2/0.8)) << 8) | angle; the unreachable centre (dist > 300) goes to the hole list
  const F = Math.fround(0.8); S.map = new Uint16Array(320 * 200); S.holes = new Int32Array(5121); let n = 0;
  for (let y = -100, i = 0; y < 100; y++) for (let x = -160; x < 160; x++, i++) {
    const q = 4800 / Math.sqrt(x * x + y * y / F), d = Number.isFinite(q) ? rne(q) : -2147483648;
    if (d > 300) { S.holes[n++] = (y + 100) * 320 + x + 160; continue; }
    S.map[i] = ((d << 8) & 0xFFFF) | (rne(Math.atan2(y, x) * 128 / Math.PI) & 255);
  }
  S.holes[n - 1] = 100 * 320 + 160;                                           // sic: the last entry is overwritten with the centre pixel
  S.nHoles = n; S.compt = 0; S.compt2 = 0; S.sin = 0x12345678;
}
function tube() {
  const pic = S.pic, map = S.map, m = M.mem, d11 = S.compt & 0x3F3F, d1 = (S.compt2 & 0x3F3F) + 128;
  for (let k = 0, o = HP; k < 32000; k++, o += 2) {
    let v = map[2 * k + 1], e = (((v >>> 6) + S.sin) & 0x7FF);
    let c = (v + Sinus2[e]) & 0x3F3F; v &= 0x3F3F;
    const hi = (pic[v + d1] + pic[c + d11]) & 255;
    v = map[2 * k]; e = (((v >>> 6) + S.sin) & 0x7FF);
    c = (v + Sinus2[e]) & 0x3F3F; v &= 0x3F3F;
    m[o] = (pic[v + d1] + pic[c + d11]) & 255; m[o + 1] = hi;
  }
  S.sin = (S.sin + 14) | 0;
}
function eraseTrou() { for (let b = S.nHoles; b !== 0; b--) M.mem[HP + S.holes[b]] = 144; }   // starts one past the list (a zero entry) and skips entry 0, as the asm does
export function* prgTunnel() {
  M.setPal(A['tunnel.pal']);
  M.updateTimer = () => { S.compt = (S.compt - 256) & 0xFFFF; S.compt2 = (S.compt2 + 512) & 0xFFFF; };
  do { screenSwap(); M.mem.fill(0, HP - 960, HP - 960 + 326 * 200); tube(); eraseTrou(); yield* waitVbl(); } while (M.ax() < 0x1A00);
  M.updateTimer = null;
}
