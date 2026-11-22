// fx/engine3d.js - the 3D kernel: relocatable object blobs, self-modifying rotation matrix, Phong env-map and glenz triangle fills
// (3dkernel.asm, fillmap.asm, fillglen.asm). Integer semantics are kept bit-for-bit (imul/sar/shl, packed Y|X<<16 points, 16.16 edges).
import { A, M, HP, Sinus, CoSinus, rne } from '../core.js';

const s16 = v => (v << 16) >> 16, u16 = v => v & 0xFFFF;
const idiv = (a, b) => Math.trunc(a / b) | 0;                         // x86 idiv (truncating)
const MIN_Y = 200, MAX_Y = 399, MAX_X = 319;
const rowAddr = y => HP + 320 * (y - 200);                             // Table_Y: hidden page minus 200 lines, 320 bytes per line
export const G = { listObject: [], nbFaces: 0, listZ: new Int32Array(2048), listFaces: [], visi: 'jge', env: null,
  angX: 0, angY: 0, angZ: 0, cx: 0, cy: 0, dist: 0, mat: null, quick: true };

// ---------- objects (object3d.asm blobs) ----------
export class Obj {
  constructor(kind) {
    const mesh = A['mesh.bin'], J = A.mesh, off = kind === 1 ? 0 : J.size1, size = kind === 1 ? J.size1 : J.size2;
    this.buf = new Uint8Array(mesh.subarray(off, off + size)).buffer; const dv = new DataView(this.buf), r = o => dv.getUint32(o, true);
    this.ax = 0; this.ay = 0; this.az = 0;
    this.cax = 4 * 3; this.cay = 5 * 3; this.caz = -6 * 3;           // Load_Object
    this.centreX = 159; this.centreY = 299; this.distance = 12000;
    this.n = r(24); this.px = 0; this.py = 0; this.pz = 0;
    this.rotate = r(44) === J.RotatePhong ? 'phong' : 'normal';
    this.S = new Int32Array(this.buf, r(48), 3 * this.n); this.D = new Int32Array(this.buf, r(52), 3 * this.n);
    this.SP = new Int32Array(this.buf, r(56), 3 * this.n); this.DP = new Int32Array(this.buf, r(60), 3 * this.n);
    this.faces = [];
    for (let p = 64; r(p) !== 0; p += 4) {
      const f = r(p); const fill = r(f + 4);
      if (fill !== J.FillPhong) throw new Error('unexpected fill ' + fill.toString(16));
      this.faces.push({ obj: this, fill: 'phong', l1: dv.getUint16(f + 8, true), l2: dv.getUint16(f + 10, true), l3: dv.getUint16(f + 12, true), env: null, color: 0 });
    }
  }
}
// Init_Ombre: turn an object into a flat "glenz" shadow
export function initOmbre(o) { o.rotate = 'normal'; o.centreX -= 30; o.centreY -= 30; o.distance += 500; for (const f of o.faces) { f.fill = 'glenz'; f.color = 1; } }
export function dimParX(o) { for (let i = 0; i < 3 * o.n; i++) o.S[i] >>= 1; }

// Create_Circle_Phong: 256x256 environment map, 4800/sqrt(x^2+y^2/0.8) (x87 extended in the original, doubles here)
export function createCirclePhong() {
  const R = Math.fround(4800), F = Math.fround(0.8), env = new Uint8Array(65536);
  for (let y = -128, i = 0; y < 128; y++) for (let x = -128; x < 128; x++, i++) {
    const q = R / Math.sqrt(x * x + y * y / F);
    let v = Number.isFinite(q) ? rne(q) : -2147483648;
    v = v >>> 2; if (v > 64) v = 64; env[i] = (v + 129) & 255;
  }
  return env;
}

// Init_Phong: per-face normals (cross products * mul1 / 65536) averaged per vertex into S_Coor_Pvect
export function initPhong(o, env, mul1) {
  let any = false; for (const f of o.faces) if (f.fill === 'phong') { f.env = env; any = true; }
  if (!any) return;
  const S = o.S, fn = new Int32Array(3 * o.faces.length);
  o.faces.forEach((f, k) => {
    const a = f.l1 / 4, b = f.l2 / 4, c = f.l3 / 4;
    const x1 = S[a], y1 = S[a + 1], z1 = S[a + 2], x2 = S[b], y2 = S[b + 1], z2 = S[b + 2], x3 = S[c], y3 = S[c + 1], z3 = S[c + 2];
    const sx = (Math.imul(y2 - y1, z3 - z1) - Math.imul(z2 - z1, y3 - y1)) | 0;
    const sy = (Math.imul(z2 - z1, x3 - x1) - Math.imul(x2 - x1, z3 - z1)) | 0;
    const sz = (Math.imul(x2 - x1, y3 - y1) - Math.imul(y2 - y1, x3 - x1)) | 0;
    fn[3 * k] = Math.trunc(sx * mul1 / 65536); fn[3 * k + 1] = Math.trunc(sy * mul1 / 65536); fn[3 * k + 2] = Math.trunc(sz * mul1 / 65536);
  });
  for (let v = 0; v < o.n; v++) {
    let sx = 0, sy = 0, sz = 0, n = 0;
    o.faces.forEach((f, k) => { if (f.l1 === 12 * v || f.l2 === 12 * v || f.l3 === 12 * v) { sx = (sx + fn[3 * k]) | 0; sy = (sy + fn[3 * k + 1]) | 0; sz = (sz + fn[3 * k + 2]) | 0; n++; } });
    o.SP[3 * v] = idiv(sx, n); o.SP[3 * v + 1] = idiv(sy, n); o.SP[3 * v + 2] = idiv(sz, n);
  }
}

// ---------- rotation (init_rotation / Rotate_Normal / Rotate_Phong) ----------
const K = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0, I: 0 };
export function initRotation(ax, ay, az) {
  initRotation.K = K;
  const sx = Sinus[ax & 0x7FF], cx = CoSinus[ax & 0x7FF], sy = Sinus[ay & 0x7FF], cy = CoSinus[ay & 0x7FF], sz = Sinus[az & 0x7FF], cz = CoSinus[az & 0x7FF];
  const m = (a, b) => Math.imul(a, b) >> 10;
  K.A = m(cy, cx); K.B = -m(cy, sx);
  const t = m(sz, sy);
  K.C = m(sx, cz) - m(t, cx); K.D = m(cz, cx) + m(t, sx);
  K.E = m(cy, sz);
  const u = m(cz, sy);
  K.F = -(m(cx, u) + m(sx, sz)); K.G = m(u, sx) - m(sz, cx);
  K.H = m(cy, cz); K.I = sy;
}
function rotateNormal(o) {
  const S = o.S, D = o.D, n = o.n, px = o.px, py = o.py, pz = o.pz, { A: a, B: b, C: c, D: d, E: e, F: f, G: g, H: h, I: i } = K;
  for (let p = 0; p < n; p++) {
    const x = S[3 * p], y = S[3 * p + 1], z = S[3 * p + 2];
    let X = (Math.imul(x, a) + Math.imul(y, b) + Math.imul(z, i)) | 0, Y = (Math.imul(x, c) + Math.imul(y, d) + Math.imul(z, e)) | 0, Z = (Math.imul(x, f) + Math.imul(y, g) + Math.imul(z, h)) | 0;
    X = (((X >> 8) + px) << 8) >> 2; Y = (((Y >> 8) + py) << 8) >> 2; Z = ((Z >> 8) + pz) >> 10;
    Z = (Z + G.dist) | 0;
    let hi, lo;
    if (Z > 0) { const qx = idiv(X, Z), qy = idiv(Y, Z); hi = qx + G.cx; lo = qy + G.cy; }
    else { hi = Y; lo = X; }                                              // No_div: raw values, X and Y swapped
    D[3 * p] = (hi << 16) | (lo & 0xFFFF);
    D[3 * p + 1] = (D[3 * p + 1] & 0xFFFF0000) | (Z & 0xFFFF);
  }
}
function rotatePhong(o) {
  rotateNormal(o);
  const SP = o.SP, DP = o.DP, { A: a, B: b, C: c, D: d, E: e, I: i } = K;
  for (let p = 0; p < o.n; p++) {
    const x = SP[3 * p], y = SP[3 * p + 1], z = SP[3 * p + 2];
    const X = (Math.imul(x, a) + Math.imul(y, b) + Math.imul(z, i)) | 0, Y = (Math.imul(x, c) + Math.imul(y, d) + Math.imul(z, e)) | 0;
    DP[3 * p] = ((Y << 6) & 0xFFFF0000) | ((X >> 10) & 0xFFFF);
  }
}
// Test_Visible: back-face cull (cross product sign, patched by Prg_3d2) and Z >= 1000, collecting the faces to draw
function testVisible(o) {
  const D = o.D, Z = n => D[n / 4 + 1] & 0xFFFF;
  for (const f of o.faces) {
    const p1 = D[f.l1 / 4], p2 = D[f.l2 / 4], p3 = D[f.l3 / 4];
    const dc = (p3 - p2) | 0, dd = (p2 - p1) | 0;
    const cross = (dc >> 16) * s16(dd) - s16(dc) * (dd >> 16);
    if (G.visi === 'jge' ? cross >= 0 : cross <= 0) continue;
    const z = ((D[f.l1 / 4 + 1] & 0xFFFF) + (D[f.l2 / 4 + 1] & 0xFFFF) + (D[f.l3 / 4 + 1] & 0xFFFF)) >> 1;
    if (z < 1000) continue;
    G.listFaces[G.nbFaces] = f; G.listZ[G.nbFaces++] = z;
  }
}
// Quick_Sort (the asm's own recursive version, keeps its exact tie order)
function quickSort(first, last) {
  const Z = G.listZ, F = G.listFaces;
  for (;;) {
    if (first >= last) return;
    const key = Z[first]; let i = first, k = first + 1;
    for (; k <= last; k++) if (Z[k] < key) { i++; let t = Z[i]; Z[i] = Z[k]; Z[k] = t; t = F[i]; F[i] = F[k]; F[k] = t; }
    let t = Z[first]; Z[first] = Z[i]; Z[i] = t; t = F[first]; F[first] = F[i]; F[i] = t;
    quickSort(first, i - 1);
    first = i + 1;
  }
}
// object_3d: transform + cull every object of the list, sort, draw back to front
export function object3d() {
  G.nbFaces = 0;
  for (const o of G.listObject) {
    G.angX = o.ax; G.angY = o.ay; G.angZ = o.az; G.cx = o.centreX; G.cy = o.centreY; G.dist = o.distance;
    initRotation(o.ax, o.ay, o.az);
    o.rotate === 'phong' ? rotatePhong(o) : rotateNormal(o);
    testVisible(o);
  }
  quickSort(0, G.nbFaces - 1);
  for (let k = G.nbFaces - 1; k >= 0; k--) { const f = G.listFaces[k]; f.fill === 'phong' ? fillPhong(f) : fillGlenz(f); }
}

// ---------- Fill_Glenz (fillglen.asm): flat triangle, or-blended with colour 1 ----------
const FG = { frac: 0 };
function rot(c, d) {                                              // xchg cx,di ; rol edi,16 ; rol ecx,16  -> [esi coef, ebx coef]
  const cl = c & 0xFFFF, ch = c >>> 16, dl = d & 0xFFFF, dh = d >>> 16;
  return [((dl << 16) | ch) >>> 0, ((cl << 16) | dh) >>> 0];
}
function advance(r, c1, c2) {                                     // one scanline step of the two packed edge registers
  let t = r.esi + c1, cy = t > 0xFFFFFFFF ? 1 : 0; r.esi = t >>> 0;
  t = r.ebx + c2 + cy; cy = t > 0xFFFFFFFF ? 1 : 0; r.ebx = t >>> 0;
  r.esi = (r.esi + cy) >>> 0;
}
function glenzSpan(m, edi, w, col) {                              // the or [edi],ax / or [edi],al run of Boucle_Glenz
  if (w <= 0) return;
  if (edi & 1) { m[edi] |= col; edi++; if (--w === 0) return; }
  for (let n = w >> 1; n > 0; n--, edi += 2) { m[edi] |= col; m[edi + 1] |= col; }
  if (w & 1) m[edi] |= col;
}
function glenzRows(r, c, d, rows, ebp, col, clip) {
  const m = M.mem; const [c1, c2] = rot(c >>> 0, d >>> 0);
  for (; rows > 0; rows--, ebp += 320) {
    const si = r.esi & 0xFFFF, bx = r.ebx & 0xFFFF;
    if (!clip) {
      const w = s16(bx - si);
      glenzSpan(m, si + ebp, w, col);
    } else if (s16(si) <= MAX_X && s16(bx) >= 0) {
      let hi = bx, lo = si; if (s16(hi) > MAX_X) hi = MAX_X; if (s16(lo) < 0) lo = 0;
      const w = s16(hi - lo); glenzSpan(m, u16(lo) + ebp, w, col);
    }
    advance(r, c1, c2);
  }
  return ebp;
}
export function fillGlenz(f) {
  const D = f.obj.D, col = f.color | (f.color << 8);
  let a = D[f.l1 / 4], b = D[f.l2 / 4], c = D[f.l3 / 4];
  let hi = a, bp = b; if (hi < bp) { bp = hi; hi = b; } if (hi < c) hi = c;
  if (hi <= 0) return;
  if (bp > c) bp = c;
  let clip = hi > (MAX_X << 16); if (bp < 0) clip = true;
  if (bp >= (MAX_X << 16)) return;
  let t;
  if (s16(a) > s16(b)) { t = a; a = b; b = t; }
  if (s16(b) > s16(c)) { t = b; b = c; c = t; }
  const eq = s16(a) === s16(b);
  if (s16(a) > s16(b)) { t = a; a = b; b = t; }
  if (eq && a > b) { t = a; a = b; b = t; }
  if (s16(a) > MAX_Y || s16(c) <= MIN_Y || s16(a) === s16(c)) return;
  const y1 = u16(a), x1 = a >> 16, y2 = u16(b), x2 = b >> 16, y3 = u16(c);
  const d31 = (c - a) | 0, dy31 = u16(d31); const cX31 = idiv(d31, dy31);
  const d32 = (c - b) | 0, dy32 = u16(d32); if (dy32) FG.x32 = idiv(d32, dy32);
  const d21 = (b - a) | 0, dy21 = u16(d21);
  const r = { esi: 0, ebx: 0 };
  if (dy21 === 0) {                                                // flat top
    let dx = s16(d31); r.esi = ((u16(x1) | (y2 << 16)) >>> 0); r.ebx = ((u16(x2) | (y3 << 16)) >>> 0);
    let cc = cX31, dd = FG.x32, ebp = y1;
    if (s16(y1) < MIN_Y) { const k = MIN_Y - s16(y1); dx = s16(dx - k); mulAdd(r, cc, dd, k); ebp = MIN_Y; }
    if (s16(y3) > MAX_Y) { dx = s16(dx - (s16(y3) - MAX_Y)); if (dx <= 0) return; }
    glenzRows(r, cc, dd, dx, rowAddr(ebp), col, clip);
    return;
  }
  const cX21 = idiv(d21, dy21);
  let dx = s16(dy21), cc = cX21, dd = cX31;
  r.esi = (u16(x1) | (y2 << 16)) >>> 0; r.ebx = r.esi;
  if (cc > dd) { const t2 = cc; cc = dd; dd = t2; }
  let ebp = y1;
  if (s16(y1) < MIN_Y) {
    let k = MIN_Y - s16(y1); if (k > dx) k = dx; dx = s16(dx - k); mulAdd(r, cc, dd, k); ebp = MIN_Y;
  }
  let row = rowAddr(ebp);
  if (dx > 0) row = glenzRows(r, cc, dd, dx, row, col, clip);
  dx = s16(d32);
  if (s16(y2) > MAX_Y) return;
  cc = FG.x32; dd = cX31; if (cc < dd) { const t2 = cc; cc = dd; dd = t2; }
  if (s16(y2) < MIN_Y) {
    let k = MIN_Y - s16(y2); if (k > dx) k = dx; dx = s16(dx - k); mulAdd(r, cc, dd, k); row = rowAddr(MIN_Y);
  }
  if (s16(y3) > MAX_Y) dx = s16(dx + (s16(y3) - MAX_Y));      // sic: the original adds here (draws extra rows below the page), the flat-top path subtracts
  if (dx <= 0) return;
  glenzRows(r, cc, dd, dx, row, col, clip);
}
function mulAdd(r, c, d, k) {                                     // imul ecx,ebp / imul edi,ebp then the same rotated add (clipping at the top)
  const [c1, c2] = rot(Math.imul(c, k) >>> 0, Math.imul(d, k) >>> 0); advance(r, c1, c2);
}

// ---------- Fill_Phong / Fill_Mapping2 (fillmap.asm): env-mapped triangle, 8.8 mapping coordinates ----------
const FM = { constMap: 0, cmY21: 0, cmX21: 0, cmY31: 0, cmX31: 0, cmY32: 0, cmX32: 0, x21: 0, x31: 0, x32: 0 };
export function fillPhong(f) {
  const D = f.obj.D, DP = f.obj.DP;
  const p1 = (DP[f.l1 / 4] + 0x80008000) | 0, p2 = (DP[f.l2 / 4] + 0x80008000) | 0, p3 = (DP[f.l3 / 4] + 0x80008000) | 0;
  fillMapping2(D[f.l1 / 4], D[f.l2 / 4], D[f.l3 / 4], p1, p2, p3, f.env);
}
const rol16 = v => ((v << 16) | (v >>> 16)) | 0;
function fillMapping2(a, b, c, m1, m2, m3, env) {
  let hi = a, bp = b; if (hi < bp) { bp = hi; hi = b; } if (hi < c) hi = c;
  if (hi <= 0) return;
  if (bp > c) bp = c;
  let clip = hi > (MAX_X << 16); if (bp < 0) clip = true;
  if (bp >= (MAX_X << 16)) return;
  let t;
  if (s16(a) > s16(b)) { t = a; a = b; b = t; t = m1; m1 = m2; m2 = t; }
  if (s16(b) > s16(c)) { t = b; b = c; c = t; t = m2; m2 = m3; m3 = t; }
  const eq = s16(a) === s16(b);
  if (s16(a) > s16(b)) { t = a; a = b; b = t; t = m1; m1 = m2; m2 = t; }
  if (eq && a > b) { t = a; a = b; b = t; t = m1; m1 = m2; m2 = t; }
  if (s16(a) > MAX_Y || s16(c) <= MIN_Y || s16(a) === s16(c)) return;
  const st = { y1: a, y2: b, y3: c, M1: m1, M2: m2, M3: m3 };      // y1/y2 are packed dwords: x in the high word, y (then the edge fraction) below
  const X = v => s16(v), Y = v => v >> 16;                           // mapping words: X low, Y high
  const d31 = (c - a) | 0, dy31 = u16(d31);
  FM.cmY31 = idiv16(s16(Y(m3) - Y(m1)), s16(dy31)); FM.cmX31 = idiv16(s16(X(m3) - X(m1)), s16(dy31));
  FM.x31 = idiv((d31 & 0xFFFF0000) | 0, dy31);
  const d32 = (c - b) | 0, dy32 = u16(d32);
  if (dy32) { FM.cmY32 = idiv16(s16(Y(m3) - Y(m2)), s16(dy32)); FM.cmX32 = idiv16(s16(X(m3) - X(m2)), s16(dy32)); FM.x32 = idiv((d32 & 0xFFFF0000) | 0, dy32); }
  const d21 = (b - a) | 0, dy21 = u16(d21);
  const x1 = a >> 16, x2 = b >> 16, x3 = c >> 16;
  if (dy21 === 0) {                                                 // Start_Hori
    const w = s16(x2 - x1); if (w === 0) return;
    const xq = idiv16(s16(X(m2) - X(m1)), w), yq = idiv16(s16(Y(m2) - Y(m1)), w);
    FM.constMap = ((xq << 16) | u16(yq)) | 0;
    st.M1 = rol16(st.M1);
    const row = rowAddr(u16(a)); drawMapping(st, FM.x31, FM.x32, u16(FM.cmY31) | (u16(FM.cmX31) << 16), s16(d31), row, env, clip);
    return;
  }
  FM.cmY21 = idiv16(s16(Y(m2) - Y(m1)), s16(dy21)); FM.cmX21 = idiv16(s16(X(m2) - X(m1)), s16(dy21)); FM.x21 = idiv((d21 & 0xFFFF0000) | 0, dy21);
  // constant mapping step across a scanline, measured on the widest row (at y2)
  let ax = s16(x3 - x1);
  let q = idiv(Math.imul(ax, s16(dy21)), s16(dy31)); ax = s16(q + x1);
  if (ax !== s16(x2)) {
    const cx = s16(ax - x2);
    let ya = s16(Y(m3) - Y(m1)), xa = s16(X(m3) - X(m1));
    ya = s16(idiv(ya * s16(dy21), s16(dy31)) + Y(m1) - Y(m2));
    xa = s16(idiv(xa * s16(dy21), s16(dy31)) + X(m1) - X(m2));
    const xc = idiv16(xa, cx), yc = idiv16(ya, cx);
    FM.constMap = ((xc << 16) | u16(yc)) | 0;
  }
  st.y2 = a; st.M1 = rol16(st.M1);
  let c1 = FM.x21, c2 = FM.x31, cm = u16(FM.cmY21) | (u16(FM.cmX21) << 16);
  if (c1 > c2) { cm = u16(FM.cmY31) | (u16(FM.cmX31) << 16); const tt = c1; c1 = c2; c2 = tt; }
  const row = drawMapping(st, c1, c2, cm | 0, s16(dy21), rowAddr(u16(a)), env, clip);
  const n2 = s16(d32); if (n2 <= 0) return;
  c1 = FM.x32; c2 = FM.x31; cm = u16(FM.cmY32) | (u16(FM.cmX32) << 16);
  if (c1 < c2) { cm = u16(FM.cmY31) | (u16(FM.cmX31) << 16); const tt = c1; c1 = c2; c2 = tt; }
  drawMapping(st, c1, c2, cm | 0, n2, row, env, clip);
}
function idiv16(num, den) { return s16(Math.trunc(num / den)); }
function drawMapping(st, c1, c2, cm, rows, ebp, env, clip) {
  const m = M.mem; const K = FM.constMap | 0;
  for (; u16(rows) !== 0; rows = u16(rows - 1)) {                     // dec cx / jne: a zero count would wrap, callers guarantee > 0
    const x1 = st.y1 >> 16, x2 = st.y2 >> 16;
    let di = u16(x1), ax = u16(x2), edx = st.M1;
    let ok = true, w;
    if (!clip) { w = s16(ax - di); ok = w > 0; }
    else {
      if (s16(di) > MAX_X || s16(ax) < 0) ok = false;
      else {
        if (s16(di) < 0) {
          const bx = u16(0 - di), yc = FM.constMap & 0xFFFF, xc = (FM.constMap >>> 16);
          let lo = u16(edx) + u16(Math.imul(bx, yc)); let hh = (edx >>> 16) + u16(Math.imul(bx, xc));
          edx = (u16(hh) << 16) | u16(lo); di = 0;
        }
        if (s16(ax) > MAX_X) ax = MAX_X;
        w = s16(ax - di); ok = w > 0;
      }
    }
    if (ok) {
      let o = di + ebp, al = w & 255 || 256;
      edx |= 0;
      do { m[o++] = env[(((edx >> 8) & 0xFF) << 8) | ((edx >>> 24) & 0xFF)]; edx = (edx + K) | 0; } while (--al);
    }
    st.M1 = (st.M1 + cm) | 0; st.y1 = (st.y1 + c1) | 0; st.y2 = (st.y2 + c2) | 0; ebp += 320;
  }
  return ebp;
}
