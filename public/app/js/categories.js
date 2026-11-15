// The four things you can listen to for a country, and how each is pulled
// from NASA's Global Imagery Browse Services (GIBS).
//
// For a country we ask GIBS for a picture of just that area (a WMS GetMap with
// the country's bounding box), look every pixel up in NASA's published color
// table for the layer, and keep the numbers.

import { countryIdAt } from './placedata.js';

const WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
const WMTS = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi';
const DAY = 86400e3, HOUR = 3600e3;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const KELVIN = 273.15;

/**
 * unit / decimals: how a value is shown.
 * range: the values the pitch spans. curve: how value maps to pitch.
 * coast: also read the sea within about a degree of the country.
 */
export const CATEGORIES = [
  {
    id: 'temperature',
    voice: 'warm',
    words: { hi: 'hottest', lo: 'coolest' },
    title: 'Temperature',
    sub: 'Land and sea, up to NASA’s newest data',
    unit: '°C', decimals: 1, range: [-20, 50], curve: 'linear', coast: true,
    colormaps: { land: 'lst', sea: 'sst' },
    palette: ['#2b3a9f', '#2f8fd8', '#35c6a2', '#e8d84a', '#f08a3c', '#d8332b'],
    noun: 'temperature',
    sources: [
      { role: 'Land (ground, about 10:30 am)', name: 'MODIS Land Surface Temperature, 8-day average (Terra)', layer: 'MODIS_Terra_L3_Land_Surface_Temp_8Day_Day', tileSet: '1km', colormap: 'lst', convert: (v) => v - KELVIN },
      { role: 'Sea surface', name: 'MUR Sea Surface Temperature (NASA JPL)', layer: 'GHRSST_L4_MUR_Sea_Surface_Temperature', tileSet: '1km', colormap: 'sst', convert: (v) => v },
    ],
    cadence: { kind: 'days', step: 8, count: 13 },
    mapping: 'A warm tone follows the temperature: higher, louder and brighter means hotter. Silence means outside the country or no reading.',
    accuracy: 'Checked against NASA MERRA-2. Sea: off by 0.3 °C on average (108 comparisons). Land: this is the ground’s own temperature at about 10:30 in the morning, not the air. It reads 2.2 °C cooler than MERRA-2 at that hour and is off by 3.4 °C on average (124 comparisons, correlation 0.89). NASA’s afternoon satellite reads up to 10 °C hotter in the same place, so the time of day matters.',
    mars: { kind: 'cold', value: -63, tol: 4, fact: 'the average temperature on Mars, −63 °C' },
  },
  {
    id: 'rain',
    voice: 'rain',
    words: { hi: 'heaviest', lo: 'lightest' },
    title: 'Rain',
    sub: 'Rain and snow falling in the last 24 hours',
    unit: 'mm/h', decimals: 1, range: [0.1, 53], curve: 'log', coast: true,
    palette: ['#2a6fdb', '#2fc0c0', '#5ed25e', '#f2e04a', '#ef8a2e', '#d8332b'],
    noun: 'rain',
    sources: [
      { role: 'Rain and snow', name: 'IMERG precipitation rate, 30-minute average (NASA and JAXA)', layer: 'IMERG_Precipitation_Rate_30min', tileSet: '2km', colormap: 'rain', convert: (v) => v },
    ],
    cadence: { kind: 'hours', step: 2, count: 13 },
    mapping: 'Rain patters: more drops and louder means harder rain. Silence means dry sky.',
    accuracy: 'Checked against NASA MERRA-2 daily rainfall (106 comparisons). This is our weakest result: correlation only 0.42, off by 2.7 mm per day on average, and they agreed on wet or dry just 62% of the time. Treat rain as a rough guide.',
    mars: null,
  },
  {
    id: 'elevation',
    voice: 'terrain',
    words: { hi: 'highest', lo: 'lowest' },
    title: 'Height of the land',
    sub: 'Mountains, valleys and plains',
    unit: 'm', decimals: 0, range: [0, 3000], curve: 'sqrt', coast: false, adaptive: true,
    palette: ['#1d8f3c', '#a5c93d', '#e6c34a', '#c98a4a', '#a8714f', '#f2f2f2'],
    noun: 'height',
    sources: [
      { role: 'Land height', name: 'ASTER Global Digital Elevation Model (NASA and Japan’s METI)', layer: 'ASTER_GDEM_Color_Index', tileSet: '31.25m', colormap: 'elevation', convert: (v) => v },
    ],
    cadence: { kind: 'static' },
    mapping: 'A deep organ tone with a rumble: higher ground sounds higher, louder and heavier. Silence means sea level or outside the country.',
    accuracy: 'Checked against SRTM elevation (70 comparisons): median error 7.5 m, correlation 0.996. Over ice, as in Antarctica, NASA’s height data contains spikes, so do not trust the highest values there.',
    mars: null,
  },
  {
    id: 'greenness',
    voice: 'leaf',
    words: { hi: 'greenest', lo: 'barest' },
    title: 'Greenness',
    sub: 'Where plants grow, month by month',
    unit: '', decimals: 2, range: [0, 0.9], curve: 'linear', coast: false,
    palette: ['#8a6a3c', '#c8b05a', '#a6c94a', '#4fae3c', '#238a3a', '#0e5a2c'],
    noun: 'greenness',
    sources: [
      { role: 'Vegetation index', name: 'MODIS Vegetation Index (NDVI), monthly (Terra)', layer: 'MODIS_Terra_L3_NDVI_Monthly', tileSet: '1km', colormap: 'ndvi', convert: (v) => v },
    ],
    cadence: { kind: 'months', count: 13 },
    mapping: 'An airy, breathy pad: the greener the land, the brighter and louder it is, and lush places get bird-like chirps. Bare desert is near silent.',
    accuracy: 'Checked against a second satellite, VIIRS (228 comparisons): correlation 0.91, off by 0.04 on average. That shows two instruments agree, not that either is perfect. The scale is NASA’s own, where bare rock and sand read 0.1 or less.',
    mars: { kind: 'bare', value: 0.1, fact: 'Mars, where nothing grows' },   // NASA: bare rock, sand and snow read 0.1 or less
  },
];

export const categoryById = (id) => CATEGORIES.find((c) => c.id === id);

// ---------------------------------------------------------------- times

async function newestTime(layer, tileSet) {
  const p = new URLSearchParams({ SERVICE: 'WMTS', REQUEST: 'DescribeDomains', VERSION: '1.0.0', LAYER: layer, TILEMATRIXSET: tileSet });
  const res = await fetch(`${WMTS}?${p}`);
  if (!res.ok) throw new Error(`NASA GIBS answered ${res.status}`);
  const m = /<Domain>([^<]+)<\/Domain>/.exec(await res.text());
  if (!m) throw new Error('NASA GIBS did not list times for this layer');
  return m[1].split(',').pop().split('/')[1];
}

const iso = (d) => d.toISOString().slice(0, 10);
const label = (d, withTime) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}${withTime ? `, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC` : ''}`;

/** The dates of the frames, oldest first, ending at NASA's newest. */
async function frameTimes(cat) {
  const c = cat.cadence;
  if (c.kind === 'static') return [{ label: 'A map that does not change', short: '', times: [null] }];
  // Use the first source as the pace-setter; others are clamped to their own newest day.
  const lead = cat.sources[0];
  const newest = await newestTime(lead.layer, lead.tileSet);
  const newestOthers = await Promise.all(cat.sources.slice(1).map((s) => newestTime(s.layer, s.tileSet).catch(() => null)));
  const out = [];
  for (let k = c.count - 1; k >= 0; k--) {
    let d, withTime = false;
    if (c.kind === 'hours') { d = new Date(new Date(newest) - k * c.step * HOUR); withTime = true; }
    else if (c.kind === 'days') { d = new Date(new Date(`${newest.slice(0, 10)}T00:00:00Z`) - k * c.step * DAY); }
    else { const e = new Date(`${newest.slice(0, 10)}T00:00:00Z`); d = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() - k, 1)); }
    const stamp = withTime ? `${d.toISOString().slice(0, 19)}Z` : iso(d);
    const times = cat.sources.map((s, i) => {
      if (i === 0) return stamp;
      const cap = newestOthers[i - 1];       // never ask a layer for a day it does not have yet
      return cap && stamp.slice(0, 10) > cap.slice(0, 10) ? cap.slice(0, 10) : stamp.slice(0, 10);
    });
    out.push({
      label: label(d, withTime),
      short: withTime ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
        : c.kind === 'months' ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`,
      times,
    });
  }
  return out;
}

// -------------------------------------------------------------- geometry

/** The map area for a country: its box, padded, with a pixel size that keeps the shape. */
export function areaFor(country) {
  let [w, s, e, n] = country.b;
  const pad = Math.max(0.5, 0.1 * Math.max(e - w, n - s));
  w -= pad; e += pad; s = Math.max(-90, s - pad); n = Math.min(90, n + pad);
  w = Math.max(-180, w); e = Math.min(180, e);
  const dlon = e - w, dlat = n - s;
  const MAX = 860, MIN = 200;
  let W, H;
  if (dlon >= dlat) { W = MAX; H = Math.max(MIN, Math.round(MAX * dlat / dlon)); }
  else { H = MAX; W = Math.max(MIN, Math.round(MAX * dlon / dlat)); }
  return { w, s, e, n, W, H, dlon, dlat };
}

/** The country's border as a path in map pixels. Returns null if its shape is missing. */
export async function loadShape(countryId, area) {
  try {
    const res = await fetch(`records/geo/c/${countryId}.json`);
    if (!res.ok) return null;
    const { r } = await res.json();
    if (!r.length) return null;
    const path = new Path2D();
    for (const ring of r) {
      for (let k = 0; k < ring.length; k += 2) {
        const x = ((ring[k] / 1000 - area.w) / area.dlon) * area.W;
        const y = ((area.n - ring[k + 1] / 1000) / area.dlat) * area.H;
        if (k === 0) path.moveTo(x, y); else path.lineTo(x, y);
      }
      path.closePath();
    }
    return path;
  } catch { return null; }
}

/**
 * For each pixel: 2 = inside the country, 1 = sea close to it (when coast), 0 = outside.
 * The country itself comes from its vector border, so edges are crisp at any size.
 * Which pixels are open sea comes from the coarser places picture.
 */
export function regionMask(area, countryId, coast, path) {
  const { w, n, W, H, dlon, dlat } = area;
  const own = new Uint8Array(W * H);
  const sea = new Uint8Array(W * H);
  if (path) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d', { willReadFrequently: true });
    c.fillStyle = '#fff';
    c.fill(path, 'evenodd');
    const px = c.getImageData(0, 0, W, H).data;
    for (let k = 0; k < W * H; k++) if (px[k * 4 + 3] > 127) own[k] = 1;
  }
  for (let j = 0; j < H; j++) {
    const lat = n - ((j + 0.5) / H) * dlat;
    for (let i = 0; i < W; i++) {
      const k = j * W + i, lon = w + ((i + 0.5) / W) * dlon;
      const id = countryIdAt(lat, lon);
      if (!path && id === countryId) own[k] = 1;       // fallback for a missing shape
      else if (id === 0 && !own[k]) sea[k] = 1;
    }
  }
  const mask = new Uint8Array(W * H);
  for (let k = 0; k < mask.length; k++) if (own[k]) mask[k] = 2;
  if (coast) {
    // Sea within about a degree of the country: a box dilation of the country pixels.
    const r = Math.max(2, Math.round((1.0 / Math.max(dlon, dlat)) * Math.max(W, H)));
    const tmp = new Uint8Array(W * H), dil = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) {                                  // horizontal pass
      let last = -1e9;
      for (let i = 0; i < W; i++) { if (own[j * W + i]) last = i; if (i - last <= r) tmp[j * W + i] = 1; }
      last = 1e9;
      for (let i = W - 1; i >= 0; i--) { if (own[j * W + i]) last = i; if (last - i <= r) tmp[j * W + i] = 1; }
    }
    for (let i = 0; i < W; i++) {                                  // vertical pass
      let last = -1e9;
      for (let j = 0; j < H; j++) { if (tmp[j * W + i]) last = j; if (j - last <= r) dil[j * W + i] = 1; }
      last = 1e9;
      for (let j = H - 1; j >= 0; j--) { if (tmp[j * W + i]) last = j; if (last - j <= r) dil[j * W + i] = 1; }
    }
    for (let k = 0; k < mask.length; k++) if (!mask[k] && dil[k] && sea[k]) mask[k] = 1;
  }
  return mask;
}

// ------------------------------------------------------------ fetching

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('NASA did not send a picture'));
    img.src = url;
  });
}

async function loadImageRetry(url, tries = 3) {
  for (let a = 0; ; a++) {
    try { return await loadImage(a ? `${url}${url.includes('?') ? '&' : '?'}retry=${a}` : url); }
    catch (err) { if (a >= tries - 1) throw err; await new Promise((r) => setTimeout(r, 400 * (a + 1))); }
  }
}

function requestUrl(layer, area, time) {
  const p = new URLSearchParams({
    SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.3.0', LAYERS: layer, CRS: 'EPSG:4326',
    BBOX: `${area.s},${area.w},${area.n},${area.e}`, WIDTH: area.W, HEIGHT: area.H,
    FORMAT: 'image/png', TRANSPARENT: 'true',
  });
  if (time) p.set('TIME', time);
  return `${WMS}?${p}`;
}

/** Position of a value on the pitch scale, 0 to 1 (this is also the legend's axis). */
export function normOf(cat, range, v) {
  const [lo, hi] = range;
  if (cat.curve === 'log') return Math.min(1, Math.max(0, Math.log(Math.max(v, lo) / lo) / Math.log(hi / lo)));
  const n = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return cat.curve === 'sqrt' ? Math.sqrt(n) : n;
}

/** The value at a position on the pitch scale: the reverse of normOf. */
export function valueAt(cat, range, f) {
  const [lo, hi] = range;
  if (cat.curve === 'log') return lo * Math.pow(hi / lo, f);
  return lo + (cat.curve === 'sqrt' ? f * f : f) * (hi - lo);
}

/** Color stops for the legend, taken from NASA's own table so the colors are exact. */
function legendStops(cat, range, source, table) {
  const entries = [...table.entries].map(([r, g, b, v]) => [source.convert(v), r, g, b]).sort((a, b) => a[0] - b[0]);
  const stops = [];
  for (let k = 0; k <= 24; k++) {
    const f = k / 24, want = valueAt(cat, range, f);
    let best = entries[0];
    for (const e of entries) { if (Math.abs(e[0] - want) < Math.abs(best[0] - want)) best = e; }
    stops.push([f, best[1], best[2], best[3]]);
  }
  return stops;
}

const tableCache = new Map();
async function colorTable(name) {
  if (!tableCache.has(name)) {
    tableCache.set(name, fetch(`records/live/${name}.json`).then((r) => r.json()).then((t) => ({
      lookup: new Map(t.entries.map(([r, g, b, v]) => [(r << 16) | (g << 8) | b, v])), units: t.units, entries: t.entries,
    })));
  }
  return tableCache.get(name);
}

/**
 * Everything for one country and one category: the area, the frames (a grid of
 * numbers plus a picture for each), the region mask, and where it all came from.
 * onProgress(done, total) is called as pictures arrive.
 */
export async function loadCountry(country, countryId, cat, onProgress, opts = {}) {
  const area = areaFor(country);
  const path = await loadShape(countryId, area);
  const mask = regionMask(area, countryId, cat.coast, path);
  let frames = await frameTimes(cat);
  if (opts.latestOnly) frames = frames.slice(-1);         // the listening test needs only NASA's newest map
  const tables = await Promise.all(cat.sources.map((s) => colorTable(s.colormap)));
  const total = frames.length * cat.sources.length;
  let done = 0;

  const jobs = [];
  frames.forEach((f, fi) => cat.sources.forEach((s, si) => jobs.push({ fi, si, url: requestUrl(s.layer, area, f.times[si]) })));
  const images = frames.map(() => new Array(cat.sources.length));
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      images[job.fi][job.si] = await loadImageRetry(job.url);
      onProgress?.(++done, total);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));

  const { W, H } = area;
  const scratch = document.createElement('canvas');
  scratch.width = W; scratch.height = H;
  const sctx = scratch.getContext('2d', { willReadFrequently: true });

  const out = [];
  let max = 0, any = false;
  frames.forEach((f, fi) => {
    const values = new Float32Array(W * H).fill(NaN);
    const rgba = new Uint8ClampedArray(W * H * 4);
    cat.sources.forEach((s, si) => {
      sctx.clearRect(0, 0, W, H);
      sctx.drawImage(images[fi][si], 0, 0, W, H);
      const px = sctx.getImageData(0, 0, W, H).data;
      const { lookup } = tables[si];
      for (let k = 0, q = 0; k < W * H; k++, q += 4) {
        if (px[q + 3] < 128 || mask[k] === 0) continue;
        // Sources are layered: land first, then sea fills the sea. A land layer never covers the sea.
        const v = lookup.get((px[q] << 16) | (px[q + 1] << 8) | px[q + 2]);
        if (v === undefined) continue;
        if (!Number.isNaN(values[k])) continue;
        values[k] = s.convert(v);
        rgba[q] = px[q]; rgba[q + 1] = px[q + 1]; rgba[q + 2] = px[q + 2]; rgba[q + 3] = 255;
        if (values[k] > max) max = values[k];
        any = true;
      }
    });
    out.push({ label: f.label, short: f.short, values, rgba, times: f.times });
  });

  const range = cat.adaptive ? [cat.range[0], Math.max(300, Math.ceil(max / 100) * 100)] : cat.range;
  const legends = cat.sources.map((s, i) => ({ role: s.role, stops: legendStops(cat, range, s, tables[i]) }));
  return {
    category: cat, country, countryId, area, mask, path, frames: out, range, hasData: any, legends,
    requests: cat.sources.map((s, i) => ({ ...s, url: requestUrl(s.layer, area, frames[frames.length - 1].times[i]), time: frames[frames.length - 1].times[i] })),
  };
}

