// crt.frag - optional CRT post-effect (Tab / button). Input: the 320x200 frame as a texture. Default view of the port is WITHOUT it.
precision mediump float;
uniform sampler2D tex; uniform vec2 res; varying vec2 uv;
vec2 warp(vec2 p) { p = p * 2.0 - 1.0; p *= vec2(1.0 + p.y * p.y * 0.03, 1.0 + p.x * p.x * 0.04); return p * 0.5 + 0.5; }
void main() {
  vec2 p = warp(uv);
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec2 px = p * vec2(320.0, 200.0);
  vec3 c = texture2D(tex, p).rgb;
  c.r = texture2D(tex, p + vec2(0.0006, 0.0)).r; c.b = texture2D(tex, p - vec2(0.0006, 0.0)).b;   // slight convergence error
  float scan = 0.72 + 0.28 * sin(px.y * 6.2831853 - 1.5708);                                      // one scanline per source line
  float mask = 0.88 + 0.12 * sin(gl_FragCoord.x * 2.0944);                                        // aperture grille
  c *= scan * mask * 1.18;
  vec2 d = p - 0.5; c *= 1.0 - dot(d, d) * 0.9;                                                   // vignette
  gl_FragColor = vec4(c, 1.0);
}
