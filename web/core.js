// core.js - the shared machine of the demo: pages, palette, sine tables, music clock, vsync (teddy.asm)
import { ROWS } from './timeline.js';
export const A = {};                                   // loaded assets (Uint8Array by name)
const FILES = ['BIGBEAR.PAL','BIGBEAR.RAW','MAP3.PAL','MAP3.RAW','TBR-FONT.PAL','TBR-FONT.RAW','TBR-LOGO.PAL','TBR-LOGO.RAW',
  'TBR-TEXT.PAL','TBR-TEXT.RAW','teddy.bin','angtext.bin','angtext2.bin','snow.bin','texts.bin','mesh.bin','phong.pal','line.pal','tunnel.pal'];
export async function loadAssets(progress) {
  let n = 0;
  await Promise.all(FILES.map(async f => { A[f] = new Uint8Array(await (await fetch('assets/' + f)).arrayBuffer()); progress?.(++n, FILES.length); }));
  A.texts = await (await fetch('assets/texts.json')).json(); A.mesh = await (await fetch('assets/mesh.json')).json();
}
export const rne = x => { const r = Math.round(x); return (Math.abs(x % 1) === 0.5 && r % 2) ? r - 1 : r; };   // fistp: round to nearest even
// Init_Sinus: Sinus has 3072 entries (CoSinus = Sinus+512), Sinus2 amplitude 64
export const Sinus = new Int32Array(3072), Sinus2 = new Int32Array(2048);
for (let i = 0; i < 3072; i++) Sinus[i] = rne(1024 * Math.sin(Math.PI * (2 * i) / 2048));
for (let i = 0; i < 2048; i++) Sinus2[i] = rne(64 * Math.sin(Math.PI * (2 * i) / 2048));
Sinus.set(Sinus2.subarray(0, 512), 2560);               // Sinus2 sits right after CoSinus and overlays the table's tail
export const CoSinus = Sinus.subarray(512);

// the machine: hidden page (with 200 lines of margin above, as in the asm), VGA page, 6-bit palette
export const HP = 320 * 200;                            // offset of the hidden page inside mem
export const M = {
  mem: new Uint8Array(320 * 240 + 320 * 400), vram: new Uint8Array(64000), pal: new Uint8Array(768),
  vbl: 0, kplay: null, updateTimer: null, setSport: 0, listSport: 0, amplitude: 20, exit: false,
  info() {                                              // Get_Info: [order, pattern, row] from the libopenmpt timeline
    if (M.kplay === null) return [0, 0, 0];
    const t = (M.vbl - M.kplay) / 70; let lo = 0, hi = ROWS.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ROWS[m][3] <= t) lo = m; else hi = m - 1; }
    return ROWS[lo];
  },
  ax() { const i = M.info(); return (i[0] << 8) | i[1]; },  // ah=order al=pattern
  setPal(src, off = 0) { for (let i = 0; i < 768; i++) M.pal[i] = src[off + i] & 63; },
  reset() { M.mem.fill(0); M.vram.fill(0); M.pal.fill(0); M.vbl = 0; M.kplay = null; M.updateTimer = null; M.setSport = 0; M.listSport = 0; M.amplitude = 20; M.exit = false; },
};
// Screen_Swap: clear the 30 margin lines, copy the hidden page to VRAM (with the "sport" vertical shake)
export function screenSwap() {
  const mem = M.mem; mem.fill(0, HP - 320 * 30, HP); mem.fill(0, HP + 64000, HP + 64000 + 320 * 30);
  let off = 0;
  if (M.setSport === 1) off = ((Math.imul(M.amplitude, Sinus[M.listSport & 0x7FF]) >> 9) << 6) * 5;
  M.vram.set(mem.subarray(HP + off, HP + off + 64000));
}
// Wait_Vbl_Teddy: the capture point (yield), then the per-vsync timer and the shake counters
export function* waitVbl() {
  yield;
  M.vbl++;
  M.updateTimer?.();
  if (M.setSport === 1) {
    if (M.listSport > 0x7FF) { M.amplitude -= 5; M.listSport &= 0x7FF; }
    M.listSport += 64 * 2 + 64 * 2 + 64;
    if (M.amplitude <= 0) M.setSport = 0;
  }
}
// font blitter (Display_Carac_Or): 12x9 cell of TBR-FONT or-ed into the hidden page
const CARAC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ.!?/\\+-=0123456789\x10\x11',@: ";
export function drawCaracOr(ch, dst) {                  // dst = offset in M.mem
  if (ch === 0x20) return;
  const k = CARAC.indexOf(String.fromCharCode(ch)); const f = A['TBR-FONT.RAW'];
  let s = (1 + 11 * Math.floor(k / 17)) * 320 + 1 + 11 * (k % 17);
  for (let y = 0; y < 9; y++, s += 320, dst += 320) for (let x = 0; x < 12; x++) M.mem[dst + x] |= f[s + x];
}
// palette flash (Init_Flash / Do_Flash)
export const Flash = {
  pal: new Uint8Array(768), count: 0,
  init() { this.pal.fill(0x3F); this.count = 8; },
  do(target) {                                          // Set_Palette(flash) then step it toward the target by 8
    M.setPal(this.pal);
    for (let i = 0; i < 768; i++) { let a = this.pal[i]; const b = target[i]; if (a > b) a -= 8; if (a < b) a = b; this.pal[i] = a; }
  },
};
