import { RECORDS, loadRecordData, sleeveArt } from './records.js';
import { Reader, BINS, BIN_DEG } from './reader.js';
import { engine, announcePlaying, SCALES, snap, semiToHz } from './audio.js';
import { Turntable, needleLon, stylus, latToRho, rhoToLat, LABEL_R } from './turntable.js';
import { oceanName, landName, fmtLat, sayLat, fmtDate, shortDate } from './geo.js';
import { loadPlaces, ready as placesReady, describe as describePlace } from './placedata.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const LAT_MIN = 2.5, LAT_MAX = 80, LAT_STEP = 2.5;
const SEMITONES = 32;      // pitch range; for sea temperature that is 1 semitone per °C
const LOOKAHEAD = 0.14;    // seconds of sound scheduled ahead of the clock

const S = {
  record: null, data: null, images: [],
  side: 1, lat: 37.5, playing: false,
  period: 4.8, stride: 1, scale: 'penta',
  smooth: true,      // one continuous tone (true) or separate notes (false)
  frame: 0,          // frame the needle is reading
  shownFrame: 0,     // frame on screen
  rot: 0, rotAnchor: 0, timeAnchor: 0,
  stepCount: 0, nextStep: 0,
  queue: [],         // steps that have been scheduled but not shown yet
  last: null,
  pulse: 0, mix: 0, fadeStart: 0, fading: false,
  flipScale: 1, flipStart: 0, flipping: false, flipDone: false,
  drone: true, voice: true, haptics: true,
  year: null, yearToken: 0, chartDirty: true,
};

const reader = new Reader();
const table = new Turntable($('plinth'), $('disc'), $('arm'), $('platter'), $('flipper'));
let timer = null;

const signedLat = () => S.side * S.lat;
const rotAt = (t) => S.rotAnchor + 2 * Math.PI * (t - S.timeAnchor) / S.period;
const profileFor = (frame) => reader.profile(S.record, S.data, frame, S.images[frame], signedLat());

// ---------------------------------------------------------------- records

function buildCrate() {
  const list = $('crateList');
  RECORDS.forEach((rec, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sleeve';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', 'false');
    b.tabIndex = i === 0 ? 0 : -1;
    b.dataset.index = i;
    b.innerHTML = `
      <span class="sleeve-art" style="background-image:url('${sleeveArt(rec)}')" aria-hidden="true"></span>
      <span class="sleeve-text">
        <span class="sleeve-num" aria-hidden="true">${i + 1}</span>
        <span class="sleeve-title">${rec.title}${rec.live ? ` <span class="live-tag">${rec.live.cadence === 'static' ? 'From NASA' : 'Live from NASA'}</span>` : ''}</span>
        <span class="sleeve-sub">${rec.subtitle}</span>
      </span>`;
    b.addEventListener('click', () => loadRecord(i));
    list.appendChild(b);
  });
  list.addEventListener('keydown', (e) => {
    const dir = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!dir) return;
    e.preventDefault(); e.stopPropagation();
    const cur = RECORDS.indexOf(S.record);
    const next = (cur + dir + RECORDS.length) % RECORDS.length;
    loadRecord(next).then(() => list.children[next].focus());
  });
}

/**
 * Load frames a few at a time, retrying failures. Asking for a hundred images
 * at once makes small servers and weak Wi-Fi drop connections.
 */
async function loadImages(urls, onProgress, crossOrigin) {
  const images = new Array(urls.length);
  let next = 0, done = 0;
  const loadOne = async (url) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const img = new Image();
        if (crossOrigin) img.crossOrigin = 'anonymous';   // needed to read pixels of NASA's images
        img.src = attempt ? `${url}${url.includes('?') ? '&' : '?'}retry=${attempt}` : url;
        await img.decode();
        return img;
      } catch (err) {
        if (attempt >= 3) throw new Error(`could not load ${url}`);
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
  };
  const worker = async () => {
    while (next < urls.length) {
      const i = next++;
      images[i] = await loadOne(urls[i]);
      onProgress(++done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return images;
}

async function loadRecord(index) {
  const rec = RECORDS[index];
  if (rec === S.record) return;
  pause();
  const loading = $('loading');
  loading.hidden = false;
  loading.textContent = 'Pressing the record…';
  $('playBtn').disabled = true;
  try {
    const data = await loadRecordData(rec);
    const images = await loadImages(
      data.frames.map((f) => f.url),
      (done, total) => { loading.textContent = `${rec.live ? 'Asking NASA' : 'Pressing the record'}… ${done} of ${total}`; },
      Boolean(rec.live));
    const start = data.startFrame ?? 0;
    Object.assign(S, { record: rec, data, images, frame: start, shownFrame: start, last: null, mix: 0, fading: false, year: null });
  } catch (err) {
    console.error(err);
    loading.textContent = location.protocol === 'file:'
      ? 'This page has to be opened through a web server. In the blue-record folder run: python3 -m http.server'
      : rec.live
        ? 'NASA’s live service did not answer. Check the internet connection and try again. The other records work offline.'
        : `Could not load this record. ${err.message}`;
    if (S.record) {
      // Keep playing the record that is already on the turntable.
      setTimeout(() => { loading.hidden = true; $('playBtn').disabled = false; }, 5000);
    } else if (rec.live) {
      const offline = RECORDS.findIndex((r) => !r.live);
      if (offline >= 0) loadRecord(offline);
    }
    return;
  }
  loading.hidden = true;
  $('playBtn').disabled = false;

  [...$('crateList').children].forEach((b, i) => {
    b.setAttribute('aria-checked', String(i === index));
    b.tabIndex = i === index ? 0 : -1;
  });

  table.setFrame(0, S.images[S.frame]);
  table.setFrame(1, S.images[S.frame]);

  const stride = $('stride');
  stride.innerHTML = rec.strides.map((s) => `<option value="${s.frames}">${s.label}</option>`).join('');
  S.stride = rec.strides[0].frames;
  stride.disabled = rec.strides.length < 2;
  const semi = $('scale').querySelector('option[value="semi"]');
  if (semi && rec.words) semi.textContent = rec.words.semitone;
  syncSoundFields();
  $('chart').hidden = S.data.frames.length < 2;   // a single map has no change through time to draw
  $('drone').closest('label').hidden = rec.kind !== 'value';

  $('liner').innerHTML = rec.liner.map((p) => `<p>${p}</p>`).join('')
    + (rec.legend ? `<img class="colorbar" src="${rec.legend.src}" alt="${rec.legend.alt}">` : '')
    + `<p class="fine">Source: <a href="${rec.sourceUrl}" target="_blank" rel="noopener">${rec.source}</a>. ${rec.credit}</p>`;
  $('helpMapping').innerHTML = `<strong>The sound is the data.</strong> ${rec.mapping}`;
  $('chartTitle').textContent = 'This latitude through time';
  $('credit').innerHTML = `Now playing: <a href="${rec.sourceUrl}" target="_blank" rel="noopener">${rec.source}</a>. ${rec.credit}`;

  refreshStatic();
  computeYear();
  announce(`${rec.title}. ${rec.subtitle}. ${rec.mapping}`, false);
}

// --------------------------------------------------------------- playback

async function play() {
  if (!S.record || S.playing) return;
  await engine.start();
  announcePlaying();
  const t = engine.now + 0.08;
  Object.assign(S, { playing: true, timeAnchor: t, rotAnchor: S.rot, nextStep: t, stepCount: 0 });
  S.queue.length = 0;
  engine.setCrackle($('crackle').checked);
  engine.needleDown(t);
  timer = setInterval(schedule, 25);
  schedule();
  syncPlayButton();
}

function pause() {
  if (!S.playing) return;
  S.rot = rotAt(engine.now);
  S.playing = false;
  clearInterval(timer);
  S.queue.length = 0;
  engine.needleUp();
  engine.glideStop();
  engine.droneStop();
  syncPlayButton();
}

const toggle = () => (S.playing ? pause() : play());

/** Which sound settings apply to the record on the turntable. */
function syncSoundFields() {
  const isValue = S.record && S.record.kind === 'value';
  $('toneField').hidden = !isValue;
  $('scaleField').hidden = !isValue || S.smooth;   // scales only apply to separate notes
}

function syncPlayButton() {
  const b = $('playBtn');
  b.setAttribute('aria-pressed', String(S.playing));
  b.classList.toggle('is-playing', S.playing);
  $('playLabel').textContent = S.playing ? 'Lift the needle' : 'Drop the needle';
}

/** Schedule every step that falls inside the lookahead window. */
function schedule() {
  const now = engine.now;
  if (S.nextStep < now - 0.05) S.nextStep = now + 0.02;   // we were asleep: skip ahead
  const dur = S.period / BINS;
  while (S.playing && S.nextStep < now + LOOKAHEAD) {
    const t = S.nextStep;
    const first = S.stepCount % BINS === 0;
    if (first && S.stepCount > 0 && S.stride) {
      S.frame = (S.frame + S.stride) % S.images.length;
    }
    const lon = needleLon(rotAt(t), latToRho(S.lat), S.side);
    const prof = profileFor(S.frame);
    const bin = clamp(Math.floor((lon + 180) / BIN_DEG), 0, BINS - 1);
    const step = prof.steps[bin];
    if (first) startSpin(t, prof);
    const level = sound(t, step, lon, dur);
    S.queue.push({ t, lon, bin, step, prof, frame: S.frame, lat: signedLat(), level });
    S.stepCount++;
    S.nextStep = t + dur;
  }
}

/** Normalised position of a value on the record's scale, 0..1. */
function norm(v) {
  const lo = S.data.valueMin, hi = S.data.valueMax, curve = S.record.curve;
  if (curve === 'log') return clamp(Math.log(Math.max(v, lo) / lo) / Math.log(hi / lo), 0, 1);
  const n = clamp((v - lo) / (hi - lo), 0, 1);
  return curve === 'sqrt' ? Math.sqrt(n) : n;
}
const pitchOf = (v) => snap(norm(v) * SEMITONES, S.scale);
const strengthOf = (hits) => clamp(Math.log2(1 + hits) / Math.log2(1 + S.data.eventRef), 0.06, 1);

function startSpin(t, prof) {
  if (S.record.kind === 'value' && S.drone && prof.mean !== null) {
    engine.drone(t, semiToHz(pitchOf(prof.mean) - 12), S.period);
  }
}

/** Turn one step into sound. Returns how strongly it sounded, 0..1. */
function sound(t, step, lon, dur) {
  const pan = Math.sin(lon * Math.PI / 180) * 0.8;   // east to the right, west to the left
  if (S.record.kind === 'value') {
    if (step.value === null) {                       // nothing to read here: silence
      if (S.smooth) engine.glideRest(t, dur);
      return 0;
    }
    const n = norm(step.value);
    if (S.smooth) {
      // Pitch follows the exact value and loudness follows it too: higher is louder.
      engine.voiceTo(S.record.voice || 'warm', t, semiToHz(n * SEMITONES), (0.3 + 0.7 * n) * (0.5 + 0.5 * step.cover), pan, n, dur);
    } else {
      engine.note(t, semiToHz(pitchOf(step.value)), 0.45 + 0.55 * step.cover, Math.max(0.3, dur * 2.6), pan, n);
    }
    return 0.35 + 0.65 * n;
  }
  if (step.value > 0) {
    const s = strengthOf(step.value);
    engine.strike(t, s, pan);
    return s;
  }
  if (step.land) engine.tap(t, pan);
  return 0;
}

// ---------------------------------------------------------------- describe

function maskSaysLand(lat, lon) {
  const mask = S.data.landMask;
  if (!mask) return null;
  const row = clamp(Math.floor(90 - lat), 0, 179), col = clamp(Math.floor(lon + 180), 0, 359);
  return mask[row][col] === '1';
}

/** Where the needle is, and whether the record has a reading there. */
function placeOf(e) {
  const rec = S.record;
  const masked = maskSaysLand(e.lat, e.lon);
  let isLand;
  if (rec.kind !== 'value') isLand = e.step.land;
  else if (rec.words.quiet === 'land') isLand = e.step.value === null && masked !== false;
  else if (rec.words.quiet === 'sea') isLand = e.step.value !== null;
  else isLand = masked === true;
  if (placesReady()) {
    // Real names from Natural Earth: the country or sea, and the nearest city.
    const d = describePlace(e.lat, e.lon);
    return { isLand: d.kind === 'land', name: d.name, where: d.where };
  }
  return { isLand, name: isLand ? landName(e.lat, e.lon) : oceanName(e.lat, e.lon) };
}

const fmtValue = (v) => `${v.toFixed(S.record.words.decimals)} ${S.record.words.unit}`;

/** Why the record is silent at this step, for the readout and for speech. */
function quietReason(place) {
  const w = S.record.words;
  if (w.quiet === 'land' && !place.isLand) {
    return { label: 'no reading (sea ice or a gap), so silence', say: 'There is no reading here, probably sea ice, so the record is silent.' };
  }
  return { label: w.quietLabel, say: w.quietSay };
}

function activityWord(hits) {
  if (!hits) return 'none';
  const s = strengthOf(hits);
  return s > 0.66 ? 'strong' : s > 0.33 ? 'moderate' : 'light';
}

/** What is under the needle right now, as an event like the scheduler makes. */
function hereNow() {
  if (S.playing && S.last) return S.last;
  const lon = needleLon(S.rot, latToRho(S.lat), S.side);
  const prof = profileFor(S.frame);
  const bin = clamp(Math.floor((lon + 180) / BIN_DEG), 0, BINS - 1);
  return { lon, bin, step: prof.steps[bin], prof, frame: S.frame, lat: signedLat() };
}

function refreshReadout(e) {
  const rec = S.record, place = placeOf(e);
  let under, mean;
  if (rec.kind === 'value') {
    under = e.step.value === null
      ? `${cap(place.where || place.name)} · ${quietReason(place).label}`
      : `${cap(place.where || place.name)} · ${fmtValue(e.step.value)}`;
    mean = e.prof.mean === null
      ? rec.words.none
      : `${fmtValue(e.prof.mean)} on average · ${Math.round(e.prof.share * 100)}% ${rec.words.share}`;
  } else {
    under = `${cap(place.where || place.name)} · lightning: ${activityWord(e.step.value)}`;
    mean = `Lightning activity ${e.prof.mean} (yellow pixels counted)`;
  }
  $('npUnder').textContent = under;
  $('npMean').textContent = mean;
}

/** Label of a frame: a calendar date if the record has one, else its season. */
const frameLabel = (i) => { const f = S.data.frames[i]; return f.date ? fmtDate(f.date) : f.label; };
const frameShort = (i) => { const f = S.data.frames[i]; return f.date ? shortDate(f.date) : f.short; };

const cap = (s) => s.replace(/^the /, '').replace(/^./, (c) => c.toUpperCase());

/** Readouts that only change with record, side, latitude or frame. */
function refreshStatic() {
  if (!S.record) return;
  const lat = signedLat();
  $('npTitle').textContent = `${S.record.title} · Side ${S.side > 0 ? 'A' : 'B'}`;
  $('npDate').textContent = frameLabel(S.shownFrame);
  $('npLat').textContent = fmtLat(lat);
  $('lat').value = S.lat;
  $('lat').setAttribute('aria-valuetext', sayLat(lat));
  $('flipBtn').textContent = S.side > 0 ? 'Flip to Side B' : 'Flip to Side A';
  $('stripNote').textContent = `${fmtLat(lat)}, unrolled from west to east. The amber line is the needle.`;
  refreshReadout(hereNow());
  S.chartDirty = true;
}

function whereAmI() {
  if (!S.record) return;
  const e = hereNow(), rec = S.record, place = placeOf(e);
  const parts = [
    `Side ${S.side > 0 ? 'A' : 'B'}.`,
    `Needle at ${sayLat(e.lat)}, ${Math.abs(e.lon).toFixed(0)} degrees ${e.lon >= 0 ? 'east' : 'west'}, over ${place.where || place.name}.`,
    `${frameLabel(e.frame)}.`,
  ];
  if (rec.kind === 'value') {
    parts.push(e.step.value === null ? quietReason(place).say : rec.words.valueSay(e.step.value));
    if (e.prof.mean !== null) parts.push(rec.words.meanSay(e.prof.mean));
  } else {
    parts.push(`Lightning here: ${activityWord(e.step.value)}.`);
  }
  announce(parts.join(' '), true);
}

let voiceTimer = null;
function announce(text, speak) {
  const live = $('live');
  live.textContent = '';
  requestAnimationFrame(() => { live.textContent = text; });
  if (!speak || !S.voice || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US'; u.rate = 1.02;
  const restore = () => { clearTimeout(voiceTimer); engine.setVolume(Number($('volume').value)); };
  u.onend = restore; u.onerror = restore;
  engine.setVolume(Number($('volume').value) * 0.25);   // duck the music under the voice
  voiceTimer = setTimeout(restore, 20000);
  speechSynthesis.speak(u);
}

// ------------------------------------------------------------ state changes

function setLat(lat, quiet) {
  lat = clamp(Math.round(lat / LAT_STEP) * LAT_STEP, LAT_MIN, LAT_MAX);
  if (lat === S.lat) return;
  S.lat = lat;
  refreshStatic();
  computeYear();
  if (!quiet) announce(`Tonearm at ${sayLat(signedLat())}.`, false);
}

function flip() {
  if (S.flipping || !S.record) return;
  if (reducedMotion.matches) { S.side = -S.side; afterFlip(); return; }
  Object.assign(S, { flipping: true, flipDone: false, flipStart: performance.now() });
}

function afterFlip() {
  refreshStatic();
  computeYear();
  announce(S.side > 0 ? 'Side A. The northern hemisphere.' : 'Side B. The southern hemisphere.', true);
}

// -------------------------------------------------------------------- chart

/** Mean of this latitude in every frame: the curve the melody follows. */
async function computeYear() {
  if (!S.record) return;
  const token = ++S.yearToken;
  await new Promise((r) => setTimeout(r, 120));          // wait for the drag to settle
  if (token !== S.yearToken) return;
  const values = [];
  for (let f = 0; f < S.images.length; f++) {
    values.push(profileFor(f).mean);
    if (f % 6 === 5) {
      await new Promise((r) => setTimeout(r, 0));        // keep the sound scheduler fed
      if (token !== S.yearToken) return;
    }
  }
  S.year = values;
  S.chartDirty = true;

  const rec = S.record, dates = S.data.frames.map((f, i) => frameShort(i));
  const known = values.map((v, i) => [v, i]).filter(([v]) => v !== null);
  let note;
  if (!known.length) {
    note = `${rec.words ? rec.words.none : 'No data'} (${fmtLat(signedLat())}).`;
  } else {
    const hi = known.reduce((a, b) => (b[0] > a[0] ? b : a));
    const lo = known.reduce((a, b) => (b[0] < a[0] ? b : a));
    note = rec.kind !== 'value'
      ? null
      : values.length === 1
        ? `${rec.chartLabel}: ${fmtValue(hi[0])} at ${fmtLat(signedLat())}. This record is a single map, so it does not change through time.`
        : `${rec.chartLabel}. At ${fmtLat(signedLat())} it runs from ${fmtValue(lo[0])} around ${dates[lo[1]]} to ${fmtValue(hi[0])} around ${dates[hi[1]]}.`;
    note = note
      ?? `${rec.chartLabel}. At ${fmtLat(signedLat())} its loudest moment is in ${dates[hi[1]]}${lo[0] === 0 && dates[lo[1]] !== dates[hi[1]] ? ', and it falls silent in ' + dates[lo[1]] : ''}.`;
  }
  $('chartNote').textContent = note;
}

function drawChart() {
  const cv = $('chart'), dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w) return;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const vals = S.year;
  if (!vals || vals.length !== S.data.frames.length) return;   // still computing
  const known = vals.filter((v) => v !== null);
  const isValue = S.record.kind === 'value';
  const unit = isValue ? S.record.words.unit : '';
  const padL = 34 + unit.length * 7, padR = 10, padT = 10, padB = 20;
  const pw = w - padL - padR, ph = h - padT - padB;
  c.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
  c.fillStyle = '#9aa3c7';
  if (!known.length) { c.textAlign = 'center'; c.fillText('No data at this latitude', w / 2, h / 2); return; }

  let lo = Math.min(...known), hi = Math.max(...known);
  if (isValue) {
    // Round the axis outward to a tidy step that suits the size of the numbers.
    const step = hi - lo > 400 ? 500 : hi - lo > 40 ? 50 : hi - lo > 4 ? 1 : 0.5;
    lo = Math.max(unit === '°C' ? -5 : 0, Math.floor((lo - step / 2) / step) * step);
    hi = Math.ceil((hi + step / 2) / step) * step;
  } else { lo = 0; hi = Math.max(1, hi); }
  const X = (i) => padL + (vals.length > 1 ? i / (vals.length - 1) : 0.5) * pw;
  const Y = (v) => padT + (1 - (v - lo) / (hi - lo)) * ph;

  c.strokeStyle = 'rgba(255,255,255,0.10)'; c.lineWidth = 1;
  c.textAlign = 'right'; c.textBaseline = 'middle';
  for (const v of [lo, (lo + hi) / 2, hi]) {
    c.beginPath(); c.moveTo(padL, Y(v)); c.lineTo(w - padR, Y(v)); c.stroke();
    c.fillText(isValue ? `${Number.isInteger(v) ? v : v.toFixed(v * 2 % 1 ? 2 : 1)} ${unit}` : String(Math.round(v)), padL - 6, Y(v));
  }
  c.textBaseline = 'alphabetic';
  [[0, 'left'], [Math.floor((vals.length - 1) / 2), 'center'], [vals.length - 1, 'right']].forEach(([i, align]) => {
    c.textAlign = align; c.fillText(frameShort(i), X(i), h - 5);
  });

  // The curve, with gaps where there is no data.
  c.strokeStyle = '#c8d0e7'; c.lineWidth = 2; c.lineJoin = 'round';
  c.beginPath();
  let pen = false;
  vals.forEach((v, i) => {
    if (v === null) { pen = false; return; }
    if (pen) c.lineTo(X(i), Y(v)); else c.moveTo(X(i), Y(v));
    pen = true;
  });
  c.stroke();

  // Where the record is now.
  const cur = vals[S.shownFrame];
  c.strokeStyle = 'rgba(240,162,113,0.5)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(X(S.shownFrame), padT); c.lineTo(X(S.shownFrame), padT + ph); c.stroke();
  if (cur !== null && cur !== undefined) {
    c.fillStyle = '#f0a271';
    c.beginPath(); c.arc(X(S.shownFrame), Y(cur), 4, 0, Math.PI * 2); c.fill();
  }
}

function drawStrip() {
  const cv = $('strip'), dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !S.record) return;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const img = S.images[S.shownFrame];
  const [y0, y1] = reader.bandRows(signedLat(), img.naturalHeight);
  c.imageSmoothingEnabled = true;
  c.fillStyle = '#05070b';
  c.fillRect(0, 0, w, h);
  c.drawImage(img, 0, y0, img.naturalWidth, y1 - y0, 0, 0, w, h);
  const e = hereNow();
  const x = (e.lon + 180) / 360 * w;
  c.fillStyle = 'rgba(240,162,113,0.25)';
  c.fillRect(x - w / BINS / 2, 0, w / BINS, h);
  c.fillStyle = '#f0a271';
  c.fillRect(x - 1, 0, 2, h);
}

// --------------------------------------------------------------- animation

function frame(nowMs) {
  if (document.body.dataset.mode !== 'record') { requestAnimationFrame(frame); return; }   // the other mode is showing
  const audioNow = engine.ctx ? engine.now : 0;
  if (S.playing) S.rot = rotAt(audioNow);

  // Show the steps whose sound has just started.
  while (S.queue.length && S.queue[0].t <= audioNow) {
    const e = S.queue.shift();
    S.last = e;
    if (e.level > 0) {
      S.pulse = Math.max(S.pulse, e.level);
      if (S.haptics && navigator.vibrate) navigator.vibrate(Math.round(8 + 32 * e.level));
    }
    if (e.frame !== S.shownFrame) {
      S.shownFrame = e.frame;
      table.setFrame(1, S.images[e.frame]);
      Object.assign(S, { fading: true, fadeStart: nowMs });
      $('npDate').textContent = frameLabel(e.frame);
      S.chartDirty = true;
    }
    refreshReadout(e);
  }

  if (S.fading) {
    S.mix = Math.min(1, (nowMs - S.fadeStart) / 380);
    if (S.mix >= 1) { table.setFrame(0, S.images[S.shownFrame]); S.mix = 0; S.fading = false; }
  }

  if (S.flipping) {
    const k = (nowMs - S.flipStart) / 460;
    if (k >= 0.5 && !S.flipDone) { S.side = -S.side; S.flipDone = true; afterFlip(); }
    S.flipScale = Math.abs(Math.cos(Math.min(1, k) * Math.PI));
    if (k >= 1) { S.flipping = false; S.flipScale = 1; }
    $('flipper').style.transform = `scaleX(${Math.max(0.02, S.flipScale)})`;
  }

  S.pulse *= 0.88;
  const still = reducedMotion.matches;
  table.draw({
    rot: still ? 0 : S.rot, side: S.side, rho: latToRho(S.lat), mix: S.mix,
    dark: S.record ? S.record.kind === 'events' : false,
    alpha: S.record ? Boolean(S.record.live) : false,
    down: S.playing, pulse: S.pulse, flipScale: S.flipScale,
    readAngle: still ? stylus(latToRho(S.lat)).angle - S.rot : null,
  });
  if (S.record) drawStrip();
  if (S.chartDirty) { drawChart(); S.chartDirty = false; }
  requestAnimationFrame(frame);
}

// ----------------------------------------------------------------- controls

function wire() {
  $('playBtn').addEventListener('click', toggle);
  $('flipBtn').addEventListener('click', flip);
  $('whereBtn').addEventListener('click', whereAmI);
  $('lat').addEventListener('input', (e) => setLat(Number(e.target.value), true));
  document.querySelectorAll('.presets button').forEach((b) =>
    b.addEventListener('click', () => {
      // Tunis is in the north, so that preset always plays Side A.
      if (b.textContent.startsWith('Tunis') && S.side < 0) { S.side = 1; refreshStatic(); computeYear(); }
      setLat(Number(b.dataset.lat));
    }));

  document.querySelectorAll('input[name="speed"]').forEach((r) =>
    r.addEventListener('change', () => {
      if (S.playing) { const now = engine.now; S.rotAnchor = rotAt(now); S.timeAnchor = now; }
      S.period = Number(r.value);
    }));
  $('stride').addEventListener('change', (e) => { S.stride = Number(e.target.value); });
  const scale = $('scale');
  scale.innerHTML = Object.entries(SCALES).map(([id, s]) => `<option value="${id}">${s.name}</option>`).join('');
  scale.addEventListener('change', (e) => { S.scale = e.target.value; });
  $('tone').addEventListener('change', (e) => {
    S.smooth = e.target.value === 'smooth';
    if (!S.smooth && engine.ctx) engine.glideStop();
    syncSoundFields();
  });
  $('volume').addEventListener('input', (e) => engine.setVolume(Number(e.target.value)));
  $('drone').addEventListener('change', (e) => { S.drone = e.target.checked; });
  $('voice').addEventListener('change', (e) => { S.voice = e.target.checked; if (!S.voice) speechSynthesis?.cancel(); });
  $('haptics').addEventListener('change', (e) => { S.haptics = e.target.checked; });
  $('crackle').addEventListener('change', (e) => {
    engine.setCrackle(e.target.checked);
    if (S.playing) engine.crackleGain.gain.setTargetAtTime(e.target.checked ? 0.07 : 0, engine.now, 0.05);
  });

  // Drag anywhere on the record to move the needle to that groove.
  const arm = $('arm');
  let dragging = false;
  const onRecord = (e) => { const r = table.rhoAt(e.clientX, e.clientY); return r >= LABEL_R && r <= 1.03 ? r : null; };
  arm.addEventListener('pointerdown', (e) => {
    const r = onRecord(e);
    if (r === null) return;
    dragging = true; arm.setPointerCapture(e.pointerId);
    setLat(rhoToLat(Math.min(1, r)), true);
  });
  arm.addEventListener('pointermove', (e) => {
    if (dragging) setLat(rhoToLat(clamp(table.rhoAt(e.clientX, e.clientY), LABEL_R, 1)), true);
    else arm.style.cursor = onRecord(e) === null ? 'default' : 'grab';
  });
  const end = () => { if (dragging) { dragging = false; announce(`Tonearm at ${sayLat(signedLat())}.`, false); } };
  arm.addEventListener('pointerup', end);
  arm.addEventListener('pointercancel', end);

  const help = $('help');
  $('helpBtn').addEventListener('click', () => help.showModal());

  document.addEventListener('keydown', (e) => {
    if (document.body.dataset.mode !== 'record') return;
    if (e.metaKey || e.ctrlKey || e.altKey || help.open) return;
    const tag = e.target.tagName;
    const field = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === ' ') {
      if (field || tag === 'BUTTON' || tag === 'SUMMARY' || tag === 'A') return;
      e.preventDefault(); toggle();
    } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      if (field) return;
      e.preventDefault(); setLat(S.lat + (key === 'ArrowRight' ? LAT_STEP : -LAT_STEP));
    } else if (field && tag !== 'INPUT') {
      return;
    } else if (key === 'f') flip();
    else if (key === 'w') whereAmI();
    else if (key === 'h') help.showModal();
    else if (/^[1-9]$/.test(key) && RECORDS[Number(key) - 1]) loadRecord(Number(key) - 1);
  });

  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
}

buildCrate();
wire();
requestAnimationFrame(frame);

/** Load the whole-planet record the first time it is opened, not before. */
function boot() {
  loadPlaces().catch(() => {});
  if (!S.record) loadRecord(0);
}

// Handy for testing from the console.
window.blueRecord = { S, engine, reader, table, play, pause, flip, setLat, loadRecord, whereAmI, boot };
