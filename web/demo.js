// demo.js - the whole demo as one generator that mirrors teddy.asm `Start32` / `Demo`: every `yield` is one Wait_Vbl capture
import { A, M, waitVbl } from './core.js';
import * as roto from './fx/roto.js';
import * as intro from './fx/intro.js';
import * as threed from './fx/threed.js';
import * as line from './fx/line.js';
import * as bitmap from './fx/bitmap.js';
import * as tunnel from './fx/tunnel.js';
export const FX = [roto, intro, threed, line, bitmap, tunnel];
export function* demo() {
  M.reset(); for (const f of FX) f.reset?.();
  M.vram.fill(0);                                   // Init_320x200: BIOS mode set clears VRAM
  for (let i = 0; i < 50; i++) yield* waitVbl();
  M.kplay = M.vbl;                                  // Play_Module
  M.fx = 0; yield* roto.roto(0x400, false);
  M.fx = 1; yield* intro.intro();
  M.fx = 2; yield* threed.prg3d();
  M.fx = 3; yield* line.prgLine();
  M.fx = 4; yield* bitmap.prgBitmap(0x1100, 3, 2);
  M.fx = 5; yield* threed.prg3d2();
  M.fx = 6; yield* bitmap.prgBitmap(0x1600, 5, 1);
  yield* waitVbl();
  M.fx = 7; yield* tunnel.prgTunnel();
  M.fx = 8; yield* bitmap.prgBitmap(0x1B00, 2, 6);
  M.fx = 9; yield* roto.roto(0x2100, true);
}

export const NAMES = ['Rotozoom', 'Intro', '3D glenz bears', 'Lines + credits', 'Bitmap 1', '3D phong bears', 'Bitmap 2', 'Tunnel', 'Bitmap 3', 'Rotozoom end'];
