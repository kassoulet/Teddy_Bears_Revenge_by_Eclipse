// player.js - shell: the ported demo (engine.js) drawn on a 320x200 canvas shown 4:3, music via libopenmpt (chiptune3), pause + seek, effect jump, optional CRT filter.
// Video is driven by the audio clock: target frame = 50 + 70*t. Forward catch-up and backward seeks (restart + replay) are time-sliced.
import { Runner, loadAssets } from './engine.js';
import { FX, END, HZ, frameOf, fxAt, fmt, displaySize } from './timetable.js';
const $ = id => document.getElementById(id);
const cvs = $('c'), g = cvs.getContext('2d'), img = g.createImageData(320, 200), px = new Uint32Array(img.data.buffer);
const run = new Runner(); let modBuf = null;
let playing = false, started = false, ready = false, tBase = 0, wall0 = 0, cp = null, ac = null, muted = false, drag = false, crtOn = false, want = -1, shown = -1;
const now = () => performance.now() / 1000;
const cur = () => playing ? Math.min(END, tBase + (now() - wall0)) : tBase;

// ---- CRT post effect (WebGL, crt.frag); falls back to nothing if WebGL is missing
const crt = $('crt'); let gl = null, tex = null;
async function initCrt() {
  gl = crt.getContext('webgl', { antialias: false }); if (!gl) return;
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
  const fs = await (await fetch('crt.frag')).text(), p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, 'attribute vec2 a; varying vec2 uv; void main(){ uv = vec2(a.x * .5 + .5, .5 - a.y * .5); gl_Position = vec4(a, 0., 1.); }'));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); gl = null; return; }
  gl.useProgram(p); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const a = gl.getAttribLocation(p, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR);
  for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
}
function setCrt(on) {
  crtOn = on && !!gl; crt.style.display = crtOn ? 'block' : 'none'; $('crtb').classList.toggle('on', crtOn); shown = -1; present();
}
function present() {
  run.rgba(px); g.putImageData(img, 0, 0);
  if (crtOn) { gl.viewport(0, 0, crt.width, crt.height); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 320, 200, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(img.data.buffer)); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
}
// ---- audio
async function initAudio() {
  const { ChiptuneJsPlayer } = await import('./vendor/chiptune3.js');
  ac = new AudioContext(); cp = new ChiptuneJsPlayer({ context: ac, repeatCount: 0, interpolationFilter: 8 });
  cp.gain.connect(ac.destination);
  await new Promise(r => cp.onInitialized(r));
  cp.onProgress(m => { if (playing && Math.abs(m.pos - cur()) > 0.25) { tBase = m.pos; wall0 = now(); } });
  cp.play(modBuf.slice(0));
}
function layout() {
  const fs = !!document.fullscreenElement, W = innerWidth, H = innerHeight;
  const { w, h } = displaySize(fs ? W : W * .96, fs ? H : H - 220, devicePixelRatio);
  $('stage').style.width = w + 'px'; $('stage').style.height = h + 'px';
}
addEventListener('resize', layout); document.addEventListener('fullscreenchange', layout); layout();
const sync = () => { $('pp').textContent = playing ? 'Pause' : 'Play'; };
async function play() {
  if (!ready) return;
  if (!started) { started = true; $('go').remove(); await initAudio().catch(e => console.error(e)); tBase = 0; }
  else if (cp) cp.unpause();
  if (tBase >= END - 0.05) seek(0);
  playing = true; wall0 = now(); ac && ac.resume(); sync();
}
function pause() { if (!playing) return; tBase = cur(); playing = false; cp && cp.pause(); sync(); }
function seek(t) { t = Math.max(0, Math.min(END, t)); tBase = t; wall0 = now(); cp && cp.setPos(t); want = frameOf(t); }
const toggle = () => playing ? pause() : play();
$('pp').onclick = toggle; $('go').onclick = () => play();
$('b10').onclick = () => seek(cur() - 10); $('f10').onclick = () => seek(cur() + 10);
$('fs').onclick = () => document.fullscreenElement ? document.exitFullscreen() : $('stage').requestFullscreen();
$('crtb').onclick = () => setCrt(!crtOn);
const sk = $('seek'); sk.oninput = () => { drag = true; seek(sk.value / 10); }; sk.onchange = () => { drag = false; };
$('fxl').append(...FX.map(e => { const b = document.createElement('button'); b.textContent = `${e.i} ${e.name}`; b.title = fmt(e.t0); b.onclick = () => seek(e.t0); return b; }));
addEventListener('keydown', e => {
  const k = e.key, big = e.shiftKey ? 10 : 5;
  if (k === ' ') { e.preventDefault(); toggle(); } else if (k === 'ArrowLeft') seek(cur() - big); else if (k === 'ArrowRight') seek(cur() + big);
  else if (k === 'ArrowUp') seek(FX[Math.max(0, fxAt(cur()) - 1)].t0); else if (k === 'ArrowDown') seek(FX[Math.min(FX.length - 1, fxAt(cur()) + 1)].t0);
  else if (k === 'f' || k === 'F') $('fs').click(); else if (k === 'Tab') { e.preventDefault(); $('crtb').click(); }
  else if (k === 'm' || k === 'M') { muted = !muted; cp && cp.setVol(muted ? 0 : 1); }
});
function loop() {
  const t = cur(); if (playing) want = frameOf(t);
  if (want >= 0 && want !== run.frame) {            // time-sliced: at most ~12 ms of stepping per animation frame
    const t0 = performance.now(); if (want < run.frame) run.restart();
    while (run.frame < want && performance.now() - t0 < 12 && run.step());
  }
  if (run.frame !== shown && run.frame >= 0) { shown = run.frame; present(); }
  if (playing && t >= END) { playing = false; tBase = END; sync(); }
  if (playing && cp && !muted) cp.setVol(Math.max(0, Math.min(1, (END - t) / 1.8)));   // the original fades the picture to black at the end: fade the sound with it
  if (!drag) sk.value = Math.round(t * 10);
  $('tm').textContent = fmt(t) + ' / ' + fmt(END);
  const i = fxAt(t); [...$('fxl').children].forEach((b, j) => b.classList.toggle('on', j === i));
  requestAnimationFrame(loop);
}
window.tbr = { seek, play, pause, cur, run, get ready() { return ready; }, get shown() { return shown; } };
// preload every asset and the module before playback can start (the effects themselves are static imports)
$('go').textContent = 'Loading 0/20...';
initCrt().catch(console.error);
modBuf = null;
loadAssets((n, N) => { $('go').textContent = `Loading ${n}/${N + 1}...`; })
  .then(async () => { modBuf = await (await fetch('TEDDY.MOD')).arrayBuffer(); ready = true; $('go').textContent = 'Click or press Space to start (sound on)'; want = frameOf(0); })
  .catch(e => { $('go').textContent = 'Load failed: ' + e; console.error(e); });
loop();
