// fx/threed.js - Init_3DKernel/2, Prg_3d and Prg_3d2 (3dkernel.asm) on top of the engine
import { A, M, screenSwap, waitVbl, Flash } from '../core.js';
import { G, Obj, initOmbre, dimParX, createCirclePhong, initPhong, initRotation, object3d } from './engine3d.js';
import { clearHiddenPageNeige } from './intro.js';

const NB = 5, SIZE_AMPLI = 20;
const ADDR = [-5000, -15000, 0, -15000, 0, 10000, 0, 0, -20000, -15000, 15000, 0, 15000, 0, 15000, 10000, 20000, -15000];
const COMPT0 = [0, -1000, 100, 100, 0, 332, 0, 100, 654, 63, -1350, 0, 0, 3550, 100, 540, 1000, 0];
const ANGLE = [5, 7, 9, 3, 6, -3, 6, 9, -11, 5, 10, 11, -10, 5, -9, -8, -9, 5];
const S = { list1: [], list2: [], compt: null, synchro: false };

export function reset() {
  S.compt = Int32Array.from(COMPT0); S.synchro = false;
  G.visi = 'jge';
  const L = S.list1 = [];
  for (let i = 0; i < (NB + 1) * 2; i++) L.push(new Obj(1));
  initOmbre(L[1]);
  const env = G.env = createCirclePhong();
  initPhong(L[0], env, 1800);
  for (let k = 0; k < NB; k++) { initPhong(L[2 + 2 * k], env, 1800); dimParX(L[2 + 2 * k]); dimParX(L[3 + 2 * k]); initOmbre(L[3 + 2 * k]); }
  const C = S.list2 = [];
  for (let k = 0; k < 7; k++) {
    const o = new Obj(2); initPhong(o, env, 3800);
    o.distance = 6000; o.cax = 4; o.cay = 10; o.caz = 14; C.push(o);
  }
  const sw = (o, f) => { for (let p = 0; p < o.n; p++) { const s = o.S, x = s[3 * p], y = s[3 * p + 1], z = s[3 * p + 2]; [s[3 * p], s[3 * p + 1], s[3 * p + 2]] = f(x, y, z); } };
  sw(C[1], (x, y, z) => [z, y, x]);
  sw(C[2], (x, y, z) => [-z, y, x]);
  sw(C[3], (x, y, z) => [x, y, -z]);
  sw(C[4], (x, y, z) => [y, z, x]);
  sw(C[5], (x, y, z) => [y, -z, x]);
  G.listObject = S.list1;
}
function addAngle() {
  for (const o of G.listObject) { o.ax = (o.ax + o.cax) & 0xFFFF; o.ay = (o.ay + o.cay) & 0xFFFF; o.az = (o.az + o.caz) & 0xFFFF; }
  for (let i = 0; i < 3 * NB; i++) S.compt[i] = (S.compt[i] + ANGLE[i]) | 0;
}
function sport() { M.setSport = 1; M.amplitude = SIZE_AMPLI; }
const ROWS = [8, 24, 40, 56];
function update3d() { addAngle(); if (ROWS.includes(M.info()[2])) sport(); }
function update3d2() {
  addAngle();
  const L = G.listObject;
  if (S.synchro) { for (const o of L) o.distance = 2000; S.synchro = false; }
  for (const o of L) if (o.distance >>> 0 <= 6000) o.distance += 150;
  if (ROWS.includes(M.info()[2])) { S.synchro = true; sport(); }
}
function rotateClone() {
  for (let k = 0; k < NB; k++) {
    initRotation(S.compt[3 * k], S.compt[3 * k + 1], S.compt[3 * k + 1]);
    const K = initRotation.K, x = ADDR[3 * k], y = ADDR[3 * k + 1], z = ADDR[3 * k + 2];
    const X = (Math.imul(x, K.A) + Math.imul(y, K.B) + Math.imul(z, K.I)) >> 10;
    const Y = (Math.imul(x, K.C) + Math.imul(y, K.D) + Math.imul(z, K.E)) >> 10;
    const Z = (Math.imul(x, K.F) + Math.imul(y, K.G) + Math.imul(z, K.H)) >> 10;
    for (const o of [S.list1[2 + 2 * k], S.list1[3 + 2 * k]]) { o.px = X; o.py = Y; o.pz = Z; }
  }
}
export function* prg3d() {
  G.visi = 'jge'; G.listObject = S.list1;
  M.setPal(A['phong.pal']); Flash.init(); M.updateTimer = update3d;
  do { screenSwap(); clearHiddenPageNeige(); object3d(); yield* waitVbl(); rotateClone(); } while (M.ax() < 0xA00);
  M.updateTimer = null;
}
export function* prg3d2() {
  G.visi = 'jle'; G.listObject = S.list2.slice(); G.listObject.length = 6;
  M.setPal(A['phong.pal']); Flash.init(); M.updateTimer = update3d2;
  do { screenSwap(); clearHiddenPageNeige(); object3d(); yield* waitVbl(); } while (M.ax() < 0x1500);
  M.updateTimer = null;
}
