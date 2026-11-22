// UI smoke test (headless google-chrome, CDP): play gated on load, time advances, pause holds, seek (slider + API + effect buttons + keys), every effect renders,
// backward seek is deterministic, CRT toggle, 4:3 stage, no page exceptions. Serves web/ itself.  usage: node tools/uitest.mjs
import { spawn } from 'child_process'; import fs from 'fs'; import http from 'http'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../web');
const srv = http.createServer((q, r) => { let p = path.join(root, q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } const m = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.frag': 'text/plain', '.wasm': 'application/wasm' }; r.writeHead(200, { 'content-type': m[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0);
const ch = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--window-size=1100,900', '--remote-debugging-port=9341', 'about:blank'], { stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(2000);
const tabs = await (await fetch('http://localhost:9341/json')).json(); const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; let exc = 0;
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) pend[d.id](d); if (d.method === 'Runtime.exceptionThrown') { exc++; console.log('EXC', JSON.stringify(d.params.exceptionDetails).slice(0, 300)); } };
const send = (method, params = {}) => new Promise(r => { pend[++id] = r; ws.send(JSON.stringify({ id, method, params })) });
const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.result.value;
const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, x); if (!c) process.exitCode = 1 };
await send('Runtime.enable'); await send('Page.navigate', { url: `http://localhost:${srv.address().port}/index.html` });
// gating: the start overlay says Loading until everything is ready
await wait(30); const g0 = await ev('document.getElementById("go")?.textContent'); ok('overlay shows Loading n/N first', /^Loading/.test(g0 || ''), g0);
for (let i = 0; i < 100 && !(await ev('tbr.ready')); i++) await wait(100);
ok('ready after preload', await ev('tbr.ready'), await ev('document.getElementById("go")?.textContent'));
const cur = () => ev('tbr.cur()'), settle = async f => { for (let i = 0; i < 200; i++) { if (await ev(`tbr.shown===tbr.run.frame && tbr.run.frame>=${f}`)) return; await wait(50); } };
const box = await ev('(()=>{const r=document.getElementById("stage").getBoundingClientRect();return [r.width,r.height]})()');
ok('stage is 4:3', Math.abs(box[0] / box[1] - 4 / 3) < 0.02, box.join('x'));
await ev('document.getElementById("pp").click()'); await wait(3500); const t1 = await cur(); ok('time advances while playing', t1 > 2, t1.toFixed(2) + ' s');
ok('video follows the clock', Math.abs((await ev('tbr.run.frame')) - (50 + 70 * (await cur()))) < 70);
await ev('document.getElementById("pp").click()'); const a = await cur(); await wait(1200); const b = await cur(); ok('pause holds', a === b, a.toFixed(2) + ' ' + b.toFixed(2));
await ev('(()=>{const s=document.getElementById("seek");s.value=1000;s.dispatchEvent(new Event("input"));})()'); await wait(600);
const s1 = await cur(); ok('slider seek to 100 s', Math.abs(s1 - 100) < 0.5, s1.toFixed(2));
await ev('document.getElementById("pp").click()'); await wait(2000); const p1 = await cur(); ok('play resumes from seek', p1 > 101.5 && p1 < 104.5, p1.toFixed(2));
await ev('document.getElementById("pp").click()');
const stat = () => ev('(()=>{const c=document.getElementById("c"),d=c.getContext("2d").getImageData(0,0,320,200).data;let n=0,h=0;for(let i=0;i<d.length;i+=4){if(d[i]|d[i+1]|d[i+2])n++;h=(h*31+d[i]+d[i+1]*7+d[i+2]*13)|0}return [n,h]})()');
const T = [[1, 'Rotozoom'], [20, 'Intro'], [30, 'Glenz bears'], [45, 'Lines'], [60, 'Bitmap 1'], [66, '3D phong'], [72, 'Bitmap 2'], [80, 'Tunnel'], [88, 'Bitmap 3'], [100, 'Rotozoom end']];
for (const [t, name] of T) { await ev(`tbr.seek(${t})`); await settle(50 + 70 * t); const [n] = await stat(); ok(`${name} at ${t}s renders`, n > 1000, 'nonblack=' + n); }
// effect buttons and keys
const nb = await ev('document.getElementById("fxl").children.length'); ok('10 effect buttons', nb === 10, nb);
await ev('document.getElementById("fxl").children[7].click()'); ok('effect button jumps to the tunnel', Math.abs((await cur()) - (5047 - 50) / 70) < 0.5, (await cur()).toFixed(2));
const kd = k => send('Input.dispatchKeyEvent', { type: 'keyDown', key: k }); const t2 = await cur(); await kd('ArrowRight'); await wait(100); ok('ArrowRight seeks +5 s', Math.abs((await cur()) - t2 - 5) < 0.3);
await kd('ArrowDown'); await wait(100); ok('ArrowDown jumps to the next effect', (await cur()) > t2 + 5);
// determinism of seeking backwards: same frame twice gives the same picture
await ev('tbr.seek(40)'); await settle(50 + 70 * 40); const h1 = await stat(); await ev('tbr.seek(5)'); await settle(50 + 70 * 5); await ev('tbr.seek(40)'); await settle(50 + 70 * 40); const h2 = await stat();
ok('seek(40) twice gives the same picture', h1[1] === h2[1], h1[1] + ' ' + h2[1]);
// end of the demo: fade to black
await ev('tbr.seek(105.2)'); await settle(7417); const [ne] = await stat(); ok('last frame is (nearly) black', ne < 200, 'nonblack=' + ne);
// CRT toggle
await ev('tbr.seek(60)'); await settle(50 + 70 * 60); await ev('document.getElementById("crtb").click()'); await wait(300);
const crtv = await ev('document.getElementById("crt").style.display'); ok('CRT toggles on (WebGL available) or is a no-op without it', crtv === 'block' || crtv === 'none', crtv);
await ev('document.getElementById("crtb").click()'); ok('CRT toggles off: original look', (await ev('document.getElementById("crt").style.display')) === 'none');
ok('no page exceptions', exc === 0);
ch.kill(); srv.close(); process.exit(process.exitCode || 0);
