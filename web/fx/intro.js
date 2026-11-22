// fx/intro.js - BIGBEAR + TBR-LOGO zoom over the snow (intro.asm)
import { A, M, HP, screenSwap, waitVbl, Flash } from '../core.js';
const S = {};
export function reset() {
  S.f1 = 0x80; S.f2 = 0x80; S.wait = 5; S.snow = Uint8Array.from(A['snow.bin']); S.snow32 = new Uint32Array(S.snow.buffer); S.neige = 0; S.doFlash = 0;
  S.img1 = new Uint8Array(64000).fill(1);                               // Init_Intro: BIGBEAR 143x150 pasted on a field of 1s
  for (let y = 0; y < 150; y++) S.img1.set(A['BIGBEAR.RAW'].subarray(y * 143, y * 143 + 143), 88 + 22 * 320 + y * 320);
  S.img2 = A['TBR-LOGO.RAW'];
}
export const snow = () => S;
export function clearHiddenPageNeige() {                                // copy a snow page (326*200 bytes) onto the hidden page, 3 lines above it
  const o = S.neige * 64000; M.mem.set(S.snow.subarray(o, o + 326 * 200), HP - 960); S.neige = (S.neige + 1) & 3;
}
const Z1 = new Int32Array(320), Z2 = new Int32Array(320);
const TY = k => 160 + 320 * (k + 100);                                  // Tbl_Y: image row offset, centred on column 160
function zoom() {
  for (let i = 0, a = -160; i < 320; i++, a++) { Z1[i] = Math.imul(a, S.f1) >> 7; Z2[i] = Math.imul(a, S.f2) >> 7; }
  const m = M.mem, i1 = S.img1, i2 = S.img2;
  for (let r = 0, o = HP; r < 200; r++) {
    const b1 = TY(Z1[60 + r]), b2 = TY(Z2[60 + r]);
    for (let x = 0; x < 320; x++, o++) m[o] |= (i1[b1 + Z1[x]] + i2[b2 + Z2[x]]) & 255;
  }
}
function timer() {
  if (--S.wait === 0) {
    S.wait = 2; S.f1--; if (S.f1 <= 0) M.exit = true;
    S.f2 -= 2; if (S.f2 <= 0) S.f2 = 0;
  }
  if (M.info()[2] === 1) S.doFlash = 1;
}
function testFlash() {
  if (!S.doFlash) return;
  Flash.do(A['BIGBEAR.PAL']);
  if (--Flash.count === 0) { S.doFlash = 0; Flash.init(); }
}
export function* intro() {
  M.setPal(A['BIGBEAR.PAL']); Flash.init(); S.f1 = 0x80 - 20; S.f2 = 0; M.updateTimer = timer;
  for (let phase = 0; phase < 2; phase++) {
    do { screenSwap(); clearHiddenPageNeige(); zoom(); yield* waitVbl(); testFlash(); } while (!M.exit);
    M.exit = false; S.f1 = 0x80 - 20; S.f2 = 0x80 - 20;
  }
  M.updateTimer = null;
  for (let i = 0; i < S.snow32.length; i++) S.snow32[i] = ((S.snow32[i] >>> 1) + 0x10101010) >>> 0;   // darken the snow for the 3D parts
}
