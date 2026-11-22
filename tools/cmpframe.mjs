// cmpframe.mjs N out.ppm : JS frame N | golden frame N | diff mask, as a PPM (3 x 320 wide)
import fs from 'node:fs'; import zlib from 'node:zlib';
const R = new URL('../', import.meta.url).pathname;
const { A, M } = await import(R + 'web/core.js');
for (const f of fs.readdirSync(R + 'web/assets')) if (!f.endsWith('.json')) A[f] = new Uint8Array(fs.readFileSync(R + 'web/assets/' + f));
A.texts = JSON.parse(fs.readFileSync(R + 'web/assets/texts.json')); A.mesh = JSON.parse(fs.readFileSync(R + 'web/assets/mesh.json'));
const { demo } = await import(R + 'web/demo.js'); const N = +process.argv[2];
const meta = JSON.parse(fs.readFileSync(R + 're/golden/meta.json')), blob = fs.readFileSync(R + 're/golden/frames.bin');
const g = demo(); for (let n = 0; n <= N; n++) g.next();
const [o, l, pi] = meta.frames[N]; const ref = zlib.inflateSync(blob.subarray(o, o + l)), pal = Buffer.from(meta.pals[pi], 'hex');
const out = Buffer.alloc(960 * 200 * 3); const c = (v, k) => { const p = pal[v * 3 + k]; return p << 2 | p >> 4; };
for (let y = 0; y < 200; y++) for (let x = 0; x < 320; x++) { const i = y * 320 + x;
  for (let k = 0; k < 3; k++) { out[(y * 960 + x) * 3 + k] = c(M.vram[i], k); out[(y * 960 + 320 + x) * 3 + k] = c(ref[i], k); out[(y * 960 + 640 + x) * 3 + k] = M.vram[i] === ref[i] ? 0 : 255; } }
fs.writeFileSync(process.argv[3], Buffer.concat([Buffer.from('P6 960 200 255\n'), out]));
