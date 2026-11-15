// Pick a country on the globe, pick what to hear, and the country plays.
//
//   1. Globe: spin it, click a country (or search, or use your location).
//   2. Category: temperature, rain, height of the land, greenness.
//   3. Play: NASA's live data for that country is fetched, and a scan line
//      sweeps it from west to east as one tone. Higher and louder = more.

import { engine, announcePlaying, semiToHz } from './audio.js';
import { Globe } from './globe.js';
import {
  loadPlaces, idPixels, idSize, countryById, countryIdAt, describe, coords, searchCountries, countries,
} from './placedata.js';
import { CATEGORIES, loadCountry, normOf } from './categories.js';
import { initScience } from './science.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

const STEPS = 64;            // steps across the country on each pass
const SEMITONES = 32;        // the pitch range
const LOOKAHEAD = 0.14;      // seconds of sound scheduled ahead of the clock
const QUICK = ['Tunisia', 'Egypt', 'Brazil', 'Japan', 'Iceland', 'Australia', 'India', 'Chile'];

const X = {
  globe: null, country: null, countryId: 0, cat: null, data: null,
  stage: 'globe', loadToken: 0,
  playing: false, frame: 0, row: 0.5, period: 9, stride: 1, smooth: true, drone: true, bling: true, voice: true,
  stepCount: 0, nextStep: 0, queue: [], last: null,
  parked: 0.5,                       // where the needle waits when nothing plays, 0 to 1 from west to east
  frameCanvas: [], profCache: new Map(),
  marsCount: 0, marsActive: false, lastMars: false, lastBlingAt: -9, flash: 0, sparks: [],
  timer: null,
};

// -------------------------------------------------------------- helpers

// ----------------------------------------------------------------- the voice

/** Rank the voices this device has: neural and premium ones sound far more human than the basic ones. */
function voiceScore(v) {
  let sc = 0;
  if (/natural|neural|premium|enhanced|online/i.test(v.name)) sc += 60;
  if (/samantha|ava|allison|zoe|serena|daniel|karen|moira|aria|jenny|guy|sonia|libby|ryan|google (us|uk) english/i.test(v.name)) sc += 30;
  if (/^en[-_](us|gb)/i.test(v.lang)) sc += 10;
  if (!v.localService) sc += 5;
  if (/compact|espeak|fred|albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|junior|kathy|pipe organ|princess|ralph|trinoids|whisper|zarvox|jester|organ/i.test(v.name)) sc -= 80;
  return sc;
}
let voiceList = [];
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  voiceList = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)).sort((a, b) => voiceScore(b) - voiceScore(a));
  const sel = $('cVoiceName');
  if (!sel || !voiceList.length) return;
  let saved = '';
  try { saved = localStorage.getItem('blue-record-voice') || ''; } catch { /* no storage */ }
  sel.innerHTML = '';
  voiceList.slice(0, 8).forEach((v, i) => {
    const o = document.createElement('option');
    o.value = v.name; o.textContent = `${v.name}${i === 0 ? ' (best on this device)' : ''}`;
    sel.appendChild(o);
  });
  if (saved && voiceList.some((v) => v.name === saved)) sel.value = saved;
}
const chosenVoice = () => {
  const name = $('cVoiceName')?.value;
  return voiceList.find((v) => v.name === name) || voiceList[0] || null;
};

/** Say something in a calm, human pace: one sentence at a time, with a breath between them. */
function say(text, speak = false) {
  const live = $('live');
  live.textContent = '';
  requestAnimationFrame(() => { live.textContent = text; });
  if (!speak || !X.voice || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const vol = Number($('cVolume').value);
  const restore = () => engine.setVolume(vol);
  engine.setVolume(vol * 0.25);
  setTimeout(restore, 25000);
  const voice = chosenVoice();
  const parts = (text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [text]).map((t) => t.trim()).filter(Boolean);
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-US';
    u.rate = 0.94;                                   // a little slower than the default
    u.pitch = i === parts.length - 1 ? 0.97 : 1.02;  // a falling note on the last sentence, like a person ending a thought
    if (i === parts.length - 1) { u.onend = restore; u.onerror = restore; }
    speechSynthesis.speak(u);
  });
}

const fmt = (cat, v) => `${v.toFixed(cat.decimals)}${cat.unit ? ` ${cat.unit}` : ''}`;

/** A value in words a screen reader can speak. */
function spoken(cat, v) {
  switch (cat.id) {
    case 'temperature': return `about ${Math.round(v)} degrees Celsius`;
    case 'rain': return `rain or snow falling at about ${v < 10 ? v.toFixed(1) : Math.round(v)} millimetres per hour`;
    case 'elevation': return `about ${Math.round(v / 10) * 10} metres above sea level`;
    default: return `a greenness of ${v.toFixed(2)}, where 0 is bare ground and 1 is dense forest`;
  }
}

const matchesMars = (cat, v) => {
  const m = cat.mars;
  if (!m || v === null || Number.isNaN(v)) return false;
  return m.kind === 'cold' ? Math.abs(v - m.value) <= m.tol : v <= m.value;
};

const latText = (lat) => `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? 'N' : 'S'}`;
const lonText = (lon) => `${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? 'E' : 'W'}`;

// ---------------------------------------------------------------- globe

function showTip(id, x, y) {
  const tip = $('globeTip');
  const c = id ? countryById(id) : null;
  if (!c) { tip.hidden = true; return; }
  const box = $('globeWrap').getBoundingClientRect();
  tip.textContent = c.n;
  tip.hidden = false;
  tip.style.left = `${clamp(x - box.left + 14, 6, box.width - 150)}px`;
  tip.style.top = `${clamp(y - box.top + 16, 6, box.height - 40)}px`;
}

function zoomFor(c) {
  const span = Math.max(c.b[2] - c.b[0], c.b[3] - c.b[1]);
  return 2.05 + Math.min(1, span / 70) * 0.95;
}

function selectCountry(id) {
  const c = countryById(id);
  if (!c) return;
  X.country = c; X.countryId = id;
  if (X.globe) X.globe.select(id, c.m[0], c.m[1], zoomFor(c));
  $('pickPanel').hidden = true;
  $('catPanel').hidden = false;
  $('catTitle').textContent = c.n;
  $('catMeta').textContent = `${c.c || ''} · ${coords(c.m[0], c.m[1])}`.replace(/^ · /, '');
  $('catPanel').scrollIntoView?.({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' });
  $('locateMsg').textContent = '';
  say(`${c.n}. Choose what to hear: temperature, rain, height of the land, or greenness.`, false);
  $('catList').querySelector('button')?.focus({ preventScroll: true });
}

function backToPick() {
  hardStop();
  X.country = null; X.countryId = 0;
  $('catPanel').hidden = true;
  $('pickPanel').hidden = false;
  if (X.globe) X.globe.clear();
  $('countrySearch').focus({ preventScroll: true });
}

function buildCategories() {
  const list = $('catList');
  list.innerHTML = '';
  const icons = {
    temperature: '<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>',
    rain: '<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="M8 19v2M12 17v4M16 19v2"/>',
    elevation: '<path d="M8 3l4 8 5-5 5 15H2L8 3z"/>',
    greenness: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.7 6-7"/>',
  };
  for (const cat of CATEGORIES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'cat';
    b.innerHTML = `
      <span class="cat-icon" style="--g:linear-gradient(90deg,${cat.palette.join(',')})">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[cat.id]}</svg>
      </span>
      <span class="cat-text">
        <span class="cat-title">${cat.title}${cat.cadence.kind === 'static' ? '' : ' <span class="live-tag">Live from NASA</span>'}</span>
        <span class="cat-sub">${cat.sub}</span>
        <span class="cat-bar" style="background:linear-gradient(90deg,${cat.palette.join(',')})" aria-hidden="true"></span>
      </span>`;
    b.addEventListener('click', () => startCategory(cat));
    list.appendChild(b);
  }
}

// -------------------------------------------------------------- loading

async function startCategory(cat) {
  if (!X.country) return;
  hardStop();
  const token = ++X.loadToken;
  X.cat = cat; X.data = null; X.last = null;
  X.frame = 0; X.stepCount = 0; X.marsCount = 0; X.started = false; X.profCache.clear(); X.frameCanvas = [];
  $('stageGlobe').hidden = true;
  $('stagePlay').hidden = false;
  X.stage = 'play';
  $('playTitle').textContent = `${X.country.n}: ${cat.title.toLowerCase()}`;
  $('cTitle').textContent = `${X.country.n} · ${cat.title}`;
  $('cPlay').disabled = true;
  $('mapEmpty').hidden = true;
  $('cInsight').hidden = true;
  const load = $('mapLoad');
  load.hidden = false;
  load.innerHTML = '<span class="spin" aria-hidden="true"></span><span id="mapLoadText">Asking NASA…</span>';
  ['cDate', 'cNeedle', 'cWhereText', 'cUnder', 'cLine'].forEach((id) => { $(id).textContent = '—'; });
  const stride = $('cStride');
  stride.innerHTML = cat.cadence.kind === 'static'
    ? '<option value="0">nothing (one map)</option>'
    : `<option value="1">one step (${cat.cadence.kind === 'hours' ? '2 hours' : cat.cadence.kind === 'months' ? 'a month' : '8 days'})</option><option value="0">nothing (hold this date)</option>`;
  X.stride = Number(stride.value);
  $('cStride').disabled = cat.cadence.kind === 'static';
  setSources(null);
  setLegend(null);
  drawMapNow();
  window.scrollTo?.({ top: 0 });
  say(`Asking NASA for ${cat.title.toLowerCase()} in ${X.country.n}.`, false);

  try {
    const data = await loadCountry(X.country, X.countryId, cat, (done, total) => {
      if (token === X.loadToken) $('mapLoadText').textContent = `Asking NASA… ${done} of ${total}`;
    });
    if (token !== X.loadToken) return;
    X.data = data;
    X.frame = data.frames.length - 1;       // start on NASA's newest data
    X.parked = 0.5;
    setLegend(data);
    setSources(data);
    marsScan();
    setMars();
    setupMap();
    load.hidden = true;
    $('cPlay').disabled = false;
    $('cPlay').focus({ preventScroll: true });
    if (!data.hasData) {
      const msg = {
        rain: `No rain or snow was falling in ${X.country.n} during NASA’s last 24 hours. That is the answer, and the record stays silent. Try another category.`,
        elevation: `NASA’s height map has no readings for ${X.country.n}. Try another category.`,
        greenness: `NASA has no vegetation readings for ${X.country.n} right now. Try another category.`,
        temperature: `NASA has no temperature readings for ${X.country.n} right now. Try another category.`,
      }[cat.id];
      $('mapEmpty').textContent = msg; $('mapEmpty').hidden = false;
      say(msg, true);
    } else {
      say(`${cat.title} for ${X.country.n} is ready. ${cat.mapping} Press space to play, W to hear where you are, S to hear what the data says.`, true);
    }
    refreshReadout(null);
    drawChart();
  } catch (err) {
    if (token !== X.loadToken) return;
    console.error(err);
    load.hidden = false;
    load.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = navigator.onLine === false
      ? 'You seem to be offline. NASA’s live data needs an internet connection.'
      : 'NASA’s live service did not answer.';
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'primary'; retry.textContent = 'Try again';
    retry.addEventListener('click', () => startCategory(cat));
    load.append(p, retry);
    say(p.textContent, false);
  }
}

// ------------------------------------------------------ map and picture

function setupMap() {
  const { area } = X.data;
  const latC = (area.n + area.s) / 2;
  const aspect = clamp((area.dlon * Math.cos(latC * Math.PI / 180)) / area.dlat, 0.5, 2.4);
  $('map').style.aspectRatio = String(aspect);
  X.frameCanvas = new Array(X.data.frames.length).fill(null);
}

/** A frame's picture: dark country shape, then NASA's colors, then a white outline. */
function frameCanvas(fi) {
  if (X.frameCanvas[fi]) return X.frameCanvas[fi];
  const { area, mask, frames } = X.data;
  const { W, H } = area;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data, rgba = frames[fi].rgba;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i, q = k * 4;
      let r, g, b;
      if (rgba[q + 3]) { r = rgba[q]; g = rgba[q + 1]; b = rgba[q + 2]; }
      else if (mask[k] === 2) { r = 30; g = 40; b = 88; }
      else if (mask[k] === 1) { r = 15; g = 22; b = 58; }
      else { r = 7; g = 10; b = 28; }
      d[q] = r; d[q + 1] = g; d[q + 2] = b; d[q + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // The country's border, drawn as a clean line over the data.
  if (X.data.path) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2.2, W / 330);
    ctx.strokeStyle = 'rgba(8,12,34,0.55)';
    ctx.stroke(X.data.path);
    ctx.lineWidth = Math.max(1.2, W / 600);
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.stroke(X.data.path);
  }
  X.frameCanvas[fi] = cv;
  return cv;
}

function sizeMap() {
  const cv = $('map');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (w && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
  return dpr;
}

function drawMapNow() {
  const cv = $('map');
  const dpr = sizeMap();
  const c = cv.getContext('2d');
  c.clearRect(0, 0, cv.width, cv.height);
  if (!X.data) { c.fillStyle = '#070a1c'; c.fillRect(0, 0, cv.width, cv.height); return; }
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'medium';
  c.drawImage(frameCanvas(X.frame), 0, 0, cv.width, cv.height);

  const w = cv.width, h = cv.height;
  const rowY = (X.data.area.H > 0 ? (Math.round(X.row * (X.data.area.H - 1)) + 0.5) / X.data.area.H : X.row) * h;

  // The scan line, with a soft glow.
  c.save();
  c.strokeStyle = 'rgba(240,162,113,0.9)'; c.lineWidth = 1.6 * dpr;
  c.shadowColor = 'rgba(240,162,113,0.9)'; c.shadowBlur = 10 * dpr;
  c.setLineDash([6 * dpr, 6 * dpr]);
  c.beginPath(); c.moveTo(0, rowY); c.lineTo(w, rowY); c.stroke();
  c.restore();

  // The needle.
  const pos = needlePos();
  const nx = pos * w;
  c.save();
  c.fillStyle = 'rgba(240,162,113,0.22)';
  c.beginPath(); c.arc(nx, rowY, 16 * dpr, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f0a271'; c.shadowColor = '#f0a271'; c.shadowBlur = 16 * dpr;
  c.beginPath(); c.arc(nx, rowY, 6 * dpr, 0, Math.PI * 2); c.fill();
  c.restore();
  c.strokeStyle = 'rgba(240,162,113,0.35)'; c.lineWidth = 1 * dpr;
  c.beginPath(); c.moveTo(nx, 0); c.lineTo(nx, h); c.stroke();

  // Mars sparkles.
  for (const s of X.sparks) {
    c.globalAlpha = clamp(s.life, 0, 1);
    c.fillStyle = s.hue;
    c.beginPath();
    c.moveTo(s.x, s.y - s.r); c.lineTo(s.x + s.r * 0.3, s.y - s.r * 0.3); c.lineTo(s.x + s.r, s.y);
    c.lineTo(s.x + s.r * 0.3, s.y + s.r * 0.3); c.lineTo(s.x, s.y + s.r); c.lineTo(s.x - s.r * 0.3, s.y + s.r * 0.3);
    c.lineTo(s.x - s.r, s.y); c.lineTo(s.x - s.r * 0.3, s.y - s.r * 0.3); c.closePath(); c.fill();
  }
  c.globalAlpha = 1;
}

/** Where the needle is along the scan line, 0 (west) to 1 (east). */
function needlePos() {
  if (X.playing && engine.ctx) {
    const steps = (engine.now - X.t0) / (X.period / STEPS);
    return clamp(((steps % STEPS) + STEPS) % STEPS / STEPS, 0, 1);
  }
  return X.parked;
}

function spawnSparks() {
  const cv = $('map'), dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rowY = ((Math.round(X.row * (X.data.area.H - 1)) + 0.5) / X.data.area.H) * cv.height;
  const nx = needlePos() * cv.width;
  for (let k = 0; k < 16; k++) {
    const a = Math.random() * Math.PI * 2, sp = (1 + Math.random() * 3) * dpr;
    X.sparks.push({ x: nx, y: rowY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - dpr, r: (3 + Math.random() * 6) * dpr, life: 1, hue: Math.random() < 0.5 ? '#fff3d6' : '#ff9d6e' });
  }
}

// ------------------------------------------------------------ the legend

function setLegend(data) {
  const box = $('legend');
  box.innerHTML = '';
  if (!data) return;
  const cat = data.category;
  for (const lg of data.legends) {
    const wrap = document.createElement('div');
    wrap.className = 'lg';
    const css = lg.stops.map(([f, r, g, b]) => `rgb(${r},${g},${b}) ${(f * 100).toFixed(1)}%`).join(',');
    const [lo, hi] = data.range;
    const unit = cat.unit ? ` ${cat.unit}` : '';
    const fmtEnd = (v) => `${Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(cat.curve === 'log' ? 1 : (Number.isInteger(v) ? 0 : 1))}${unit}`;
    wrap.innerHTML = `
      <span class="lg-role">${lg.role}</span>
      <div class="lg-bar" style="background:linear-gradient(90deg,${css})"><i class="lg-mark"></i></div>
      <div class="lg-ends"><span>${fmtEnd(lo)}</span><span>${cat.id === 'elevation' ? `${fmtEnd(hi)} (this country's highest)` : fmtEnd(hi)}</span></div>`;
    box.appendChild(wrap);
  }
}

function moveMarks(value) {
  const marks = $('legend').querySelectorAll('.lg-mark');
  marks.forEach((m) => {
    if (value === null || value === undefined || Number.isNaN(value)) { m.style.opacity = '0'; return; }
    m.style.opacity = '1';
    m.style.left = `${normOf(X.cat, X.data.range, value) * 100}%`;
  });
}

function setSources(data) {
  const box = $('cSources');
  box.innerHTML = '';
  if (!data) return;
  for (const r of data.requests) {
    const a = document.createElement('a');
    a.href = r.url; a.target = '_blank'; a.rel = 'noopener';
    a.className = 'src';
    a.innerHTML = `<span class="src-role">${r.role}</span><span class="src-name">${r.name}</span>
      <span class="src-meta">Layer ${r.layer}${r.time ? ` · newest map ${r.time.slice(0, 10)}` : ''}</span>
      <span class="src-link">See the exact request to NASA ↗</span>`;
    box.appendChild(a);
  }
  const eic = document.createElement('a');
  eic.href = 'https://earth.gov/'; eic.target = '_blank'; eic.rel = 'noopener'; eic.className = 'src';
  eic.innerHTML = `<span class="src-role">Challenge resource</span><span class="src-name">NASA Earth Information Center</span>
      <span class="src-meta">earth.gov · the home of the Earth Information Jukebox challenge</span>
      <span class="src-link">Open it ↗</span>`;
  box.appendChild(eic);
  const acc = document.createElement('div');
  acc.className = 'accuracy';
  acc.innerHTML = `<p class="acc-title">How accurate is it?</p><p class="fine"></p>`;
  acc.querySelector('p.fine').textContent = data.category.accuracy;
  box.appendChild(acc);
  const note = document.createElement('p');
  note.className = 'fine';
  note.textContent = data.category.id === 'temperature'
    ? 'Sea is a daily analysis; land is an 8-day average of Terra satellite readings, so cloudy places can have gaps. Both are read with NASA’s own color tables.'
    : 'Read with NASA’s own color table for the layer: every colored pixel is looked up, nothing is guessed.';
  box.appendChild(note);
}

/** Look at the whole newest map: does any place here read like Mars? */
function marsScan() {
  const cat = X.cat;
  X.marsInfo = null;
  if (!cat?.mars || !X.data) return;
  const { area, mask, frames } = X.data;
  const vals = frames[frames.length - 1].values, { W, H } = area;
  let cnt = 0, total = 0, sx = 0, sy = 0, closest = null;
  for (let k = 0; k < W * H; k++) {
    if (mask[k] !== 2) continue;
    const v = vals[k];
    if (Number.isNaN(v)) continue;
    total++;
    if (cat.mars.kind === 'cold') { const d = Math.abs(v - cat.mars.value); if (closest === null || d < Math.abs(closest - cat.mars.value)) closest = v; }
    else if (closest === null || v < closest) closest = v;
    if (matchesMars(cat, v)) { cnt++; sx += k % W; sy += Math.floor(k / W); }
  }
  let where = '';
  if (cnt) {
    const lon = area.w + (sx / cnt / W) * area.dlon, lat = area.n - (sy / cnt / H) * area.dlat;
    where = describe(lat, lon).where;
  }
  X.marsInfo = { cnt, total, share: total ? cnt / total : 0, where, closest };
}

function setMars() {
  const cat = X.cat, card = $('marsCard'), badge = $('marsBadge');
  X.marsActive = false;
  card.classList.remove('is-on', 'live-match', 'found', 'missing', 'na');
  $('marsTitle').textContent = 'Mars check';
  $('marsHeard').textContent = '';
  const info = X.marsInfo;
  if (!cat.mars) {
    card.classList.add('na');
    badge.textContent = 'No Mars test';
    $('marsText').textContent = cat.id === 'elevation'
      ? 'Mars’s tallest mountain, Olympus Mons, is about 21.9 km high, more than twice Mount Everest. There is no Mars chime for height.'
      : 'It never rains on Mars. There is no Mars chime for rain.';
    return;
  }
  if (!info) { badge.textContent = 'Checking…'; $('marsText').textContent = '—'; return; }
  const place = info.where ? `, around ${info.where}` : '';
  if (info.cnt) {
    card.classList.add('found');
    badge.textContent = 'FOUND';
    $('marsText').textContent = cat.id === 'temperature'
      ? `${(info.share * 100).toFixed(info.share < 0.1 ? 1 : 0)}% of ${X.country.n} in NASA’s newest map is within 4 °C of Mars’s average, −63 °C${place}. A chime rings each time the line crosses it.`
      : `${(info.share * 100).toFixed(info.share < 0.1 ? 1 : 0)}% of ${X.country.n} is as bare as Mars (greenness 0.1 or less)${place}. A chime rings each time the line crosses it.`;
  } else {
    card.classList.add('missing');
    badge.textContent = 'NOT FOUND';
    const near = info.closest === null ? '' : cat.id === 'temperature'
      ? ` The closest reading is ${info.closest.toFixed(1)} °C, far from −63 °C.`
      : ` The barest reading is ${info.closest.toFixed(2)}.`;
    $('marsText').textContent = cat.id === 'temperature'
      ? `Nothing in ${X.country.n} is within 4 °C of Mars’s average, −63 °C, in NASA’s newest map.${near} Try a very cold place such as Iceland.`
      : `Nothing in ${X.country.n} is as bare as Mars (0.1 or less) in NASA’s newest map.${near} Try a desert such as Egypt.`;
  }
}

// ----------------------------------------------------- reading the data

/** What the scan line reads at this frame and row: STEPS values from west to east. */
function profile(frame, row) {
  const { area, mask, frames } = X.data;
  const { W, H, w, n, dlon, dlat } = area;
  const rowPx = Math.round(row * (H - 1));
  const key = `${frame}|${rowPx}`;
  const hit = X.profCache.get(key);
  if (hit) return hit;
  const half = Math.max(1, Math.round(H * 0.008));
  const y0 = Math.max(0, rowPx - half), y1 = Math.min(H - 1, rowPx + half);
  const values = frames[frame].values;
  const lat = n - ((rowPx + 0.5) / H) * dlat;
  const steps = [];
  let sum = 0, cnt = 0, lo = Infinity, hi = -Infinity;
  for (let b = 0; b < STEPS; b++) {
    const x0 = Math.floor((b * W) / STEPS), x1 = Math.floor(((b + 1) * W) / STEPS);
    let region = 0, valid = 0, acc = 0;
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i < x1; i++) {
        const k = j * W + i;
        if (mask[k] === 0) continue;
        region++;
        const v = values[k];
        if (!Number.isNaN(v)) { valid++; acc += v; }
      }
    }
    const value = valid ? acc / valid : null;
    steps.push({ value, inRegion: region > 0, cover: region ? valid / region : 0, lon: w + ((b + 0.5) / STEPS) * dlon, lat });
    if (value !== null) { sum += value; cnt++; lo = Math.min(lo, value); hi = Math.max(hi, value); }
  }
  const prof = { steps, mean: cnt ? sum / cnt : null, min: cnt ? lo : null, max: cnt ? hi : null, rowPx, lat };
  X.profCache.set(key, prof);
  return prof;
}

// ----------------------------------------------------------------- sound

async function play() {
  if (!X.data || X.playing) return;
  await engine.start();
  announcePlaying();
  engine.setVolume(Number($('cVolume').value));
  if (!X.started && X.data.frames.length > 1 && X.stride) { X.frame = 0; X.started = true; }   // travel forward to NASA's newest
  const t = engine.now + 0.08;
  X.playing = true; X.t0 = t - X.parked * (X.period / STEPS) * STEPS;
  X.stepCount = Math.round(X.parked * STEPS) % STEPS;
  X.nextStep = t;
  X.queue.length = 0; X.lastMars = false;
  engine.needleDown(t);
  X.timer = setInterval(schedule, 25);
  schedule();
  syncPlay();
}

function pause() {
  if (!X.playing) return;
  X.parked = needlePos();
  X.playing = false;
  clearInterval(X.timer);
  X.queue.length = 0;
  engine.needleUp();
  engine.glideStop();
  engine.droneStop();
  syncPlay();
}

function syncPlay() {
  const b = $('cPlay');
  b.setAttribute('aria-pressed', String(X.playing));
  b.classList.toggle('is-playing', X.playing);
  $('cPlayLabel').textContent = X.playing ? 'Pause' : 'Play this country';
}

function schedule() {
  const now = engine.now;
  if (X.nextStep < now - 0.05) X.nextStep = now + 0.02;
  const dur = X.period / STEPS;
  while (X.playing && X.nextStep < now + LOOKAHEAD) {
    const t = X.nextStep;
    const bin = X.stepCount % STEPS;
    if (bin === 0 && X.stepCount > 0 && X.stride && X.data.frames.length > 1) {
      X.frame = (X.frame + X.stride) % X.data.frames.length;
    }
    const prof = profile(X.frame, X.row);
    const step = prof.steps[bin];
    if (bin === 0 || X.stepCount === 0) startPass(t, prof);
    const ev = { t, bin, step, prof, frame: X.frame, mars: false };
    sound(t, step, bin, dur, ev);
    X.queue.push(ev);
    X.stepCount++;
    X.nextStep = t + dur;
  }
}

function startPass(t, prof) {
  if (X.drone && prof.mean !== null) {
    engine.drone(t, semiToHz(normOf(X.cat, X.data.range, prof.mean) * SEMITONES - 12), X.period);
  }
}

function sound(t, step, bin, dur, ev) {
  const cat = X.cat;
  const pan = (bin / (STEPS - 1) * 2 - 1) * 0.8;            // west in the left ear, east in the right
  if (step.value === null) { engine.glideRest(t, dur); X.lastMars = false; return; }
  const n = normOf(cat, X.data.range, step.value);
  if (X.smooth) engine.voiceTo(cat.voice, t, semiToHz(n * SEMITONES), (0.3 + 0.7 * n) * (0.5 + 0.5 * step.cover), pan, n, dur);
  else engine.note(t, semiToHz(Math.round(n * SEMITONES)), 0.45 + 0.55 * step.cover, Math.max(0.3, dur * 4), pan, n);
  const mars = matchesMars(cat, step.value);
  ev.mars = mars;
  // One chime each time the data first matches Mars, never more than one a second.
  if (mars && !X.lastMars && X.bling && t - X.lastBlingAt > 1.0) { engine.bling(t); X.lastBlingAt = t; ev.bling = true; }
  X.lastMars = mars;
}

// -------------------------------------------------------------- readout

function describeStep(step, prof) {
  const lat = prof.lat, lon = step.lon;
  return { lat, lon, place: describe(lat, lon) };
}

function refreshReadout(ev) {
  if (!X.data) return;
  const cat = X.cat;
  const fr = X.data.frames[ev ? ev.frame : X.frame];
  $('cDate').textContent = fr.label;
  const prof = ev ? ev.prof : profile(X.frame, X.row);
  const step = ev ? ev.step : prof.steps[clamp(Math.floor(X.parked * STEPS), 0, STEPS - 1)];
  const info = describeStep(step, prof);
  $('cNeedle').textContent = `${latText(info.lat)}, ${lonText(info.lon)}`;
  $('cWhereText').textContent = info.place.where;
  $('cUnder').textContent = step.value !== null ? fmt(cat, step.value)
    : step.inRegion ? 'No reading here' : 'Outside this country';
  $('cLine').textContent = prof.mean === null ? 'Nothing to read along this line'
    : `${fmt(cat, prof.mean)} on average · from ${fmt(cat, prof.min)} to ${fmt(cat, prof.max)}`;
  moveMarks(step.value);
  const mars = step.value !== null && matchesMars(cat, step.value);
  $('marsCard').classList.toggle('is-on', mars);
  if (mars && cat.mars) {
    $('marsCard').classList.add('live-match');
    $('marsBadge').textContent = 'MATCH HERE';
    $('marsTitle').textContent = 'Mars match!';
    $('marsText').textContent = cat.id === 'temperature'
      ? `${fmt(cat, step.value)} is as cold as ${cat.mars.fact}. This place could pass for Mars.`
      : `Almost nothing grows here, just like ${cat.mars.fact}.`;
  } else if (!mars && $('marsCard').classList.contains('live-match')) {
    setMars();
  }
}

const INK = '#9aa3c7';
const tickText = (cat, v) => (cat.id === 'rain' ? (v < 10 ? v.toFixed(1) : Math.round(v)) : cat.id === 'greenness' ? v.toFixed(2) : Math.round(v));

/** A chart canvas sized for the screen, cleared and ready. Returns null if it cannot be drawn yet. */
function chartCtx(id) {
  const cv = $(id);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return null;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  return { c, w, h };
}

/** Grid, y tick labels with units, and an axis title. Returns the plot box and the y mapping. */
function drawAxes(c, w, h, box, lo, hi, cat, yTitle) {
  const { L, R, T, B } = box, pw = w - L - R, ph = h - T - B;
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * ph;
  c.font = '11px ui-monospace, Menlo, monospace'; c.fillStyle = INK; c.textAlign = 'right';
  c.strokeStyle = 'rgba(255,255,255,0.10)'; c.lineWidth = 1;
  for (const f of [0, 0.5, 1]) {
    const v = lo + (1 - f) * (hi - lo), yy = T + f * ph;
    c.beginPath(); c.moveTo(L, yy); c.lineTo(w - R, yy); c.stroke();
    c.fillText(String(tickText(cat, v)), L - 6, yy + 4);
  }
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.beginPath(); c.moveTo(L, T); c.lineTo(L, T + ph); c.lineTo(w - R, T + ph); c.stroke();   // the two axes
  c.save(); c.translate(11, T + ph / 2); c.rotate(-Math.PI / 2); c.textAlign = 'center';
  c.fillText(yTitle, 0, 0); c.restore();
  return { pw, ph, y };
}

/** Time chart: average along the scan line in every map, with both axes labelled. */
function drawChart() {
  const g = chartCtx('cChart');
  if (!g || !X.data) return;
  const { c, w, h } = g;
  const cat = X.cat, frames = X.data.frames;
  const vals = frames.map((_, i) => profile(i, X.row).mean);
  const known = vals.filter((v) => v !== null);
  const note = $('cChartNote');
  if (frames.length < 2) {
    note.textContent = known.length ? `${fmt(cat, known[0])} on average along this line. This map does not change through time.` : 'Nothing to read along this line.';
    c.fillStyle = INK; c.font = '12px ui-monospace, Menlo, monospace'; c.textAlign = 'center';
    c.fillText('One map, no change through time', w / 2, h / 2);
    return;
  }
  if (!known.length) { note.textContent = 'Nothing to read along this line in any of the maps.'; return; }
  const lo0 = Math.min(...known), hi0 = Math.max(...known);
  note.textContent = `Average along this line: ${fmt(cat, lo0)} around ${frames[vals.indexOf(lo0)].short} to ${fmt(cat, hi0)} around ${frames[vals.indexOf(hi0)].short}.`;
  const pad = (hi0 - lo0) * 0.12 || 1;
  const lo = lo0 - pad, hi = hi0 + pad;
  const box = { L: 46, R: 10, T: 10, B: 34 };
  const { pw, ph, y } = drawAxes(c, w, h, box, lo, hi, cat, cat.unit || 'index');
  const x = (i) => box.L + (i / (vals.length - 1)) * pw;
  // x axis: dates
  c.fillStyle = INK; c.font = '11px ui-monospace, Menlo, monospace';
  const ticks = [0, Math.round((vals.length - 1) / 2), vals.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  for (const i of ticks) {
    c.textAlign = i === 0 ? 'left' : i === vals.length - 1 ? 'right' : 'center';
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.moveTo(x(i), box.T + ph); c.lineTo(x(i), box.T + ph + 4); c.stroke();
    c.fillText(frames[i].short, i === 0 ? box.L : i === vals.length - 1 ? w - box.R : x(i), box.T + ph + 16);
  }
  c.textAlign = 'center'; c.fillText('date of the NASA map →', box.L + pw / 2, h - 3);
  c.strokeStyle = '#c8d0e7'; c.lineWidth = 2; c.lineJoin = 'round';
  c.beginPath(); let pen = false;
  vals.forEach((v, i) => { if (v === null) { pen = false; return; } if (pen) c.lineTo(x(i), y(v)); else c.moveTo(x(i), y(v)); pen = true; });
  c.stroke();
  const cur = vals[X.frame];
  c.strokeStyle = 'rgba(240,162,113,0.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x(X.frame), box.T); c.lineTo(x(X.frame), box.T + ph); c.stroke();
  if (cur !== null) { c.fillStyle = '#f0a271'; c.beginPath(); c.arc(x(X.frame), y(cur), 4, 0, Math.PI * 2); c.fill(); }
}

/** The sound line itself: value (y) against position from west to east (x), with the needle moving along it. */
function drawProfile(pos) {
  const g = chartCtx('cProfile');
  if (!g || !X.data) return;
  const { c, w, h } = g;
  const cat = X.cat;
  const prof = profile(X.frame, X.row);
  const known = prof.steps.filter((s) => s.value !== null);
  const note = $('cProfileNote');
  if (!known.length) {
    note.textContent = 'Nothing to read along this line. Move the scan line.';
    c.fillStyle = INK; c.font = '12px ui-monospace, Menlo, monospace'; c.textAlign = 'center';
    c.fillText('No readings on this line', w / 2, h / 2);
    return;
  }
  const lo0 = Math.min(...known.map((s) => s.value)), hi0 = Math.max(...known.map((s) => s.value));
  note.textContent = `At ${latText(prof.lat)}, from west to east: ${fmt(cat, lo0)} up to ${fmt(cat, hi0)}. This is exactly what you hear.`;
  const pad = (hi0 - lo0) * 0.12 || 1;
  const lo = lo0 - pad, hi = hi0 + pad;
  const box = { L: 46, R: 10, T: 10, B: 34 };
  const { pw, ph, y } = drawAxes(c, w, h, box, lo, hi, cat, cat.unit || 'index');
  const x = (b) => box.L + (b / (STEPS - 1)) * pw;
  // x axis: longitude, west to east
  const first = prof.steps[0].lon, last = prof.steps[STEPS - 1].lon;
  c.fillStyle = INK; c.font = '11px ui-monospace, Menlo, monospace';
  [[0, 'left'], [0.5, 'center'], [1, 'right']].forEach(([f, al]) => {
    const lon = first + f * (last - first), xx = box.L + f * pw;
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.moveTo(xx, box.T + ph); c.lineTo(xx, box.T + ph + 4); c.stroke();
    c.textAlign = al; c.fillText(lonText(lon), xx, box.T + ph + 16);
  });
  c.textAlign = 'center'; c.fillText('west → east (longitude)', box.L + pw / 2, h - 3);
  // the line: filled steps so gaps (outside the country, no reading) stay gaps
  const grad = c.createLinearGradient(0, box.T, 0, box.T + ph);
  grad.addColorStop(0, 'rgba(240,162,113,0.35)'); grad.addColorStop(1, 'rgba(240,162,113,0.02)');
  let run = [];
  const flush = () => {
    if (!run.length) return;
    c.beginPath(); c.moveTo(x(run[0].b), box.T + ph);
    run.forEach((p) => c.lineTo(x(p.b), y(p.v)));
    c.lineTo(x(run[run.length - 1].b), box.T + ph); c.closePath(); c.fillStyle = grad; c.fill();
    c.beginPath(); run.forEach((p, i) => (i ? c.lineTo(x(p.b), y(p.v)) : c.moveTo(x(p.b), y(p.v))));
    c.strokeStyle = '#f0a271'; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
    run = [];
  };
  prof.steps.forEach((s, b) => { if (s.value === null) flush(); else run.push({ b, v: s.value }); });
  flush();
  // Mars matches along this line
  prof.steps.forEach((s, b) => {
    if (s.value !== null && matchesMars(cat, s.value)) { c.fillStyle = '#ff6a3d'; c.beginPath(); c.arc(x(b), y(s.value), 3.5, 0, Math.PI * 2); c.fill(); }
  });
  // the needle
  const nb = clamp(pos * (STEPS - 1), 0, STEPS - 1);
  c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(box.L + (nb / (STEPS - 1)) * pw, box.T); c.lineTo(box.L + (nb / (STEPS - 1)) * pw, box.T + ph); c.stroke();
}

/** What the data says along the scan line: the extremes, where they are, and how it changed. */
function summarize(speak = true) {
  if (!X.data || !X.data.hasData) return;
  const cat = X.cat, name = X.country.n;
  const prof = profile(X.frame, X.row);
  if (prof.mean === null) { const t = `Nothing to read along this line in ${name}. Move the scan line.`; $('cInsight').hidden = false; $('cInsightText').textContent = t; say(t, speak); return; }
  let hi = null, lo = null;
  for (const st of prof.steps) {
    if (st.value === null) continue;
    if (!hi || st.value > hi.value) hi = st;
    if (!lo || st.value < lo.value) lo = st;
  }
  const near = (st) => { const d = describe(st.lat, st.lon); return d.kind === 'land' ? (d.detail || d.name) : d.where; };
  const parts = [`Along this line in ${name}, the ${cat.words.hi} reading is ${fmt(cat, hi.value)}, ${near(hi)}.`];
  if (lo.value !== hi.value) parts.push(`The ${cat.words.lo} is ${fmt(cat, lo.value)}, ${near(lo)}.`);
  const frames = X.data.frames;
  if (frames.length > 1) {
    const first = profile(0, X.row).mean, last = profile(frames.length - 1, X.row).mean;
    if (first !== null && last !== null) {
      const d = last - first, tiny = Math.abs(d) < Math.max(0.15, Math.abs(first) * 0.03);
      parts.push(tiny ? `It barely changed between ${frames[0].label} and ${frames[frames.length - 1].label}.`
        : `On average it went from ${fmt(cat, first)} on ${frames[0].label} to ${fmt(cat, last)} on ${frames[frames.length - 1].label}.`);
    }
  }
  const text = parts.join(' ');
  $('cInsight').hidden = false;
  $('cInsightText').textContent = text;
  say(text, speak);
}

function whereAmI() {
  if (!X.data) return;
  const cat = X.cat;
  const ev = X.playing ? X.last : null;
  const prof = ev ? ev.prof : profile(X.frame, X.row);
  const step = ev ? ev.step : prof.steps[clamp(Math.floor(X.parked * STEPS), 0, STEPS - 1)];
  const info = describeStep(step, prof);
  const parts = [`You're in ${info.place.where}.`, `${latText(info.lat).replace('° ', ' degrees ')}, ${lonText(info.lon).replace('° ', ' degrees ')}.`];
  parts[1] = `Latitude ${Math.abs(info.lat).toFixed(1)} degrees ${info.lat >= 0 ? 'north' : 'south'}, longitude ${Math.abs(info.lon).toFixed(1)} degrees ${info.lon >= 0 ? 'east' : 'west'}.`;
  parts.push(`${X.data.frames[ev ? ev.frame : X.frame].label}.`);
  if (step.value !== null) parts.push(`${cat.title}: ${spoken(cat, step.value)}.`);
  else parts.push(step.inRegion ? 'NASA doesn’t have a reading at this spot.' : 'This spot is outside the country, so it stays silent.');
  if (matchesMars(cat, step.value)) parts.push('Mars match!');
  say(parts.join(' '), true);
}

// ------------------------------------------------------------- animation

let lastFrameTime = 0;
function tick(now) {
  requestAnimationFrame(tick);
  if (document.hidden || document.body.dataset.mode !== 'explore') return;
  if (X.stage === 'globe' && X.globe) X.globe.draw(now);
  if (X.stage !== 'play' || !X.data) return;
  const audioNow = engine.ctx ? engine.now : 0;
  while (X.queue.length && X.queue[0].t <= audioNow) {
    const ev = X.queue.shift();
    X.last = ev;
    refreshReadout(ev);
    if (ev.bling) { X.marsCount++; X.flash = 1; spawnSparks(); $('marsHeard').textContent = ` Chimes heard so far: ${X.marsCount}.`; }
    if (ev.bin === 0) drawChart();
  }
  for (const s of X.sparks) { s.x += s.vx; s.y += s.vy; s.vy += 0.05; s.life -= 0.02; }
  X.sparks = X.sparks.filter((s) => s.life > 0);
  X.flash *= 0.94;
  $('mapWrap').style.setProperty('--flash', X.flash.toFixed(3));
  if (now - lastFrameTime > 16) { drawMapNow(); drawProfile(needlePos()); lastFrameTime = now; }
}

// ------------------------------------------------------------ interface

function renderResults(list) {
  const ul = $('countryResults');
  ul.innerHTML = '';
  ul.hidden = list.length === 0;
  $('countrySearch').setAttribute('aria-expanded', String(list.length > 0));
  list.forEach(({ id, c }, i) => {
    const li = document.createElement('li');
    li.role = 'option'; li.id = `res${i}`;
    const b = document.createElement('button');
    b.type = 'button'; b.tabIndex = -1;
    b.innerHTML = `<span>${c.n}</span><span class="muted">${c.c || ''}</span>`;
    b.addEventListener('click', () => { $('countrySearch').value = ''; renderResults([]); selectCountry(id); });
    li.appendChild(b);
    ul.appendChild(li);
  });
}

function bindPicker() {
  const input = $('countrySearch');
  let active = -1;
  const setActive = (n) => {
    const items = $('countryResults').querySelectorAll('li');
    items.forEach((li, i) => li.classList.toggle('is-active', i === n));
    active = n;
    input.setAttribute('aria-activedescendant', n >= 0 ? `res${n}` : '');
  };
  input.addEventListener('input', () => { renderResults(searchCountries(input.value)); setActive(-1); });
  input.addEventListener('keydown', (e) => {
    const items = $('countryResults').querySelectorAll('li');
    if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); setActive((active + 1) % items.length); }
    else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); setActive((active - 1 + items.length) % items.length); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const target = items[active >= 0 ? active : 0];
      if (target) target.querySelector('button').click();
    } else if (e.key === 'Escape') { input.value = ''; renderResults([]); e.stopPropagation(); }
  });

  $('quickPicks').innerHTML = '';
  for (const name of QUICK) {
    const id = countries().findIndex((c) => c && c.n === name);
    if (id < 1) continue;
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = name;
    b.addEventListener('click', () => selectCountry(id));
    $('quickPicks').appendChild(b);
  }

  $('locateBtn').addEventListener('click', () => {
    const msg = $('locateMsg');
    if (!navigator.geolocation) { msg.textContent = 'Your browser cannot share its location. Search for a country instead.'; return; }
    msg.textContent = 'Asking your browser for your location…';
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      const id = countryIdAt(lat, lon);
      if (id) { msg.textContent = ''; selectCountry(id); }
      else { msg.textContent = `You are at ${coords(lat, lon)}, which is over water. Pick a country instead.`; }
    }, () => { msg.textContent = 'Location was not shared. Search for a country instead.'; }, { timeout: 8000, maximumAge: 600000 });
  });
  $('changeCountry').addEventListener('click', backToPick);
}

function bindPlayer() {
  $('cPlay').addEventListener('click', () => (X.playing ? pause() : play()));
  $('cWhere').addEventListener('click', whereAmI);
  $('cSummary').addEventListener('click', () => summarize(true));
  $('backGlobe').addEventListener('click', () => leavePlay(true));
  $('backCat').addEventListener('click', () => leavePlay(false));
  const row = $('cRow');
  row.addEventListener('input', () => setRow(Number(row.value) / 100));
  $('cSpeed').addEventListener('change', (e) => {
    const was = needlePos();
    X.period = Number(e.target.value);
    if (X.playing) X.t0 = engine.now - was * X.period;
  });
  $('cStride').addEventListener('change', (e) => { X.stride = Number(e.target.value); });
  $('cTone').addEventListener('change', (e) => { X.smooth = e.target.value === 'smooth'; if (!X.smooth) engine.glideStop(); });
  $('cVolume').addEventListener('input', (e) => engine.setVolume(Number(e.target.value)));
  $('cDrone').addEventListener('change', (e) => { X.drone = e.target.checked; if (!X.drone) engine.droneStop(); });
  $('cBling').addEventListener('change', (e) => { X.bling = e.target.checked; });
  $('cVoiceName').addEventListener('change', (e) => { try { localStorage.setItem('blue-record-voice', e.target.value); } catch { /* no storage */ } say('This is how I sound. I will read you the data.', true); });
  $('cVoice').addEventListener('change', (e) => { X.voice = e.target.checked; if (!X.voice) speechSynthesis?.cancel(); });

  // Click or drag on the map to move the scan line.
  const map = $('map');
  let dragging = false;
  const setFromPointer = (e) => {
    const r = map.getBoundingClientRect();
    setRow(clamp((e.clientY - r.top) / r.height, 0, 1));
  };
  map.addEventListener('pointerdown', (e) => { if (!X.data) return; dragging = true; map.setPointerCapture(e.pointerId); setFromPointer(e); });
  map.addEventListener('pointermove', (e) => { if (dragging) setFromPointer(e); });
  map.addEventListener('pointerup', () => { dragging = false; });
  map.addEventListener('pointercancel', () => { dragging = false; });
  new ResizeObserver(() => { if (X.data) { drawMapNow(); drawChart(); } }).observe($('mapWrap'));

  document.addEventListener('keydown', (e) => {
    if (document.body.dataset.mode !== 'explore' || e.metaKey || e.ctrlKey || e.altKey) return;
    if ($('help').open) return;
    const tag = e.target.tagName, field = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    if (e.key === 'Escape') {
      if (X.stage === 'play') { leavePlay(false); e.preventDefault(); }
      else if (X.country) { backToPick(); e.preventDefault(); }
      return;
    }
    if (X.stage !== 'play' || !X.data) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === ' ' && !field && tag !== 'BUTTON' && tag !== 'SUMMARY' && tag !== 'A') { e.preventDefault(); X.playing ? pause() : play(); }
    else if ((key === 'ArrowUp' || key === 'ArrowDown') && !(field && tag !== 'INPUT')) {
      if (tag === 'INPUT' && e.target.type === 'range') return;       // the slider handles its own arrows
      e.preventDefault(); setRow(clamp(X.row + (key === 'ArrowDown' ? 0.03 : -0.03), 0, 1));
    } else if (key === 'w' && !field) whereAmI();
    else if (key === 's' && !field) summarize(true);
  });
}

function setRow(r) {
  X.row = r;
  $('cRow').value = String(Math.round(r * 100));
  if (X.data) {
    refreshReadout(X.playing ? X.last : null);
    drawChart(); drawMapNow();
  }
}

/** Silence everything at once: tone, drone, chime, spoken words. */
function hardStop() {
  pause();
  X.playing = false; clearInterval(X.timer); X.queue.length = 0;
  try { speechSynthesis?.cancel(); } catch { /* no speech */ }
  engine.hush(Number($('cVolume').value));
  syncPlay();
}

function leavePlay(toGlobe) {
  hardStop();
  X.loadToken++;
  X.data = null; X.stage = 'globe';
  $('stagePlay').hidden = true;
  $('stageGlobe').hidden = false;
  if (toGlobe) backToPick();
  else if (X.country && X.globe) X.globe.select(X.countryId, X.country.m[0], X.country.m[1], zoomFor(X.country));
}

// ------------------------------------------------------------------ boot

function loadEarth() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The Earth picture did not load'));
    img.src = 'records/geo/earth.jpg';
  });
}

export async function initExplore() {
  initScience(() => {
    if (!X.data || !X.cat) return null;
    const prof = profile(X.frame, X.row);
    const ev = X.playing ? X.last : null;
    const step = ev ? ev.step : prof.steps[clamp(Math.floor(X.parked * STEPS), 0, STEPS - 1)];
    return { cat: X.cat, range: X.data.range, value: step.value, cover: step.cover, bin: ev ? ev.bin : clamp(Math.floor(X.parked * STEPS), 0, STEPS - 1), lat: prof.lat, lon: step.lon };
  });
  loadVoices();
  if ('speechSynthesis' in window) speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
  buildCategories();
  bindPlayer();
  requestAnimationFrame(tick);
  const status = $('globeLoad');
  try {
    const [, earth] = await Promise.all([loadPlaces(), loadEarth()]);
    bindPicker();
    try {
      X.globe = new Globe($('globe'), earth, idPixels(), idSize, {
        onHover: showTip,
        onSelect: (id) => selectCountry(id),
      });
      if (!X.globe.ok) throw new Error('no WebGL');
      X.globe.placeAt = countryIdAt;
      status.hidden = true;
      if (reduced.matches) { X.globe.vLon = 0; X.globe.noSpin = true; }
    } catch (err) {
      console.warn('Globe unavailable:', err);
      status.textContent = 'Your browser cannot draw the 3D globe, so search for a country instead.';
      $('globe').hidden = true;
    }
  } catch (err) {
    console.error(err);
    status.textContent = 'The map data did not load. Check your connection and reload the page.';
  }
}

export const explorePause = hardStop;
export const exploreState = X;
