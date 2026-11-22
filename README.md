# Teddybear's Revenge - JavaScript rework

A browser port of **Teddybear's Revenge** (Eclipse, Saturne Party 1996; PC 320x200 VGA demo). Music and font by Rez, graphics by Zany Bird.
The 30th-anniversary source release is by Light Show. This port was made by reading that assembly effect by effect and rewriting each algorithm in JavaScript. The executable was not reverse-engineered.

Open `web/index.html` through any static web server, for example `cd web && python3 -m http.server`. Click or press Space to start. Sound is on.

- 320x200 indexed picture shown at 4:3. The video mode is mode 13h (320x200 on a 4:3 monitor), so the pixels are not square.
- The music (`TEDDY.MOD`) plays through libopenmpt (`web/vendor/chiptune3`). Frames are driven by the audio clock.
- Pause, seek bar, -/+ 10 s, previous/next effect, effect buttons, fullscreen.
- Everything (assets and module) is preloaded before Play is enabled ("Loading n/N...").
- Optional CRT filter (Tab or the CRT button; WebGL, `web/crt.frag`). The default is the original look, without any filter.

Keys: Space play/pause, Left/Right seek 5 s (Shift 10 s), Up/Down previous/next effect, F fullscreen, Tab CRT, M mute.

## How it is built

`web/demo.js` is one JavaScript generator that mirrors `teddy.asm`. Every `yield` is one `Wait_Vbl` of the original. The demo is a deterministic state machine advanced once per vsync (70 Hz); the order/row of the module comes from a libopenmpt timeline (`web/timeline.js`, `tools/mk_timeline.py`), as the original reads it from the player.
Seeking backwards restarts the generator and replays it (the whole demo takes about 2 s of CPU), time-sliced so the page stays responsive.

| Effect | Frames | Source | JS |
|---|---|---|---|
| Rotozoom with typewriter text | 50-1067 | rotozoom.asm | web/fx/roto.js |
| Intro (big bear + logo zoom over snow) | 1068-1502 | intro.asm | web/fx/intro.js |
| 3D glenz bears (shadow, clones) | 1503-2393 | object3d.asm, 3dkernel.asm, fillglen.asm | web/fx/threed.js, web/fx/engine3d.js |
| Lines + credits | 2394-3719 | line.asm | web/fx/line.js |
| Bitmap (polar warp), first pass | 3720-3940 | bitmap.asm | web/fx/bitmap.js |
| 3D phong bears | 3941-4824 | object3d.asm, fillmap.asm | web/fx/threed.js |
| Bitmap, second pass | 4825-5046 | bitmap.asm | web/fx/bitmap.js |
| Tunnel | 5047-5928 | tunnel.asm | web/fx/tunnel.js |
| Bitmap, third pass | 5929-6149 | bitmap.asm | web/fx/bitmap.js |
| Rotozoom, ending with a palette fade | 6150-7417 | rotozoom.asm | web/fx/roto.js |

## Verification: the oracle

The reference is not the exe but the original assembly itself, run frame by frame:

1. `re/build.sh` assembles the upstream `teddy`, `fillflat`, `fillglen`, `fillmap` NASM sources untouched, plus `re/stubs.asm`, into a flat 32-bit image.
2. `re/oracle.py` runs that image in Unicorn. The WinEOS services are Python stubs, with a virtual 70 Hz vsync clock and the MOD position from the libopenmpt timeline. It captures one golden frame (VRAM, palette, order/row) per `Wait_Vbl`: 7418 frames, about 127 s of emulation. They are stored zlib-compressed in `re/golden/` (not committed, about 137 MB; regenerate with `python3 re/oracle.py`).
3. `node tools/difftest.mjs [from] [to]` steps the JS generator and compares each frame (all 64000 VRAM bytes and the palette) with the golden one. `node tools/cmpframe.mjs N out.ppm` writes a JS | golden | diff picture for one frame.

Unicorn quirks handled in the oracle: `fyl2x` with a zero operand does not pop the x87 stack (x=1 is fed instead), `fsin` uses the host double sine, and a BIOS mode set clears VRAM.

## Bit-exact versus approximated

**Result: all 7418 captured frames are identical to the original code's output (every VRAM byte and the 6-bit palette).** That covers every effect:
rotozoom, intro, both 3D parts (including the Rotate_Normal/Rotate_Phong integer arithmetic, quicksort order, glenz and phong fillers, and the glenz clipping quirk), lines and credits, the three bitmap passes and the tunnel.

What is **not** exact, honestly:

- **Snow noise (intro and 3D backgrounds).** `Create_Neige` seeds its generator from code bytes and a heap address, so its output cannot be rederived outside the original program. `web/assets/snow.bin` is a sample of the 4 snow pages taken from the oracle run. The pixels shown are identical, but they are replayed data, not computed.
- **Unused palette tail.** `Palette_Phong` (and `Palette_Tunnel`) in the source are shorter than 768 bytes, yet `Set_Palette` reads 768. The last entries (index 226 and up) read adjacent assembler variables and heap pointers. This is undefined in the original, no pixel uses those colours, and it cannot be reproduced; `difftest` ignores palette bytes from 678 on and reports the frame count that differs only there (884 frames).
- **Timing.** The original polls the VGA retrace and a timer; the port runs a 70 Hz virtual clock locked to the libopenmpt audio position. Browser audio latency and `requestAnimationFrame` (which is not 70 Hz) make the exact on-screen frame within about one display frame of the ideal. Frames themselves are never skipped by design in the diff, but live playback may show frame n+1 or n+2 together, as any vsync-less browser would.
- **Music** is rendered by libopenmpt, not by the original sound routine, so it can sound slightly different from the original player. The module itself is unchanged.
- **End of the demo.** The original fades the picture to black; the audio ends abruptly. The port fades the sound with a short gain ramp (about 1.8 s) matching the picture.
- **CRT filter** is an optional addition (not in the original).
- Assets and sample data (`web/assets`) come from the release's data directory; the data tables that the asm only has as assembled `.data` blobs (3D meshes, palettes, wobble tables, scroller texts) are exported from the oracle's memory image by `tools/export_assets.py`. They are data, not code.

## Layout

```
web/       the browser port (index.html, player.js, engine.js, demo.js, core.js, fx/, vendor/, assets/, writeups/)
re/        the oracle: build.sh, oracle.py, stubs.asm, timeline.json (golden/ is generated and not committed)
tools/     difftest.mjs, cmpframe.mjs, uitest.mjs, export_assets.py, mk_timeline.py, frame2png.py
sources/   the upstream source release (its own git repo, ignored here; never modified)
```

Rebuild the golden frames: `nasm`, `ld`, Python with `unicorn`, then `re/build.sh && python3 re/oracle.py`.
Refresh assets from the oracle: `DUMPF=5 python3 re/oracle.py 6 /some/scratch/dir`, copy `mem_5.bin` to `re/golden/`, then `python3 tools/export_assets.py`.

## Tests

- `node tools/difftest.mjs` : frame-by-frame diff against the golden frames (0 differing).
- `node tools/uitest.mjs` : headless Chrome UI test (play gating, play/pause, seek by slider/API/buttons/keys, every effect renders, backward seek determinism, CRT toggle, no page exceptions).

## Credits

Original demo: Eclipse (code, Saturne Party 1996), music and font Rez, graphics Zany Bird, source release 2026 by Light Show. All rights on the original demo, its data and its music belong to their authors. Player library: libopenmpt via chiptune3 (see `web/vendor/LICENSE`).
