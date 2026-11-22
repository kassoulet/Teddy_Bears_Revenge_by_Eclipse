// engine.js - runs the ported demo generator (demo.js) one vsync at a time; seeking backwards restarts it (the whole demo replays in ~2 s).
import { A, M, loadAssets } from './core.js';
import { demo } from './demo.js';
export { loadAssets, A, M };
export class Runner {
  constructor() { this.restart(); }
  restart() { this.g = demo(); this.frame = -1; this.done = false; }       // frame = index of the last captured frame
  step() { if (this.done) return false; if (this.g.next().done) { this.done = true; return false; } this.frame++; return true; }
  stepTo(f, max = Infinity) { if (f < this.frame) this.restart(); let n = 0; while (this.frame < f && n < max && this.step()) n++; return this.frame >= f || this.done; }
  rgba(px) {                                            // 320x200 indexed + 6-bit palette -> 0xAABBGGRR words
    const v = M.vram, p = M.pal, lut = new Uint32Array(256);
    for (let i = 0; i < 256; i++) { const r = p[i * 3], g = p[i * 3 + 1], b = p[i * 3 + 2]; lut[i] = 0xff000000 | (b << 2 | b >> 4) << 16 | (g << 2 | g >> 4) << 8 | (r << 2 | r >> 4); }
    for (let k = 0; k < 64000; k++) px[k] = lut[v[k]];
  }
}
