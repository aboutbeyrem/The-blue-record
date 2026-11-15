// Sound engine. Everything is synthesized live with the Web Audio API;
// there are no recorded samples.

export const SCALES = {
  penta: { name: 'Pentatonic (musical)', steps: [0, 2, 4, 7, 9] },
  semi:  { name: 'One semitone per °C (precise)', steps: null },
  rast:  { name: 'Rast, with quarter tones (maqam)', steps: [0, 2, 3.5, 5, 7, 9, 10.5] },
};

const BASE_HZ = 130.81;   // C3: the note for the lowest value on the colorbar

/** Snap a pitch (in semitones above the base note) to the chosen scale. */
export function snap(semi, scaleId) {
  const steps = SCALES[scaleId].steps;
  if (!steps) return Math.round(semi);
  const oct = Math.floor(semi / 12);
  let best = 0, err = Infinity;
  for (let o = oct - 1; o <= oct + 1; o++) {
    for (const s of steps) {
      const cand = o * 12 + s, e = Math.abs(cand - semi);
      if (e < err) { err = e; best = cand; }
    }
  }
  return best;
}

export const semiToHz = (semi) => BASE_HZ * Math.pow(2, semi / 12);

export class Engine {
  constructor() { this.ctx = null; this.volume = 0.8; this.crackleOn = true; }

  /** Must be called from a click or key press: browsers block audio otherwise. */
  async start() {
    if (!this.ctx) this.build();
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });

    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);

    this.dry = ctx.createGain(); this.dry.gain.value = 0.9;
    this.dry.connect(this.master);

    // A small synthetic room so notes do not sound like a test tone.
    this.send = ctx.createGain(); this.send.gain.value = 0.28;
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(1.9);
    this.send.connect(verb).connect(this.master);

    this.noise = this.noiseBuffer(1.5);

    // Vinyl crackle: decoration only. It also tells you the needle is down.
    this.crackleGain = ctx.createGain(); this.crackleGain.gain.value = 0;
    const crackle = ctx.createBufferSource();
    crackle.buffer = this.crackleBuffer(4);
    crackle.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
    crackle.connect(hp).connect(this.crackleGain).connect(this.master);
    crackle.start();
  }

  impulse(seconds) {
    const { ctx } = this, n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
    }
    return buf;
  }

  noiseBuffer(seconds) {
    const { ctx } = this, n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  crackleBuffer(seconds) {
    const { ctx } = this, n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      d[i] = (Math.random() * 2 - 1) * 0.015;
      if (Math.random() < 0.00035) d[i] = (Math.random() * 2 - 1) * (0.3 + Math.random() * 0.7);
    }
    return buf;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) { this.master.gain.cancelScheduledValues(this.now); this.master.gain.setTargetAtTime(v, this.now, 0.03); this.muted = false; }
  }

  setCrackle(on) { this.crackleOn = on; }

  /** Cut everything now: every voice, the drone, the crackle, and anything already scheduled. */
  hush(restoreTo) {
    if (!this.ctx) return;
    this.needleUp(); this.glideStop(); this.droneStop();
    const now = this.now;
    if (this.master) {
      const was = this.master.gain.value;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(was, now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.05);   // drops anything queued ahead
      this.muted = true;
      // Bring the volume back once anything queued has died away, unless something new has started.
      setTimeout(() => { if (this.muted) this.setVolume(restoreTo ?? this.volume); }, 1500);
    }
  }

  /** Needle touches the record: a soft thump, then the crackle bed. */
  needleDown(time) {
    const { ctx } = this;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(110, time);
    o.frequency.exponentialRampToValueAtTime(48, time + 0.14);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.5, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
    o.connect(g).connect(this.dry);
    o.start(time); o.stop(time + 0.25);
    this.crackleGain.gain.setTargetAtTime(this.crackleOn ? 0.07 : 0, time, 0.05);
  }

  needleUp() {
    if (this.ctx) this.crackleGain.gain.setTargetAtTime(0, this.now, 0.04);
  }

  /**
   * One continuous voice for each kind of data, so every parameter has its own sound:
   *   warm     temperature: a smooth, warm tone that brightens as it gets hotter
   *   rain     rainfall: a patter of drops whose number and loudness follow the rate
   *   terrain  height of the land: a deep organ-like tone over a rumble, heavier on high ground
   *   leaf     greenness: an airy, breathy pad, with bird-like chirps where it is lush
   * Every voice glides from value to value instead of restarting, and falls silent where
   * there is nothing to read. n is the value on a 0 to 1 scale; hz is its pitch.
   */
  voiceTo(kind, time, hz, level, pan, n, stepSeconds) {
    if (!this.voices) this.voices = {};
    if (!this.voices[kind]) this.voices[kind] = this.buildVoice(kind, hz);
    const slide = Math.max(0.02, stepSeconds * 0.45);
    this.voices[kind].set(time, hz, level, pan, n, slide, stepSeconds);
    this.glide = this.voices[kind];           // kept so older code can still ask "is a voice playing?"
  }

  buildVoice(kind, hz) {
    const { ctx } = this;
    const eng = this;                 // inside the voice objects below, `this` is the voice, not the engine
    const out = ctx.createGain(); out.gain.value = 0;
    const panner = ctx.createStereoPanner();
    out.connect(panner); panner.connect(this.dry); panner.connect(this.send);
    const stoppers = [];
    const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); stoppers.push(o); return o; };
    const noise = () => { const b = ctx.createBufferSource(); b.buffer = this.noise; b.loop = true; b.start(); stoppers.push(b); return b; };
    const at = (param, v, t, k) => param.setTargetAtTime(v, t, k);
    const common = { out, panner, stop: null };

    if (kind === 'rain') {
      const bed = ctx.createBiquadFilter(); bed.type = 'bandpass'; bed.frequency.value = 3400; bed.Q.value = 0.6;
      const bg = ctx.createGain(); bg.gain.value = 0;
      noise().connect(bed).connect(bg).connect(out);
      out.gain.value = 1;
      return {
        ...common, o1: stoppers[0], g: bg,
        set(t, _hz, level, pan, n, slide, step) {
          at(bg.gain, 0.05 + 0.34 * Math.pow(n, 0.8) * level, t, slide);
          at(panner.pan, pan, t, slide);
          const drops = Math.max(1, Math.round((1 + n * 8) * (step / 0.14)));
          for (let k = 0; k < drops; k++) {
            const when = t + Math.random() * step;
            const o = ctx.createOscillator(); o.type = 'sine';
            const f = 1500 + Math.random() * (1700 + 900 * n);
            o.frequency.setValueAtTime(f, when); o.frequency.exponentialRampToValueAtTime(f * 0.62, when + 0.05);
            const g = ctx.createGain();
            const peak = (0.05 + 0.2 * n) * (0.4 + Math.random() * 0.6);
            g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(peak, when + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05 + Math.random() * 0.05);
            const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan + (Math.random() - 0.5) * 0.5));
            o.connect(g).connect(p); p.connect(eng.dry); p.connect(eng.send);
            o.start(when); o.stop(when + 0.13);
          }
        },
        rest(t, fade) { at(bg.gain, 0, t, fade); },
        stop: () => stoppers,
      };
    }

    if (kind === 'terrain') {
      const body = ctx.createGain(); body.gain.value = 1;
      const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.Q.value = 1.6; low.frequency.value = 300;
      const saw = osc('sawtooth', hz * 0.5), sub = osc('sine', hz * 0.25), fifth = osc('triangle', hz * 0.75);
      const subG = ctx.createGain(); subG.gain.value = 0.8; const fifthG = ctx.createGain(); fifthG.gain.value = 0.18;
      saw.connect(low); sub.connect(subG).connect(low); fifth.connect(fifthG).connect(low);
      low.connect(body).connect(out);
      const rumbleLP = ctx.createBiquadFilter(); rumbleLP.type = 'lowpass'; rumbleLP.frequency.value = 130;
      const rumbleG = ctx.createGain(); rumbleG.gain.value = 0;
      noise().connect(rumbleLP).connect(rumbleG).connect(out);
      return {
        ...common, o1: saw, g: out,
        set(t, f, level, pan, n, slide) {
          for (const [o, m] of [[saw, 0.5], [sub, 0.25], [fifth, 0.75]]) at(o.frequency, f * m, t, slide);
          at(low.frequency, 200 + 1300 * n, t, slide);
          at(out.gain, level * 0.42, t, slide);
          at(rumbleG.gain, (0.12 + 0.5 * n) * level, t, slide);
          at(panner.pan, pan, t, slide);
        },
        rest(t, fade) { at(out.gain, 0, t, fade); at(rumbleG.gain, 0, t, fade); },
        stop: () => stoppers,
      };
    }

    if (kind === 'leaf') {
      const o1 = osc('triangle', hz), o2 = osc('triangle', hz * 1.006), o3 = osc('sine', hz * 2);
      const o3g = ctx.createGain(); o3g.gain.value = 0.16;
      const air = ctx.createBiquadFilter(); air.type = 'lowpass'; air.Q.value = 0.5; air.frequency.value = 1800;
      o1.connect(air); o2.connect(air); o3.connect(o3g).connect(air);
      const pad = ctx.createGain(); pad.gain.value = 1; air.connect(pad).connect(out);
      const lfo = osc('sine', 5.2), lfoG = ctx.createGain(); lfoG.gain.value = 0.18; lfo.connect(lfoG).connect(pad.gain);
      const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 2600; band.Q.value = 0.9;
      const breath = ctx.createGain(); breath.gain.value = 0;
      noise().connect(band).connect(breath).connect(out);
      return {
        ...common, o1, g: out,
        set(t, f, level, pan, n, slide, step) {
          at(o1.frequency, f, t, slide); at(o2.frequency, f * 1.006, t, slide); at(o3.frequency, f * 2, t, slide);
          at(air.frequency, 900 + 2800 * n, t, slide);
          at(out.gain, level * 0.26, t, slide);
          at(breath.gain, 0.02 + 0.1 * n * level, t, slide);
          at(panner.pan, pan, t, slide);
          // Lush places get bird-like chirps; bare ground gets none.
          if (n > 0.42 && Math.random() < (n - 0.4) * 0.5 * (step / 0.14)) {
            const when = t + Math.random() * step;
            const o = ctx.createOscillator(); o.type = 'sine';
            const f0 = 2500 + Math.random() * 700;
            o.frequency.setValueAtTime(f0, when); o.frequency.exponentialRampToValueAtTime(f0 * (1.25 + Math.random() * 0.25), when + 0.07);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(0.07, when + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.11);
            const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan + (Math.random() - 0.5) * 0.7));
            o.connect(g).connect(p); p.connect(eng.dry); p.connect(eng.send);
            o.start(when); o.stop(when + 0.15);
          }
        },
        rest(t, fade) { at(out.gain, 0, t, fade); at(breath.gain, 0, t, fade); },
        stop: () => stoppers,
      };
    }

    // warm: temperature
    const o1 = osc('triangle', hz), o2 = osc('sine', hz * 2);
    const g2 = ctx.createGain(); g2.gain.value = 0.18;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.7; f.frequency.value = 1200;
    o1.connect(f); o2.connect(g2).connect(f); f.connect(out);
    return {
      ...common, o1, g: out,
      set(t, hz2, level, pan, n, slide) {
        at(o1.frequency, hz2, t, slide); at(o2.frequency, hz2 * 2, t, slide);
        at(f.frequency, 700 + 3600 * n, t, slide);
        at(out.gain, level * 0.3, t, slide);
        at(panner.pan, pan, t, slide);
      },
      rest(t, fade) { at(out.gain, 0, t, fade); },
      stop: () => stoppers,
    };
  }

  glideTo(time, hz, level, pan, bright, stepSeconds) { this.voiceTo('warm', time, hz, level, pan, bright, stepSeconds); }

  /** Nothing to read under the needle: every voice fades to silence. */
  glideRest(time, stepSeconds) {
    if (!this.voices) return;
    const fade = Math.max(0.02, stepSeconds * 0.3);
    for (const v of Object.values(this.voices)) v.rest(time, fade);
  }

  /** Needle lifted: stop every voice. */
  glideStop() {
    if (!this.voices) return;
    const now = this.now;
    for (const v of Object.values(this.voices)) {
      v.out.gain.cancelScheduledValues(now);
      v.out.gain.setTargetAtTime(0, now, 0.03);
      for (const o of v.stop()) { try { o.stop(now + 0.3); } catch { /* already stopped */ } }
    }
    this.voices = {};
    this.glide = null;
  }

  /** One plucked note. bright is 0..1 and opens the filter. */
  note(time, hz, level, seconds, pan, bright) {
    const { ctx } = this;
    const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = hz;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = hz * 2.003;
    const g2 = ctx.createGain(); g2.gain.value = 0.22;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.8;
    f.frequency.value = 700 + bright * 4200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, level * 0.42), time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + seconds);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    o1.connect(f); o2.connect(g2).connect(f);
    f.connect(g).connect(p);
    p.connect(this.dry); p.connect(this.send);
    o1.start(time); o2.start(time);
    o1.stop(time + seconds + 0.05); o2.stop(time + seconds + 0.05);
  }

  /** Held low note for one whole spin: the average around the latitude. */
  drone(time, hz, seconds) {
    const { ctx } = this;
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = hz;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = hz * 1.002;
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.11, time + 0.25);
    g.gain.setValueAtTime(0.11, time + Math.max(0.3, seconds - 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, time + seconds + 0.15);
    o1.connect(g); o2.connect(g2).connect(g);
    g.connect(this.dry); g.connect(this.send);
    o1.start(time); o2.start(time);
    o1.stop(time + seconds + 0.25); o2.stop(time + seconds + 0.25);
    this.droneVoice = { o1, o2, g };
  }

  /** Needle lifted: cut the drone short instead of letting the spin finish. */
  droneStop() {
    if (!this.droneVoice) return;
    const { o1, o2, g } = this.droneVoice, now = this.now;
    g.gain.cancelScheduledValues(now);
    g.gain.setTargetAtTime(0, now, 0.04);
    try { o1.stop(now + 0.35); o2.stop(now + 0.35); } catch { /* already ended */ }
    this.droneVoice = null;
  }

  /** Lightning: a crack of noise plus a short low thump. strength is 0..1. */
  strike(time, strength, pan) {
    const { ctx } = this;
    const len = 0.07 + 0.42 * strength;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass';
    hp.frequency.value = 2600 - 1700 * strength;   // bigger storms sound deeper
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.16 + 0.55 * strength, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + len);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(hp).connect(g).connect(p);
    p.connect(this.dry); p.connect(this.send);
    src.start(time, Math.random() * 0.5); src.stop(time + len + 0.05);

    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(190, time);
    o.frequency.exponentialRampToValueAtTime(70, time + 0.16);
    og.gain.setValueAtTime(0.0001, time);
    og.gain.exponentialRampToValueAtTime(0.1 + 0.4 * strength, time + 0.006);
    og.gain.exponentialRampToValueAtTime(0.0001, time + 0.12 + 0.25 * strength);
    o.connect(og).connect(p);
    o.start(time); o.stop(time + 0.5);
  }

  /**
   * The Mars bling: a bright two-step chime with a sparkle on top, quick to
   * decay so it never hides the data underneath.
   */
  bling(time) {
    const { ctx } = this;
    const out = ctx.createGain();
    out.gain.value = 0.55;
    out.connect(this.dry); out.connect(this.send);
    const notes = [[1318.5, 0, 0.9], [1975.5, 0.09, 0.8], [2637.0, 0.19, 0.7], [3951.1, 0.19, 0.28]];
    for (const [hz, delay, level] of notes) {
      const t = time + delay;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = hz * 2.01;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32 * level, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
      const g2 = ctx.createGain(); g2.gain.value = 0.18;
      o.connect(g); o2.connect(g2).connect(g); g.connect(out);
      o.start(t); o2.start(t); o.stop(t + 1.0); o2.stop(t + 1.0);
    }
  }

  /** A soft tap: land with no lightning. Gives a sense of where you are. */
  tap(time, pan) {
    const { ctx } = this;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 520;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.05, time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    o.connect(g).connect(p).connect(this.dry);
    o.start(time); o.stop(time + 0.08);
  }
}

/** One audio engine for the whole page, so the two modes never fight over the speakers. */
export const engine = new Engine();

/** Tell the page around us (the project website) that this app is making sound, so it can stop the video. */
export function announcePlaying() {
  try { if (window.parent !== window) window.parent.postMessage({ type: 'blue-record-audio' }, window.location.origin); } catch { /* not in a frame */ }
}
