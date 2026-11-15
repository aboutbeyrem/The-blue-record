// A 3D globe drawn with WebGL, no libraries.
//
// One full-screen shader ray-traces a sphere and paints it with NASA's Blue
// Marble picture. A second picture (places.png) holds a country id for every
// spot on Earth, which gives us borders, hover highlights and click picking.

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_lat;       // latitude facing us, radians
uniform float u_lon;       // longitude facing us, radians
uniform float u_zoom;      // camera distance
uniform float u_time;
uniform float u_hover;     // country id under the pointer
uniform float u_sel;       // chosen country id
uniform float u_pulse;     // 0..1, a ripple when a country is chosen
uniform sampler2D u_earth;
uniform sampler2D u_ids;
const float PI = 3.14159265359;
const float TAN = 0.41421356;      // tan(22.5 degrees)

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float idAt(vec2 uv) { return floor(texture2D(u_ids, uv).r * 255.0 + 0.5); }

void main() {
  vec2 frag = gl_FragCoord.xy;
  float side = min(u_res.x, u_res.y);
  vec2 p = (frag - 0.5 * u_res) / (0.5 * side);

  // Deep space with a few twinkling stars.
  vec3 sky = mix(vec3(0.020, 0.030, 0.075), vec3(0.045, 0.060, 0.135), smoothstep(-1.0, 1.0, p.y));
  vec2 cell = floor(frag / 3.0);
  float h = hash(cell);
  float star = step(0.9965, h) * (0.55 + 0.45 * sin(u_time * 1.6 + h * 60.0));
  sky += vec3(star) * vec3(0.85, 0.9, 1.0);

  vec3 ro = vec3(0.0, 0.0, u_zoom);
  vec3 rd = normalize(vec3(p * TAN, -1.0));
  float b = dot(ro, rd);
  float c = dot(ro, ro) - 1.0;
  float disc = b * b - c;

  // Closest approach of the ray to the globe's centre, for the atmosphere glow.
  float closest = length(ro - rd * max(b * -1.0, 0.0) * -1.0);
  float miss = length(cross(ro, rd));

  if (disc < 0.0) {
    float glow = exp(-(miss - 1.0) * 9.0) * smoothstep(1.55, 1.0, miss);
    vec3 col = sky + vec3(0.25, 0.50, 1.0) * glow * 0.9;
    gl_FragColor = vec4(col, 1.0);
    return;
  }

  float t = -b - sqrt(disc);
  vec3 hit = ro + rd * t;                 // point on the sphere, camera space

  // Camera space -> globe space: undo the pitch, then the turn.
  float ca = cos(u_lat), sa = sin(u_lat);
  vec3 q = vec3(hit.x, hit.y * ca + hit.z * sa, -hit.y * sa + hit.z * ca);   // Rx(-lat)
  float cl = cos(u_lon), sl = sin(u_lon);
  vec3 v = vec3(q.x * cl + q.z * sl, q.y, -q.x * sl + q.z * cl);             // Ry(+lon)

  float lat = asin(clamp(v.y, -1.0, 1.0));
  float lon = atan(v.x, v.z);
  vec2 uv = vec2((lon + PI) / (2.0 * PI), (PI * 0.5 - lat) / PI);

  vec3 col = texture2D(u_earth, uv).rgb;
  col = pow(col, vec3(0.92)) * 1.06;

  // Soft sunlight from the upper left, with a little glow on the dark side.
  vec3 n = normalize(hit);
  vec3 sun = normalize(vec3(-0.55, 0.45, 0.70));
  float lit = clamp(dot(n, sun), 0.0, 1.0);
  col *= 0.30 + 0.85 * lit;

  // Ocean sparkle where the sun reflects.
  vec3 refl = reflect(-sun, n);
  float spec = pow(clamp(dot(refl, -rd), 0.0, 1.0), 38.0);
  float oceanish = smoothstep(0.35, 0.0, col.r - col.b);
  col += vec3(0.5, 0.6, 0.8) * spec * 0.30 * oceanish;

  // Borders and highlights from the country id picture.
  float id = idAt(uv);
  vec2 px = vec2(1.0 / 4096.0, 1.0 / 2048.0);
  float w = 1.0;
  float edge = 0.0, selEdge = 0.0;
  float idR = idAt(uv + vec2(px.x * w, 0.0)), idL = idAt(uv - vec2(px.x * w, 0.0));
  float idU = idAt(uv + vec2(0.0, px.y * w)), idD = idAt(uv - vec2(0.0, px.y * w));
  if (id > 0.5 && (idR != id || idL != id || idU != id || idD != id)) edge = 1.0;
  float w2 = 2.2;
  float jR = idAt(uv + vec2(px.x * w2, 0.0)), jL = idAt(uv - vec2(px.x * w2, 0.0));
  float jU = idAt(uv + vec2(0.0, px.y * w2)), jD = idAt(uv - vec2(0.0, px.y * w2));
  if (abs(id - u_sel) < 0.5 && u_sel > 0.5 && (jR != id || jL != id || jU != id || jD != id)) selEdge = 1.0;

  col = mix(col, vec3(0.85, 0.92, 1.0), edge * 0.32);

  bool isSel = u_sel > 0.5 && abs(id - u_sel) < 0.5;
  bool isHover = u_hover > 0.5 && abs(id - u_hover) < 0.5;
  if (isHover && !isSel) {
    col = mix(col, vec3(1.0, 0.84, 0.66), 0.38);
    col += vec3(0.10, 0.07, 0.04);
  }
  if (isSel) {
    float shimmer = 0.5 + 0.5 * sin(u_time * 2.2 + lat * 14.0);
    col = mix(col, vec3(0.94, 0.64, 0.44), 0.42 + 0.10 * shimmer);
    col += vec3(0.16, 0.10, 0.05) * (0.6 + 0.8 * u_pulse);
  }
  col = mix(col, vec3(1.0, 0.86, 0.70), selEdge * 0.95);

  // Rim: a thin blue atmosphere over the limb.
  float rim = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 2.6);
  col += vec3(0.22, 0.46, 1.0) * rim * 0.95;
  col = mix(col, col * vec3(0.9, 0.95, 1.1), 0.12);

  gl_FragColor = vec4(col, 1.0);
}`;

const rad = (d) => d * Math.PI / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Globe {
  /**
   * @param canvas   the canvas to draw on
   * @param earthImg a loaded Image of the Earth, flat world map
   * @param idPixels RGBA pixels of places.png (red = country id)
   * @param idSize   [width, height] of places.png
   * @param callbacks onHover(id|0, x, y), onSelect(id)
   */
  constructor(canvas, earthImg, idPixels, idSize, callbacks) {
    this.cv = canvas;
    this.cb = callbacks;
    this.lat = rad(25); this.lon = rad(10);
    this.zoom = 3.15;
    this.vLat = 0; this.vLon = rad(0.12);          // idle spin, radians per frame
    this.hover = 0; this.sel = 0; this.pulse = 0;
    this.fly = null;
    this.drag = null;
    this.idle = true;
    this.lastTouch = 0;                            // when you last dragged or zoomed
    this.noSpin = false;                           // set for people who asked for less motion
    this.placeAt = null;                           // set by the owner: (lat, lon) -> country id
    this.ok = this.init(earthImg, idPixels, idSize);
    if (this.ok) this.bind();
  }

  init(earthImg, idPixels, idSize) {
    const gl = this.gl = this.cv.getContext('webgl', { antialias: true, alpha: false });
    if (!gl) return false;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = this.prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ['u_res', 'u_lat', 'u_lon', 'u_zoom', 'u_time', 'u_hover', 'u_sel', 'u_pulse', 'u_earth', 'u_ids']) {
      this.u[n] = gl.getUniformLocation(prog, n);
    }

    const tex = (unit, upload, filter) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      upload();
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.NEAREST ? gl.NEAREST : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    tex(0, () => {
      if (earthImg.naturalWidth > maxTex) {                       // old phones: shrink to fit
        const c = document.createElement('canvas');
        c.width = maxTex; c.height = maxTex / 2;
        c.getContext('2d').drawImage(earthImg, 0, 0, c.width, c.height);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, c);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, earthImg);
      }
      gl.generateMipmap(gl.TEXTURE_2D);
    }, gl.LINEAR_MIPMAP_LINEAR);
    tex(1, () => {
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, idSize[0], idSize[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(idPixels.buffer, idPixels.byteOffset, idPixels.byteLength));
    }, gl.NEAREST);
    gl.uniform1i(this.u.u_earth, 0);
    gl.uniform1i(this.u.u_ids, 1);
    return true;
  }

  /** The country under screen point (x, y) in CSS pixels, or null. */
  pick(x, y) {
    const r = this.cv.getBoundingClientRect();
    const side = Math.min(r.width, r.height);
    const px = (x - r.left - r.width / 2) / (side / 2);
    const py = -(y - r.top - r.height / 2) / (side / 2);
    const TAN = 0.41421356;
    const dir = [px * TAN, py * TAN, -1];
    const len = Math.hypot(...dir); dir[0] /= len; dir[1] /= len; dir[2] /= len;
    const ro = [0, 0, this.zoom];
    const b = ro[2] * dir[2];
    const disc = b * b - (ro[2] * ro[2] - 1);
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    const hit = [ro[0] + dir[0] * t, ro[1] + dir[1] * t, ro[2] + dir[2] * t];
    const ca = Math.cos(this.lat), sa = Math.sin(this.lat);
    const q = [hit[0], hit[1] * ca + hit[2] * sa, -hit[1] * sa + hit[2] * ca];
    const cl = Math.cos(this.lon), sl = Math.sin(this.lon);
    const v = [q[0] * cl + q[2] * sl, q[1], -q[0] * sl + q[2] * cl];
    return { lat: Math.asin(clamp(v[1], -1, 1)) * 180 / Math.PI, lon: Math.atan2(v[0], v[2]) * 180 / Math.PI };
  }

  bind() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now() };
      this.idle = false; this.fly = null; this.vLon = 0; this.vLat = 0;
      this.lastTouch = performance.now();
    });
    cv.addEventListener('pointermove', (e) => {
      if (this.drag) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        this.drag.moved += Math.abs(dx) + Math.abs(dy);
        this.drag.x = e.clientX; this.drag.y = e.clientY;
        const k = 0.0055 * (this.zoom - 0.6) / 2.5;
        this.lon -= dx * k; this.lat = clamp(this.lat + dy * k, rad(-85), rad(85));
        this.vLon = -dx * k * 0.5; this.vLat = dy * k * 0.5;
        this.setHover(0, e);
        return;
      }
      this.updateHover(e);
    });
    const end = (e) => {
      if (!this.drag) return;
      const wasClick = this.drag.moved < 6;
      this.drag = null;
      if (wasClick) this.clickAt(e);
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', () => { this.drag = null; });
    cv.addEventListener('pointerleave', (e) => { if (!this.drag) this.setHover(0, e); });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = clamp(this.zoom + e.deltaY * 0.0016, 1.9, 4.2);
      this.idle = false; this.lastTouch = performance.now();
    }, { passive: false });
    new ResizeObserver(() => this.resize()).observe(cv);
  }

  updateHover(e) {
    const p = this.pick(e.clientX, e.clientY);
    this.setHover(p && this.placeAt ? this.placeAt(p.lat, p.lon) : 0, e);
    this.cv.style.cursor = this.hover ? 'pointer' : 'grab';
  }

  setHover(id, e) {
    if (id !== this.hover) { this.hover = id; }
    this.cb.onHover?.(id, e ? e.clientX : 0, e ? e.clientY : 0);
  }

  clickAt(e) {
    const p = this.pick(e.clientX, e.clientY);
    if (!p || !this.placeAt) return;
    const id = this.placeAt(p.lat, p.lon);
    if (id) this.cb.onSelect?.(id, p);
  }

  /** Choose a country and turn the globe to face it. */
  select(id, lat, lon, zoom = 2.55) {
    this.sel = id; this.pulse = 1; this.idle = false;
    this.flyTo(lat, lon, zoom);
  }

  clear() { this.sel = 0; this.idle = true; this.lastTouch = 0; this.vLon = rad(0.12); this.vLat = 0; this.flyTo(this.lat * 180 / Math.PI * 0.6, this.lon * 180 / Math.PI, 3.15, 900); }

  flyTo(latDeg, lonDeg, zoom, ms = 1300) {
    let dl = rad(lonDeg) - this.lon;
    dl = Math.atan2(Math.sin(dl), Math.cos(dl));            // take the short way round
    this.fly = { t0: performance.now(), ms, from: [this.lat, this.lon, this.zoom], to: [clamp(rad(latDeg), rad(-80), rad(80)), this.lon + dl, zoom] };
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.cv.clientWidth * dpr), h = Math.round(this.cv.clientHeight * dpr);
    if (w && (this.cv.width !== w || this.cv.height !== h)) { this.cv.width = w; this.cv.height = h; }
  }

  draw(now) {
    if (!this.ok) return;
    this.resize();
    if (!this.cv.width) return;
    const gl = this.gl;
    if (this.fly) {
      const k = Math.min(1, (now - this.fly.t0) / this.fly.ms), e = easeInOut(k);
      const { from, to } = this.fly;
      this.lat = from[0] + (to[0] - from[0]) * e;
      this.lon = from[1] + (to[1] - from[1]) * e;
      this.zoom = from[2] + (to[2] - from[2]) * e;
      if (k >= 1) this.fly = null;
    } else if (!this.drag) {
      // Coast after a drag, then go back to the slow idle spin if nothing is chosen.
      this.lon += this.vLon; this.lat = clamp(this.lat + this.vLat, rad(-85), rad(85));
      this.vLon *= 0.94; this.vLat *= 0.94;
      // Spin again a couple of seconds after you let go, unless a country is chosen.
      // Over a country it slows right down, so it is easy to click, but never stops for good.
      const resting = !this.sel && !this.noSpin && now - this.lastTouch > 2200;
      if (resting) {
        this.vLon += (rad(this.hover ? 0.035 : 0.12) - this.vLon) * 0.05;
        this.lat += (rad(22) - this.lat) * 0.004;
      }
    }
    this.pulse *= 0.965;
    gl.viewport(0, 0, this.cv.width, this.cv.height);
    gl.uniform2f(this.u.u_res, this.cv.width, this.cv.height);
    gl.uniform1f(this.u.u_lat, this.lat);
    gl.uniform1f(this.u.u_lon, this.lon);
    gl.uniform1f(this.u.u_zoom, this.zoom);
    gl.uniform1f(this.u.u_time, now / 1000);
    gl.uniform1f(this.u.u_hover, this.hover);
    gl.uniform1f(this.u.u_sel, this.sel);
    gl.uniform1f(this.u.u_pulse, this.pulse);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
