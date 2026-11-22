// difftest.mjs: step the JS demo and compare every captured frame (VRAM + palette) with the oracle's golden frames.
// usage: node tools/difftest.mjs [from] [to] [golden_dir]
import fs from 'node:fs'; import zlib from 'node:zlib';
const R = new URL('../', import.meta.url).pathname;
const core = await import(R + 'web/core.js'); const { A, M } = core;
for (const f of fs.readdirSync(R + 'web/assets')) if (!f.endsWith('.json')) A[f] = new Uint8Array(fs.readFileSync(R + 'web/assets/' + f));
A.texts = JSON.parse(fs.readFileSync(R + 'web/assets/texts.json'));
A.mesh = JSON.parse(fs.readFileSync(R + 'web/assets/mesh.json'));
const { demo } = await import(R + 'web/demo.js');
const from = +(process.argv[2] ?? 0), to = +(process.argv[3] ?? 1e9), G = process.argv[4] ?? R + 're/golden';
const meta = JSON.parse(fs.readFileSync(G + '/meta.json')), blob = fs.readFileSync(G + '/frames.bin');
const g = demo(); let n = 0, tail = 0, bad = 0, firstBad = -1, worst = 0; const rep = [];
for (; ; n++) {
  const r = g.next(); if (r.done || n >= meta.frames.length || n > to) break;
  if (n < from) continue;
  const [o, l, pi] = meta.frames[n]; const ref = zlib.inflateSync(blob.subarray(o, o + l)); const pal = Buffer.from(meta.pals[pi], 'hex');
  let d = 0; for (let i = 0; i < 64000; i++) if (ref[i] !== M.vram[i]) d++;
  // palette indices >= 226 of Palette_Phong alias the asm's own 3D variables and heap pointers (the table is 680 bytes long but Set_Palette reads 768): undefined in the original, never visible; counted apart
  let dp = 0; for (let i = 0; i < 678; i++) if (pal[i] !== M.pal[i]) dp++;
  for (let i = 678; i < 768; i++) if (pal[i] !== M.pal[i]) { tail++; break; }
  if (d || dp) { bad++; if (firstBad < 0) firstBad = n; worst = Math.max(worst, d); if (rep.length < 12) rep.push(`frame ${n}: ${d} px, ${dp} pal bytes differ`); }
}
console.log(rep.join('\n')); console.log(`frames ${from}..${n - 1}: ${bad} differing, first ${firstBad}, worst ${worst} px (${tail} frames differ only in the unused palette tail 226..255)`);
