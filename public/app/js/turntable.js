// Draws the record (WebGL) and the tonearm (2D canvas on top).
//
// The record is an azimuthal map: the pole sits at the centre and the equator
// at the edge, so a circle of latitude is a groove. Side A looks down on the
// north pole, Side B looks up at the south pole.

// Layout in "record radii". The record has radius 1 and sits at the origin.
export const VIEW = { w: 2.74, h: 2.24, cx: 1.12, cy: 1.12 };
const PIVOT = { x: 1.18, y: -0.80 };     // tonearm pivot, relative to the centre
const ARM_LEN = 1.33;
export const LABEL_R = 0.115;

// The record is drawn flat, then the whole stage is tilted back in CSS perspective.
const TILT = 27;                    // degrees
const PERSP = 1500;                 // pixels
const PERSP_ORIGIN = [0.5, 0.26];   // where the viewer's eye is, as a share of the box
const TILT_ORIGIN = [0.5, 0.58];    // the line the stage tilts around            // paper label: hides latitudes above ~80

const VERT = `
attribute vec2 a_pos;
varying vec2 v_p;
void main() { v_p = a_pos; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
varying vec2 v_p;
uniform sampler2D u_a;
uniform sampler2D u_b;
uniform float u_mix;      // crossfade between two frames
uniform float u_rot;      // how far the record has turned, radians
uniform float u_side;     // +1 Side A (north), -1 Side B (south)
uniform float u_needle;   // radius of the groove under the needle
uniform float u_dark;     // 1 for maps that are mostly black (lightning)
uniform float u_px;       // one pixel, in record radii
uniform float u_alpha;    // 1 when the map marks missing data with transparency (live maps)
const float PI = 3.14159265359;

void main() {
  vec2 p = vec2(v_p.x, -v_p.y);            // y grows downward, like the screen
  float r = length(p);
  if (r > 1.0) { gl_FragColor = vec4(0.0); return; }

  float a = atan(p.y, p.x);                // clockwise screen angle
  float d = a - u_rot;                     // same point in the record's own frame
  float lon = u_side > 0.0 ? -d : d;       // east runs anticlockwise seen from the north
  float lat = u_side * 90.0 * (1.0 - r);
  vec2 uv = vec2(fract(lon / (2.0 * PI) + 0.5), (90.0 - lat) / 180.0);
  vec4 texel = mix(texture2D(u_a, uv), texture2D(u_b, uv), u_mix);
  vec3 c = texel.rgb;
  if (u_dark > 0.5) {
    // Lightning dots are a pixel or two wide: thicken them so they read on the record.
    vec2 e = vec2(1.0 / 1024.0, 1.0 / 512.0);
    for (int i = 0; i < 4; i++) {
      vec2 o = i == 0 ? vec2(e.x, 0.0) : i == 1 ? vec2(-e.x, 0.0) : i == 2 ? vec2(0.0, e.y) : vec2(0.0, -e.y);
      c = max(c, mix(texture2D(u_a, uv + o).rgb, texture2D(u_b, uv + o).rgb, u_mix));
    }
  }

  // Grey land becomes bare black vinyl so the data glows on top of it.
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float sat = mx > 0.0 ? (mx - mn) / mx : 0.0;
  float isData = u_alpha > 0.5 ? smoothstep(0.3, 0.7, texel.a) : smoothstep(0.16, 0.34, sat);
  vec3 vinyl = vec3(0.035, 0.04, 0.05) + c * mix(0.30, 0.95, u_dark);
  c = mix(vinyl, c * mix(1.12, 1.35, u_dark), isData);

  // Grooves, and the two bands of light every record has.
  float groove = 0.90 + 0.10 * sin(r * 520.0);
  c *= groove;
  float sheen = pow(abs(cos(a - 0.9)), 20.0) + 0.7 * pow(abs(sin(a - 0.9)), 70.0);
  c += vec3(0.13, 0.15, 0.19) * sheen * (1.0 - isData * 0.55);

  // The groove being played.
  float ring = 1.0 - smoothstep(0.0, u_px * 2.2, abs(r - u_needle));
  c = mix(c, vec3(0.94, 0.64, 0.44), ring * 0.55);

  c *= 1.0 - smoothstep(0.975, 1.0, r) * 0.65;       // rim
  float alpha = 1.0 - smoothstep(1.0 - u_px * 1.5, 1.0, r);
  gl_FragColor = vec4(c * alpha, alpha);
}`;

/** Where the stylus sits for a groove of radius rho: {x, y, angle}. */
export function stylus(rho) {
  const pd = Math.hypot(PIVOT.x, PIVOT.y);
  const cos = (rho * rho + pd * pd - ARM_LEN * ARM_LEN) / (2 * rho * pd);
  const phi = Math.acos(Math.max(-1, Math.min(1, cos)));
  const angle = Math.atan2(PIVOT.y, PIVOT.x) + phi;
  return { x: rho * Math.cos(angle), y: rho * Math.sin(angle), angle };
}

/** Longitude (degrees) under the needle for a given turn of the record. */
export function needleLon(rot, rho, side) {
  const d = stylus(rho).angle - rot;
  const lon = (side > 0 ? -d : d) * 180 / Math.PI;
  return ((lon + 180) % 360 + 360) % 360 - 180;
}

export const latToRho = (absLat) => 1 - absLat / 90;
export const rhoToLat = (rho) => 90 * (1 - rho);

export class Turntable {
  constructor(plinth, discCanvas, armCanvas, platter, flipper) {
    Object.assign(this, { plinth, disc: discCanvas, arm: armCanvas, platter, flipper });
    this.unit = 100;
    this.gl = discCanvas.getContext('webgl', { premultipliedAlpha: true, antialias: true });
    this.ctx = armCanvas.getContext('2d');
    this.tex = [null, null];
    this.ok = !!this.gl;
    if (this.ok) this.initGL();
    this.stage = plinth.querySelector('.stage3d');
    plinth.style.perspective = `${PERSP}px`;
    plinth.style.perspectiveOrigin = `${PERSP_ORIGIN[0] * 100}% ${PERSP_ORIGIN[1] * 100}%`;
    this.stage.style.transform = `rotateX(${TILT}deg)`;
    this.stage.style.transformOrigin = `${TILT_ORIGIN[0] * 100}% ${TILT_ORIGIN[1] * 100}%`;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(plinth);
  }

  initGL() {
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
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
    for (const n of ['u_a', 'u_b', 'u_mix', 'u_rot', 'u_side', 'u_needle', 'u_dark', 'u_px', 'u_alpha']) {
      this.u[n] = gl.getUniformLocation(prog, n);
    }
    gl.uniform1i(this.u.u_a, 0);
    gl.uniform1i(this.u.u_b, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    for (let i = 0; i < 2; i++) {
      const t = this.tex[i] = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([8, 9, 12, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      // Frames are 1024x512, a power of two, so the map can wrap at the date line.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
  }

  /** Put a frame into slot 0 (current) or 1 (the one being faded in). */
  setFrame(slot, img) {
    if (!this.ok) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + slot);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[slot]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  }

  resize() {
    const box = this.plinth.getBoundingClientRect();
    if (!box.width) return;
    const unit = this.unit = Math.min(box.width / VIEW.w, box.height / VIEW.h);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ox = (box.width - VIEW.w * unit) / 2, oy = (box.height - VIEW.h * unit) / 2;
    this.origin = { x: ox + VIEW.cx * unit, y: oy + VIEW.cy * unit };

    const place = (el, r) => {
      el.style.left = `${this.origin.x - r * unit}px`;
      el.style.top = `${this.origin.y - r * unit}px`;
      el.style.width = el.style.height = `${2 * r * unit}px`;
    };
    for (const el of this.plinth.querySelectorAll('[data-r]')) place(el, Number(el.dataset.r));
    this.disc.width = this.disc.height = Math.round(2 * unit * dpr);
    if (this.ok) this.gl.viewport(0, 0, this.disc.width, this.disc.height);

    this.arm.width = Math.round(box.width * dpr);
    this.arm.height = Math.round(box.height * dpr);
    this.dpr = dpr;
  }

  /**
   * Where a point on the screen lands on the flat record, undoing the tilt and the
   * perspective. Returns plinth coordinates in CSS pixels.
   */
  toLocal(clientX, clientY) {
    const box = this.plinth.getBoundingClientRect();
    const w = box.width, h = box.height;
    const sx = clientX - box.left, sy = clientY - box.top;
    const th = TILT * Math.PI / 180, sin = Math.sin(th), cos = Math.cos(th);
    const px = w * PERSP_ORIGIN[0], py = h * PERSP_ORIGIN[1], oy = h * TILT_ORIGIN[1];
    const v = PERSP * (sy - oy) / ((sy - py) * sin + PERSP * cos);   // distance along the tilted plane from its axis
    const k = PERSP / (PERSP - v * sin);                             // how much perspective magnified that spot
    return { x: (sx - px) / k + px, y: oy + v };
  }

  /** Radius (in record radii) of a pointer position, for dragging the needle. */
  rhoAt(clientX, clientY) {
    const p = this.toLocal(clientX, clientY);
    return Math.hypot(p.x - this.origin.x, p.y - this.origin.y) / this.unit;
  }

  draw(s) {
    if (!this.origin) { this.resize(); if (!this.origin) return; }   // the panel can start hidden
    if (this.ok) {
      const gl = this.gl, u = this.u;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(u.u_mix, s.mix);
      gl.uniform1f(u.u_rot, s.rot);
      gl.uniform1f(u.u_side, s.side);
      gl.uniform1f(u.u_needle, s.rho);
      gl.uniform1f(u.u_dark, s.dark ? 1 : 0);
      gl.uniform1f(u.u_alpha, s.alpha ? 1 : 0);
      gl.uniform1f(u.u_px, 2 / this.disc.width);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    this.drawOverlay(s);
  }

  drawOverlay(s) {
    const c = this.ctx, U = this.unit;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.arm.width, this.arm.height);
    c.translate(this.origin.x, this.origin.y);
    const flipping = s.flipScale < 0.98;

    if (!flipping) {
      // Latitude guides: faint rings at 30 and 60 degrees.
      c.lineWidth = 1;
      c.font = `${Math.max(10, U * 0.042)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      for (const lat of [30, 60]) {
        const r = latToRho(lat) * U;
        c.strokeStyle = 'rgba(255,255,255,0.16)';
        c.setLineDash([2, 6]);
        c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
        c.setLineDash([]);
        const a = -2.36;
        const tx = Math.cos(a) * r, ty = Math.sin(a) * r;
        c.fillStyle = 'rgba(8,10,14,0.75)';
        c.fillRect(tx - U * 0.062, ty - U * 0.03, U * 0.124, U * 0.06);
        c.fillStyle = 'rgba(255,255,255,0.78)';
        c.fillText(`${lat}°${s.side > 0 ? 'N' : 'S'}`, tx, ty + 0.5);
      }

      // Paper label, turning with the record.
      c.save();
      c.rotate(s.rot);
      const lr = LABEL_R * U;
      const g = c.createRadialGradient(-lr * 0.3, -lr * 0.3, lr * 0.1, 0, 0, lr);
      g.addColorStop(0, '#5b9bff'); g.addColorStop(1, '#1b4fc4');
      c.fillStyle = g;
      c.beginPath(); c.arc(0, 0, lr, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1;
      c.beginPath(); c.arc(0, 0, lr * 0.84, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#fff';
      c.font = `700 ${lr * 0.78}px "Avenir Next", Futura, "Trebuchet MS", sans-serif`;
      c.fillText(s.side > 0 ? 'A' : 'B', lr * 0.46, lr * 0.04);
      c.restore();
      c.fillStyle = '#d9dde4';
      c.beginPath(); c.arc(0, 0, U * 0.016, 0, Math.PI * 2); c.fill();
    }

    // Reduced motion: the record stays still and a dot shows what is being read.
    if (s.readAngle !== null && s.readAngle !== undefined && s.down) {
      c.fillStyle = '#f0a271';
      c.beginPath();
      c.arc(Math.cos(s.readAngle) * s.rho * U, Math.sin(s.readAngle) * s.rho * U, U * 0.02, 0, Math.PI * 2);
      c.fill();
    }

    this.drawArm(c, U, s);
  }

  drawArm(c, U, s) {
    const st = stylus(s.rho);
    const px = PIVOT.x * U, py = PIVOT.y * U;
    const sx = st.x * U, sy = st.y * U;
    const dir = Math.atan2(sy - py, sx - px);
    const lift = s.down ? 0 : U * 0.02;      // a raised arm throws a wider shadow

    c.save();
    c.shadowColor = 'rgba(0,0,0,0.55)';
    c.shadowBlur = U * 0.03 + lift;
    c.shadowOffsetX = U * 0.012 + lift; c.shadowOffsetY = U * 0.018 + lift * 1.5;

    // Counterweight and tube.
    c.lineCap = 'round';
    c.strokeStyle = '#2a2f38'; c.lineWidth = U * 0.085;
    c.beginPath();
    c.moveTo(px - Math.cos(dir) * U * 0.16, py - Math.sin(dir) * U * 0.16);
    c.lineTo(px - Math.cos(dir) * U * 0.27, py - Math.sin(dir) * U * 0.27);
    c.stroke();
    const tube = c.createLinearGradient(px, py, px - Math.sin(dir) * U * 0.03, py + Math.cos(dir) * U * 0.03);
    tube.addColorStop(0, '#f1f3f6'); tube.addColorStop(1, '#8f97a3');
    c.strokeStyle = tube; c.lineWidth = U * 0.028;
    c.beginPath();
    c.moveTo(px - Math.cos(dir) * U * 0.16, py - Math.sin(dir) * U * 0.16);
    c.lineTo(sx - Math.cos(dir) * U * 0.07, sy - Math.sin(dir) * U * 0.07);
    c.stroke();

    // Headshell.
    c.translate(sx, sy); c.rotate(dir);
    c.fillStyle = '#39424f';
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1;
    const hw = U * 0.15, hh = U * 0.062;
    c.beginPath();
    c.roundRect(-hw + U * 0.03, -hh / 2, hw, hh, U * 0.012);
    c.fill(); c.stroke();
    c.restore();

    // Pivot.
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = U * 0.03;
    const pg = c.createRadialGradient(px - U * 0.03, py - U * 0.03, U * 0.01, px, py, U * 0.1);
    pg.addColorStop(0, '#e9edf2'); pg.addColorStop(1, '#6f7783');
    c.fillStyle = pg;
    c.beginPath(); c.arc(px, py, U * 0.095, 0, Math.PI * 2); c.fill();
    c.restore();
    c.fillStyle = '#1c2027';
    c.beginPath(); c.arc(px, py, U * 0.035, 0, Math.PI * 2); c.fill();

    // Stylus: glows while it is reading.
    const pulse = s.down ? 0.6 + 0.4 * s.pulse : 0;
    if (s.down) {
      c.fillStyle = `rgba(240,162,113,${0.22 * pulse})`;
      c.beginPath(); c.arc(sx, sy, U * (0.03 + 0.03 * s.pulse), 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = s.down ? '#f0a271' : '#c9ced6';
    c.beginPath(); c.arc(sx, sy, U * 0.014, 0, Math.PI * 2); c.fill();
  }
}
